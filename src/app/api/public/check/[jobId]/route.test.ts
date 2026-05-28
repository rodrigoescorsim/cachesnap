import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: mockSql }))

import { GET } from './route'

function req(jobId: string) {
  return new NextRequest(`http://localhost/api/public/check/${jobId}`)
}

const JOB_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

beforeEach(() => vi.resetAllMocks())

it('returns 200 with job results for a valid jobId', async () => {
  mockSql
    .mockResolvedValueOnce([{
      id: JOB_ID,
      status: 'complete',
      url: 'https://example.com',
      regions_done: 8,
      regions_total: 8,
    }])
    .mockResolvedValueOnce([{
      region: 'us-east-1',
      ttfb_ms: 45,
      total_ms: 120,
      cache_status: 'HIT',
      cdn_provider: 'Cloudflare',
      status_code: 200,
      age_s: 300,
      cache_control: 'public, max-age=86400',
      security_score: 90,
      error: null,
      probed_at: new Date('2026-01-01T00:00:00.000Z'),
    }])

  const res = await GET(req(JOB_ID), { params: Promise.resolve({ jobId: JOB_ID }) })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('complete')
  expect(body.regionsDone).toBe(8)
  expect(body.results).toHaveLength(1)
  expect(body.results[0].cache_status).toBe('HIT')
  expect(body.results[0].ttfb_ms).toBe(45)
  expect(typeof body.results[0].probed_at).toBe('string')
})

it('returns 404 for a non-existent jobId', async () => {
  mockSql.mockResolvedValueOnce([])
  const res = await GET(req(JOB_ID), { params: Promise.resolve({ jobId: JOB_ID }) })
  expect(res.status).toBe(404)
})

it('returns 404 for an invalid UUID format', async () => {
  const res = await GET(req('not-a-uuid'), { params: Promise.resolve({ jobId: 'not-a-uuid' }) })
  expect(res.status).toBe(404)
  // DB should NOT be called — UUID guard short-circuits
  expect(mockSql).not.toHaveBeenCalled()
})

it('returns empty results array for a pending job', async () => {
  mockSql
    .mockResolvedValueOnce([{
      id: JOB_ID,
      status: 'running',
      url: 'https://example.com',
      regions_done: 2,
      regions_total: 8,
    }])
    .mockResolvedValueOnce([])

  const res = await GET(req(JOB_ID), { params: Promise.resolve({ jobId: JOB_ID }) })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('running')
  expect(body.regionsDone).toBe(2)
  expect(body.results).toHaveLength(0)
})
