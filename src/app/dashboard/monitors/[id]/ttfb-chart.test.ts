import { describe, it, expect } from 'vitest'
import { formatChartLabel, niceMax, globalBucketAverage, buildP95BandPath } from './ttfb-chart.helpers'
import type { ChartPoint } from './ttfb-chart'

// ── formatChartLabel ──────────────────────────────────────────────────────────

describe('formatChartLabel', () => {
  const iso = '2026-04-01T12:00:00.000Z'

  it('uses month + day format for the 7d range', () => {
    expect(formatChartLabel(iso, '7d')).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })

  it('uses month + day format for 30d', () => {
    expect(formatChartLabel(iso, '30d')).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })

  it('uses month + day format for 90d', () => {
    expect(formatChartLabel(iso, '90d')).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })

  it('uses HH:MM format for the 24h range', () => {
    expect(formatChartLabel(iso, '24h')).toMatch(/^\d{2}:\d{2}$/)
  })

  it('falls back to 24h format for unknown range values', () => {
    expect(formatChartLabel(iso, 'unknown')).toMatch(/^\d{2}:\d{2}$/)
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
      { bucket: 't1', value: 20 },
      { bucket: 't2', value: 50 },
    ])
  })

  it('treats null values as 0 — matches chart rendering semantics', () => {
    const sparse: MinPoint[] = [
      { bucket: 't1', dns: null, tls: null },
      { bucket: 't1', dns: 20, tls: 40 },
    ]
    const result = globalBucketAverage(['t1'], sparse, p => p.dns)
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

// ── buildP95BandPath ──────────────────────────────────────────────────────────

function makePoint(bucket: string, avg: number, p95: number | null): ChartPoint {
  return { bucket, region: 'us-east', ttfb_avg: avg, ttfb_p95: p95, dns_avg: null, tcp_avg: null, tls_avg: null, cache_hit_pct: null }
}

describe('buildP95BandPath', () => {
  const toX = (i: number) => i * 100
  const toY = (ms: number) => 180 - ms

  it('returns null with fewer than 2 buckets', () => {
    const map = new Map([['t1', makePoint('t1', 200, 400)]])
    expect(buildP95BandPath(['t1'], map, toX, toY)).toBeNull()
  })

  it('returns null when all p95 values are null', () => {
    const buckets = ['t1', 't2']
    const map = new Map([
      ['t1', makePoint('t1', 200, null)],
      ['t2', makePoint('t2', 300, null)],
    ])
    expect(buildP95BandPath(buckets, map, toX, toY)).toBeNull()
  })

  it('generates a valid SVG path string with complete data', () => {
    const buckets = ['t1', 't2', 't3']
    const map = new Map([
      ['t1', makePoint('t1', 100, 200)],
      ['t2', makePoint('t2', 150, 250)],
      ['t3', makePoint('t3', 120, 220)],
    ])
    const path = buildP95BandPath(buckets, map, toX, toY)
    expect(path).not.toBeNull()
    expect(path).toMatch(/^M /)
    expect(path).toMatch(/ L /)
    expect(path).toMatch(/Z$/)
  })

  it('ignores buckets without p95 and closes the path correctly', () => {
    const buckets = ['t1', 't2', 't3']
    const map = new Map([
      ['t1', makePoint('t1', 100, 200)],
      ['t2', makePoint('t2', 150, null)],
      ['t3', makePoint('t3', 120, 220)],
    ])
    const path = buildP95BandPath(buckets, map, toX, toY)
    // Only t1 and t3 have p95, so path should still be valid
    expect(path).not.toBeNull()
    expect(path).toMatch(/Z$/)
  })
})
