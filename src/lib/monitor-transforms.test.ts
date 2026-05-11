import { describe, it, expect } from 'vitest'
import { toNum, toNumOrNull, hostnameFallback, toMonitor, type MonitorSummaryRow } from './monitor-transforms'

// ─── toNum ────────────────────────────────────────────────────────────────────

describe('toNum', () => {
  it('converts numeric string (postgres ROUND return)', () => {
    expect(toNum('98.2')).toBe(98.2)
    expect(toNum('0')).toBe(0)
  })

  it('passes through numbers unchanged', () => {
    expect(toNum(42)).toBe(42)
    expect(toNum(0)).toBe(0)
  })

  it('returns 0 for null or undefined', () => {
    expect(toNum(null)).toBe(0)
    expect(toNum(undefined)).toBe(0)
  })
})

// ─── toNumOrNull ──────────────────────────────────────────────────────────────

describe('toNumOrNull', () => {
  it('converts numeric string to number', () => {
    expect(toNumOrNull('75.5')).toBe(75.5)
  })

  it('returns null for null', () => {
    expect(toNumOrNull(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(toNumOrNull(undefined)).toBeNull()
  })

  it('preserves 0 as a number (not null)', () => {
    expect(toNumOrNull(0)).toBe(0)
    expect(toNumOrNull('0')).toBe(0)
  })
})

// ─── hostnameFallback ─────────────────────────────────────────────────────────

describe('hostnameFallback', () => {
  it('strips www. and protocol', () => {
    expect(hostnameFallback('https://www.microsoft.com')).toBe('microsoft.com')
    expect(hostnameFallback('http://www.apple.com')).toBe('apple.com')
  })

  it('keeps subdomain other than www', () => {
    expect(hostnameFallback('https://api.github.com')).toBe('api.github.com')
    expect(hostnameFallback('https://vercel.com/docs')).toBe('vercel.com')
  })

  it('returns original string for invalid URLs', () => {
    expect(hostnameFallback('not-a-url')).toBe('not-a-url')
  })
})

// ─── toMonitor ────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<MonitorSummaryRow> = {}): MonitorSummaryRow {
  return {
    id: 'mon_1',
    url: 'https://example.com',
    name: null,
    status: 'active',
    ttfb_current: 120,
    ttfb_avg_1h: 118,
    ttfb_avg_24h: 135,
    ttfb_delta: '-11.1',   // string — simulates postgres ROUND return
    cache_hit_current: '95.0',
    cache_hit_avg_1h: '94.0',
    cache_hit_avg_24h: '93.5',
    cache_hit_delta: '1.5',
    cache_status_current: 'HIT',
    regions: [{ code: 'sa-east', label: 'São Paulo', flag: '🇧🇷', isSlow: false, isError: false }],
    slow_region_count: 0,
    total_region_count: 1,
    error_region_count: 0,
    error_5xx_count: 0,
    error_4xx_count: 0,
    is_waf_blocked: false,
    uptime_24h: '99.9',
    last_checked_at: '2026-04-19T10:00:00.000Z',
    sparkline: [100, 110, 120, 115],
    active_incident_count: 0,
    ...overrides,
  }
}

describe('toMonitor', () => {
  it('uses hostname when name is null', () => {
    const m = toMonitor(makeRow({ name: null, url: 'https://www.microsoft.com' }))
    expect(m.name).toBe('microsoft.com')
  })

  it('uses the explicit name when provided', () => {
    const m = toMonitor(makeRow({ name: 'My Monitor' }))
    expect(m.name).toBe('My Monitor')
  })

  it('converts postgres string numerics to numbers', () => {
    const m = toMonitor(makeRow({ ttfb_delta: '-11.1', cache_hit_current: '95.0' }))
    expect(m.ttfbCurrentDelta).toBe(-11.1)
    expect(m.cacheHitCurrent).toBe(95)
  })

  it('maps null cache_hit_current to null (no data, not 0)', () => {
    const m = toMonitor(makeRow({ cache_hit_current: null, cache_hit_avg_24h: null, cache_hit_delta: null }))
    expect(m.cacheHitCurrent).toBeNull()
    expect(m.cacheHitAvg24h).toBeNull()
    expect(m.cacheHitDelta).toBeNull()
  })

  it('parses last_checked_at into a Date', () => {
    const m = toMonitor(makeRow({ last_checked_at: '2026-04-19T10:00:00.000Z' }))
    expect(m.lastCheckedAt).toBeInstanceOf(Date)
    expect(m.lastCheckedAt.toISOString()).toBe('2026-04-19T10:00:00.000Z')
  })

  it('uses epoch (Date(0)) when last_checked_at is null — signals never probed', () => {
    const m = toMonitor(makeRow({ last_checked_at: null }))
    expect(m.lastCheckedAt.getTime()).toBe(0)
  })

  it('maps sparkline array, coercing string entries to numbers', () => {
    const m = toMonitor(makeRow({ sparkline: ['100', '120', 130] }))
    expect(m.ttfbSparkline).toEqual([100, 120, 130])
  })

  it('maps uptime_24h to uptime24h', () => {
    const m = toMonitor(makeRow({ uptime_24h: '98.7' }))
    expect(m.uptime24h).toBe(98.7)
  })

  it('returns empty sparkline for empty array', () => {
    const m = toMonitor(makeRow({ sparkline: [] }))
    expect(m.ttfbSparkline).toEqual([])
  })

  it('maps status correctly', () => {
    expect(toMonitor(makeRow({ status: 'active' })).status).toBe('active')
    expect(toMonitor(makeRow({ status: 'paused' })).status).toBe('paused')
  })

  it('maps slow/total region counts', () => {
    const m = toMonitor(makeRow({ slow_region_count: '2', total_region_count: '8' }))
    expect(m.slowRegionCount).toBe(2)
    expect(m.totalRegionCount).toBe(8)
  })

  it('maps error_region_count to errorRegionCount (string from postgres)', () => {
    const m = toMonitor(makeRow({ error_region_count: '3' }))
    expect(m.errorRegionCount).toBe(3)
  })

  it('defaults errorRegionCount to 0 when error_region_count is 0', () => {
    const m = toMonitor(makeRow({ error_region_count: 0 }))
    expect(m.errorRegionCount).toBe(0)
  })

  // ── activeIncidentCount — shared definition across monitors table, detail badge, and alerts tab ──

  it('maps active_incident_count integer to activeIncidentCount', () => {
    expect(toMonitor(makeRow({ active_incident_count: 3 })).activeIncidentCount).toBe(3)
  })

  it('maps active_incident_count string (postgres return) to number', () => {
    expect(toMonitor(makeRow({ active_incident_count: '2' })).activeIncidentCount).toBe(2)
  })

  it('maps null active_incident_count to 0 (no open incidents)', () => {
    // COALESCE in summary SQL returns 0, but null is also safe here
    expect(toMonitor(makeRow({ active_incident_count: null })).activeIncidentCount).toBe(0)
  })

  it('maps zero active_incident_count correctly', () => {
    expect(toMonitor(makeRow({ active_incident_count: 0 })).activeIncidentCount).toBe(0)
  })

  it('active incident count is always a non-negative integer', () => {
    [0, 1, 5, 10].forEach(n => {
      const m = toMonitor(makeRow({ active_incident_count: n }))
      expect(m.activeIncidentCount).toBe(n)
      expect(Number.isInteger(m.activeIncidentCount)).toBe(true)
      expect(m.activeIncidentCount).toBeGreaterThanOrEqual(0)
    })
  })
})
