/**
 * Pure helpers for the hourly pattern chart.
 * Extracted for unit testing without mounting React.
 */

export interface HourlyPoint {
  hour_of_day: number
  ttfb_avg: number
  ttfb_p95: number | null
  cache_hit_pct: number | null
  sample_count: number
}

/**
 * Ensures a 24-element array (hours 0–23), filling missing hours with null.
 * Missing hours occur when no probes ran during that hour in the period.
 */
export function normalizeHourlyData(rows: HourlyPoint[]): Array<HourlyPoint | null> {
  const result: Array<HourlyPoint | null> = Array(24).fill(null)
  for (const row of rows) {
    if (row.hour_of_day >= 0 && row.hour_of_day <= 23) {
      result[row.hour_of_day] = row
    }
  }
  return result
}

/**
 * Returns the N hours with the highest avg TTFB, sorted descending.
 * Hours with fewer than minSamples are excluded.
 */
export function worstHours(data: HourlyPoint[], n: number, minSamples: number): HourlyPoint[] {
  return [...data]
    .filter(p => p.sample_count >= minSamples)
    .sort((a, b) => b.ttfb_avg - a.ttfb_avg)
    .slice(0, n)
}

/**
 * Returns the N hours with the lowest avg TTFB, sorted ascending.
 * Hours with fewer than minSamples are excluded.
 */
export function bestHours(data: HourlyPoint[], n: number, minSamples: number): HourlyPoint[] {
  return [...data]
    .filter(p => p.sample_count >= minSamples)
    .sort((a, b) => a.ttfb_avg - b.ttfb_avg)
    .slice(0, n)
}

/**
 * Returns a CSS variable color based on TTFB thresholds from the design system.
 * fast (<200ms): var(--metric-fast)
 * med (200–500ms): var(--metric-med)
 * slow (>500ms): var(--metric-slow)
 * Boundaries: 200ms → med, 500ms → slow
 */
export function hourlyBarColor(ttfb: number): string {
  if (ttfb < 200) return 'var(--metric-fast, #22FF88)'
  if (ttfb < 500) return 'var(--metric-med, #f59e0b)'
  return 'var(--metric-slow, #f43f5e)'
}
