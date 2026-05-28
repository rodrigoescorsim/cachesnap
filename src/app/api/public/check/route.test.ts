import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCheckRateLimit, mockRefundRateLimit, mockSql, mockFetch } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockRefundRateLimit: vi.fn(),
  mockSql: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  refundRateLimit: mockRefundRateLimit,
}))
vi.mock('@/lib/db', () => ({ default: mockSql }))
vi.stubGlobal('fetch', mockFetch)

import { POST } from './route'

const COOLDOWN_SECONDS = 180  // must match route.ts

function req(body: unknown, ip = '1.2.3.4') {
  return new NextRequest('http://localhost/api/public/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': ip,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  process.env.PROBE_SECRET = 'test-secret'
  process.env.RUST_API_URL = 'http://localhost:3001'
  mockCheckRateLimit.mockResolvedValue(true)
  mockRefundRateLimit.mockResolvedValue(undefined)
  mockSql.mockResolvedValue([{ running: 0 }])
})

// ── Valid request ─────────────────────────────────────────────────────────────

it('POST with valid URL returns 200 with jobId and cooldownExpiresAt', async () => {
  const jobId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  mockSql
    .mockResolvedValueOnce([{ running: 0 }])
    .mockResolvedValueOnce([{ id: jobId }])
  mockFetch.mockResolvedValueOnce({ ok: true })

  const res = await POST(req({ url: 'https://example.com' }))
  const body = await res.json()

  expect(res.status).toBe(200)
  expect(body.jobId).toBe(jobId)
  expect(body.cooldownExpiresAt).toBeDefined()
  const expiry = new Date(body.cooldownExpiresAt).getTime()
  expect(expiry - Date.now()).toBeGreaterThan((COOLDOWN_SECONDS - 2) * 1000)
  expect(expiry - Date.now()).toBeLessThan((COOLDOWN_SECONDS + 2) * 1000)
})

// ── URL validation ────────────────────────────────────────────────────────────

it('POST with invalid URL returns 400 with INVALID_URL code', async () => {
  const res = await POST(req({ url: 'not-a-url' }))
  expect(res.status).toBe(400)
  expect((await res.json()).code).toBe('INVALID_URL')
})

it('POST with private IP returns 400 with PRIVATE_IP code', async () => {
  const res = await POST(req({ url: 'http://192.168.1.1/data' }))
  expect(res.status).toBe(400)
  expect((await res.json()).code).toBe('PRIVATE_IP')
})

it('POST with localhost returns 400 with PRIVATE_IP code', async () => {
  const res = await POST(req({ url: 'http://localhost/api' }))
  expect(res.status).toBe(400)
  expect((await res.json()).code).toBe('PRIVATE_IP')
})

// ── Rate limiting ─────────────────────────────────────────────────────────────

it('POST in cooldown returns 429 with type cooldown and retryAfterSeconds matching COOLDOWN_SECONDS', async () => {
  mockCheckRateLimit.mockResolvedValueOnce(false)

  const res = await POST(req({ url: 'https://example.com' }))
  expect(res.status).toBe(429)
  const body = await res.json()
  expect(body.type).toBe('cooldown')
  expect(body.retryAfterSeconds).toBe(COOLDOWN_SECONDS)
})

it('cooldown message reflects configured duration in minutes', async () => {
  mockCheckRateLimit.mockResolvedValueOnce(false)

  const body = await (await POST(req({ url: 'https://example.com' }))).json()
  expect(body.error).toContain('3 minutes')
})

it('POST above hourly limit returns 429 with type hourly', async () => {
  mockCheckRateLimit
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false)

  const res = await POST(req({ url: 'https://example.com' }))
  expect(res.status).toBe(429)
  expect((await res.json()).type).toBe('hourly')
})

it('POST same URL too many times returns 429 with type url_dedup', async () => {
  mockCheckRateLimit
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false)

  const res = await POST(req({ url: 'https://example.com' }))
  expect(res.status).toBe(429)
  expect((await res.json()).type).toBe('url_dedup')
})

// ── Overload guard ────────────────────────────────────────────────────────────

it('POST returns 503 and refunds rate limits when overloaded', async () => {
  mockSql.mockResolvedValueOnce([{ running: 201 }])

  const res = await POST(req({ url: 'https://example.com' }))
  expect(res.status).toBe(503)
  expect((await res.json()).code).toBe('OVERLOADED')
  // Rate limit slots should be refunded so user can retry immediately
  expect(mockRefundRateLimit).toHaveBeenCalledTimes(3)
})

// ── Dispatch failure ──────────────────────────────────────────────────────────

it('POST returns 503 and refunds rate limits when dispatch fails', async () => {
  const jobId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  mockSql
    .mockResolvedValueOnce([{ running: 0 }])
    .mockResolvedValueOnce([{ id: jobId }])
    .mockResolvedValueOnce([])  // UPDATE status = error
  mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })

  const res = await POST(req({ url: 'https://example.com' }))
  expect(res.status).toBe(503)
  expect((await res.json()).code).toBe('DISPATCH_FAILED')
  // All 3 rate limit slots should be refunded
  expect(mockRefundRateLimit).toHaveBeenCalledTimes(3)
})

it('POST returns 503 and refunds rate limits when dispatch throws', async () => {
  const jobId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  mockSql
    .mockResolvedValueOnce([{ running: 0 }])
    .mockResolvedValueOnce([{ id: jobId }])
    .mockResolvedValueOnce([])
  mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

  const res = await POST(req({ url: 'https://example.com' }))
  expect(res.status).toBe(503)
  expect((await res.json()).code).toBe('DISPATCH_FAILED')
  expect(mockRefundRateLimit).toHaveBeenCalledTimes(3)
})
