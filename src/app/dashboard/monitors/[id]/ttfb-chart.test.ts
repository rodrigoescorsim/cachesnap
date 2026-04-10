import { describe, it, expect } from 'vitest'
import { formatChartLabel, niceMax, globalBucketAverage } from './ttfb-chart.helpers'

// ── formatChartLabel ──────────────────────────────────────────────────────────

describe('formatChartLabel', () => {
  // Use a fixed ISO string that is unambiguous regardless of TZ offset
  const iso = '2026-04-01T12:00:00.000Z'

  it('uses month + day format for the 7d range', () => {
    const result = formatChartLabel(iso, '7d')
    // e.g. "Apr 1" — exact day may differ by timezone offset, just check shape
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })

  it('uses HH:MM format for the 24h range', () => {
    const result = formatChartLabel(iso, '24h')
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })

  it('falls back to 24h format for unknown range values', () => {
    const result = formatChartLabel(iso, 'unknown')
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })
})

// ── niceMax ───────────────────────────────────────────────────────────────────

describe('niceMax', () => {
  it('rounds up to the next multiple of step', () => {
    expect(niceMax(150, 100)).toBe(200)
    expect(niceMax(101, 100)).toBe(200)
  })

  it('keeps exact multiples unchanged', () => {
    expect(niceMax(100, 100)).toBe(100)
    expect(niceMax(300, 100)).toBe(300)
    expect(niceMax(75, 25)).toBe(75)
  })

  it('returns at least one step when maxValue is zero or small', () => {
    expect(niceMax(0, 100)).toBe(100)
    expect(niceMax(1, 50)).toBe(50)
  })

  it('respects fine-grained steps for small ranges', () => {
    expect(niceMax(32, 50)).toBe(50)
    expect(niceMax(51, 50)).toBe(100)
  })
})

// ── globalBucketAverage ───────────────────────────────────────────────────────

type MinPoint = { bucket: string; dns: number | null; tls: number | null }

describe('globalBucketAverage', () => {
  const allBuckets = ['t1', 't2']

  const data: MinPoint[] = [
    { bucket: 't1', dns: 10, tls: 20 },
    { bucket: 't1', dns: 30, tls: 40 },
    { bucket: 't2', dns: 50, tls: 60 },
  ]

  it('computes the mean per bucket', () => {
    const result = globalBucketAverage(allBuckets, data, p => p.dns)
    expect(result).toEqual([
      { bucket: 't1', value: 20 },  // (10 + 30) / 2
      { bucket: 't2', value: 50 },  // 50 / 1
    ])
  })

  it('treats null values as 0 — matches chart rendering semantics', () => {
    const sparse: MinPoint[] = [
      { bucket: 't1', dns: null, tls: null },
      { bucket: 't1', dns: 20, tls: 40 },
    ]
    const result = globalBucketAverage(['t1'], sparse, p => p.dns)
    // (0 + 20) / 2 = 10
    expect(result).toEqual([{ bucket: 't1', value: 10 }])
  })

  it('returns 0 for buckets absent from data', () => {
    const result = globalBucketAverage(['missing'], data, p => p.dns)
    expect(result).toEqual([{ bucket: 'missing', value: 0 }])
  })

  it('preserves bucket order from allBuckets', () => {
    const result = globalBucketAverage(['t2', 't1'], data, p => p.dns)
    expect(result.map(r => r.bucket)).toEqual(['t2', 't1'])
  })

  it('is generic — works with any object that has a bucket field', () => {
    const cacheData = [
      { bucket: 'b1', region: 'eu-west', cache_hit_pct: 80 },
      { bucket: 'b1', region: 'us-east', cache_hit_pct: 60 },
    ]
    const result = globalBucketAverage(['b1'], cacheData, p => p.cache_hit_pct)
    expect(result).toEqual([{ bucket: 'b1', value: 70 }])
  })
})
