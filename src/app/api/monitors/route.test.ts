import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetSession, mockSql } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSql: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }))
vi.mock('@/lib/db', () => ({ default: mockSql }))

import { GET, POST } from './route'

const userId = '11111111-2222-3333-4444-555555555555'
const monitorId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const newMonitorRow = {
  id: monitorId,
  url: 'https://example.com',
  name: 'example.com',
  check_interval_seconds: 300,
  audit_interval_seconds: 1800,
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/monitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// mockSql call sequence for a successful creation:
// 1st call → count query → [{ count: N }]
// 2nd call → duplicate check → []
// 3rd call → INSERT → [newMonitorRow]
function mockSuccessSequence(currentCount: number) {
  mockSql
    .mockResolvedValueOnce([{ count: currentCount }])  // count check
    .mockResolvedValueOnce([])                          // duplicate check
    .mockResolvedValueOnce([newMonitorRow])             // INSERT
}

// ── GET /api/monitors ─────────────────────────────────────────────────────────

describe('GET /api/monitors', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com', plan: 'free' })
  })

  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns the user monitors as JSON', async () => {
    mockSql.mockResolvedValueOnce([newMonitorRow])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json[0].id).toBe(monitorId)
  })
})

// ── POST /api/monitors ────────────────────────────────────────────────────────

describe('POST /api/monitors', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com', plan: 'free' })
  })

  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await POST(req({ url: 'https://example.com' }))
    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 422 for invalid URL', async () => {
    mockSql.mockResolvedValueOnce([{ count: 0 }])
    const res = await POST(req({ url: 'not-a-url' }))
    expect(res.status).toBe(422)
  })

  it('returns 402 when free user is at monitor limit (2)', async () => {
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com', plan: 'free' })
    mockSql.mockResolvedValueOnce([{ count: 2 }])
    const res = await POST(req({ url: 'https://example.com' }))
    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json.code).toBe('PLAN_LIMIT')
    expect(json.error).toContain('2')
  })

  it('returns 402 when pro user is at monitor limit (20)', async () => {
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com', plan: 'pro' })
    mockSql.mockResolvedValueOnce([{ count: 20 }])
    const res = await POST(req({ url: 'https://example.com' }))
    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json.code).toBe('PLAN_LIMIT')
    expect(json.error).toContain('20')
  })

  it('returns 402 when team user is at monitor limit (100)', async () => {
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com', plan: 'team' })
    mockSql.mockResolvedValueOnce([{ count: 100 }])
    const res = await POST(req({ url: 'https://example.com' }))
    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json.code).toBe('PLAN_LIMIT')
  })

  it('allows creation when free user is below limit (1 of 2)', async () => {
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com', plan: 'free' })
    mockSuccessSequence(1)
    const res = await POST(req({ url: 'https://example.com' }))
    expect(res.status).toBe(201)
  })

  it('returns 409 for duplicate URL', async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 0 }])       // count check — below limit
      .mockResolvedValueOnce([{ id: monitorId }])   // duplicate check — found
    const res = await POST(req({ url: 'https://example.com' }))
    expect(res.status).toBe(409)
  })

  it('creates monitor and returns 201 with monitor data', async () => {
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com', plan: 'free' })
    mockSuccessSequence(0)
    const res = await POST(req({ url: 'https://example.com', name: 'My Monitor' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe(monitorId)
    expect(json.url).toBe('https://example.com')
  })

  it('treats unknown plan as free (falls back to 2-monitor limit)', async () => {
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com', plan: 'unknown_plan' })
    mockSql.mockResolvedValueOnce([{ count: 2 }])
    const res = await POST(req({ url: 'https://example.com' }))
    expect(res.status).toBe(402)
  })
})
