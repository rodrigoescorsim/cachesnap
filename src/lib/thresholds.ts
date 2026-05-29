/**
 * Centralized thresholds for performance metrics metrics.
 * Differentiates between individual monitor performance and global aggregate performance.
 */

import { isCacheHit, isCacheMiss } from '@/lib/cache-utils'

// ─── Individual Monitor Thresholds ──────────────────────────────────────────
export const MONITOR_TTFB = {
  ELITE: 250, // ms — ultra fast
  FAST: 500, // ms — default alert_threshold_hit_ms (cache HIT rows)
  SLOW: 1000, // ms
  /** Default alert_threshold_ms — lenient fast tier for cache MISS rows in Live tables. */
  MISS_FAST: 1500,
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
/**
 * Per-row TTFB "fast" tier (green boundary) for Live + public checker tables.
 * HIT → hit threshold; MISS → miss threshold; NO HEADER / bypass → hit threshold (strict).
 */
export function ttfbRowFastMs(
  cacheStatus: string | null | undefined,
  opts?: { thresholdHitMs?: number; thresholdMs?: number }
): number {
  const hitFast = opts?.thresholdHitMs ?? MONITOR_TTFB.FAST
  const missFast = opts?.thresholdMs ?? MONITOR_TTFB.MISS_FAST
  if (isCacheHit(cacheStatus)) return hitFast
  if (isCacheMiss(cacheStatus)) return missFast
  return hitFast
}

export function getTtfbTone(ms: number, type: 'monitor' | 'global' = 'monitor') {
  const t = type === 'global' ? GLOBAL_TTFB : MONITOR_TTFB
  if (ms < t.FAST) return 'success'
  if (ms > t.SLOW) return 'danger'
  return 'warning'
}

export function getTtfbColorClass(ms: number, type: 'monitor' | 'global' = 'monitor', fastMs?: number, slowMs?: number) {
  const t = type === 'global' ? GLOBAL_TTFB : MONITOR_TTFB
  const fast = fastMs ?? t.FAST
  const slow = slowMs ?? t.SLOW
  if (ms < Math.min(MONITOR_TTFB.ELITE, fast)) return 'text-metric-elite'
  if (ms < fast) return 'text-metric-ttfb-fast'
  if (ms > slow) return 'text-metric-ttfb-slow'
  return 'text-metric-ttfb-med'
}

export function getCacheColor(pct: number | null, type: 'monitor' | 'global' = 'monitor', warnPct?: number, criticalPct?: number) {
  if (pct === null) return 'text-zinc-500'
  const t = type === 'global' ? GLOBAL_CACHE : { GOOD: warnPct ?? MONITOR_CACHE.GOOD, FAIR: criticalPct ?? MONITOR_CACHE.LOW, PERFECT: GLOBAL_CACHE.PERFECT }
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

export function getTtfbTooltip(ms: number, type: 'monitor' | 'global' = 'monitor', fastMs?: number, slowMs?: number): string {
  const t = type === 'global' ? GLOBAL_TTFB : MONITOR_TTFB
  const fast = fastMs ?? t.FAST
  const slow = slowMs ?? t.SLOW
  if (ms < Math.min(MONITOR_TTFB.ELITE, fast)) return 'Excellent latency: Very fast.'
  if (ms < fast) return 'Good latency: Fast for most users.'
  if (ms > slow) return 'High latency: Above expected range.'
  return 'Moderate latency: Within normal range.'
}

export function getCacheTooltip(pct: number, type: 'monitor' | 'global' = 'monitor', warnPct?: number, criticalPct?: number): string {
  const t = type === 'global' ? GLOBAL_CACHE : { GOOD: warnPct ?? MONITOR_CACHE.GOOD, FAIR: criticalPct ?? MONITOR_CACHE.LOW, PERFECT: GLOBAL_CACHE.PERFECT }
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

