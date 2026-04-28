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
 * Maps a TTFB value to a hex color using a hybrid Contextual + Semantic scale.
 * 
 * - Site Context: We show variance based on the site's own average (+/- 50%).
 * - Global Semantics: The color hue (Green/Amber/Red) is anchored by absolute performance.
 *   - Elite sites (<250ms) oscillate between Green and Amber (never Red).
 *   - Slow sites (>800ms) oscillate between Amber and Red (never Green).
 */
export function heatmapTtfbColor(ttfb: number | null, siteAvg: number): string {
  if (ttfb == null) return EMPTY_HEX

  // 1. Calculate relative position within the site's own variance window (+/- 50% of avg)
  const min = siteAvg * 0.5
  const max = siteAvg * 1.5
  const relT = Math.max(0, Math.min(1, (ttfb - min) / (max - min)))

  // 2. Determine semantic anchor colors based on site average
  let start = FAST_HEX
  let mid = MED_HEX
  let end = SLOW_HEX

  if (siteAvg < 250) {
    // Elite site: Oscillate between Deep Green and Amber (Light Green as midpoint)
    start = FAST_HEX
    mid = interpolateColor(0.5, FAST_HEX, MED_HEX) // Vibrant Light Green
    end = MED_HEX
  } else if (siteAvg > 800) {
    // Slow site: Oscillate between Amber and Deep Red (Orange as midpoint)
    start = MED_HEX
    mid = interpolateColor(0.5, MED_HEX, SLOW_HEX) // Vivid Orange
    end = SLOW_HEX
  }

  // 3. Final interpolation based on the contextual variance
  if (relT < 0.5) return interpolateColor(relT * 2, start, mid)
  return interpolateColor((relT - 0.5) * 2, mid, end)
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
