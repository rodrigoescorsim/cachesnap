'use client'

import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Monitor } from '@/types/monitor'
import { type MonitorSummaryRow, toMonitor } from '@/lib/monitor-transforms'

/** React Query key for `/api/monitors/summary` (list + aggregates for global metrics). */
export const MONITORS_QUERY_KEY = ['monitors'] as const

/** Call after create/delete so Monitors / Insights global metrics refetch immediately. */
export function invalidateMonitorsSummary(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: MONITORS_QUERY_KEY })
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
  refetchInterval?: number | false | ((data: Monitor[] | undefined) => number | false)
}

export interface UseMonitorsResult {
  monitors: Monitor[]
  /** True only on the initial fetch (no data in cache yet). Shows skeleton. */
  isLoading: boolean
  /** True on every fetch, including background refetches. Shows sync indicator. */
  isFetching: boolean
  isError: boolean
  /** Unix ms timestamp of the last successful fetch. 0 before the first fetch. */
  dataUpdatedAt: number
  refetch: () => void
}

const EMPTY_MONITORS: Monitor[] = []

export function useMonitors({ refetchInterval = false }: UseMonitorsOptions = {}): UseMonitorsResult {
  const { data, isLoading, isFetching, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: MONITORS_QUERY_KEY,
    queryFn: fetchMonitorSummary,
    staleTime: 5_000,
    // TanStack Query accepts number | false | ((query) => number | false).
    // We wrap a plain number/false to keep the type compatible.
    refetchInterval: typeof refetchInterval === 'function'
      ? (query) => (refetchInterval as (data: Monitor[] | undefined) => number | false)(query.state.data)
      : refetchInterval,
  })

  return {
    monitors:      data ?? EMPTY_MONITORS,
    isLoading,
    isFetching,
    isError,
    dataUpdatedAt,
    refetch: () => { void refetch() },
  }
}
