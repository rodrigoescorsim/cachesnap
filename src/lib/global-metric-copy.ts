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
    return `Excellent global latency. Overall average is under ${GLOBAL_TTFB.FAST}ms.`
  }
  const abs = Math.abs(ttfbDelta)
  if (ttfbDelta < 0) {
    return `Performance is improving. Latency is ${abs}% faster than the 24h average.`
  }
  if (ttfbDelta > 0) {
    return `Performance is degrading. Latency is ${abs}% slower than the 24h average.`
  }
  return 'Latency matches the 24h global average.'
}

/** Status chip for Global Cache Hit — aligned with `getCacheColor(..., 'global')`. */
export function globalCacheFooterPill(liveHit: number): { label: string; tone: GlobalFooterTone } {
  if (liveHit >= GLOBAL_CACHE.GOOD) return { label: 'GOOD', tone: 'success' }
  if (liveHit >= GLOBAL_CACHE.FAIR) return { label: 'DEGRADED', tone: 'warning' }
  return { label: 'CRITICAL', tone: 'danger' }
}

export function globalCacheFooterContext(liveHit: number): string {
  if (liveHit >= GLOBAL_CACHE.GOOD) return 'Excellent efficiency. Most content is served from the CDN.'
  if (liveHit >= GLOBAL_CACHE.FAIR) return 'Partial efficiency. Many requests are reaching the origin.'
  return 'Low efficiency. Cache effectiveness is weak.'
}

/** Shorter footer lines for compact dashboard strips (e.g. Monitors overview). */
export function globalTtfbFooterContextCompact(liveTtfb: number, ttfbDelta: number): string {
  if (liveTtfb < GLOBAL_TTFB.FAST) {
    return 'Healthy global latency.'
  }
  const abs = Math.abs(ttfbDelta)
  if (ttfbDelta < 0) return `${abs}% faster than 24h avg.`
  if (ttfbDelta > 0) return `${abs}% slower than 24h avg.`
  return 'Matches 24h average.'
}

export function globalCacheFooterContextCompact(liveHit: number): string {
  if (liveHit >= GLOBAL_CACHE.GOOD) return 'High efficiency.'
  if (liveHit >= GLOBAL_CACHE.FAIR) return 'Partial efficiency.'
  return 'Low efficiency.'
}

export const GLOBAL_TTFB_VALUE_TOOLTIP =
  'Average latency across all active monitors.'

export const GLOBAL_CACHE_VALUE_TOOLTIP =
  'Average cache hit rate across all active monitors.'

export const GLOBAL_TTFB_TREND_TOOLTIP =
  'Latency change compared to the 24h global average. Lower is better.'

export const GLOBAL_CACHE_TREND_TOOLTIP =
  'Cache efficiency change compared to the 24h global average. Higher is better.'
