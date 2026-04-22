/**
 * Centralized thresholds for performance metrics metrics.
 * Differentiates between individual monitor performance and global aggregate performance.
 */

// ─── Individual Monitor Thresholds ──────────────────────────────────────────
export const MONITOR_TTFB = {
  FAST:     250, // ms
  SLOW:     600, // ms
}

export const MONITOR_CACHE = {
  GOOD:     80,  // %
  LOW:      40,  // %
}

// ─── Global Aggregate Thresholds ──────────────────────────────────────────────
// Global averages are naturally higher due to regional variance.
export const GLOBAL_TTFB = {
  FAST:     300, // ms
  SLOW:     500, // ms
}

/** Global cache card: same bands as footer copy (GOOD / DEGRADED / CRITICAL). */
export const GLOBAL_CACHE = {
  GOOD:     85,  // % — product target; matches footer “target”
  FAIR:     70,  // % — degraded band
}

export const GLOBAL_HEALTH = {
  HEALTHY:  90,  // %
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
  if (ms < t.FAST) return 'text-metric-ttfb-fast'
  if (ms > t.SLOW) return 'text-metric-ttfb-slow'
  return 'text-metric-ttfb-med'
}

export function getCacheColor(pct: number, type: 'monitor' | 'global' = 'monitor') {
  if (pct >= (type === 'global' ? GLOBAL_CACHE.GOOD : MONITOR_CACHE.GOOD)) return 'text-metric-ttfb-fast'
  if (pct >= (type === 'global' ? GLOBAL_CACHE.FAIR : MONITOR_CACHE.LOW))  return 'text-amber-400'
  return 'text-rose-500'
}

export function getHealthColor(score: number) {
  if (score >= GLOBAL_HEALTH.HEALTHY)  return 'text-metric-ttfb-fast'
  if (score >= GLOBAL_HEALTH.DEGRADED) return 'text-amber-400'
  return 'text-rose-500'
}
