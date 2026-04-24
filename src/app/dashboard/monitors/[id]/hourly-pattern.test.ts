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
    expect(normalizeHourlyData([makePoint(0, 100), makePoint(23, 200)])).toHaveLength(24)
  })

  it('fills missing hours with null', () => {
    const result = normalizeHourlyData([makePoint(5, 100)])
    expect(result[0]).toBeNull()
    expect(result[4]).toBeNull()
    expect(result[6]).toBeNull()
  })

  it('preserves data for present hours', () => {
    const row = makePoint(12, 300)
    const result = normalizeHourlyData([row])
    expect(result[12]).toEqual(row)
  })

  it('places each hour in the correct index (hour 14 at index 14)', () => {
    const row = makePoint(14, 250)
    const result = normalizeHourlyData([row])
    expect(result[14]).toEqual(row)
    expect(result[13]).toBeNull()
    expect(result[15]).toBeNull()
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

  it('excludes hours with sample_count below the minimum', () => {
    const result = worstHours(data, 4, 6)
    expect(result).toHaveLength(0)
  })

  it('returns fewer than N when there are not enough eligible hours', () => {
    const sparse = [makePoint(0, 400, 10), makePoint(1, 200, 3)]
    const result = worstHours(sparse, 5, 5)
    expect(result).toHaveLength(1)
    expect(result[0].ttfb_avg).toBe(400)
  })
})

// ── bestHours ────────────────────────────────────────────────────────────────

describe('bestHours', () => {
  const data: HourlyPoint[] = [
    makePoint(0, 150, 10),
    makePoint(1, 80, 10),
    makePoint(2, 300, 10),
    makePoint(3, 50, 2),
  ]

  it('returns the N fastest sorted by ttfb_avg asc', () => {
    const result = bestHours(data, 2, 5)
    expect(result.map(p => p.ttfb_avg)).toEqual([80, 150])
  })

  it('excludes hours with sample_count below the minimum', () => {
    const result = bestHours(data, 4, 5)
    expect(result.every(p => p.sample_count >= 5)).toBe(true)
    expect(result).not.toContainEqual(expect.objectContaining({ hour_of_day: 3 }))
  })
})

// ── hourlyBarColor ────────────────────────────────────────────────────────────

describe('hourlyBarColor', () => {
  it('returns var(--metric-fast) for ttfb < 200', () => {
    expect(hourlyBarColor(199)).toContain('--metric-fast')
    expect(hourlyBarColor(0)).toContain('--metric-fast')
  })

  it('returns var(--metric-med) for ttfb between 200 and 499', () => {
    expect(hourlyBarColor(200)).toContain('--metric-med')
    expect(hourlyBarColor(350)).toContain('--metric-med')
    expect(hourlyBarColor(499)).toContain('--metric-med')
  })

  it('returns var(--metric-slow) for ttfb >= 500', () => {
    expect(hourlyBarColor(500)).toContain('--metric-slow')
    expect(hourlyBarColor(900)).toContain('--metric-slow')
  })

  it('treats exactly 200ms as med (boundary)', () => {
    expect(hourlyBarColor(200)).toContain('--metric-med')
  })

  it('treats exactly 500ms as slow (boundary)', () => {
    expect(hourlyBarColor(500)).toContain('--metric-slow')
  })
})
