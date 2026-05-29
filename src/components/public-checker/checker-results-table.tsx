'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckerLiveTable } from './checker-live-table'
import { CheckerSummaryBar } from './checker-summary-bar'
import { ProbeWaterfall, type WaterfallProbe } from '@/app/dashboard/monitors/[id]/probe-waterfall'
import { PUBLIC_PROBE_REGION_IDS } from '@/lib/public-regions'
import type { CheckJobResponse, CheckResult } from './types'

const POLL_INTERVAL_MS = 1500

function avg(results: CheckResult[], field: keyof CheckResult): number | null {
  const vals = results
    .map(r => r[field] as number | null)
    .filter((v): v is number => v != null)
  return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

function rangeOf(results: CheckResult[], field: keyof CheckResult) {
  const vals = results
    .map(r => r[field] as number | null)
    .filter((v): v is number => v != null)
  return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null
}

function buildGlobalProbe(results: CheckResult[]): WaterfallProbe | null {
  const completed = results.filter(r => r.ttfb_ms != null)
  if (completed.length === 0) return null

  const hitRate = Math.round(
    completed.filter(r => r.cache_status?.toUpperCase() === 'HIT').length / completed.length * 100
  )

  const tcpAvg = avg(completed, 'tcp_ms')
  const breakdown: Record<string, number> = {}
  if (tcpAvg != null) breakdown.tcp_ms = tcpAvg

  const validStbs = completed
    .map(r => r.server_timing_breakdown)
    .filter((v): v is Record<string, number> => v != null && Object.keys(v).length > 0)
  for (const key of new Set(validStbs.flatMap(b => Object.keys(b)))) {
    if (key === 'tcp_ms') continue
    const vals = validStbs.map(b => b[key]).filter((v): v is number => typeof v === 'number')
    if (vals.length > 0) breakdown[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  const latestProbedAt = completed
    .map(r => new Date(r.probed_at))
    .reduce((latest, d) => (d > latest ? d : latest), new Date(0))

  return {
    region: 'Global',
    dns_ms: avg(completed, 'dns_ms'),
    tls_ms: avg(completed, 'tls_ms'),
    ttfb_ms: avg(completed, 'ttfb_ms'),
    download_ms: avg(completed, 'download_ms'),
    total_ms: avg(completed, 'total_ms'),
    edge_ms: avg(completed, 'edge_ms'),
    origin_ms: avg(completed, 'origin_ms'),
    redirect_count: null,
    cache_status: null,
    served_by: null,
    cdn_provider: null,
    age_s: null,
    server_timing_breakdown: Object.keys(breakdown).length > 0 ? breakdown : null,
    probed_at: latestProbedAt,
    ranges: {
      dns_ms: rangeOf(completed, 'dns_ms'),
      tls_ms: rangeOf(completed, 'tls_ms'),
      ttfb_ms: rangeOf(completed, 'ttfb_ms'),
      download_ms: rangeOf(completed, 'download_ms'),
      total_ms: rangeOf(completed, 'total_ms'),
      edge_ms: rangeOf(completed, 'edge_ms'),
      origin_ms: rangeOf(completed, 'origin_ms'),
    },
  }
}

const GLOBAL_REGION_LABELS: Record<string, string> = { Global: 'Global Average' }
const TIMEOUT_MS = 30_000

interface Props {
  jobId: string
  regionsTotal?: number
}

export function CheckerResultsTable({ jobId, regionsTotal = 8 }: Props) {
  const [data, setData] = useState<CheckJobResponse | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    startedAt.current = Date.now()
    setData(null)
    setTimedOut(false)
    setFetchError(null)

    let stopped = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function poll(): Promise<boolean> {
      if (stopped) return true
      try {
        const res = await fetch(`/api/public/check/${jobId}`)
        if (!res.ok) {
          if (!stopped) setFetchError('Could not load results.')
          return true
        }
        const json: CheckJobResponse = await res.json()
        if (!stopped) setData(json)
        return json.status === 'complete' || json.status === 'error'
      } catch {
        return false
      }
    }

    async function start() {
      const done = await poll()
      if (done || stopped) return

      timer = setInterval(async () => {
        if (stopped) return

        if (Date.now() - startedAt.current > TIMEOUT_MS) {
          clearInterval(timer!)
          if (!stopped) setTimedOut(true)
          return
        }

        const done = await poll()
        if (done) clearInterval(timer!)
      }, POLL_INTERVAL_MS)
    }

    start()

    return () => {
      stopped = true
      if (timer) clearInterval(timer)
    }
  }, [jobId])

  if (fetchError) {
    return (
      <div className="cs-card px-6 py-6 text-center">
        <p className="text-sm text-rose-400">{fetchError}</p>
      </div>
    )
  }

  const resultMap = new Map<string, CheckResult>()
  for (const r of data?.results ?? []) {
    resultMap.set(r.region, r)
  }

  const totalRegions = data?.regionsTotal ?? regionsTotal
  const completedIds = new Set(resultMap.keys())
  const pendingRegionIds = PUBLIC_PROBE_REGION_IDS.filter((id) => !completedIds.has(id))

  const isLoading = !data || data.status === 'pending' || data.status === 'running'
  const isDone = data?.status === 'complete' || data?.status === 'error' || timedOut

  return (
    <div className="space-y-4">
      {(data?.results.length ?? 0) > 0 && (
        <CheckerSummaryBar
          results={data!.results}
          regionsTotal={data!.regionsTotal}
        />
      )}

      {isLoading && !timedOut && (
        <div className="flex items-center gap-2.5 text-[12px] text-zinc-500">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
          Checking {data?.regionsDone ?? 0} of {data?.regionsTotal ?? regionsTotal} regions…
        </div>
      )}
      {timedOut && (
        <p className="text-[12px] text-amber-400">
          Timed out — showing partial results from {data?.regionsDone ?? 0} regions.
        </p>
      )}
      {data?.status === 'error' && (data?.results.length ?? 0) === 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-400">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>Check failed — no results returned. The probe service may be temporarily unavailable. Try again in a moment.</span>
        </div>
      )}

      <CheckerLiveTable
        results={data?.results ?? []}
        pendingRegionIds={!isDone ? pendingRegionIds : []}
        loading={isLoading && !timedOut && (data?.results.length ?? 0) === 0}
      />

      {isDone && data && (() => {
        const globalProbe = buildGlobalProbe(data.results)
        return globalProbe ? (
          <div className="cs-card px-4 py-4">
            <div className="cs-card-wash" />
            <div className="relative z-10">
              <ProbeWaterfall
                probes={[globalProbe]}
                regionLabels={GLOBAL_REGION_LABELS}
                hideHeader={false}
                hideLegend={false}
              />
            </div>
          </div>
        ) : null
      })()}

      {isDone && data && <CacheControlDetails results={data.results} />}
    </div>
  )
}

function CacheControlDetails({ results }: { results: CheckResult[] }) {
  const unique = Array.from(
    new Map(
      results
        .filter((r) => r.cache_control)
        .map((r) => [r.cache_control!, r.region])
    ).entries()
  )
  if (unique.length === 0) return null

  return (
    <div className="cs-card px-4 py-4">
      <div className="cs-card-wash" />
      <p className="relative z-10 mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
        Cache-Control
      </p>
      <div className="relative z-10 space-y-1.5">
        {unique.map(([value]) => (
          <p key={value} className="break-all font-mono text-[11px] text-zinc-400">
            {value}
          </p>
        ))}
      </div>
    </div>
  )
}
