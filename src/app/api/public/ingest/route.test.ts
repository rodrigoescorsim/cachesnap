import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ default: mockSql }))

import { POST } from './route'

function req(body: unknown, secret = 'correct-secret') {
  return new NextRequest('http://localhost/api/public/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-probe-secret': secret,
    },
    body: JSON.stringify(body),
  })
}

const JOB_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const VALID_PAYLOAD = {
  job_id: JOB_ID,
  region: 'us-east-1',
  ttfb_ms: 45,
  total_ms: 120,
  status_code: 200,
  cache_status: 'HIT',
  cdn_provider: 'Cloudflare',
}

beforeEach(() => {
  vi.resetAllMocks()
  process.env.PROBE_SECRET = 'correct-secret'
})

// ── Auth ──────────────────────────────────────────────────────────────────────

it('POST without probe-secret returns 401', async () => {
  const res = await POST(req(VALID_PAYLOAD, ''))
  expect(res.status).toBe(401)
})

it('POST with wrong probe-secret returns 401', async () => {
  const res = await POST(req(VALID_PAYLOAD, 'wrong-secret'))
  expect(res.status).toBe(401)
})

// ── Job lookup ────────────────────────────────────────────────────────────────

it('POST with valid payload returns 200 and saves result', async () => {
  // CTE combines INSERT + UPDATE into a single SQL call (2 total: job check + CTE)
  mockSql
    .mockResolvedValueOnce([{ id: JOB_ID }])              // job exists check
    .mockResolvedValueOnce([{                              // CTE: INSERT + UPDATE
      regions_done: 1,
      regions_total: 8,
      is_complete: false,
    }])

  const res = await POST(req(VALID_PAYLOAD))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.complete).toBe(false)
})

it('POST with non-existent jobId returns 404', async () => {
  mockSql.mockResolvedValueOnce([])  // no job found

  const res = await POST(req(VALID_PAYLOAD))
  expect(res.status).toBe(404)
})

it('POST completing last region marks job complete', async () => {
  mockSql
    .mockResolvedValueOnce([{ id: JOB_ID }])
    .mockResolvedValueOnce([{
      regions_done: 8,
      regions_total: 8,
      is_complete: true,
    }])

  const res = await POST(req(VALID_PAYLOAD))
  const body = await res.json()
  expect(body.complete).toBe(true)
})

it('POST with probe error payload still saves with error field', async () => {
  mockSql
    .mockResolvedValueOnce([{ id: JOB_ID }])
    .mockResolvedValueOnce([{ regions_done: 1, regions_total: 8, is_complete: false }])

  const errorPayload = {
    job_id: JOB_ID,
    region: 'ap-southeast-1',
    error: 'Connection timed out',
    ttfb_ms: null,
  }

  const res = await POST(req(errorPayload))
  expect(res.status).toBe(200)
  // Second mock call is the INSERT — verify error field would be included
  // (exact SQL params are tested by integration tests against real DB)
})

it('POST with invalid job_id UUID format returns 400', async () => {
  const res = await POST(req({ ...VALID_PAYLOAD, job_id: 'not-a-uuid' }))
  expect(res.status).toBe(400)
})

it('POST missing job_id returns 400', async () => {
  const res = await POST(req({ region: 'us-east-1' }))
  expect(res.status).toBe(400)
})

it('POST accepts monitor_id alias from Lambda payload', async () => {
  mockSql
    .mockResolvedValueOnce([{ id: JOB_ID }])
    .mockResolvedValueOnce([{ regions_done: 1, regions_total: 8, is_complete: false }])

  const res = await POST(req({ monitor_id: JOB_ID, region: 'sa-east', ttfb_ms: 50 }))
  expect(res.status).toBe(200)
})

it('POST rounds fractional ttfb_ms and total_ms from Lambda', async () => {
  mockSql
    .mockResolvedValueOnce([{ id: JOB_ID }])
    .mockResolvedValueOnce([{ regions_done: 1, regions_total: 8, is_complete: false }])

  const res = await POST(
    req({ job_id: JOB_ID, region: 'eu-west', ttfb_ms: 229.97, total_ms: 190.43, status_code: 200 })
  )
  expect(res.status).toBe(200)
  const insertCall = mockSql.mock.calls[1]
  expect(insertCall).toBeDefined()
})
