'use client'

import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
import { Clock, Zap, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Gauge, ShieldAlert } from 'lucide-react'
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
import { isCacheHit, getCacheDisplayLabel } from '@/lib/cache-utils'

export type { AuditReadiness }

interface BypassPoint {
  hour: Date
  region: string
  edge_ttfb: number
  origin_ttfb: number
  edge_cache_status: string
  origin_cache_status: string
}

interface BypassAuditProps {
  data: BypassPoint[]
  regionLabels: Record<string, string>
  readiness: AuditReadiness
}

const COMPARABLE_PAIRS_GATE = 8
const COMPARABLE_REGIONS_GATE = 4

function RecheckButton({ monitorId }: { monitorId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const handleRecheck = () => {
    startTransition(async () => {
      setError(null)
      try {
        const res = await fetch(`/api/monitors/${monitorId}/evaluate-readiness`, { method: 'POST' })
        if (!res.ok) throw new Error('Failed to trigger recheck')
        router.refresh()
      } catch (err) {
        setError('Connection error. Try again.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleRecheck}
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
      >
        <RefreshCw className={`w-3 h-3 text-zinc-400 group-hover:text-white transition-colors ${isPending ? 'animate-spin' : ''}`} />
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-white">
          {isPending ? 'Rechecking...' : 'Trigger Recheck'}
        </span>
      </button>
      {error && <p className="text-[9px] font-bold text-red-400">{error}</p>}
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
  if (state === 'enabled' || state === 'warmup') return null

  const reason = resolveReason(readiness)
  return (
    <div className="cs-tint-warning p-4 flex gap-4 items-start">
      <div className="cs-card-wash opacity-40" />
      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
      <div className="relative z-10 space-y-1 flex-1">
        <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-400">
          Edge Audit Unavailable
        </h3>
        {reason && (
          <p className="text-xs leading-relaxed font-medium text-amber-200/60">{reason}</p>
        )}
        <div className="pt-1">
          <RecheckButton monitorId={monitorId} />
        </div>
      </div>
    </div>
  )
}

function AuditCTA({ readiness, monitorId }: { readiness: AuditReadiness; monitorId: string }) {
  if (readiness.state !== 'enabled') return null
  return <MonitorDispatchButtons monitorId={monitorId} variant="compact" />
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

  // ── Global Aggregation (for Status & Confidence) ──────────────────────────
  const totalAggregatedData = useMemo(() => {
    const regions: Record<string, { edge_ttfb: number[], origin_ttfb: number[], edge_statuses: string[], origin_statuses: string[], edge_hits: number, origin_hits: number }> = {}
    
    data.forEach(item => {
      if (!regions[item.region]) {
        regions[item.region] = { edge_ttfb: [], origin_ttfb: [], edge_statuses: [], origin_hits: 0, edge_hits: 0, origin_statuses: [] }
      }
      const r = regions[item.region]
      const isEdgeHit = isCacheHit(item.edge_cache_status)
      const isOriginHit = isCacheHit(item.origin_cache_status)
      if (item.edge_ttfb > 0) r.edge_ttfb.push(item.edge_ttfb)
      if (item.origin_ttfb > 0 && !isOriginHit) r.origin_ttfb.push(item.origin_ttfb)
      if (isEdgeHit) r.edge_hits++
      if (isOriginHit) r.origin_hits++
      if (item.edge_cache_status) r.edge_statuses.push(item.edge_cache_status.toUpperCase())
      if (item.origin_cache_status) r.origin_statuses.push(item.origin_cache_status.toUpperCase())
    })

    return Object.entries(regions).map(([id, stats]) => ({
      region: id,
      comparable_samples: stats.edge_ttfb.length
    }))
  }, [data])

  const liveMatched = totalAggregatedData.reduce((sum, s) => sum + s.comparable_samples, 0)
  const liveVerified = totalAggregatedData.filter(s => s.comparable_samples > 0).length

  // ── Filtered Aggregation (for Table & Charts) ──────────────────────────────
  const aggregatedData = useMemo(() => {
    const regions: Record<string, {
      edge_ttfb: number[],
      origin_ttfb: number[],
      edge_statuses: string[],
      origin_statuses: string[],
      edge_hits: number,
      origin_hits: number,
    }> = {}

    filteredData.forEach(item => {
      if (!regions[item.region]) {
        regions[item.region] = { edge_ttfb: [], origin_ttfb: [], edge_statuses: [], origin_hits: 0, edge_hits: 0, origin_statuses: [] }
      }
      const r = regions[item.region]
      const isEdgeHit = isCacheHit(item.edge_cache_status)
      const isOriginHit = isCacheHit(item.origin_cache_status)

      if (item.edge_ttfb > 0) r.edge_ttfb.push(item.edge_ttfb)
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
        is_forced_hit: originHitRatio >= 1 && stats.origin_statuses.length > 0,
        last_edge_status: stats.edge_statuses[stats.edge_statuses.length - 1] || 'MISS',
        last_origin_status: stats.origin_statuses[stats.origin_statuses.length - 1] || 'MISS',
        sample_count: stats.edge_statuses.length,
        comparable_samples: stats.edge_ttfb.length // Count of valid audit pairs
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

  const isLiveActive = liveMatched >= COMPARABLE_PAIRS_GATE && liveVerified >= COMPARABLE_REGIONS_GATE
  const statusLabel = isLiveActive ? 'Active' : badge.label
  const statusColor = isLiveActive ? 'text-emerald-400' : badge.cssClass.replace('cs-badge', '')

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

      <div className="grid grid-cols-1 gap-6">
        {/* Global Impact Analysis Card */}
        <div className="cs-card px-6 py-5">
          <div className={BRAND_CARD_SURFACE_GRADIENT} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.25em]">
                  Global Impact Analysis
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-zinc-700" />
                  <span className={`text-[9px] font-black uppercase tracking-tight ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-baseline gap-4">
                {validForAvg > 0 ? (
                  <>
                    <span className={`text-5xl font-black tracking-tighter ${avgSavingMs > 0 ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}>
                      {avgSavingMs > 0 ? '-' : '+'}
                      {Math.abs(Math.round(avgSavingMs))}ms
                    </span>
                    <div className="flex flex-col">
                      <PremiumTooltip content={`Averaged over ${filteredData.length} samples across ${aggregatedData.length} regions.`}>
                        <span className={`text-base font-bold cursor-help ${avgSavingMs > 0 ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}>
                          {avgSavingMs > 0 ? '-' : '+'}
                          {Math.abs(Math.round(avgSavingPct))}% {avgSavingMs > 0 ? 'Saved' : 'Added'}
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
                <span className={`h-2 w-2 rounded-full ${validForAvg > 0 ? 'bg-[var(--brand-primary)] animate-pulse' : 'bg-zinc-700'}`} />
                Edge (HIT) vs Origin (Direct)
              </div>
              <p className="text-[11px] text-zinc-500 max-w-[280px] sm:text-right leading-relaxed font-medium">
                {validForAvg > 0
                  ? `Analyzing average performance across ${validForAvg} regions with ${filteredData.length} audit samples in the last ${period}.`
                  : `Waiting for infrastructure telemetry to establish a performance baseline.`}
              </p>
            </div>
          </div>
        </div>

        {/* Readiness Banner for Disabled/Error states */}
        {shouldShowBanner(readiness) && readiness.state !== 'warmup' && (
          <ReadinessBanner readiness={readiness} monitorId={monitorId} />
        )}

        {/* Partial Signal Alert */}
        {hasData && aggregatedData.some(r => r.origin_hit_ratio > 0) && (
          <div className="cs-tint-warning p-4 flex gap-4 items-start">
            <div className="cs-card-wash opacity-40" />
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
            <div className="relative z-10 space-y-1">
              <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em]">Partial Signal Optimization</h3>
              <p className="text-xs leading-relaxed text-amber-200/60 font-medium">
                Could not obtain Origin metrics in {forcedHitRegionsCount} regions due to infrastructure optimizations.
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
                    <th className="px-4 py-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Edge (HIT)</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Origin (Direct)</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Real Benefit</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.map(row => {
                    const isEdgeHit = row.edge_hit_ratio > 0
                    const isOriginHit = row.is_forced_hit
                    const itemSaving = row.origin_ttfb - row.edge_ttfb
                    return (
                      <tr key={row.region} className={MONITOR_TABLE.tbodyRow}>
                        <td className="px-4 py-4 text-zinc-200 font-bold">{regionLabels[row.region] ?? row.region}</td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            {isEdgeHit ? (
                              <div className="flex items-center gap-1.5 text-emerald-400">
                                <Zap className="w-3 h-3 fill-current" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{Math.round(row.edge_hit_ratio * 100)}% HIT</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{getCacheDisplayLabel(row.last_edge_status)}</span>
                            )}
                            <span className="text-zinc-200 font-mono font-bold text-xs">{Math.round(row.edge_ttfb)}ms</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            {isOriginHit ? (
                              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-tighter">FORCED HIT (CDN)</span>
                            ) : (
                              <span className="text-zinc-200 font-mono font-bold text-xs">{row.origin_ttfb > 0 ? `${Math.round(row.origin_ttfb)}ms` : '—'}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {itemSaving !== 0 && row.origin_ttfb > 0 ? (
                            <div className={`text-xs font-bold ${itemSaving > 0 ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}>
                              {itemSaving > 0 ? '-' : '+'}{Math.abs(Math.round(itemSaving))}ms
                            </div>
                          ) : <span className="text-zinc-600">—</span>}
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
            <p className="text-sm text-zinc-400 italic">No audit samples detected in the last {period}.</p>
            <p className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-bold">Try selecting a broader timeframe.</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
