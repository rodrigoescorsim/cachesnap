import { GLOBAL_CACHE, GLOBAL_TTFB } from '@/lib/thresholds'

export type GlobalFooterTone = 'success' | 'warning' | 'danger'

/** Status chip for Global Avg. TTFB — aligned with `getTtfbColorClass(..., 'global')` thresholds. */
export function globalTtfbFooterPill(liveTtfb: number): { label: string; tone: GlobalFooterTone } {
  if (liveTtfb < GLOBAL_TTFB.FAST) return { label: 'GOOD', tone: 'success' }
  if (liveTtfb < GLOBAL_TTFB.SLOW) return { label: 'DEGRADED', tone: 'warning' }
  return { label: 'CRITICAL', tone: 'danger' }
}

/** Explains snapshot vs pooled 24h monitor means; sign of `ttfbDelta` matches `calculateTrend(live, avg24h)`. */
export function globalTtfbFooterContext(liveTtfb: number, ttfbDelta: number): string {
  if (liveTtfb < GLOBAL_TTFB.FAST) {
    return `Under ${GLOBAL_TTFB.FAST}ms global average — healthy latency across active monitors.`
  }
  const abs = Math.abs(ttfbDelta)
  if (ttfbDelta < 0) {
    return `Latency ${abs}% below the pooled 24h average (mean of each active monitor's 24h mean).`
  }
  if (ttfbDelta > 0) {
    return `Latency ${abs}% above the pooled 24h average (mean of each active monitor's 24h mean).`
  }
  return 'Matches the pooled 24h average across active monitors.'
}

/** Status chip for Global Cache Hit — aligned with `getCacheColor(..., 'global')`. */
export function globalCacheFooterPill(liveHit: number): { label: string; tone: GlobalFooterTone } {
  if (liveHit >= GLOBAL_CACHE.GOOD) return { label: 'GOOD', tone: 'success' }
  if (liveHit >= GLOBAL_CACHE.FAIR) return { label: 'DEGRADED', tone: 'warning' }
  return { label: 'CRITICAL', tone: 'danger' }
}

export function globalCacheFooterContext(liveHit: number): string {
  if (liveHit >= GLOBAL_CACHE.GOOD) return 'Excellent edge efficiency.'
  if (liveHit >= GLOBAL_CACHE.FAIR) {
    return `Below ${GLOBAL_CACHE.GOOD}% target — room to improve.`
  }
  return `Well below ${GLOBAL_CACHE.GOOD}% target — cache effectiveness is weak.`
}

/** Shorter footer lines for compact dashboard strips (e.g. Monitors overview). */
export function globalTtfbFooterContextCompact(liveTtfb: number, ttfbDelta: number): string {
  if (liveTtfb < GLOBAL_TTFB.FAST) {
    return `Under ${GLOBAL_TTFB.FAST}ms aggregate.`
  }
  const abs = Math.abs(ttfbDelta)
  if (ttfbDelta < 0) return `${abs}% below pooled 24h average.`
  if (ttfbDelta > 0) return `${abs}% above pooled 24h average.`
  return 'Matches pooled 24h average.'
}

export function globalCacheFooterContextCompact(liveHit: number): string {
  if (liveHit >= GLOBAL_CACHE.GOOD) return 'On target.'
  if (liveHit >= GLOBAL_CACHE.FAIR) return `Below ${GLOBAL_CACHE.GOOD}% target.`
  return `Far below ${GLOBAL_CACHE.GOOD}% target.`
}

export const GLOBAL_TTFB_VALUE_TOOLTIP =
  "Simple mean across active monitors: each value is that monitor's latest TTFB averaged across regions. Paused monitors are excluded."

export const GLOBAL_CACHE_VALUE_TOOLTIP =
  'Simple mean of cache-hit % among active monitors that send a recognizable cache-status header. Monitors without cache data are excluded.'

export const GLOBAL_TTFB_TREND_TOOLTIP =
  "Percent change of this global snapshot vs the mean of each active monitor's 24h TTFB average. Lower latency is better (down arrow = improved vs 24h pool)."

export const GLOBAL_CACHE_TREND_TOOLTIP =
  "Percent change of this global snapshot vs the mean of each active monitor's 24h cache-hit average. Higher is better (up arrow = improved vs 24h pool)."
