import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetSession, mockSql } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSql: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}))

vi.mock('@/lib/db', () => ({
  default: mockSql,
}))

import { GET } from './route'

const monitorId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const userId = '11111111-2222-3333-4444-555555555555'

function req() {
  return new NextRequest(`http://localhost/api/monitors/${monitorId}/incidents`)
}

const params = { params: Promise.resolve({ id: monitorId }) }

describe('GET /api/monitors/[id]/incidents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com' })
  })

  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await GET(req(), params)
    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 404 when monitor does not belong to the user', async () => {
    mockSql.mockResolvedValueOnce([]) // ownership check returns empty
    const res = await GET(req(), params)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Not found')
  })

  it('returns empty incidents array when no active incidents exist', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }]) // ownership check
      .mockResolvedValueOnce([])                   // incidents query returns none
    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.incidents).toEqual([])
  })

  it('returns active (unresolved) incidents with full shape', async () => {
    const incident = {
      id: 'inc-1',
      alert_type: 'down',
      severity: 'critical',
      affected_regions: ['us-east'],
      opened_at: new Date('2026-05-01T10:00:00Z'),
      last_notified_at: null,
      notification_count: 1,
      delivered_notification_count: 1,
      failed_notification_count: 0,
      snoozed_until: null,
      last_actual: null,
      last_threshold: null,
      duration_ms: 3_600_000,
    }
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([incident])

    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.incidents).toHaveLength(1)
    expect(json.incidents[0].id).toBe('inc-1')
    expect(json.incidents[0].severity).toBe('critical')
  })

  it('active incident definition uses resolved_at IS NULL filter', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([])

    await GET(req(), params)

    // Second call is the incidents query — must filter by resolved_at IS NULL
    const incidentsCall = mockSql.mock.calls[1]
    const fragments = (incidentsCall[0] as TemplateStringsArray).join('§')
    expect(fragments).toContain('resolved_at IS NULL')
    expect(fragments).toContain('alert_incidents')
  })

  it('filters incidents by the given monitor_id', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([])

    await GET(req(), params)

    const incidentsCall = mockSql.mock.calls[1]
    const values = incidentsCall.slice(1)
    expect(values).toContain(monitorId)
  })
})

// ─── Consistency contract ─────────────────────────────────────────────────────
// These tests codify the shared definition of "active incident" used across:
//   1. monitors table  →  /api/monitors/summary  (inc CTE)
//   2. monitor header badge  →  page.tsx inline query
//   3. alerts tab panel  →  same data as (2)
//   4. this API route
//
// All four MUST use: alert_incidents WHERE resolved_at IS NULL
//
describe('active incident definition contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com' })
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([])
  })

  it('queries alert_incidents table (not alerts table)', async () => {
    await GET(req(), params)
    const call = mockSql.mock.calls[1]
    const sql = (call[0] as TemplateStringsArray).join('§')
    expect(sql).toContain('alert_incidents')
    expect(sql).not.toMatch(/^FROM alerts/)
  })

  it('does not include resolved incidents (no open resolved_at check)', async () => {
    await GET(req(), params)
    const call = mockSql.mock.calls[1]
    const sql = (call[0] as TemplateStringsArray).join('§')
    // Must exclude resolved incidents
    expect(sql).toContain('resolved_at IS NULL')
    // Must NOT filter for resolved incidents
    expect(sql).not.toContain('resolved_at IS NOT NULL')
  })
})
