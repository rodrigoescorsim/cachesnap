'use client'

import { useState, useMemo } from 'react'
import { Clock, Zap, AlertTriangle } from 'lucide-react'
import { useParams } from 'next/navigation'
import { MonitorDispatchButtons } from './monitor-dispatch-buttons'
import { ViewSectionHeader } from '@/components/dashboard/dashboard-ui'
import {
  BRAND_CARD_SURFACE_GRADIENT,
  BRAND_TABLE_SURFACE_GRADIENT,
  MONITOR_TABLE,
} from './monitor-table-styles'
import { PremiumTooltip } from '@/components/premium-tooltip'

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
}

export function BypassAudit({ data, regionLabels }: BypassAuditProps) {
  const { id } = useParams()
  // Group data by hour
  const itemsByHour = useMemo(() => {
    const groups: Record<string, BypassPoint[]> = {}
    data.forEach(item => {
      const h = item.hour.toISOString()
      if (!groups[h]) groups[h] = []
      groups[h].push(item)
    })
    return groups
  }, [data])

  const hours = useMemo(() => Object.keys(itemsByHour).sort((a, b) => b.localeCompare(a)), [itemsByHour])
  const [selectedHour, setSelectedHour] = useState<string | null>(hours[0] || null)

  const currentItems = selectedHour ? itemsByHour[selectedHour] : []

  // For global impact analysis
  const confirmedHits = currentItems.filter(item =>
    item.edge_cache_status?.toUpperCase() === 'HIT' &&
    item.origin_cache_status?.toUpperCase() !== 'HIT' &&
    item.origin_cache_status?.toUpperCase() !== 'HIDDEN'
  )

  const bypassFails = currentItems.filter(item => item.origin_cache_status?.toUpperCase() === 'HIT')

  const totalEdge = confirmedHits.reduce((sum, item) => sum + item.edge_ttfb, 0)
  const totalOrigin = confirmedHits.reduce((sum, item) => sum + item.origin_ttfb, 0)
  const avgSavingMs = confirmedHits.length > 0 ? (totalOrigin - totalEdge) / confirmedHits.length : 0
  const avgSavingPct = totalOrigin > 0 ? ((totalOrigin - totalEdge) / totalOrigin) * 100 : 0

  if (hours.length === 0) {
    return (
      <div className="cs-card cs-card-glass p-12 text-center">
        <p className="text-sm text-zinc-400 italic">No hourly bypass events detected in the last 24h.</p>
        <p className="text-[11px] text-zinc-500 mt-2 uppercase tracking-widest font-bold">Bypass probes run once per hour per region.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Time Explorer */}
      <div className="space-y-3">
        <ViewSectionHeader title="Audit Timeline — Performance Snapshots" showDot={false}>
          <MonitorDispatchButtons monitorId={id as string} variant="audit" />
        </ViewSectionHeader>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
          {hours.map((h) => {
            const date = new Date(h)
            const isActive = selectedHour === h

            // Calculate relative time for a more "Live" feel
            const diffMs = Date.now() - date.getTime()
            const diffMin = Math.floor(diffMs / 60000)
            const diffHours = Math.floor(diffMin / 60)

            let relativeTime = ""
            if (diffMin < 1) relativeTime = "Just now"
            else if (diffMin < 60) relativeTime = `${diffMin}m ago`
            else if (diffHours < 24) relativeTime = `${diffHours}h ago`
            else relativeTime = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            return (
              <PremiumTooltip key={h} content={`${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`}>
                <button
                  onClick={() => setSelectedHour(h)}
                  className={`shrink-0 flex flex-col items-center justify-center min-w-[100px] h-14 rounded-xl border transition-all duration-300 active:scale-95 ${isActive
                    ? 'border-[rgba(34,255,136,0.3)] bg-[rgba(34,255,136,0.08)] text-white shadow-[0_0_15px_rgba(34,255,136,0.08)]'
                    : 'border-white/5 bg-white/[0.03] text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                    }`}
                >
                  <span className={`text-[12px] font-black uppercase tracking-tight ${isActive ? 'text-metric-ttfb-fast' : 'text-zinc-400'}`}>
                    {relativeTime}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">
                    Snapshot
                  </span>
                </button>
              </PremiumTooltip>
            )
          })}
        </div>
      </div>

      {/* Bypass Failure Alert */}
      {bypassFails.length > 0 && (
        <div className="cs-card-glass p-4 flex gap-4 items-start border-amber-500/10 bg-amber-500/5">
          <div className="cs-card-wash opacity-40" />
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
          <div className="relative z-10 space-y-1">
            <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em]">Partial Signal Optimization</h3>
            <p className="text-xs leading-relaxed text-amber-200/60 font-medium">
              Could not obtain Origin metrics in <span className="text-amber-400 font-bold">{bypassFails.length} {bypassFails.length === 1 ? 'region' : 'regions'}</span> due to infrastructure optimizations that forced delivery via Edge (Cache HIT), preventing a direct server measurement.
            </p>
          </div>
        </div>
      )}

      {/* Impact Summary - Unified Wide Card */}
      <div className="cs-card px-6 py-5">
        <div className={BRAND_CARD_SURFACE_GRADIENT} />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.25em]">Global Impact Analysis</div>
            <div className="flex items-baseline gap-4">
              {confirmedHits.length > 0 ? (
                <>
                  <span className={`text-5xl font-black tracking-tighter ${avgSavingMs > 0 ? 'text-metric-ttfb-fast drop-shadow-[0_0_12px_rgba(34,255,136,0.3)]' : 'text-amber-500'}`}>
                    {avgSavingMs > 0 ? '-' : '+'}{Math.abs(Math.round(avgSavingMs))}ms
                  </span>
                  <div className="flex flex-col">
                    <span className={`text-base font-bold ${avgSavingMs > 0 ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}>
                      {avgSavingMs > 0 ? '-' : '+'}{Math.abs(Math.round(avgSavingPct))}% {avgSavingMs > 0 ? 'Saved' : 'Added'}
                    </span>
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      {avgSavingMs > 0 ? 'CDN Edge Benefit' : 'Latency Penalty'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-5xl font-black tracking-tighter text-zinc-700">
                    —ms
                  </span>
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-zinc-600">
                      Baseline Pending
                    </span>
                    <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                      Waiting for cache hit
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5 px-6 sm:border-l border-white/5">
            <div className="flex items-center gap-2 font-black text-zinc-400 text-[10px] uppercase tracking-widest">
              <span className={`h-2 w-2 rounded-full ${confirmedHits.length > 0 ? 'bg-[var(--brand-primary)] animate-pulse' : 'bg-zinc-700'}`} />
              Edge (HIT) vs Origin (Direct)
            </div>
            <p className="text-[11px] text-zinc-500 max-w-[280px] sm:text-right leading-relaxed font-medium">
              {confirmedHits.length > 0
                ? `Analyzing comparative data for ${confirmedHits.length} regions with verified cache hits in this window.`
                : `Insufficient verified hits for a statistical comparative analysis.`}
            </p>
          </div>
        </div>
      </div>

      {/* Regional Table for Selected Hour */}
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
              {currentItems.map((row) => {
                const isEdgeHit = row.edge_cache_status?.toUpperCase() === 'HIT'
                const isOriginHit = row.origin_cache_status?.toUpperCase() === 'HIT'
                const isValidComparison = isEdgeHit && !isOriginHit && row.origin_cache_status?.toUpperCase() !== 'HIDDEN'

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
                        {row.edge_cache_status?.toUpperCase() === 'HIT' ? (
                          <span className="cs-badge cs-badge-success text-[10px] px-2 py-0.5">
                            <Zap className="w-2.5 h-2.5 fill-current" />
                            HIT
                          </span>
                        ) : (
                          <span className="cs-badge-flat cs-badge-flat-muted text-[10px] px-2 py-0.5 font-bold">
                            {row.edge_cache_status?.toUpperCase() || 'MISS'}
                          </span>
                        )}
                        <span className="text-zinc-200 font-mono font-bold text-xs">{Math.round(row.edge_ttfb)}ms</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        {isOriginHit ? (
                          <span className="text-[10px] font-black text-zinc-700 tracking-[0.4em] px-2" title="Origin measurement unavailable (CDN served cache)">
                            ———
                          </span>
                        ) : (
                          <>
                            <span className="cs-badge-flat cs-badge-flat-muted text-[10px] px-2 py-0.5 font-bold">
                              {row.origin_cache_status?.toUpperCase() || 'MISS'}
                            </span>
                            <span className="text-zinc-500 font-mono font-medium text-xs">{Math.round(row.origin_ttfb)}ms</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex flex-col items-end">
                        {isOriginHit ? (
                          <PremiumTooltip content="Origin latency unavailable because all requests were served from cache.">
                            <div className="flex flex-col items-end cursor-help">
                              <span className="text-[11px] font-bold text-zinc-500 italic">Inconclusive</span>
                              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter">Origin Forced HIT</span>
                            </div>
                          </PremiumTooltip>
                        ) : !isValidComparison ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Analysis Pending</span>
                            <span className="text-[9px] font-bold text-zinc-700 uppercase">Wait for HIT/MISS</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className={`text-xs font-black flex items-center gap-1 ${isSaving ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}>
                              {isSaving ? '-' : '+'}{Math.abs(Math.round(itemSaving))}ms
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${isSaving ? 'text-metric-ttfb-fast opacity-60' : 'text-amber-600'}`}>
                              {isSaving ? 'Faster at Edge' : 'Latency Penalty'}
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

      <p className="text-[10px] text-zinc-500 italic text-center font-bold uppercase tracking-wide opacity-50 px-1">
        Statistical snapshots are persisted hourly. Previous windows provide a baseline for CDN propagation stability.
      </p>
    </div>
  )
}
