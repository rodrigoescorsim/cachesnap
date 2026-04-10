/**
 * Pure helpers for the time-series chart components.
 * Extracted here so they can be unit-tested without mounting React.
 */

/**
 * Formats a bucket ISO timestamp for X-axis labels.
 * 7d range → "Apr 1", 24h range → "14:30"
 */
export function formatChartLabel(iso: string, range: string): string {
  const d = new Date(iso)
  if (range === '7d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
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
 * a missing DNS/TLS reading should not inflate the average.
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
