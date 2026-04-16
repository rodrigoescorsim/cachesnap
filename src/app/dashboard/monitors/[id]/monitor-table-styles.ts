/**
 * Shared table styling for monitor dashboard (Real-time, Trends, Alerts, …).
 * Change once here to keep behaviour aligned across tables.
 */

/** CacheSnap brand wash on cards (logo cyan → blue). */
export const BRAND_CARD_SURFACE_GRADIENT =
  'pointer-events-none absolute inset-0 bg-gradient-to-bl from-[rgba(76,201,255,0.028)] via-transparent to-[rgba(0,136,255,0.035)]'

/** Same gradient at lower opacity — dense data tables. */
export const BRAND_TABLE_SURFACE_GRADIENT =
  'pointer-events-none absolute inset-0 bg-gradient-to-bl from-[rgba(76,201,255,0.010)] via-transparent to-[rgba(0,136,255,0.012)]'

/**
 * TTFB metric column: vertical “layer” + inset side rails (body cells).
 * Header uses neutral stack only where needed; see TH_TTFB_HEADER for label tone.
 */
export const TTFB_LAYER_NEUTRAL =
  'bg-white/[0.02] dark:bg-white/[0.03]'
export const TTFB_LAYER_FAST =
  'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]'
export const TTFB_LAYER_MED =
  'bg-amber-500/[0.04] dark:bg-amber-500/[0.08]'
export const TTFB_LAYER_SLOW =
  'bg-red-500/[0.04] dark:bg-red-500/[0.08]'
export const TTFB_COL_RAIL =
  '[box-shadow:inset_1px_0_0_rgba(255,255,255,0.03),inset_-1px_0_0_rgba(255,255,255,0.03)]'

/** TTFB-related column header — slightly brighter than default zinc-500 headers. */
export const TH_TTFB_HEADER = 'text-zinc-400'

/** Origin TTFB header — same tone + subtle semantic glow (readability without loud colour). */
export const TH_TTFB_HEADER_ORIGIN = `${TH_TTFB_HEADER} [text-shadow:0_0_14px_rgba(255,255,255,0.07)]`

export const MONITOR_TABLE = {
  transition: 'transition-all duration-200',
  theadRow: 'border-b border-border bg-white/[0.02]',
  tbodyRow:
    'border-b border-border/40 transition-colors hover:bg-white/[0.02] last:border-b-0',
  outerWrapper: 'cs-card',
  /** Softer surface (e.g. alerts list). */
  outerWrapperMuted: 'cs-card cs-card-glass',
  innerScroll: 'relative overflow-x-auto md:overflow-visible',
  tableBase: 'w-full text-sm',
} as const

/** Green — fast, amber — medium, red — slow (aggregate TTFB). */
export function ttfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms <= 150) return 'text-emerald-400'
  if (ms <= 250) return 'text-amber-500/90'
  return 'text-rose-400/90'
}

/** Edge TTFB — cache hit path. Same scale as core TTFB for consistency. */
export function edgeTtfbColor(ms: number | null): string {
  return ttfbColor(ms)
}

/** Origin TTFB — naturally slower, but we still flag above 250ms as a slowdown. */
export function originTtfbColor(ms: number | null): string {
  return ttfbColor(ms)
}

/** Real-time & Trends “Avg TTFB” — same tiers as ttfbColor(). */
export function ttfbMetricCellClass(ms: number | null): string {
  const base = `px-3 py-2.5 text-right font-bold tabular-nums ${TTFB_COL_RAIL}`
  if (ms == null) return `${base} text-zinc-400 ${TTFB_LAYER_NEUTRAL}`
  if (ms <= 150) return `${base} text-emerald-400 ${TTFB_LAYER_FAST}`
  if (ms <= 250) return `${base} text-amber-500/90 ${TTFB_LAYER_MED}`
  return `${base} text-rose-400/90 ${TTFB_LAYER_SLOW}`
}

/** Trends Edge TTFB column — edge tier thresholds. */
export function edgeTtfbMetricCellClass(ms: number | null): string {
  const base = `px-3 py-2.5 text-right font-semibold tabular-nums ${TTFB_COL_RAIL}`
  if (ms == null) return `${base} text-zinc-400 ${TTFB_LAYER_NEUTRAL}`
  const color = ttfbColor(ms)
  const layer = ms <= 150 ? TTFB_LAYER_FAST : ms <= 250 ? TTFB_LAYER_MED : TTFB_LAYER_SLOW
  return `${base} ${color} ${layer}`
}

/** Trends Origin TTFB column — origin tier thresholds. */
export function originTtfbMetricCellClass(ms: number | null): string {
  const base = `px-3 py-2.5 text-right font-semibold tabular-nums ${TTFB_COL_RAIL}`
  if (ms == null) return `${base} text-zinc-400 ${TTFB_LAYER_NEUTRAL}`
  const color = ttfbColor(ms)
  const layer = ms <= 150 ? TTFB_LAYER_FAST : ms <= 250 ? TTFB_LAYER_MED : TTFB_LAYER_SLOW
  return `${base} ${color} ${layer}`
}
