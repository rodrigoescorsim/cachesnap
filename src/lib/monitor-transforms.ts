/**
 * Pure transformation functions: API row (snake_case) → Monitor (camelCase).
 * Kept in a separate module so they can be unit-tested without React/fetch.
 */

import type { Monitor } from '@/types/monitor'

// ─── Raw API shape ────────────────────────────────────────────────────────────

export interface MonitorSummaryRow {
  id: string
  url: string
  name: string | null
  status: 'active' | 'paused'
  // postgres.js returns ROUND(...,1) / numeric columns as string — accept both
  ttfb_current: number | string
  ttfb_avg_1h: number | string
  ttfb_avg_24h: number | string
  ttfb_delta: number | string
  cache_hit_current: number | string | null
  cache_hit_avg_1h: number | string | null
  cache_hit_avg_24h: number | string | null
  cache_hit_delta: number | string | null
  cache_status_current: string | null
  regions: Array<{ code: string; label: string; flag: string; isSlow: boolean; isError: boolean }>
  slow_region_count: number | string
  total_region_count: number | string
  error_region_count: number | string
  error_5xx_count: number | string
  error_4xx_count: number | string
  is_waf_blocked: boolean | number
  uptime_24h: number | string | null
  last_checked_at: string | null
  sparkline: Array<number | string>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  return Number(v)
}

export function toNumOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  return Number(v)
}

export function hostnameFallback(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

// ─── Main transform ───────────────────────────────────────────────────────────

export function toMonitor(row: MonitorSummaryRow): Monitor {
  return {
    id:               row.id,
    name:             row.name || hostnameFallback(row.url),
    url:              row.url,
    status:           row.status,
    ttfbCurrent:      toNum(row.ttfb_current),
    ttfbCurrentDelta: toNum(row.ttfb_delta),
    ttfbAvg1h:        toNum(row.ttfb_avg_1h),
    ttfbAvg24h:       toNum(row.ttfb_avg_24h),
    ttfbSparkline:    (row.sparkline ?? []).map(Number),
    // null = site doesn't send a recognisable cache-status header
    cacheHitCurrent:  toNumOrNull(row.cache_hit_current),
    cacheHitAvg1h:   toNumOrNull(row.cache_hit_avg_1h),
    cacheHitAvg24h:   toNumOrNull(row.cache_hit_avg_24h),
    cacheHitDelta:    toNumOrNull(row.cache_hit_delta),
    cacheStatusCurrent: row.cache_status_current,
    regions:           row.regions ?? [],
    slowRegionCount:   toNum(row.slow_region_count),
    totalRegionCount:  toNum(row.total_region_count),
    errorRegionCount:  toNum(row.error_region_count),
    error5xxCount:     toNum(row.error_5xx_count),
    error4xxCount:     toNum(row.error_4xx_count),
    isWafBlocked:      Boolean(row.is_waf_blocked),
    uptime24h:         toNumOrNull(row.uptime_24h),
    // new Date(0) = epoch signals "never probed" — displayed as "–" in the UI
    lastCheckedAt:    row.last_checked_at ? new Date(row.last_checked_at) : new Date(0),
  }
}
