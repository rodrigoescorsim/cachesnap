import { describe, it, expect } from 'vitest'

// Pure helper functions extracted for testing.
// These mirror the logic in dashboard/page.tsx.

interface MonitorSummary {
  id: string
  url: string
  name: string | null
  is_active: boolean
  ttfb_avg_ms: number | null
  ttfb_worst_ms: number | null
  error_count: number
  cache_hit_pct: number | null
  last_probe_at: Date | null
  alert_count: number
}

function statusLabel(m: MonitorSummary): string {
  if (!m.is_active) return 'Paused'
  if (m.error_count > 0) return 'Errors'
  if (m.alert_count > 0) return 'Alert'
  if (m.ttfb_avg_ms != null && m.ttfb_avg_ms > 800) return 'Slow'
  if (!m.last_probe_at) return 'No data'
  return 'Healthy'
}

function advisorNarrative(monitors: MonitorSummary[]): string | null {
  const active = monitors.filter(m => m.is_active && m.last_probe_at)
  if (active.length === 0) return null

  const withErrors = active.filter(m => m.error_count > 0)
  const withAlerts = active.filter(m => m.alert_count > 0)
  const slow = active.filter(m => m.ttfb_avg_ms != null && m.ttfb_avg_ms > 800)

  if (withErrors.length > 0)
    return `${withErrors.length} monitor${withErrors.length > 1 ? 's are' : ' is'} returning errors in the last 24h. Check the details below.`
  if (withAlerts.length > 0)
    return `${withAlerts.length} monitor${withAlerts.length > 1 ? 's have' : ' has'} active alerts. Performance anomalies detected.`
  if (slow.length > 0) {
    const worst = slow.sort((a, b) => (b.ttfb_avg_ms ?? 0) - (a.ttfb_avg_ms ?? 0))[0]
    return `${worst.name ?? worst.url} is averaging ${worst.ttfb_avg_ms}ms TTFB — above the 800ms threshold.`
  }
  return `All ${active.length} monitor${active.length > 1 ? 's are' : ' is'} healthy. No anomalies in the last 24 hours.`
}

const base: MonitorSummary = {
  id: '1',
  url: 'https://example.com',
  name: null,
  is_active: true,
  ttfb_avg_ms: 200,
  ttfb_worst_ms: 300,
  error_count: 0,
  cache_hit_pct: 90,
  last_probe_at: new Date(),
  alert_count: 0,
}

describe('statusLabel', () => {
  it('returns Paused when inactive', () => {
    expect(statusLabel({ ...base, is_active: false })).toBe('Paused')
  })

  it('returns Errors when error_count > 0', () => {
    expect(statusLabel({ ...base, error_count: 1 })).toBe('Errors')
  })

  it('returns Alert when alert_count > 0 and no errors', () => {
    expect(statusLabel({ ...base, alert_count: 2 })).toBe('Alert')
  })

  it('returns Slow when ttfb > 800ms', () => {
    expect(statusLabel({ ...base, ttfb_avg_ms: 850 })).toBe('Slow')
  })

  it('returns No data when no probes yet', () => {
    expect(statusLabel({ ...base, last_probe_at: null })).toBe('No data')
  })

  it('returns Healthy when all good', () => {
    expect(statusLabel(base)).toBe('Healthy')
  })

  it('Errors takes priority over Alert', () => {
    expect(statusLabel({ ...base, error_count: 1, alert_count: 3 })).toBe('Errors')
  })
})

describe('advisorNarrative', () => {
  it('returns null when no active monitors with data', () => {
    expect(advisorNarrative([])).toBeNull()
    expect(advisorNarrative([{ ...base, is_active: false }])).toBeNull()
    expect(advisorNarrative([{ ...base, last_probe_at: null }])).toBeNull()
  })

  it('reports errors first', () => {
    const monitors = [
      { ...base, error_count: 2 },
      { ...base, id: '2', alert_count: 1 },
    ]
    expect(advisorNarrative(monitors)).toContain('returning errors')
  })

  it('uses plural form for multiple erroring monitors', () => {
    const monitors = [
      { ...base, error_count: 1 },
      { ...base, id: '2', error_count: 1 },
    ]
    expect(advisorNarrative(monitors)).toMatch(/2 monitors are/)
  })

  it('reports alerts when no errors', () => {
    const monitors = [{ ...base, alert_count: 1 }]
    expect(advisorNarrative(monitors)).toContain('active alerts')
  })

  it('reports slowest monitor by name when slow', () => {
    const monitors = [
      { ...base, name: 'My API', ttfb_avg_ms: 1200 },
      { ...base, id: '2', ttfb_avg_ms: 900 },
    ]
    expect(advisorNarrative(monitors)).toContain('My API')
    expect(advisorNarrative(monitors)).toContain('1200ms')
  })

  it('falls back to URL when name is null', () => {
    const monitors = [{ ...base, name: null, ttfb_avg_ms: 900 }]
    expect(advisorNarrative(monitors)).toContain('https://example.com')
  })

  it('reports healthy when all monitors are fine', () => {
    const monitors = [base, { ...base, id: '2' }]
    expect(advisorNarrative(monitors)).toContain('healthy')
  })
})
