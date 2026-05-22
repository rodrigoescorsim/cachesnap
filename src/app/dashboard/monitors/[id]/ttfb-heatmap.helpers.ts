/**
 * Pure helpers for the TTFB × day-of-week heatmap component.
 * Extracted for unit testing without mounting React.
 */

export interface HeatmapCell {
  dow: number           // 0=Sun, 1=Mon, ..., 6=Sat
  hour_of_day: number   // 0–23
  ttfb_avg: number | null
  cache_hit_pct: number | null
  sample_count: number
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Short day-of-week label. DOW 0=Sun, returns '?' for out-of-range values. */
export function dowLabel(dow: number): string {
  return DOW_LABELS[dow] ?? '?'
}

/**
 * Interpolates between two hex colors given a normalized value t ∈ [0, 1].
 * t is clamped to [0, 1].
 */
export function interpolateColor(t: number, from: string, to: string): string {
  const clamped = Math.max(0, Math.min(1, t))
  const parse = (hex: string) => {
    const h = hex.replace('#', '')
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ]
  }
  const [r1, g1, b1] = parse(from)
  const [r2, g2, b2] = parse(to)
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * clamped)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(lerp(r1, r2))}${toHex(lerp(g1, g2))}${toHex(lerp(b1, b2))}`
}

// Hex equivalents of the design system CSS vars
const FAST_HEX  = '#22FF88'
const MED_HEX   = '#f59e0b'
const SLOW_HEX  = '#f43f5e'
const EMPTY_HEX = '#1F2A3A'

/**
 * Maps a TTFB value to a hex color using an Absolute-Weighted Hybrid scale.
 * 
 * - Absolute Weight (60%): Ensures values stay within their semantic category (e.g. <400ms stays Greenish).
 * - Relative Weight (40%): Provides internal resolution to see peaks and valleys relative to the site's average.
 */
export function heatmapTtfbColor(ttfb: number | null, siteAvg: number): string {
  if (ttfb == null) return EMPTY_HEX

  // 1. Absolute Factor: 0 (0ms) to 1 (800ms+)
  // This anchors the color in the global performance tiers.
  const absT = Math.max(0, Math.min(1, ttfb / 800))

  // 2. Relative Factor: 0 (Best for site) to 1 (Worst for site)
  // We use a narrower window (+/- 40% of avg) for higher sensitivity.
  const min = siteAvg * 0.6
  const max = siteAvg * 1.4
  const relT = max === min ? 0.5 : Math.max(0, Math.min(1, (ttfb - min) / (max - min)))

  // 3. Blended T: Heavily weighted by absolute category to prevent "false negatives"
  // For an elite value (e.g. 366ms), the absT (~0.45) will keep it in the Green-Yellow band.
  const t = (relT * 0.4) + (absT * 0.6)

  // 4. Color Mapping with Elite Floor
  if (t < 0.3) return FAST_HEX // Solid Elite Green
  if (t < 0.6) {
    // Transition from Fast Green to Amber
    const factor = (t - 0.3) / 0.3
    return interpolateColor(factor, FAST_HEX, MED_HEX)
  }
  // Transition from Amber to Slow Red
  const factor = (t - 0.6) / 0.4
  return interpolateColor(factor, MED_HEX, SLOW_HEX)
}

/**
 * Maps a cache hit percentage to a hex color.
 * 0% → slow color, 100% → fast color.
 * null → surface-muted (#1F2A3A).
 * Values > 100 are clamped to 100.
 */
export function heatmapCacheColor(pct: number | null): string {
  if (pct == null) return EMPTY_HEX
  const t = Math.max(0, Math.min(100, pct)) / 100
  // Inverted: high cache hit → fast (good)
  if (t > 0.5) return interpolateColor((t - 0.5) * 2, MED_HEX, FAST_HEX)
  return interpolateColor(t * 2, SLOW_HEX, MED_HEX)
}

/**
 * Builds a 7×24 grid (indexed [dow][hour]) from query rows.
 * Missing slots are null. Duplicates: first occurrence wins.
 */
export function buildHeatmapGrid(rows: HeatmapCell[]): Array<Array<HeatmapCell | null>> {
  const grid: Array<Array<HeatmapCell | null>> = Array.from({ length: 7 }, () => Array(24).fill(null))
  for (const row of rows) {
    if (row.dow >= 0 && row.dow <= 6 && row.hour_of_day >= 0 && row.hour_of_day <= 23) {
      if (grid[row.dow][row.hour_of_day] === null) {
        grid[row.dow][row.hour_of_day] = row
      }
    }
  }
  return grid
}
