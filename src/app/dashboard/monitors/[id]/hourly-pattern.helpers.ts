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
 * Maps a TTFB value to a hex color using the same Absolute-Weighted Hybrid scale as the heatmap.
 * 
 * - Absolute Weight (60%): Anchors color in global tiers (<400ms is Greenish).
 * - Relative Weight (40%): Provides resolution based on site average.
 */
export function hourlyBarColor(ttfb: number, siteAvg: number): string {
  // Use same hex constants as heatmap for consistency
  const FAST_HEX = '#22FF88'
  const MED_HEX  = '#f59e0b'
  const SLOW_HEX = '#f43f5e'

  // 1. Interpolation helper (inline to avoid circular dependencies)
  const interpolate = (t: number, from: string, to: string) => {
    const parse = (hex: string) => {
      const h = hex.replace('#', '')
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
    }
    const [r1, g1, b1] = parse(from)
    const [r2, g2, b2] = parse(to)
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
    const toHex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${toHex(lerp(r1, r2))}${toHex(lerp(g1, g2))}${toHex(lerp(b1, b2))}`
  }

  // 2. Calculate blended T factor
  const absT = Math.max(0, Math.min(1, ttfb / 800))
  const min = siteAvg * 0.6
  const max = siteAvg * 1.4
  const relT = max === min ? 0.5 : Math.max(0, Math.min(1, (ttfb - min) / (max - min)))
  
  const t = (relT * 0.4) + (absT * 0.6)

  // 3. Map to semantic scale
  if (t < 0.3) return FAST_HEX
  if (t < 0.6) return interpolate((t - 0.3) / 0.3, FAST_HEX, MED_HEX)
  return interpolate((t - 0.6) / 0.4, MED_HEX, SLOW_HEX)
}
