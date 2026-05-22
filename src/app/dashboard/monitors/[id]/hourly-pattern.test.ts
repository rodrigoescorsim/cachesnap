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

  it('discards out-of-range hour_of_day values', () => {
    const result = normalizeHourlyData([makePoint(-1, 100), makePoint(24, 200)])
    expect(result.every(p => p === null)).toBe(true)
  })

  it('places point at the correct index', () => {
    const point = makePoint(23, 400)
    const result = normalizeHourlyData([point])
    expect(result[23]).toEqual(point)
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

  it('returns [] for empty data', () => {
    expect(worstHours([], 3, 1)).toEqual([])
  })

  it('excludes hours below minSamples', () => {
    const result = worstHours(data, 4, 10)
    expect(result).toEqual([])
  })

  it('does not exceed n results even with more data', () => {
    const result = worstHours(data, 1, 1)
    expect(result).toHaveLength(1)
    expect(result[0].ttfb_avg).toBe(800)
  })
})

// ── bestHours ─────────────────────────────────────────────────────────────────

describe('bestHours', () => {
  const data: HourlyPoint[] = [
    makePoint(10, 100, 5),
    makePoint(11, 500, 5),
    makePoint(12, 300, 5),
    makePoint(13, 800, 5),
  ]

  it('returns the N fastest sorted by ttfb_avg asc', () => {
    const result = bestHours(data, 2, 1)
    expect(result.map(p => p.ttfb_avg)).toEqual([100, 300])
  })

  it('returns [] for empty data', () => {
    expect(bestHours([], 3, 1)).toEqual([])
  })

  it('excludes hours below minSamples', () => {
    const result = bestHours(data, 4, 10)
    expect(result).toEqual([])
  })

  it('does not exceed n results', () => {
    const result = bestHours(data, 1, 1)
    expect(result).toHaveLength(1)
    expect(result[0].ttfb_avg).toBe(100)
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

  it('returns a valid hex color when siteAvg is 0', () => {
    const color = hourlyBarColor(200, 0)
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})
