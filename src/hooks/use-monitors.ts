'use client'

import { useQuery } from '@tanstack/react-query'
import type { Monitor } from '@/types/monitor'

// ─── API response shape (snake_case from postgres) ────────────────────────────

interface MonitorSummaryRow {
  id: string
  url: string
  name: string | null
  status: 'active' | 'paused'
  // postgres.js returns ROUND(...,1) / numeric columns as string — accept both
  ttfb_current: number | string
  ttfb_avg_24h: number | string
  ttfb_delta: number | string
  cache_hit_current: number | string
  cache_hit_avg_24h: number | string
  cache_hit_delta: number | string
  regions: Array<{ code: string; label: string; flag: string; isSlow: boolean }>
  slow_region_count: number | string
  total_region_count: number | string
  last_checked_at: string | null
  sparkline: Array<number | string>
}

// ─── Transform DB row → Monitor (camelCase + Date objects) ───────────────────

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  return Number(v)
}

function toNumOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  return Number(v)
}

function hostnameFallback(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

function toMonitor(row: MonitorSummaryRow): Monitor {
  // postgres.js returns ROUND(..., 1) / numeric columns as strings to preserve
  // decimal precision. toNum / toNumOrNull normalise both strings and numbers.
  return {
    id:               row.id,
    name:             row.name || hostnameFallback(row.url),
    url:              row.url,
    status:           row.status,
    ttfbCurrent:      toNum(row.ttfb_current),
    ttfbCurrentDelta: toNum(row.ttfb_delta),
    ttfbAvg24h:       toNum(row.ttfb_avg_24h),
    ttfbSparkline:    (row.sparkline ?? []).map(Number),
    // null = site doesn't send a recognisable cache-status header
    cacheHitCurrent:  toNumOrNull(row.cache_hit_current),
    cacheHitAvg24h:   toNumOrNull(row.cache_hit_avg_24h),
    cacheHitDelta:    toNumOrNull(row.cache_hit_delta),
    regions:          row.regions           ?? [],
    slowRegionCount:  toNum(row.slow_region_count),
    totalRegionCount: toNum(row.total_region_count),
    lastCheckedAt:    row.last_checked_at ? new Date(row.last_checked_at) : new Date(),
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchMonitorSummary(): Promise<Monitor[]> {
  const res = await fetch('/api/monitors/summary')
  if (!res.ok) throw new Error(`Failed to fetch monitors: ${res.status}`)
  const rows: MonitorSummaryRow[] = await res.json()
  return rows.map(toMonitor)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseMonitorsOptions {
  refetchInterval?: number | false
}

export interface UseMonitorsResult {
  monitors: Monitor[]
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  dataUpdatedAt: number
  refetch: () => void
}

export function useMonitors({ refetchInterval = false }: UseMonitorsOptions = {}): UseMonitorsResult {
  const { data, isLoading, isFetching, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['monitors'],
    queryFn: fetchMonitorSummary,
    staleTime: 5_000,
    refetchInterval,
  })

  return {
    monitors:      data ?? [],
    isLoading,
    isFetching,
    isError,
    dataUpdatedAt,
    refetch: () => { void refetch() },
  }
}
