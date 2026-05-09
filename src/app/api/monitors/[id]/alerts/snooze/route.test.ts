import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetSession, mockSql } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSql: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }))
vi.mock('@/lib/db', () => ({ default: mockSql }))

import { PATCH, DELETE } from './route'

const monitorId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const userId = '11111111-2222-3333-4444-555555555555'
const incidentId = 'cccccccc-dddd-eeee-ffff-000000000000'

function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/monitors/${monitorId}/alerts/snooze`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteReq(body: unknown) {
  return new NextRequest(`http://localhost/api/monitors/${monitorId}/alerts/snooze`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const routeParams = { params: Promise.resolve({ id: monitorId }) }

describe('PATCH /api/monitors/[id]/alerts/snooze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com' })
  })

  it('returns 401 with no session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await PATCH(patchReq({ alert_type: 'cache_hit_low', duration_hours: 24 }), routeParams)
    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 404 when monitor does not belong to user', async () => {
    mockSql.mockResolvedValueOnce([])
    const res = await PATCH(patchReq({ alert_type: 'cache_hit_low', duration_hours: 24 }), routeParams)
    expect(res.status).toBe(404)
  })

  it('returns 422 for invalid duration_hours', async () => {
    mockSql.mockResolvedValueOnce([{ id: monitorId }])
    const res = await PATCH(patchReq({ alert_type: 'cache_hit_low', duration_hours: 48 }), routeParams)
    expect(res.status).toBe(422)
  })

  it('returns 422 when alert_type is missing', async () => {
    mockSql.mockResolvedValueOnce([{ id: monitorId }])
    const res = await PATCH(patchReq({ duration_hours: 24 }), routeParams)
    expect(res.status).toBe(422)
  })

  it('returns 404 when no open incident exists for alert_type', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([])
    const res = await PATCH(patchReq({ alert_type: 'down', duration_hours: 8 }), routeParams)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toMatch(/no open incident/i)
  })

  it('returns 200 with snoozed_until when snooze succeeds', async () => {
    const snoozedUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([{ id: incidentId, snoozed_until: snoozedUntil }])
    const res = await PATCH(patchReq({ alert_type: 'cache_hit_low', duration_hours: 24 }), routeParams)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(incidentId)
    expect(json.snoozed_until).toBe(snoozedUntil)
  })

  it('accepts all valid duration_hours values', async () => {
    for (const hours of [1, 8, 24, 72, 168] as const) {
      vi.clearAllMocks()
      mockGetSession.mockResolvedValue({ id: userId })
      const snoozedUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString()
      mockSql
        .mockResolvedValueOnce([{ id: monitorId }])
        .mockResolvedValueOnce([{ id: incidentId, snoozed_until: snoozedUntil }])
      const res = await PATCH(patchReq({ alert_type: 'down', duration_hours: hours }), routeParams)
      expect(res.status).toBe(200)
    }
  })

  it('double-snooze replaces existing snoozed_until', async () => {
    const firstSnooze = new Date(Date.now() + 1 * 3600 * 1000).toISOString()
    const secondSnooze = new Date(Date.now() + 168 * 3600 * 1000).toISOString()

    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([{ id: incidentId, snoozed_until: firstSnooze }])
    await PATCH(patchReq({ alert_type: 'down', duration_hours: 1 }), routeParams)

    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([{ id: incidentId, snoozed_until: secondSnooze }])
    const res = await PATCH(patchReq({ alert_type: 'down', duration_hours: 168 }), routeParams)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.snoozed_until).toBe(secondSnooze)
  })
})

describe('DELETE /api/monitors/[id]/alerts/snooze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ id: userId, email: 'u@example.com' })
  })

  it('returns 401 with no session', async () => {
    mockGetSession.mockResolvedValueOnce(null)
    const res = await DELETE(deleteReq({ alert_type: 'cache_hit_low' }), routeParams)
    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 404 when monitor does not belong to user', async () => {
    mockSql.mockResolvedValueOnce([])
    const res = await DELETE(deleteReq({ alert_type: 'cache_hit_low' }), routeParams)
    expect(res.status).toBe(404)
  })

  it('returns 422 when alert_type is missing', async () => {
    mockSql.mockResolvedValueOnce([{ id: monitorId }])
    const res = await DELETE(deleteReq({}), routeParams)
    expect(res.status).toBe(422)
  })

  it('returns 404 when no open incident exists for alert_type', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([])
    const res = await DELETE(deleteReq({ alert_type: 'down' }), routeParams)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toMatch(/no open incident/i)
  })

  it('returns 200 with snoozed_until: null when unsnooze succeeds', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: monitorId }])
      .mockResolvedValueOnce([{ id: incidentId }])
    const res = await DELETE(deleteReq({ alert_type: 'cache_hit_low' }), routeParams)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(incidentId)
    expect(json.snoozed_until).toBeNull()
  })
})
