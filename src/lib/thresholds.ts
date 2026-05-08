/**
 * Centralized thresholds for performance metrics metrics.
 * Differentiates between individual monitor performance and global aggregate performance.
 */

// ─── Individual Monitor Thresholds ──────────────────────────────────────────
export const MONITOR_TTFB = {
  ELITE: 250, // ms — ultra fast
  FAST: 500, // ms
  SLOW: 1000, // ms
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
  PERFECT: 98,  // % — elite cache performance
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

export function getCacheColor(pct: number | null, type: 'monitor' | 'global' = 'monitor') {
  if (pct === null) return 'text-zinc-500'
  const t = type === 'global' ? GLOBAL_CACHE : { GOOD: MONITOR_CACHE.GOOD, FAIR: MONITOR_CACHE.LOW, PERFECT: GLOBAL_CACHE.PERFECT }
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
  if (ms < t.ELITE) return 'Excellent latency: Very fast.'
  if (ms < t.FAST) return 'Good latency: Fast for most users.'
  if (ms > t.SLOW) return 'High latency: Above expected range.'
  return 'Moderate latency: Within normal range.'
}

export function getCacheTooltip(pct: number, type: 'monitor' | 'global' = 'monitor'): string {
  const t = type === 'global' ? GLOBAL_CACHE : { GOOD: MONITOR_CACHE.GOOD, FAIR: MONITOR_CACHE.LOW, PERFECT: GLOBAL_CACHE.PERFECT }
  if (pct >= 100) return '100% cache hit: All requests served from CDN.'
  if (pct >= t.PERFECT) return 'Very high cache: Almost all requests use CDN.'
  if (pct >= t.GOOD) return 'Good efficiency: Most requests use CDN.'
  if (pct >= t.FAIR) return 'Partial efficiency: Many requests still go to origin.'
  return 'Low efficiency: Most requests go to origin.'
}

export function getCacheHitTier(pct: number): 'high' | 'mid' | 'low' {
  if (pct >= MONITOR_CACHE.GOOD) return 'high'
  if (pct >= MONITOR_CACHE.LOW) return 'mid'
  return 'low'
}

