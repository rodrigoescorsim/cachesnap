/**
 * Centralized thresholds for performance metrics metrics.
 * Differentiates between individual monitor performance and global aggregate performance.
 */

// ─── Individual Monitor Thresholds ──────────────────────────────────────────
export const MONITOR_TTFB = {
  ELITE: 200, // ms — ultra fast
  FAST: 400, // ms
  SLOW: 800, // ms
}

export const MONITOR_CACHE = {
  GOOD: 80,  // %
  LOW: 50,  // %
}

// ─── Global Aggregate Thresholds ──────────────────────────────────────────────
// Global averages are naturally higher due to regional variance.
export const GLOBAL_TTFB = {
  ELITE: 250, // ms — global ultra fast
  FAST: 500, // ms
  SLOW: 1000, // ms
}

/** Global cache card: same bands as footer copy (GOOD / DEGRADED / CRITICAL). */
export const GLOBAL_CACHE = {
  PERFECT:  98,  // % — elite cache performance
  GOOD: 80,  // % — realistic edge target
  FAIR: 50,  // % — degraded band
}

export const GLOBAL_HEALTH = {
  HEALTHY: 90,  // %
  DEGRADED: 70,  // %
}

// ─── Utility Helpers ────────────────────────────────────────────────────────
export function getTtfbTone(ms: number, type: 'monitor' | 'global' = 'monitor') {
  const t = type === 'global' ? GLOBAL_TTFB : MONITOR_TTFB
  if (ms < t.FAST) return 'success'
  if (ms > t.SLOW) return 'danger'
  return 'warning'
}

export function getTtfbColorClass(ms: number, type: 'monitor' | 'global' = 'monitor') {
  const t = type === 'global' ? GLOBAL_TTFB : MONITOR_TTFB
  if (ms < t.ELITE) return 'text-metric-elite'
  if (ms < t.FAST) return 'text-metric-ttfb-fast'
  if (ms > t.SLOW) return 'text-metric-ttfb-slow'
  return 'text-metric-ttfb-med'
}

export function getCacheColor(pct: number, type: 'monitor' | 'global' = 'monitor') {
  const t = type === 'global' ? GLOBAL_CACHE : { GOOD: MONITOR_CACHE.GOOD, FAIR: MONITOR_CACHE.LOW, PERFECT: 98 }
  if (pct >= t.PERFECT) return 'text-metric-elite'
  if (pct >= t.GOOD) return 'text-metric-ttfb-fast'
  if (pct >= t.FAIR) return 'text-amber-400'
  return 'text-rose-500'
}

export function getHealthColor(score: number) {
  if (score >= GLOBAL_HEALTH.HEALTHY) return 'text-metric-ttfb-fast'
  if (score >= GLOBAL_HEALTH.DEGRADED) return 'text-amber-400'
  return 'text-rose-500'
}

export function getTtfbTooltip(ms: number, type: 'monitor' | 'global' = 'monitor'): string {
  const t = type === 'global' ? GLOBAL_TTFB : MONITOR_TTFB
  if (ms < t.ELITE) return `Elite performance! Ultra-fast response (<${t.ELITE}ms).`
  if (ms < t.FAST) return `Good performance. Fast response (<${t.FAST}ms).`
  if (ms > t.SLOW) return `Poor performance. Slow response (>${t.SLOW}ms).`
  return `Fair performance. Acceptable response (${t.FAST}ms - ${t.SLOW}ms).`
}

export function getCacheTooltip(pct: number, type: 'monitor' | 'global' = 'monitor'): string {
  const t = type === 'global' ? GLOBAL_CACHE : { GOOD: MONITOR_CACHE.GOOD, FAIR: MONITOR_CACHE.LOW, PERFECT: 98 }
  if (pct >= 100) return "Perfect Cache! 100% of requests served from edge."
  if (pct >= t.PERFECT) return `Perfect Cache! All requests served from edge (≥${t.PERFECT}%).`
  if (pct >= t.GOOD) return `Good efficiency. Most content served from CDN (≥${t.GOOD}%).`
  if (pct >= t.FAIR) return `Fair efficiency. Some requests reaching origin (${t.FAIR}% - ${t.GOOD}%).`
  return `Critical efficiency. High origin traffic (<${t.FAIR}%).`
}
