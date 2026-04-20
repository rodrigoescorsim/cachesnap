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

export const GLOBAL_CACHE = {
  GOOD:     80,  // %
  FAIR:     60,  // %
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
  const t = type === 'global' ? GLOBAL_CACHE : MONITOR_CACHE
  if (pct >= t.GOOD) return 'text-emerald-400'
  if (pct >= (type === 'global' ? t.FAIR : t.LOW)) return 'text-amber-400'
  return 'text-rose-500'
}

export function getHealthColor(score: number) {
  if (score >= GLOBAL_HEALTH.HEALTHY)  return 'text-emerald-400'
  if (score >= GLOBAL_HEALTH.DEGRADED) return 'text-amber-400'
  return 'text-rose-500'
}
