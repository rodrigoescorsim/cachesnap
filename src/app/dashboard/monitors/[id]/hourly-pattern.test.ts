import { describe, it, expect } from 'vitest'
import {
  normalizeHourlyData,
  worstHours,
  bestHours,
  hourlyBarColor,
  type HourlyPoint,
} from './hourly-pattern.helpers'

function makePoint(hour: number, ttfb: number, samples = 10): HourlyPoint {
  return { hour_of_day: hour, ttfb_avg: ttfb, ttfb_p95: null, cache_hit_pct: null, sample_count: samples }
}

// ── normalizeHourlyData ───────────────────────────────────────────────────────

describe('normalizeHourlyData', () => {
  it('returns array of exactly 24 elements', () => {
    expect(normalizeHourlyData([])).toHaveLength(24)
  })

  it('fills missing hours with null', () => {
    const result = normalizeHourlyData([makePoint(5, 100)])
    expect(result[0]).toBeNull()
    expect(result[5]).not.toBeNull()
  })
})

// ── worstHours ───────────────────────────────────────────────────────────────

describe('worstHours', () => {
  const data: HourlyPoint[] = [
    makePoint(10, 100, 5),
    makePoint(11, 500, 5),
    makePoint(12, 300, 5),
    makePoint(13, 800, 5),
  ]

  it('returns the N slowest sorted by ttfb_avg desc', () => {
    const result = worstHours(data, 2, 1)
    expect(result.map(p => p.ttfb_avg)).toEqual([800, 500])
  })
})

// ── hourlyBarColor ────────────────────────────────────────────────────────────
const FAST_HEX = '#22FF88'

describe('hourlyBarColor', () => {
  it('returns hex colors instead of CSS variables', () => {
    const color = hourlyBarColor(100, 200)
    expect(color).toMatch(/^#/)
  })

  it('is green for low TTFB relative to average', () => {
    const color = hourlyBarColor(100, 200)
    expect(color).toBe(FAST_HEX)
  })

  it('shows variance even for elite sites', () => {
    const v1 = hourlyBarColor(80, 100)
    const v2 = hourlyBarColor(180, 100)
    expect(v1).not.toBe(v2)
  })

  it('anchors in absolute slow for high values', () => {
    const color = hourlyBarColor(1200, 1000)
    // Should be Red-ish
    const r = parseInt(color.slice(1, 3), 16)
    const b = parseInt(color.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })
})
