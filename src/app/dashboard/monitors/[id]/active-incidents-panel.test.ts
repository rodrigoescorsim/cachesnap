import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  alertTypeDisplay,
  formatMetricDelta,
  ActiveIncidentsPanel,
  type ActiveIncident,
} from './active-incidents-panel'

// --- formatDuration ---

describe('formatDuration', () => {
  it('returns "0 minutes" for 0ms', () => {
    expect(formatDuration(0)).toBe('0 minutes')
  })

  it('returns "1 minute" for exactly 60000ms', () => {
    expect(formatDuration(60_000)).toBe('1 minute')
  })

  it('returns plural minutes for < 1 hour', () => {
    expect(formatDuration(59 * 60_000)).toBe('59 minutes')
    expect(formatDuration(2 * 60_000)).toBe('2 minutes')
  })

  it('returns "1 hour" for exactly 3600000ms', () => {
    expect(formatDuration(3_600_000)).toBe('1 hour')
  })

  it('returns plural hours for < 24 hours', () => {
    expect(formatDuration(2 * 3_600_000)).toBe('2 hours')
    expect(formatDuration(23 * 3_600_000)).toBe('23 hours')
  })

  it('returns "1 day" for exactly 86400000ms', () => {
    expect(formatDuration(86_400_000)).toBe('1 day')
  })

  it('returns plural days for >= 48h', () => {
    expect(formatDuration(2 * 86_400_000)).toBe('2 days')
    expect(formatDuration(7 * 86_400_000)).toBe('7 days')
  })
})

// --- alertTypeDisplay ---

describe('alertTypeDisplay', () => {
  const knownTypes = [
    ['down', 'Monitor Offline'],
    ['ttfb_threshold', 'TTFB Threshold Exceeded'],
    ['anomaly', 'Latency Anomaly'],
    ['cache_hit_low', 'Cache Hit Rate Low'],
    ['ssl_expiry', 'SSL Certificate Expiring'],
    ['zombie_cache', 'Zombie Cache Detected'],
    ['anycast', 'Anycast Routing Issue'],
    ['cache_hit_trend_drop_region', 'Cache Hit Trend Drop (Region)'],
    ['cache_hit_trend_drop_global', 'Cache Hit Trend Drop (Global)'],
    ['ttfb_trend_up_region', 'TTFB Trend Worsening (Region)'],
    ['ttfb_trend_up_global', 'TTFB Trend Worsening (Global)'],
    ['ttfb_trend_down_region', 'TTFB Improved (Region)'],
    ['ttfb_trend_down_global', 'TTFB Improved (Global)'],
  ] as const

  it.each(knownTypes)('maps %s to a non-empty display name', (slug, expected) => {
    expect(alertTypeDisplay(slug)).toBe(expected)
  })

  it('returns non-empty string for all known types', () => {
    for (const [slug] of knownTypes) {
      const display = alertTypeDisplay(slug)
      expect(display.length).toBeGreaterThan(0)
    }
  })

  it('has no snake_case in any known display name', () => {
    for (const [slug] of knownTypes) {
      expect(alertTypeDisplay(slug)).not.toContain('_')
    }
  })

  it('falls back to "Unknown Alert" for unrecognized slugs', () => {
    expect(alertTypeDisplay('some_new_type')).toBe('Unknown Alert')
    expect(alertTypeDisplay('')).toBe('Unknown Alert')
  })
})

// --- formatMetricDelta ---

describe('formatMetricDelta', () => {
  it('shows pp (percentage points) for cache metrics below threshold', () => {
    const result = formatMetricDelta(65.0, 80.0, 'cache_hit_low')
    expect(result).toContain('pp vs threshold')
    expect(result).toContain('15.0')
    expect(result).toContain('−')
  })

  it('shows pp for cache_hit_trend types', () => {
    const result = formatMetricDelta(70.0, 75.0, 'cache_hit_trend_drop_region')
    expect(result).toContain('pp vs threshold')
  })

  it('shows positive sign when actual exceeds threshold for cache metric', () => {
    const result = formatMetricDelta(90.0, 80.0, 'cache_hit_low')
    expect(result).toContain('+')
    expect(result).toContain('10.0pp vs threshold')
  })

  it('shows ms for TTFB metrics above threshold', () => {
    const result = formatMetricDelta(350, 200, 'ttfb_threshold')
    expect(result).toContain('ms vs threshold')
    expect(result).toContain('150')
    expect(result).toContain('+')
  })

  it('shows minus sign for TTFB below threshold', () => {
    const result = formatMetricDelta(150, 200, 'ttfb_threshold')
    expect(result).toContain('ms vs threshold')
    expect(result).toContain('50')
    expect(result).toContain('−')
  })

  it('rounds ms to integers', () => {
    const result = formatMetricDelta(350.7, 200.3, 'ttfb_threshold')
    expect(result).not.toContain('.')
  })

  it('shows ms for down alert type', () => {
    const result = formatMetricDelta(1500, 1000, 'down')
    expect(result).toContain('ms vs threshold')
  })
})

// --- ActiveIncidentsPanel (null return for empty) ---

describe('ActiveIncidentsPanel', () => {
  it('returns null when incidents array is empty', () => {
    const result = ActiveIncidentsPanel({ incidents: [] })
    expect(result).toBeNull()
  })

  it('returns non-null for non-empty incidents', () => {
    const incident: ActiveIncident = {
      id: 'abc',
      alert_type: 'down',
      severity: 'critical',
      affected_regions: ['us-east-1'],
      opened_at: new Date().toISOString(),
      last_notified_at: null,
      notification_count: 1,
      snoozed_until: null,
      last_actual: null,
      last_threshold: null,
      duration_ms: 3_600_000,
    }
    const result = ActiveIncidentsPanel({ incidents: [incident] })
    expect(result).not.toBeNull()
  })
})
