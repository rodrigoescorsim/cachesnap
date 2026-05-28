'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckerRegionRow } from './checker-region-row'
import { CheckerSummaryBar } from './checker-summary-bar'
import type { CheckJobResponse, CheckResult } from './types'

const POLL_INTERVAL_MS = 1500
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
    // Reset state for new job
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

  const knownRegions = Array.from(resultMap.keys()).sort()
  const totalRegions = data?.regionsTotal ?? regionsTotal
  const pendingCount = Math.max(0, totalRegions - knownRegions.length)

  const isLoading = !data || data.status === 'pending' || data.status === 'running'
  const isDone = data?.status === 'complete' || data?.status === 'error' || timedOut

  return (
    <div className="space-y-4">
      {/* Summary bar — shown as soon as any results arrive */}
      {(data?.results.length ?? 0) > 0 && (
        <CheckerSummaryBar
          results={data!.results}
          regionsTotal={data!.regionsTotal}
        />
      )}

      {/* Progress / timeout indicator */}
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

      {/* Results table */}
      <div className="cs-card overflow-hidden">
        <div className="cs-card-wash" />
        <div className="relative z-10 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2.5 pl-4 pr-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Region</th>
                <th className="py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Cache</th>
                <th className="py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">CDN</th>
                <th className="py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">TTFB</th>
                <th className="py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">HTTP</th>
                <th className="py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Age</th>
                <th className="py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Sec</th>
              </tr>
            </thead>
            <tbody>
              {knownRegions.map(region => (
                <CheckerRegionRow
                  key={region}
                  result={resultMap.get(region) ?? null}
                  loading={false}
                />
              ))}
              {!isDone && Array.from({ length: pendingCount }).map((_, i) => (
                <CheckerRegionRow
                  key={`pending-${i}`}
                  result={null}
                  loading={true}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isDone && data && <CacheControlDetails results={data.results} />}
    </div>
  )
}

function CacheControlDetails({ results }: { results: CheckResult[] }) {
  const unique = Array.from(
    new Map(
      results
        .filter(r => r.cache_control)
        .map(r => [r.cache_control!, r.region])
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
