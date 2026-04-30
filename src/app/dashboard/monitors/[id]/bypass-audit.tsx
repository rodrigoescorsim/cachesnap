'use client'

import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
import { Clock, Zap, AlertTriangle, RefreshCw } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { MonitorDispatchButtons } from './monitor-dispatch-buttons'
import { ViewSectionHeader } from '@/components/dashboard/dashboard-ui'
import {
  BRAND_CARD_SURFACE_GRADIENT,
  BRAND_TABLE_SURFACE_GRADIENT,
  MONITOR_TABLE,
} from './monitor-table-styles'
import { PremiumTooltip } from '@/components/premium-tooltip'
import {
  type AuditReadiness,
  resolveReadinessState,
  resolveReason,
  shouldShowBanner,
  formatAuditBadge,
  globalImpactEmptyStateCopy,
  regionalBenefitPendingLabel,
} from './bypass-audit.helpers'
import { isCacheHit } from '@/lib/cache-utils'

export type { AuditReadiness }

interface BypassPoint {
  hour: Date
  region: string
  edge_ttfb: number
  origin_ttfb: number
  savings: number
  edge_cache_status: string | null
  origin_cache_status: string | null
}

interface BypassAuditProps {
  data: BypassPoint[]
  regionLabels: Record<string, string>
  readiness?: AuditReadiness | null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AuditCTA({
  readiness,
  monitorId,
}: {
  readiness: AuditReadiness | null | undefined
  monitorId: string
}) {
  const state = resolveReadinessState(readiness)

  if (state === 'enabled') {
    return <MonitorDispatchButtons monitorId={monitorId} variant="audit" />
  }

  return null
}

function RecheckButton({ monitorId }: { monitorId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setTimeout(() => setCooldown(c => c - 1), 1000)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [cooldown])

  function handleRecheck() {
    if (cooldown > 0 || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${monitorId}/evaluate-readiness`, {
          method: 'POST',
        })
        if (res.status === 429) {
          setError('Available after 2 min.')
          setCooldown(120)
        } else if (res.ok) {
          setCooldown(120)
          router.refresh()
        } else {
          setError('Check failed.')
        }
      } catch {
        setError('Connection error.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        onClick={handleRecheck}
        disabled={cooldown > 0 || isPending}
        className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`h-2.5 w-2.5 ${isPending ? 'animate-spin' : ''}`} />
        {cooldown > 0 ? `Re-check in ${cooldown}s` : 'Check Cache Evidence'}
      </button>
      {error && <p className="text-[9px] font-bold text-red-400">{error}</p>}
    </div>
  )
}

function WarmupProgress({
  pairsCurrent,
  pairsTarget = 8,
  regionsCurrent,
  regionsTarget = 4,
}: {
  pairsCurrent: number
  pairsTarget?: number
  regionsCurrent: number
  regionsTarget?: number
}) {
  const pairsPct = (pairsCurrent / pairsTarget) * 100
  const regionsPct = (regionsCurrent / regionsTarget) * 100
  const progressPct = Math.min(pairsPct, regionsPct)
  const isHigh = pairsPct >= 100 && regionsPct >= 100

  return (
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em]">
        <span className={isHigh ? 'text-emerald-400' : 'text-zinc-300'}>
          {isHigh ? 'High' : progressPct < 30 ? 'Low' : 'Medium'} Confidence
        </span>
        <span className="text-zinc-700 opacity-50">·</span>
        <span className="text-zinc-600">
          Pairs {pairsCurrent}/{pairsTarget} · Regions {regionsCurrent}/{regionsTarget}
        </span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden w-full">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isHigh ? 'bg-emerald-500' : 'bg-amber-500/50'}`}
          style={{ width: `${Math.min(progressPct, 100)}%` }}
        />
      </div>
    </div>
  )
}

function ReadinessBanner({
  readiness,
  monitorId,
}: {
  readiness: AuditReadiness
  monitorId: string
}) {
  const state = readiness.state
  if (state === 'enabled') return null

  const reason = resolveReason(readiness)
  const isWarmup = state === 'warmup'
  return (
    <div className={`${isWarmup ? 'cs-tint-success' : 'cs-tint-warning'} p-4 flex gap-4 items-start`}>
      <div className="cs-card-wash opacity-40" />
      {isWarmup ? (
        <Clock className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
      )}
      <div className="relative z-10 space-y-1 flex-1">
        <h3 className={`text-[10px] font-black uppercase tracking-[0.15em] ${isWarmup ? 'text-emerald-400' : 'text-amber-400'}`}>
          {isWarmup ? 'Edge Audit Warming Up' : 'Edge Audit Unavailable'}
        </h3>
        {reason && (
          <p className={`text-xs leading-relaxed font-medium ${isWarmup ? 'text-emerald-200/70' : 'text-amber-200/60'}`}>{reason}</p>
        )}
        {!isWarmup && (
          <div className="pt-1">
            <RecheckButton monitorId={monitorId} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function BypassAudit({ data, regionLabels, readiness }: BypassAuditProps) {
  const { id } = useParams()
  const monitorId = id as string

  const badge = formatAuditBadge(readiness)
  const readinessState = resolveReadinessState(readiness)

  const [period, setPeriod] = useState<'1H' | '4H' | '24H' | '7D' | '30D'>('24H')
  const periods = ['1H', '4H', '24H', '7D', '30D'] as const
  const globalEmptyState = globalImpactEmptyStateCopy(readinessState, period)

  const filteredData = useMemo(() => {
    const now = new Date()
    const MS_PER_HOUR = 3_600_000
    const PERIOD_MS: Record<typeof periods[number], number> = {
      '1H':  MS_PER_HOUR,
      '4H':  4  * MS_PER_HOUR,
      '24H': 24 * MS_PER_HOUR,
      '7D':  7  * 24 * MS_PER_HOUR,
      '30D': 30 * 24 * MS_PER_HOUR,
    }
    const limit = PERIOD_MS[period]
    return data.filter(item => (now.getTime() - item.hour.getTime()) <= limit)
  }, [data, period])

  // Aggregate by region
  const aggregatedData = useMemo(() => {
    const regions: Record<string, {
      edge_ttfb: number[],
      origin_ttfb: number[],
      edge_hits: number,
      origin_hits: number,
      edge_statuses: string[],
      origin_statuses: string[]
    }> = {}

    filteredData.forEach(item => {
      if (!regions[item.region]) {
        regions[item.region] = { edge_ttfb: [], origin_ttfb: [], edge_hits: 0, origin_hits: 0, edge_statuses: [], origin_statuses: [] }
      }
      const r = regions[item.region]
      const isEdgeHit = isCacheHit(item.edge_cache_status)
      const isOriginHit = isCacheHit(item.origin_cache_status)

      if (item.edge_ttfb > 0) r.edge_ttfb.push(item.edge_ttfb)
      // Only push origin TTFB if it was NOT a forced hit, to avoid polluting the average
      if (item.origin_ttfb > 0 && !isOriginHit) r.origin_ttfb.push(item.origin_ttfb)

      if (isEdgeHit) r.edge_hits++
      if (isOriginHit) r.origin_hits++
      if (item.edge_cache_status) r.edge_statuses.push(item.edge_cache_status.toUpperCase())
      if (item.origin_cache_status) r.origin_statuses.push(item.origin_cache_status.toUpperCase())
    })

    return Object.entries(regions).map(([id, stats]) => {
      const originHitRatio = stats.origin_statuses.length > 0 ? stats.origin_hits / stats.origin_statuses.length : 0
      return {
        region: id,
        edge_ttfb: stats.edge_ttfb.length > 0 ? stats.edge_ttfb.reduce((a, b) => a + b, 0) / stats.edge_ttfb.length : 0,
        origin_ttfb: stats.origin_ttfb.length > 0 ? stats.origin_ttfb.reduce((a, b) => a + b, 0) / stats.origin_ttfb.length : 0,
        edge_hit_ratio: stats.edge_statuses.length > 0 ? stats.edge_hits / stats.edge_statuses.length : 0,
        origin_hit_ratio: originHitRatio,
        // We only consider it a forced hit if 100% of samples failed bypass
        is_forced_hit: originHitRatio >= 1 && stats.origin_statuses.length > 0,
        last_edge_status: stats.edge_statuses[stats.edge_statuses.length - 1] || 'MISS',
        last_origin_status: stats.origin_statuses[stats.origin_statuses.length - 1] || 'MISS',
        sample_count: stats.edge_statuses.length
      }
    })
  }, [filteredData])

  const validForAvg = aggregatedData.filter(r => r.edge_hit_ratio > 0 && !r.is_forced_hit).length
  const forcedHitRegionsCount = aggregatedData.filter(r => r.is_forced_hit).length
  const totalEdge = aggregatedData.reduce((sum, r) => sum + (r.edge_hit_ratio > 0 && !r.is_forced_hit ? r.edge_ttfb : 0), 0)
  const totalOrigin = aggregatedData.reduce((sum, r) => sum + (r.edge_hit_ratio > 0 && !r.is_forced_hit ? r.origin_ttfb : 0), 0)

  const avgSavingMs = validForAvg > 0 ? (totalOrigin - totalEdge) / validForAvg : 0
  const avgSavingPct = totalOrigin > 0 ? ((totalOrigin - totalEdge) / totalOrigin) * 100 : 0

  const hasData = filteredData.length > 0
  const hasAnyData = data.length > 0

  return (
    <div className="space-y-6 min-h-[200px]">
      <ViewSectionHeader 
        title={
          <div className="flex items-center gap-2">
            <span>Edge Audit</span>
            <span className="text-zinc-600 font-bold uppercase tracking-widest text-[11px] opacity-60">·</span>
            <span className="text-zinc-500 font-black uppercase tracking-[0.2em] text-[11px]">
              {period}
            </span>
          </div>
        } 
        showDot={true}
      >
        <div className="flex items-center gap-2">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
            {periods.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                  period === p
                    ? 'bg-white/10 text-white shadow-lg'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </ViewSectionHeader>

      {/* Info Bar — Readiness & Confidence (Integrated Status Line) */}
      {readiness && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-1 gap-4 pt-1">
          <div className="flex items-center gap-8">
             <WarmupProgress
               pairsCurrent={readiness.comparable_pairs}
               regionsCurrent={readiness.comparable_regions}
             />
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
               <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Status:</span>
               <span className={badge.cssClass}>{badge.label}</span>
             </div>
             <div className="h-4 w-[1px] bg-white/5 hidden sm:block" />
             <AuditCTA readiness={readiness} monitorId={monitorId} />
          </div>
        </div>
      )}

      {shouldShowBanner(readiness) && readiness && (
        <ReadinessBanner readiness={readiness} monitorId={monitorId} />
      )}

      {/* Results Section */}
      {!hasData && hasAnyData && (
        <div className="cs-card cs-card-glass p-12 text-center border-dashed border-white/5 bg-white/[0.01]">
           <p className="text-sm text-zinc-400 italic">
            No audit samples detected in the last {period}.
          </p>
          <p className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-bold">
            Data is aggregated hourly. Try selecting a broader timeframe.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Bypass Failure Alert — Show if any region in period is forced hit */}
      {aggregatedData.some(r => r.origin_hit_ratio > 0) && (
            <div className="cs-tint-warning p-4 flex gap-4 items-start">
              <div className="cs-card-wash opacity-40" />
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
              <div className="relative z-10 space-y-1">
                <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em]">
                  Partial Signal Optimization
                </h3>
                <p className="text-xs leading-relaxed text-amber-200/60 font-medium">
                  Could not obtain Origin metrics in{' '}
                  <span className="text-amber-400 font-bold">
                    {forcedHitRegionsCount} {forcedHitRegionsCount === 1 ? 'region' : 'regions'}
                  </span>{' '}
                  due to infrastructure optimizations that forced delivery via Edge (Cache HIT),
                  preventing a direct server measurement.
                </p>
              </div>
            </div>
          )}

          {/* Global Impact Analysis */}
          <div className="cs-card px-6 py-5">
            <div className={BRAND_CARD_SURFACE_GRADIENT} />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.25em]">
                  Global Impact Analysis
                </div>
                <div className="flex items-baseline gap-4">
                  {validForAvg > 0 ? (
                    <>
                      <span
                        className={`text-5xl font-black tracking-tighter ${avgSavingMs > 0 ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}
                      >
                        {avgSavingMs > 0 ? '-' : '+'}
                        {Math.abs(Math.round(avgSavingMs))}ms
                      </span>
                      <div className="flex flex-col">
                        <PremiumTooltip content={`Averaged over ${filteredData.length} total samples across ${aggregatedData.length} regions for the last ${period}.`}>
                          <span
                            className={`text-base font-bold cursor-help ${avgSavingMs > 0 ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}
                          >
                            {avgSavingMs > 0 ? '-' : '+'}
                            {Math.abs(Math.round(avgSavingPct))}%{' '}
                            {avgSavingMs > 0 ? 'Saved' : 'Added'}
                          </span>
                        </PremiumTooltip>
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                          CDN Edge Benefit ({period})
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-5xl font-black tracking-tighter text-zinc-700">—ms</span>
                      <div className="flex flex-col">
                        <span className="text-base font-bold text-zinc-600">{globalEmptyState.title}</span>
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                          {globalEmptyState.subtitle}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-1.5 px-6 sm:border-l border-white/5">
                <div className="flex items-center gap-2 font-black text-zinc-400 text-[10px] uppercase tracking-widest">
                  <span
                    className={`h-2 w-2 rounded-full ${validForAvg > 0 ? 'bg-[var(--brand-primary)] animate-pulse' : 'bg-zinc-700'}`}
                  />
                  Edge (HIT) vs Origin (Direct)
                </div>
                <p className="text-[11px] text-zinc-500 max-w-[280px] sm:text-right leading-relaxed font-medium">
                  {validForAvg > 0
                    ? `Analyzing average performance across ${validForAvg} regions with cache hits in the last ${period}.`
                    : `No regions reported consistent cache hits during the ${period} window.`}
                </p>
              </div>
            </div>
          </div>

          {/* Regional Table */}
          <div className={MONITOR_TABLE.outerWrapper}>
            <div className={BRAND_TABLE_SURFACE_GRADIENT} />
            <div className={MONITOR_TABLE.innerScroll}>
              <table className={MONITOR_TABLE.tableBase}>
                <thead>
                  <tr className={MONITOR_TABLE.theadRow}>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Region
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Edge (HIT)
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Origin (Direct)
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Real Benefit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.map(row => {
                    const isEdgeHit = row.edge_hit_ratio > 0
                    const isOriginHit = row.is_forced_hit
                    const isValidComparison = isEdgeHit && !isOriginHit && row.origin_ttfb > 0

                    const itemSaving = row.origin_ttfb - row.edge_ttfb
                    const isSaving = itemSaving > 0
                    return (
                      <tr key={row.region} className={MONITOR_TABLE.tbodyRow}>
                        <td className="px-4 py-4">
                          <span className="font-bold text-zinc-200 tracking-tight">
                            {regionLabels[row.region] ?? row.region}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            {isEdgeHit ? (
                              <div className="flex items-center gap-1.5 text-emerald-400">
                                <Zap className="w-3 h-3 fill-current" />
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                  {Math.round(row.edge_hit_ratio * 100)}% HIT
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                {row.last_edge_status}
                              </span>
                            )}
                            <span className="text-zinc-200 font-mono font-bold text-xs">
                              {Math.round(row.edge_ttfb)}ms
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            {isOriginHit ? (
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-black text-zinc-600 tracking-[0.4em] px-2 opacity-50">
                                  ———
                                </span>
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-tighter">
                                  Forced HIT
                                </span>
                              </div>
                            ) : (
                              <>
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                  {row.last_origin_status}
                                </span>
                                <span className="text-zinc-500 font-mono font-bold text-xs">
                                  {row.origin_ttfb > 0 ? `${Math.round(row.origin_ttfb)}ms` : '—'}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-col items-end">
                            {isOriginHit ? (
                              <PremiumTooltip content="Origin latency unavailable for this period because CDN served cache even on bypass attempts (100% of samples).">
                                <div className="flex flex-col items-end cursor-help">
                                  <span className="text-[11px] font-bold text-zinc-400 italic">
                                    Origin hidden by edge cache
                                  </span>
                                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-tighter opacity-70">
                                    {row.sample_count} samples
                                  </span>
                                </div>
                              </PremiumTooltip>
                            ) : !isValidComparison ? (
                              <div className="flex flex-col items-end opacity-60">
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tight">
                                  {regionalBenefitPendingLabel(row.origin_hit_ratio > 0)}
                                </span>
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
                                  {row.sample_count} samples
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span
                                  className={`text-xs font-black flex items-center gap-1 ${isSaving ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}
                                >
                                  {isSaving ? '-' : '+'}
                                  {Math.abs(Math.round(itemSaving))}ms
                                </span>
                                <span
                                  className="text-[9px] font-black uppercase tracking-widest text-metric-ttfb-fast opacity-60"
                                >
                                  {Math.abs(Math.round((itemSaving / row.origin_ttfb) * 100))}% Benefit
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
