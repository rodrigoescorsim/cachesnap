/**
 * Change once here to keep behaviour aligned across tables.
 */
import { MONITOR_TTFB } from '@/lib/thresholds'

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
/** Background washes — paired with .text-metric-ttfb-* in globals.css (:root --metric-*). */
export const TTFB_LAYER_FAST = 'bg-metric-layer-fast'
export const TTFB_LAYER_MED = 'bg-metric-layer-med'
export const TTFB_LAYER_SLOW = 'bg-metric-layer-slow'
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
  /** Tighter vertical padding than cs-table-compact defaults (Live + Trends data tables). */
  tableDense: '[&_th]:!py-2 [&_td]:!py-2',
} as const

/** Green — fast, amber — medium, red — slow (aggregate TTFB). Maps to .text-metric-ttfb-* in globals.css. */
export function ttfbColor(ms: number | null): string {
  if (ms == null) return 'text-zinc-400'
  if (ms <= MONITOR_TTFB.FAST) return 'text-metric-ttfb-fast'
  if (ms <= MONITOR_TTFB.SLOW) return 'text-metric-ttfb-med'
  return 'text-metric-ttfb-slow'
}

/** Real-time & Trends “Avg TTFB” — same tiers as ttfbColor(). */
export function ttfbMetricCellClass(ms: number | null): string {
  const base = `px-3 py-2.5 text-right font-bold tabular-nums ${TTFB_COL_RAIL}`
  if (ms == null) return `${base} text-zinc-400 ${TTFB_LAYER_NEUTRAL}`
  if (ms <= MONITOR_TTFB.FAST) return `${base} text-metric-ttfb-fast ${TTFB_LAYER_FAST}`
  if (ms <= MONITOR_TTFB.SLOW) return `${base} text-metric-ttfb-med ${TTFB_LAYER_MED}`
  return `${base} text-metric-ttfb-slow ${TTFB_LAYER_SLOW}`
}

/** Trends Edge/Origin TTFB columns — same tiers as ttfbColor(), semibold weight. */
export function edgeTtfbMetricCellClass(ms: number | null): string {
  const base = `px-3 py-2.5 text-right font-semibold tabular-nums ${TTFB_COL_RAIL}`
  if (ms == null) return `${base} text-zinc-400 ${TTFB_LAYER_NEUTRAL}`
  const layer = ms <= MONITOR_TTFB.FAST ? TTFB_LAYER_FAST : ms <= MONITOR_TTFB.SLOW ? TTFB_LAYER_MED : TTFB_LAYER_SLOW
  return `${base} ${ttfbColor(ms)} ${layer}`
}

export const originTtfbMetricCellClass = edgeTtfbMetricCellClass
