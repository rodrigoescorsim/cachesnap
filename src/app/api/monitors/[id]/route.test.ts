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

import { PATCH } from './route'

const monitorId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const userId = '11111111-2222-3333-4444-555555555555'

const baseRow = {
  id: monitorId,
  url: 'https://example.com',
  name: 'Test',
  check_interval_seconds: 60,
  audit_interval_seconds: 3600,
  is_active: true,
  notify_email: null as string | null,
  notify_email_enabled: false,
  notify_slack_webhook: null as string | null,
  notify_slack_enabled: false,
  alert_threshold_ms: 1000,
  alert_sensitivity: 2,
  alert_down_enabled: true,
  alert_anomaly_enabled: true,
  alert_anycast_enabled: false,
  alert_zombie_cache_enabled: false,
  alert_cache_hit_enabled: false,
  alert_cache_hit_threshold_pct: 80,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/monitors/' + monitorId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/monitors/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com' })
    mockSql.mockImplementation((_strings: TemplateStringsArray, ..._values: unknown[]) => {
      return Promise.resolve([{ ...baseRow }]) as Promise<typeof baseRow[]>
    })
  })

  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await PATCH(req({ alert_sensitivity: 1 }), {
      params: Promise.resolve({ id: monitorId }),
    })
    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 400 when no updatable fields are present', async () => {
    const res = await PATCH(req({}), { params: Promise.resolve({ id: monitorId }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('No fields to update')
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 422 for invalid alert_threshold_ms', async () => {
    const res = await PATCH(req({ alert_threshold_ms: 50 }), {
      params: Promise.resolve({ id: monitorId }),
    })
    expect(res.status).toBe(422)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 404 when UPDATE affects no row', async () => {
    mockSql.mockImplementationOnce(() => Promise.resolve([]))
    const res = await PATCH(req({ alert_sensitivity: 3 }), {
      params: Promise.resolve({ id: monitorId }),
    })
    expect(res.status).toBe(404)
  })

  it('persists alert config fields and returns updated monitor', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ...baseRow,
        alert_threshold_ms: 2500,
        alert_sensitivity: 1,
        alert_down_enabled: false,
        alert_anomaly_enabled: false,
        alert_anycast_enabled: true,
        alert_zombie_cache_enabled: true,
        alert_cache_hit_enabled: true,
        alert_cache_hit_threshold_pct: 65.5,
      },
    ] as never)

    const res = await PATCH(
      req({
        alert_threshold_ms: 2500,
        alert_sensitivity: 1,
        alert_down_enabled: false,
        alert_anomaly_enabled: false,
        alert_anycast_enabled: true,
        alert_zombie_cache_enabled: true,
        alert_cache_hit_enabled: true,
        alert_cache_hit_threshold_pct: 65.5,
      }),
      { params: Promise.resolve({ id: monitorId }) }
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.alert_threshold_ms).toBe(2500)
    expect(json.alert_sensitivity).toBe(1)
    expect(json.alert_down_enabled).toBe(false)
    expect(json.alert_anomaly_enabled).toBe(false)
    expect(json.alert_anycast_enabled).toBe(true)
    expect(json.alert_zombie_cache_enabled).toBe(true)
    expect(json.alert_cache_hit_enabled).toBe(true)
    expect(json.alert_cache_hit_threshold_pct).toBe(65.5)

    expect(mockSql).toHaveBeenCalledTimes(1)
    const call = mockSql.mock.calls[0]
    const fragments = call[0] as TemplateStringsArray
    const joined = fragments.join('§')
    expect(joined).toContain('UPDATE monitors')
    expect(joined).toContain('alert_cache_hit_threshold_pct')
  })
})
