'use client'

import { useState, useMemo } from 'react'
import { Zap, AlertTriangle, ShieldAlert, Activity } from 'lucide-react'
import { ViewSectionHeader } from '@/components/dashboard/dashboard-ui'
import {
  BRAND_CARD_SURFACE_GRADIENT,
  BRAND_TABLE_SURFACE_GRADIENT,
  MONITOR_TABLE,
} from './monitor-table-styles'
import { PremiumTooltip } from '@/components/premium-tooltip'
import {
  type EdgeVsOriginReadiness,
  resolveReadinessState,
  shouldShowBanner,
  edgeVsOriginDisabledBannerBody,
  formatEdgeVsOriginBadge,
  globalImpactEmptyStateCopy,
} from './edge-vs-origin.helpers'

export type { EdgeVsOriginReadiness }

interface ComparisonBucket {
  hour: Date
  region: string
  edge_ttfb: number
  origin_ttfb: number
  edge_hit_count: number
  origin_miss_count: number
  sample_count: number
  edge_cache_status: string
  origin_cache_status: string
}

interface EdgeVsOriginProps {
  data: ComparisonBucket[]
  regionLabels: Record<string, string>
  readiness: EdgeVsOriginReadiness
  isDown?: boolean
}

const COMPARABLE_PAIRS_GATE = 8
const COMPARABLE_REGIONS_GATE = 4

function ReadinessBanner({ readiness, isOffline }: { readiness: EdgeVsOriginReadiness; isOffline: boolean }) {
  const state = readiness.state
  if (state === 'enabled' || state === 'warmup') return null

  return (
    <div className="cs-tint-warning p-4 flex gap-4 items-start">
      <div className="cs-card-wash opacity-40" />
      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
      <div className="relative z-10 space-y-1 flex-1">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-400">
          {isOffline ? 'Comparison paused — site offline' : 'Edge vs Origin unavailable'}
        </h3>
        <p className="text-xs leading-relaxed font-medium text-amber-200/60">
          {isOffline
            ? 'Site is currently unreachable from probed regions. Edge vs Origin needs successful responses to compare edge and origin performance. Check Diagnostics to troubleshoot connection issues.'
            : edgeVsOriginDisabledBannerBody(readiness)}
        </p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EdgeVsOrigin({ data, regionLabels, readiness, isDown }: EdgeVsOriginProps) {
  const badge = formatEdgeVsOriginBadge(readiness)
  const readinessState = resolveReadinessState(readiness)

  const [period, setPeriod] = useState<'1H' | '4H' | '24H' | '7D' | '30D' | '90D'>('24H')
  const periods = ['1H', '4H', '24H', '7D', '30D', '90D'] as const
  const globalEmptyState = globalImpactEmptyStateCopy(readinessState, period)

  const PERIOD_TOOLTIPS: Record<typeof periods[number], string> = {
    '1H': 'Last 1 hour — most recent activity',
    '4H': 'Last 4 hours — short-term trends',
    '24H': 'Last 24 hours — daily overview',
    '7D': 'Last 7 days — weekly patterns',
    '30D': 'Last 30 days — monthly overview',
    '90D': 'Last 90 days — quarterly view',
  }

  const filteredData = useMemo(() => {
    const now = new Date()
    const MS_PER_HOUR = 3_600_000
    const PERIOD_MS: Record<typeof periods[number], number> = {
      '1H': MS_PER_HOUR,
      '4H': 4 * MS_PER_HOUR,
      '24H': 24 * MS_PER_HOUR,
      '7D': 7 * 24 * MS_PER_HOUR,
      '30D': 30 * 24 * MS_PER_HOUR,
      '90D': 90 * 24 * MS_PER_HOUR,
    }
    const limit = PERIOD_MS[period]
    return data.filter(item => (now.getTime() - item.hour.getTime()) <= limit)
  }, [data, period])

  // ── Aggregation Logic ──────────────────────────────────────────────────────
  const aggregatedData = useMemo(() => {
    const regions: Record<string, {
      total_edge_ttfb: number,
      total_origin_ttfb: number,
      edge_hits: number,
      origin_misses: number,
    }> = {}

    filteredData.forEach(item => {
      if (!regions[item.region]) {
        regions[item.region] = {
          total_edge_ttfb: 0,
          total_origin_ttfb: 0,
          edge_hits: 0,
          origin_misses: 0
        }
      }
      const r = regions[item.region]
      const hits = Number(item.edge_hit_count || 0)
      const misses = Number(item.origin_miss_count || 0)

      r.edge_hits += hits
      r.origin_misses += misses

      if (item.edge_ttfb > 0) {
        r.total_edge_ttfb += (item.edge_ttfb * hits)
      }
      if (item.origin_ttfb > 0) {
        r.total_origin_ttfb += (item.origin_ttfb * misses)
      }
    })

    return Object.entries(regions).map(([id, stats]) => {
      const edge_ttfb = stats.edge_hits > 0 ? stats.total_edge_ttfb / stats.edge_hits : 0
      const origin_ttfb = stats.origin_misses > 0 ? stats.total_origin_ttfb / stats.origin_misses : 0

      return {
        region: id,
        edge_ttfb,
        origin_ttfb,
        edge_hits: stats.edge_hits,
        origin_misses: stats.origin_misses,
        origin_hits: 0,
      }
    }).sort((a, b) => {
      // Sort by reduction % (descending)
      const aPct = a.origin_ttfb > 0 ? (a.origin_ttfb - a.edge_ttfb) / a.origin_ttfb : -1
      const bPct = b.origin_ttfb > 0 ? (b.origin_ttfb - b.edge_ttfb) / b.origin_ttfb : -1
      return bPct - aPct
    })
  }, [filteredData])

  // Global Impact: Compare average of Edge Hits vs Origin Misses in comparable regions
  const comparableRegions = aggregatedData.filter(r => r.edge_hits > 0 && r.origin_misses > 0)

  /** Buckets (e.g. hour × region) that have both edge HIT samples and origin MISS samples — required for a real comparison signal. */
  const comparableRowsInPeriod = useMemo(
    () =>
      filteredData.filter(
        item =>
          Number(item.edge_hit_count || 0) > 0 && Number(item.origin_miss_count || 0) > 0,
      ).length,
    [filteredData],
  )

  const totalEdgeTtfb = comparableRegions.reduce((sum, r) => sum + r.edge_ttfb, 0)
  const totalOriginTtfb = comparableRegions.reduce((sum, r) => sum + r.origin_ttfb, 0)

  const avgSavingMs = comparableRegions.length > 0 ? (totalOriginTtfb - totalEdgeTtfb) / comparableRegions.length : 0
  const avgSavingPct = totalOriginTtfb > 0 ? ((totalOriginTtfb - totalEdgeTtfb) / totalOriginTtfb) * 100 : 0

  const totalSamples = useMemo(() => {
    return filteredData.reduce((sum, r) => sum + (Number(r.sample_count) || 1), 0)
  }, [filteredData])

  // --- Advisor / Polishing Logic ---
  const validRegionsForAdvisor = useMemo(() =>
    aggregatedData.filter(r => r.edge_hits > 0 && r.origin_misses > 0),
    [aggregatedData]
  )

  const bestRegion = useMemo(() =>
    [...validRegionsForAdvisor].sort((a, b) => {
      const aSaving = (a.origin_ttfb - a.edge_ttfb) / a.origin_ttfb
      const bSaving = (b.origin_ttfb - b.edge_ttfb) / b.origin_ttfb
      return bSaving - aSaving
    })[0],
    [validRegionsForAdvisor]
  )

  const worstRegion = useMemo(() =>
    [...validRegionsForAdvisor].sort((a, b) => {
      const aSaving = a.origin_ttfb > 0 ? (a.origin_ttfb - a.edge_ttfb) / a.origin_ttfb : 0
      const bSaving = b.origin_ttfb > 0 ? (b.origin_ttfb - b.edge_ttfb) / b.origin_ttfb : 0
      return aSaving - bSaving
    })[0],
    [validRegionsForAdvisor]
  )

  const hasData = filteredData.length > 0
  const hasAnyData = data.length > 0

  // "Active" must reflect measurable edge HIT vs origin MISS — not merely enough rows with MISS-only data.
  const isLiveActive =
    comparableRowsInPeriod >= COMPARABLE_PAIRS_GATE &&
    comparableRegions.length >= COMPARABLE_REGIONS_GATE

  const readinessResolved = resolveReadinessState(readiness)
  const statusLabel = isLiveActive
    ? 'Active'
    : readinessResolved === 'enabled'
      ? 'Awaiting comparison'
      : badge.label
  const statusColor = isLiveActive
    ? 'text-emerald-400'
    : readinessResolved === 'enabled'
      ? 'text-amber-400/90'
      : badge.cssClass.replace('cs-badge', '')

  return (
    <div className="space-y-6 min-h-[200px]">
      <ViewSectionHeader
        title={
          <div className="flex items-center gap-2">
            <span>Edge cache vs origin fetch</span>
            <span className="text-zinc-600 font-bold uppercase tracking-widest text-[11px] opacity-60">·</span>
            <span className="text-zinc-500 font-black uppercase tracking-widest text-[11px]">
              {period}
            </span>
          </div>
        }
        showDot={true}
      >
        <div className="flex items-center gap-2">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
            {periods.map(p => (
              <PremiumTooltip key={p} content={PERIOD_TOOLTIPS[p]} position="bottom-center">
                <button
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${period === p
                    ? 'bg-white/10 text-white shadow-lg'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  {p}
                </button>
              </PremiumTooltip>
            ))}
          </div>
        </div>
      </ViewSectionHeader>

      <div className="grid grid-cols-1 gap-6">
        {/* Global Impact Analysis Card */}
        <div className="cs-card px-6 py-5">
          <div className={BRAND_CARD_SURFACE_GRADIENT} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  Latency (edge HIT vs origin MISS)
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-zinc-700" />
                  <span className={`text-[9px] font-black uppercase tracking-tight ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-baseline gap-4">
                {comparableRegions.length > 0 ? (
                  <>
                    <span
                      className={`text-4xl font-black tracking-tighter ${avgSavingMs > 0 ? 'text-metric-ttfb-fast' : avgSavingMs < 0 ? 'text-metric-ttfb-slow' : 'text-zinc-500'
                        }`}
                      title={
                        avgSavingMs > 0
                          ? 'Average edge response is faster than origin in this period.'
                          : avgSavingMs < 0
                            ? 'Average edge response is slower than origin in this period.'
                            : undefined
                      }
                    >
                      {Math.abs(Math.round(avgSavingMs))}ms
                    </span>
                    <div className="flex flex-col">
                      <PremiumTooltip content={`Averaged over ${totalSamples} samples across ${comparableRegions.length} valid regions.`}>
                        <div className="flex items-center gap-1.5 cursor-help">
                          <span className={`text-2xl font-black ${avgSavingMs > 0 ? 'text-metric-ttfb-fast' : 'text-metric-ttfb-slow'}`}>
                            {avgSavingMs > 0 ? (
                              <>{Math.abs(Math.round(avgSavingPct))}% faster</>
                            ) : avgSavingMs < 0 ? (
                              <>{Math.abs(Math.round(avgSavingPct))}% slower</>
                            ) : (
                              <>0% same</>
                            )}
                          </span>
                        </div>
                      </PremiumTooltip>
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                        on average compared to origin
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
                <span className={`h-2 w-2 rounded-full ${comparableRegions.length > 0 ? 'bg-[var(--brand-primary)] animate-pulse' : 'bg-zinc-700'}`} />
                Comparison signal
              </div>
              <p className="text-[11px] text-zinc-500 max-w-[280px] sm:text-right leading-relaxed font-medium">
                {comparableRegions.length > 0
                  ? `Analyzing average performance across ${comparableRegions.length} regions with ${totalSamples} comparison samples in the last ${period}.`
                  : 'Waiting for enough paired edge and origin samples to establish a baseline.'}
              </p>
            </div>
          </div>
        </div>

        {/* Regional highlights */}
        {comparableRegions.length > 0 && (
          <div className="cs-card px-6 py-4 border-t-0 bg-white/[0.02]">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-3 h-3 text-[var(--brand-primary)]" />
                  Regional summary
                </h4>
                <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                  Leveraging edge effectively across most regions.
                  {bestRegion && ` Strongest gain: ${regionLabels[bestRegion.region] ?? bestRegion.region} (+${Math.round(((bestRegion.origin_ttfb - bestRegion.edge_ttfb) / bestRegion.origin_ttfb) * 100)}% faster vs origin).`}
                </p>
              </div>
              <div className="flex items-center gap-4 border-l border-white/5 pl-6">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Next target</span>
                  <p className="text-[11px] text-zinc-400 font-bold">
                    {worstRegion && worstRegion !== bestRegion ? (() => {
                      const saving = Math.round(((worstRegion.origin_ttfb - worstRegion.edge_ttfb) / worstRegion.origin_ttfb) * 100);
                      return `${regionLabels[worstRegion.region] ?? worstRegion.region} shows low gain (${saving < 0 ? `${Math.abs(saving)}% loss` : `${saving}% benefit`}). Review cache headers.`;
                    })() : 'Maintain current s-maxage strategy.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Readiness Banner for Disabled/Error states */}
        {shouldShowBanner(readiness) && readiness.state !== 'warmup' && !isLiveActive && (
          <ReadinessBanner readiness={readiness} isOffline={!!isDown} />
        )}

        {/* Partial Signal Alert */}
        {hasData && aggregatedData.some(r => r.origin_hits > 0) && (
          <div className="cs-tint-warning p-4 flex gap-4 items-start">
            <div className="cs-card-wash opacity-40" />
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
            <div className="relative z-10 space-y-1">
              <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Partial signal</h3>
              <p className="text-xs leading-relaxed text-amber-200/60 font-medium">
                Could not obtain Origin metrics in some regions due to infrastructure optimizations (forced CDN hits).
              </p>
            </div>
          </div>
        )}

        {/* Data Tables / Empty States */}
        {hasData ? (
          <div className={MONITOR_TABLE.outerWrapper}>
            <div className={BRAND_TABLE_SURFACE_GRADIENT} />
            <div className={MONITOR_TABLE.innerScroll}>
              <table className={MONITOR_TABLE.tableBase}>
                <thead>
                  <tr className={MONITOR_TABLE.theadRow}>
                    <th className="px-4 py-3 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">Region</th>
                    <th className="px-4 py-3 text-right">
                      <PremiumTooltip content="Average TTFB when content is served from the CDN Edge cache.">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-help border-b border-zinc-800 hover:border-zinc-600 transition-colors">Edge (HIT)</span>
                      </PremiumTooltip>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <PremiumTooltip content="Average TTFB when the CDN must fetch content directly from your origin server.">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-help border-b border-zinc-800 hover:border-zinc-600 transition-colors">Origin (direct)</span>
                      </PremiumTooltip>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <PremiumTooltip content="Green: edge faster than origin for this region. Red: edge slower than origin (same as MISS).">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-help border-b border-zinc-800 hover:border-zinc-600 transition-colors">Latency delta</span>
                      </PremiumTooltip>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <PremiumTooltip content="Green: lower latency vs origin. Red: higher latency vs origin (same as ms, same signal as MISS).">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-help border-b border-zinc-800 hover:border-zinc-600 transition-colors">Reduction %</span>
                      </PremiumTooltip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.map(row => {
                    const hasEdgeHits = row.edge_hits > 0
                    const hasOriginMisses = row.origin_misses > 0
                    const hasOriginHits = row.origin_hits > 0
                    const canCompare = hasEdgeHits && hasOriginMisses
                    const itemSaving = canCompare ? (row.origin_ttfb - row.edge_ttfb) : 0
                    const reductionPct =
                      canCompare && row.origin_ttfb > 0
                        ? ((row.origin_ttfb - row.edge_ttfb) / row.origin_ttfb) * 100
                        : null

                    const edgeSampleText = `HIT (${row.edge_hits} ${row.edge_hits === 1 ? 'sample' : 'samples'})`
                    const originSampleText = hasOriginMisses
                      ? `MISS (${row.origin_misses} ${row.origin_misses === 1 ? 'sample' : 'samples'})`
                      : `HIT (${row.origin_hits} samples)`

                    const isBest = bestRegion && row.region === bestRegion.region
                    const isWorst = worstRegion && row.region === worstRegion.region && row.edge_ttfb > (bestRegion?.edge_ttfb || 0) * 1.5

                    return (
                      <tr key={row.region} className={`${MONITOR_TABLE.tbodyRow} ${isBest ? 'bg-emerald-400/[0.03]' : ''} ${isWorst ? 'bg-amber-400/[0.01]' : ''} transition-colors group`}>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-200 font-bold">{regionLabels[row.region] ?? row.region}</span>
                            {isBest && <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest border border-emerald-500/30 px-1.5 py-0.5 rounded leading-none">Top edge gain</span>}
                            {isWorst && <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest border border-amber-500/20 px-1.5 py-0.5 rounded leading-none">Lowest edge gain</span>}
                          </div>
                        </td>

                        {/* Edge (HIT) Column */}
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            <div className={`flex items-center gap-1.5 ${hasEdgeHits ? 'text-emerald-400' : 'text-zinc-600'}`}>
                              {hasEdgeHits ? (
                                <>
                                  <Zap className="w-3 h-3 fill-current" />
                                  <PremiumTooltip content={edgeSampleText} position="top-right">
                                    <span className="text-[10px] font-black uppercase tracking-widest cursor-help border-b border-white/5 hover:border-current/30 transition-colors">
                                      HIT
                                    </span>
                                  </PremiumTooltip>
                                </>
                              ) : (
                                <PremiumTooltip content={edgeSampleText} position="top-right">
                                  <span className="text-zinc-600 font-bold tracking-widest cursor-help border-b border-white/5">—</span>
                                </PremiumTooltip>
                              )}
                            </div>
                            <span className="text-zinc-200 font-mono font-bold text-xs">
                              {hasEdgeHits ? `${Math.round(row.edge_ttfb)}ms` : '—'}
                            </span>
                          </div>
                        </td>

                        {/* Origin (direct) Column */}
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            {hasOriginMisses ? (
                              <>
                                <div className="flex items-center gap-1.5 text-metric-ttfb-slow">
                                  <PremiumTooltip content={originSampleText} position="top-right">
                                    <span className="text-[10px] font-black uppercase tracking-widest cursor-help border-b border-white/5 hover:border-current/30 transition-colors">
                                      MISS
                                    </span>
                                  </PremiumTooltip>
                                </div>
                                <span className="text-zinc-200 font-mono font-bold text-xs">{Math.round(row.origin_ttfb)}ms</span>
                              </>
                            ) : hasOriginHits ? (
                              <div className="flex items-center gap-1.5 text-zinc-500">
                                <ShieldAlert className="w-3 h-3" />
                                <PremiumTooltip content={originSampleText} position="top-right">
                                  <span className="text-[9px] font-black uppercase tracking-widest cursor-help border-b border-white/5">FORCED HIT (CDN)</span>
                                </PremiumTooltip>
                                <span className="text-zinc-600 font-mono font-bold text-xs ml-1">—</span>
                              </div>
                            ) : (
                              <span className="text-zinc-600 font-bold tracking-widest">—</span>
                            )}
                          </div>
                        </td>

                        {/* Latency delta */}
                        <td className="px-4 py-4 text-right">
                          {canCompare ? (
                            <span className={`text-xs font-bold ${itemSaving > 0 ? 'text-metric-ttfb-fast' : 'text-metric-ttfb-slow'}`}>
                              {Math.abs(Math.round(itemSaving))}ms
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>

                        {/* Reduction % vs origin TTFB */}
                        <td className="px-4 py-4 text-right">
                          {canCompare && reductionPct !== null ? (
                            <span className={`text-xs font-bold tabular-nums ${itemSaving > 0 ? 'text-metric-ttfb-fast' : 'text-metric-ttfb-slow'}`}>
                              {Math.abs(Math.round(reductionPct))}%
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : hasAnyData ? (
          <div className="cs-card cs-card-glass p-12 text-center border-dashed border-white/5 bg-white/[0.01]">
            <p className="text-sm text-zinc-400 italic">No comparison samples detected in the last {period}.</p>
            <p className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-bold">Try selecting a broader timeframe.</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
