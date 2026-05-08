import { MONITOR_TTFB, MONITOR_CACHE } from '@/lib/thresholds'
import { getCacheDisplayLabel, isCacheBypass } from '@/lib/cache-utils'

export type MonitorStatus = 'active' | 'paused'
export type TtfbTier = 'fast' | 'med' | 'slow'
export type CacheHitTier = 'high' | 'mid' | 'low'

export interface MonitorRegion {
  code: string
  flag: string
  label: string
  isSlow: boolean
  isError: boolean
}

export interface Monitor {
  id: string
  name: string
  url: string
  status: MonitorStatus
  ttfbCurrent: number
  ttfbCurrentDelta: number
  ttfbAvg24h: number
  ttfbSparkline: number[]
  // null = CDN/origin doesn't report a recognisable cache-status header
  cacheHitCurrent: number | null
  cacheHitAvg24h: number | null
  cacheHitDelta: number | null
  cacheStatusCurrent: string | null
  regions: MonitorRegion[]
  slowRegionCount: number
  totalRegionCount: number
  /** How many regions reported a connection error (timeout, empty reply, DNS fail) on their latest probe. */
  errorRegionCount: number
  /** How many regions reported a 5xx status code on their latest probe. */
  error5xxCount: number
  /** How many regions reported a 4xx status code (excluding 401/403/404) on their latest probe. */
  error4xxCount: number
  isWafBlocked: boolean
  uptime24h: number | null
  lastCheckedAt: Date
}

export interface Alert {
  id: string
  region: string
  alert_type: string
  metric: string
  baseline_ms: number | null
  actual_ms: number | null
  deviation_factor: number | null
  diagnosis: string | null
  action: string | null
  delta_pct: number | null
  comparator: string | null
  scope: string | null
  created_at: Date
}

export function getTtfbTier(ms: number): TtfbTier {
  if (ms < MONITOR_TTFB.FAST) return 'fast'
  if (ms <= MONITOR_TTFB.SLOW) return 'med'
  return 'slow'
}

export function getCacheHitTier(pct: number): CacheHitTier {
  if (pct >= MONITOR_CACHE.GOOD) return 'high'
  if (pct >= MONITOR_CACHE.LOW) return 'mid'
  return 'low'
}

/**
 * When false, numeric `cacheHitCurrent` must not drive health filters or scores — same idea as
 * quick-filter "low-cache-hit" (NO HEADER; BYPASS / DYNAMIC / etc. are intentional, not a failed 0%).
 */
export function monitorCacheHitIsComparable(m: Monitor): boolean {
  const statusLabel = getCacheDisplayLabel(m.cacheStatusCurrent)
  if (statusLabel === 'NO HEADER') return false
  if (isCacheBypass(m.cacheStatusCurrent)) return false
  return true
}

/**
 * Per-monitor health 0–100 (pessimistic components so the global summary can use min()).
 * Aligns with quick-filter "healthy": TTFB < FAST threshold and cache unset or > GOOD threshold.
 */
export function monitorHealthScore(m: Monitor): number {
  // Full outage: all probed regions are failing — site is unreachable
  if (m.totalRegionCount > 0 && m.errorRegionCount >= m.totalRegionCount) return 0
  let score = 100
  // Partial outage penalty: proportional to failing region ratio
  if (m.errorRegionCount > 0 && m.totalRegionCount > 0) {
    score -= Math.round((m.errorRegionCount / m.totalRegionCount) * 60)
  }
  if (m.ttfbCurrent >= MONITOR_TTFB.FAST) {
    score -= Math.min(55, Math.round((m.ttfbCurrent - MONITOR_TTFB.FAST) * 0.4))
  }
  if (
    monitorCacheHitIsComparable(m) &&
    m.cacheHitCurrent !== null &&
    m.cacheHitCurrent <= MONITOR_CACHE.GOOD
  ) {
    score -= Math.round((MONITOR_CACHE.GOOD - m.cacheHitCurrent) * 1.2)
  }
  return Math.max(0, Math.min(100, score))
}

/** Chips da lista Active Monitors (Etapa 3) — um ativo por vez. */
export type MonitorQuickFilterId =
  | 'all'
  | 'healthy'
  | 'degraded'
  | 'high-ttfb'
  | 'low-cache-hit'
  | 'down'
  | 'missing-cache-headers'

export function monitorMatchesSearch(monitor: Monitor, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  // Support multiple filters separated by commas (AND logic)
  const parts = q.split(',').map((p) => p.trim()).filter(Boolean)

  return parts.every((part) => {
    // 1. TTFB: "ttfb > 300", "ttfb:200", "> 500" (assume ttfb if just op + num)
    const ttfbMatch = part.match(/^(?:ttfb\s*)?([><=:]+)\s*(\d+)/)
    if (ttfbMatch) {
      const op = ttfbMatch[1]
      const val = parseInt(ttfbMatch[2], 10)
      if (op === '>') return monitor.ttfbCurrent > val
      if (op === '<') return monitor.ttfbCurrent < val
      if (op === '=' || op === ':') return monitor.ttfbCurrent === val
      if (op === '>=') return monitor.ttfbCurrent >= val
      if (op === '<=') return monitor.ttfbCurrent <= val
    }

    // 2. Cache: "cache > 80", "hit < 50" (skip when % is not comparable — bypass / no header)
    const cacheMatch = part.match(/^(?:cache|hit)\s*([><=:]+)\s*(\d+)/)
    if (cacheMatch) {
      if (!monitorCacheHitIsComparable(monitor) || monitor.cacheHitCurrent === null) return false
      const op = cacheMatch[1]
      const val = parseInt(cacheMatch[2], 10)
      if (op === '>') return monitor.cacheHitCurrent > val
      if (op === '<') return monitor.cacheHitCurrent < val
      if (op === '=' || op === ':') return monitor.cacheHitCurrent === val
      if (op === '>=') return monitor.cacheHitCurrent >= val
      if (op === '<=') return monitor.cacheHitCurrent <= val
    }

    // 3. Special Keywords
    if (part === 'cache miss' || part === 'miss')
      return (
        monitorCacheHitIsComparable(monitor) &&
        monitor.cacheHitCurrent !== null &&
        monitor.cacheHitCurrent < 100
      )
    if (part === 'active') return monitor.status === 'active'
    if (part === 'paused') return monitor.status === 'paused'

    // 4. Text search (fallback)
    return (
      monitor.name.toLowerCase().includes(part) || monitor.url.toLowerCase().includes(part)
    )
  })
}

/** Critérios alinhados ao produto: TTFB / cache atuais (`ttfbCurrent`, `cacheHitCurrent`). */
export function monitorMatchesQuickFilter(
  monitor: Monitor,
  filter: MonitorQuickFilterId,
): boolean {
  if (filter === 'all') return true
  const ttfb = monitor.ttfbCurrent
  const hit = monitor.cacheHitCurrent
  switch (filter) {
    case 'healthy':
      return (
        monitor.errorRegionCount === 0 &&
        ttfb < MONITOR_TTFB.FAST &&
        (!monitorCacheHitIsComparable(monitor) || hit === null || hit >= MONITOR_CACHE.GOOD)
      )
    case 'degraded':
      return (
        monitor.errorRegionCount > 0 ||
        ttfb >= MONITOR_TTFB.FAST ||
        (monitorCacheHitIsComparable(monitor) && hit !== null && hit < MONITOR_CACHE.GOOD)
      )
    case 'high-ttfb':
      return ttfb >= MONITOR_TTFB.FAST
    case 'low-cache-hit':
      if (!monitorCacheHitIsComparable(monitor)) return false
      const hasCurrentLowHit = hit !== null && hit < MONITOR_CACHE.GOOD
      const has24hLowHit = monitor.cacheHitAvg24h !== null && monitor.cacheHitAvg24h < MONITOR_CACHE.GOOD
      return hasCurrentLowHit || has24hLowHit
    case 'down':
      return monitor.totalRegionCount > 0 && monitor.errorRegionCount >= monitor.totalRegionCount
    case 'missing-cache-headers':
      return getCacheDisplayLabel(monitor.cacheStatusCurrent) === 'NO HEADER'
  }
}
