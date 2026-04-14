/**
 * Shared table styling for monitor dashboard (Real-time, Trends, Alerts, …).
 * Change once here to keep behaviour aligned across tables.
 */

/** CacheSnap brand wash on cards (logo cyan → blue). */
export const BRAND_CARD_SURFACE_GRADIENT =
  'pointer-events-none absolute inset-0 bg-gradient-to-bl from-[#4CC9FF]/[0.028] via-transparent to-[#0088FF]/[0.035]'

/** Same gradient at lower opacity — dense data tables. */
export const BRAND_TABLE_SURFACE_GRADIENT =
  'pointer-events-none absolute inset-0 bg-gradient-to-bl from-[#4CC9FF]/[0.010] via-transparent to-[#0088FF]/[0.012]'

/**
 * TTFB metric column: vertical “layer” + inset side rails (body cells).
 * Header uses neutral stack only where needed; see TH_TTFB_HEADER for label tone.
 */
export const TTFB_LAYER_NEUTRAL =
  'bg-[linear-gradient(180deg,rgba(0,0,0,0.035),rgba(0,0,0,0.015)),rgba(0,0,0,0.03)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015)),rgba(255,255,255,0.03)]'
export const TTFB_LAYER_FAST =
  'bg-[linear-gradient(180deg,rgba(16,185,129,0.045),rgba(0,0,0,0.015)),rgba(0,0,0,0.03)] dark:bg-[linear-gradient(180deg,rgba(16,185,129,0.09),rgba(255,255,255,0.015)),rgba(255,255,255,0.03)]'
export const TTFB_LAYER_MED =
  'bg-[linear-gradient(180deg,rgba(245,158,11,0.045),rgba(0,0,0,0.015)),rgba(0,0,0,0.03)] dark:bg-[linear-gradient(180deg,rgba(245,158,11,0.09),rgba(255,255,255,0.015)),rgba(255,255,255,0.03)]'
export const TTFB_LAYER_SLOW =
  'bg-[linear-gradient(180deg,rgba(239,68,68,0.045),rgba(0,0,0,0.015)),rgba(0,0,0,0.03)] dark:bg-[linear-gradient(180deg,rgba(239,68,68,0.09),rgba(255,255,255,0.015)),rgba(255,255,255,0.03)]'
export const TTFB_COL_RAIL =
  '[box-shadow:inset_1px_0_0_rgba(0,0,0,0.05),inset_-1px_0_0_rgba(0,0,0,0.05)] dark:[box-shadow:inset_1px_0_0_rgba(255,255,255,0.03),inset_-1px_0_0_rgba(255,255,255,0.03)]'

/** TTFB-related column header — slightly brighter than default zinc-500 headers. */
export const TH_TTFB_HEADER = 'text-zinc-400'

/** Origin TTFB header — same tone + subtle semantic glow (readability without loud colour). */
export const TH_TTFB_HEADER_ORIGIN = `${TH_TTFB_HEADER} [text-shadow:0_0_12px_rgba(255,255,255,0.05)] dark:[text-shadow:0_0_14px_rgba(255,255,255,0.07)]`

export const MONITOR_TABLE = {
  transition: '[&_td]:transition-[background_0.2s_ease] [&_th]:transition-[background_0.2s_ease]',
  theadRow: 'border-b border-border bg-black/[0.02] dark:bg-white/[0.02]',
  tbodyRow:
    'border-b border-black/[0.06] transition-colors hover:bg-black/[0.03] dark:border-white/[0.04] dark:hover:bg-white/[0.03] last:border-b-0',
  outerWrapper: 'relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm',
  /** Softer surface (e.g. alerts list). */
  outerWrapperMuted: 'relative overflow-hidden rounded-xl border border-border bg-surface/50 shadow-sm',
  innerScroll: 'relative overflow-x-auto',
  tableBase: 'w-full text-sm',
} as const

/** Green → fast, amber → medium, red — slow (aggregate TTFB). */
export function ttfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms <= 200) return 'text-emerald-600 dark:text-emerald-400'
  if (ms <= 600) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** Edge TTFB — cache hit path. */
export function edgeTtfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms <= 100) return 'text-emerald-500'
  if (ms <= 200) return 'text-green-500'
  if (ms <= 300) return 'text-amber-500'
  return 'text-red-500'
}

/** Origin TTFB — miss / origin path. */
export function originTtfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms <= 300) return 'text-emerald-500'
  if (ms <= 600) return 'text-green-500'
  if (ms <= 900) return 'text-amber-500'
  return 'text-red-500'
}

/** Real-time & Trends “Avg TTFB” — same tiers as ttfbColor(). */
export function ttfbMetricCellClass(ms: number | null): string {
  const base = `px-3 py-2.5 text-right font-bold tabular-nums ${TTFB_COL_RAIL}`
  if (ms == null) return `${base} text-zinc-400 ${TTFB_LAYER_NEUTRAL}`
  if (ms <= 200) return `${base} text-emerald-600 dark:text-emerald-400 ${TTFB_LAYER_FAST}`
  if (ms <= 600) return `${base} text-amber-600 dark:text-amber-400 ${TTFB_LAYER_MED}`
  return `${base} text-red-600 dark:text-red-400 ${TTFB_LAYER_SLOW}`
}

/** Trends Edge TTFB column — edge tier thresholds. */
export function edgeTtfbMetricCellClass(ms: number | null): string {
  const base = `px-3 py-2.5 text-right font-semibold tabular-nums ${TTFB_COL_RAIL}`
  if (ms == null) return `${base} text-zinc-400 ${TTFB_LAYER_NEUTRAL}`
  if (ms <= 200) return `${base} ${edgeTtfbColor(ms)} ${TTFB_LAYER_FAST}`
  if (ms <= 300) return `${base} ${edgeTtfbColor(ms)} ${TTFB_LAYER_MED}`
  return `${base} ${edgeTtfbColor(ms)} ${TTFB_LAYER_SLOW}`
}

/** Trends Origin TTFB column — origin tier thresholds. */
export function originTtfbMetricCellClass(ms: number | null): string {
  const base = `px-3 py-2.5 text-right font-semibold tabular-nums ${TTFB_COL_RAIL}`
  if (ms == null) return `${base} text-zinc-400 ${TTFB_LAYER_NEUTRAL}`
  if (ms <= 600) return `${base} ${originTtfbColor(ms)} ${TTFB_LAYER_FAST}`
  if (ms <= 900) return `${base} ${originTtfbColor(ms)} ${TTFB_LAYER_MED}`
  return `${base} ${originTtfbColor(ms)} ${TTFB_LAYER_SLOW}`
}
