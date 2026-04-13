'use client'

import { useState, useMemo } from 'react'

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
  
  // Para a análise de impacto global, só consideramos o que temos certeza que foi HIT
  const confirmedHits = currentItems.filter(item => item.edge_cache_status?.toUpperCase() === 'HIT')
  
  const totalEdge = confirmedHits.reduce((sum, item) => sum + item.edge_ttfb, 0)
  const totalOrigin = confirmedHits.reduce((sum, item) => sum + item.origin_ttfb, 0)
  const avgSavingMs = confirmedHits.length > 0 ? (totalOrigin - totalEdge) / confirmedHits.length : 0
  const avgSavingPct = totalOrigin > 0 ? ((totalOrigin - totalEdge) / totalOrigin) * 100 : 0

  if (hours.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-12 text-center">
        <p className="text-sm text-zinc-400 italic">No hourly bypass events detected in the last 24h.</p>
        <p className="text-xs text-zinc-500 mt-2">Bypass probes typically run once per hour per region.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Time Explorer */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
            Hourly Precision Audit
          </h2>
          <div className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">
            1:1 Temporal Alignment
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {hours.map((h) => {
            const date = new Date(h)
            const isActive = selectedHour === h
            return (
              <button
                key={h}
                onClick={() => setSelectedHour(h)}
                className={`shrink-0 flex flex-col items-center justify-center min-w-[72px] py-1.5 rounded-xl border transition-all ${isActive
                    ? 'bg-zinc-900 dark:bg-zinc-800 border-zinc-900 dark:border-zinc-700 text-white shadow-lg shadow-zinc-200 dark:shadow-none'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
              >
                <span className="text-[9px] font-bold uppercase tracking-tight opacity-50">
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Impact Summary - Unified Wide Card */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 p-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 pt-5 opacity-10 dark:opacity-5">
          <svg className="w-24 h-24 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">Global Impact Analysis</div>
            <div className="flex items-baseline gap-3">
              {confirmedHits.length > 0 ? (
                <>
                  <span className={`text-4xl font-black tracking-tighter ${avgSavingMs > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {avgSavingMs > 0 ? '-' : '+'}{Math.abs(Math.round(avgSavingMs))}ms
                  </span>
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${avgSavingMs > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {avgSavingMs > 0 ? '-' : '+'}{Math.abs(Math.round(avgSavingPct))}% {avgSavingMs > 0 ? 'Saved' : 'Added'}
                    </span>
                    <span className="text-[10px] font-medium text-zinc-500 uppercase">
                      {avgSavingMs > 0 ? 'CDN Benefit' : 'Performance Penalty'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-4xl font-black tracking-tighter text-zinc-300">
                    —ms
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-400">
                      Baseline Pending
                    </span>
                    <span className="text-[10px] font-medium text-zinc-500 uppercase">
                      Waiting for cache hit
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-1 px-4 sm:border-l border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-1.5 font-bold text-zinc-700 dark:text-zinc-300 text-xs">
              <div className={`h-2 w-2 rounded-full ${confirmedHits.length > 0 ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
              Edge (HIT) vs Origin (Direct)
            </div>
            <p className="text-[11px] text-zinc-400 max-w-[240px] sm:text-right leading-tight">
              {confirmedHits.length > 0 
                ? `Aggregated metrics for ${confirmedHits.length} regions with verified cache hits in this 60min window.`
                : `No verified cache hits available for analysis in this window.`}
            </p>
          </div>
        </div>
      </div>

      {/* Regional Table for Selected Hour */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
              <th className="px-4 py-3 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Region</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Edge (HIT)</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Origin (Direct)</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Real Benefit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {currentItems.map((row) => {
              const isHit = row.edge_cache_status?.toUpperCase() === 'HIT'
              const itemSaving = row.origin_ttfb - row.edge_ttfb
              const isSaving = itemSaving > 0
              return (
                <tr key={row.region} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-zinc-800 dark:text-zinc-200 tracking-tight">
                      {regionLabels[row.region] ?? row.region}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-mono">
                    <div className="flex items-center justify-end gap-2">
                      {row.edge_cache_status?.toUpperCase() === 'HIT' ? (
                        <span className="text-[9px] uppercase font-bold text-emerald-500">HIT</span>
                      ) : row.edge_cache_status?.toUpperCase() === 'HIDDEN' ? (
                        <span className="text-[9px] uppercase font-bold text-zinc-500">HIDDEN</span>
                      ) : (
                        <span className="text-[9px] uppercase font-bold text-zinc-400">{row.edge_cache_status?.toUpperCase() || 'EDGE'}</span>
                      )}
                      <span className="text-zinc-700 dark:text-zinc-300">{Math.round(row.edge_ttfb)}ms</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums font-mono">
                    <div className="flex items-center justify-end gap-2">
                        {row.origin_cache_status?.toUpperCase() === 'HIT' && (
                          <span className="text-[9px] uppercase font-bold text-red-500 animate-pulse" title="Bypass failed! CDN served cache even for Bypass request.">
                            HIT ⚠
                          </span>
                        )}
                        {row.origin_cache_status?.toUpperCase() === 'HIDDEN' && (
                          <span className="text-[9px] uppercase font-bold text-zinc-500" title="Status Hidden: Cannot confirm if it hit origin.">
                            HIDDEN
                          </span>
                        )}
                        {(row.origin_cache_status?.toUpperCase() === 'MISS' || row.origin_cache_status?.toUpperCase() === 'BYPASS' || row.origin_cache_status?.toUpperCase() === 'DYNAMIC') && (
                          <span className="text-[9px] uppercase font-bold text-zinc-500/60">ORIGIN</span>
                        )}
                      <span className="text-zinc-400">{Math.round(row.origin_ttfb)}ms</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span className={`text-xs font-black ${isSaving ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {isSaving ? '-' : '+'}{Math.abs(Math.round(itemSaving))}ms
                      </span>
                      <span className={`text-[10px] font-bold opacity-80 ${isSaving ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {isSaving ? 'Faster' : 'Slower'}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-zinc-400 italic px-1 text-center font-medium">
        Historical snapshots are persisted hourly. Previous hours provide a baseline for CDN propagation stability.
      </p>
    </div>
  )
}
