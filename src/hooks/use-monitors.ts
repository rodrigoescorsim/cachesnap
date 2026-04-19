'use client'

import { useQuery } from '@tanstack/react-query'
import type { Monitor } from '@/types/monitor'
import { type MonitorSummaryRow, toMonitor } from '@/lib/monitor-transforms'

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
  /** True only on the initial fetch (no data in cache yet). Shows skeleton. */
  isLoading: boolean
  /** True on every fetch, including background refetches. Shows sync indicator. */
  isFetching: boolean
  isError: boolean
  /** Unix ms timestamp of the last successful fetch. 0 before the first fetch. */
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
