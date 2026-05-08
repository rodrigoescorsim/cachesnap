/**
 * Pure helpers for the time-series chart components.
 * Extracted here so they can be unit-tested without mounting React.
 */

import type { ChartPoint } from './ttfb-chart'

/**
 * Formats a bucket ISO timestamp for X-axis labels.
 * 7d/30d/90d range → "Apr 1", 24h range → "14:30"
 */
export function formatChartLabel(iso: string, range: string): string {
  const d = new Date(iso)
  if (range === '7d' || range === '30d' || range === '90d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  // 1h and 4h show hours + minutes; 24h and fallback show HH:MM
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Rounds maxValue up to the nearest multiple of step, with a minimum of step.
 * Used to compute clean Y-axis ceilings (e.g., 150 ms → 200 ms with step=100).
 */
export function niceMax(maxValue: number, step: number): number {
  if (step <= 0) return step
  return Math.max(Math.ceil(maxValue / step) * step, step)
}

/**
 * Computes the per-bucket cross-region average for a numeric metric.
 * NULL values are treated as 0, matching chart render semantics where
 * a missing DNS/TCP/TLS reading should not inflate the average.
 */
export function globalBucketAverage<T extends { bucket: string }>(
  allBuckets: string[],
  data: T[],
  getValue: (p: T) => number | null,
): Array<{ bucket: string; value: number }> {
  return allBuckets.map(bucket => {
    const points = data.filter(d => d.bucket === bucket)
    if (points.length === 0) return { bucket, value: 0 }
    const total = points.reduce((acc, p) => acc + (getValue(p) ?? 0), 0)
    return { bucket, value: total / points.length }
  })
}

/**
 * Builds an SVG polygon path for the P95 band (avg → p95 fill, traversed back).
 * Returns null when fewer than 2 points exist or all p95 values are null.
 */
export function buildP95BandPath(
  allBuckets: string[],
  regionData: Map<string, ChartPoint>,
  toX: (i: number) => number,
  toY: (ms: number) => number,
): string | null {
  if (allBuckets.length < 2) return null

  const validPoints: Array<{ i: number; avg: number; p95: number }> = []
  for (let i = 0; i < allBuckets.length; i++) {
    const p = regionData.get(allBuckets[i])
    if (p && p.ttfb_p95 != null) {
      validPoints.push({ i, avg: p.ttfb_avg, p95: p.ttfb_p95 })
    }
  }
  if (validPoints.length < 2) return null

  // Forward pass along avg line, then backward along p95
  const forward = validPoints.map(({ i, avg }) => `${toX(i)},${toY(avg)}`).join(' L ')
  const backward = [...validPoints].reverse().map(({ i, p95 }) => `${toX(i)},${toY(p95)}`).join(' L ')

  return `M ${forward} L ${backward} Z`
}
