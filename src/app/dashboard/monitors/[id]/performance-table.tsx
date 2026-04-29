'use client'

import React, { useState, Fragment } from 'react'
import { ChevronDown, ChevronUp, Zap, Gauge } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { extractPop, resolveCdnLabel, popToCity } from '@/lib/edge-helpers'
import { isCacheHit, isCacheMiss, isCacheBypass, getCacheDisplayLabel } from '@/lib/cache-utils'
import { getCacheColor, getCacheTooltip, getTtfbTooltip, getTtfbColorClass } from '@/lib/thresholds'
import {
  MONITOR_TABLE,
  BRAND_TABLE_SURFACE_GRADIENT,
  TH_TTFB_HEADER,
  TH_TTFB_HEADER_ORIGIN,
  ttfbMetricCellClass,
  edgeTtfbMetricCellClass,
  originTtfbMetricCellClass
} from './monitor-table-styles'
import { VisualGlow } from '../../visual-glow'
import { ProbeWaterfall, type WaterfallProbe } from './probe-waterfall'

interface RegionStat {
  region: string
  probe_count: number
  ttfb_avg_ms: number | null
  edge_hit_avg_ms: number | null
  origin_miss_avg_ms: number | null
  bypass_ttfb_avg_ms: number | null
  ttfb_p95_ms: number | null
  ttfb_min_ms: number | null
  ttfb_max_ms: number | null
  download_avg_ms: number | null
  total_avg_ms: number | null
  dns_avg_ms: number | null
  tcp_avg_ms: number | null
  tls_avg_ms: number | null
  edge_avg_ms: number | null
  origin_avg_ms: number | null
  redirect_avg: number | null
  common_served_by: string | null
  common_cdn_provider: string | null
  common_http_version: string | null
  common_cache_status: string | null
  error_count: number
  cache_hit_pct: number | null
  uptime_pct: number | null
  max_age_s: number | null
  last_probe_at: Date | null
}

interface PerformanceTableProps {
  stats: RegionStat[]
  regionLabels: Record<string, string>
  regionDescriptions: Record<string, string>
  globalAvgTtfb: number
}

const TOOLTIP_EDGE_DATA_UNAVAILABLE = 'Data not available yet'

export function regionRowServedFromLabel(servedBy: string | null): string {
  if (!servedBy?.trim()) return ''
  return (popToCity(extractPop(servedBy) || '') || extractPop(servedBy) || '').trim()
}

export function regionRowCdnLabelTrimmed(
  provider: string | null | undefined,
  servedBy: string | null | undefined
): string {
  return (resolveCdnLabel(provider, servedBy) ?? '').trim()
}

export function PerformanceTable({ stats, regionLabels, regionDescriptions, globalAvgTtfb }: PerformanceTableProps) {
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({})

  const toggleRegion = (region: string, e: React.MouseEvent) => {
    // If the click was on a link or button, don't toggle
    if ((e.target as HTMLElement).closest('a, button')) return

    setExpandedRegions(prev => ({
      ...prev,
      [region]: !prev[region]
    }))
  }

  const isAllExpanded = stats.length > 0 && stats.every(s => expandedRegions[s.region])

  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedRegions({})
    } else {
      const all: Record<string, boolean> = {}
      stats.forEach(s => {
        all[s.region] = true
      })
      setExpandedRegions(all)
    }
  }

  const hasEdgeData = stats.some(s => s.edge_hit_avg_ms !== null)
  const hasOriginData = stats.some(s => s.origin_miss_avg_ms !== null)
  const showSplitTtfb = hasEdgeData || hasOriginData

  const sortedStats = [...stats].sort((a, b) => {
    const valA = a.ttfb_avg_ms ?? 0
    const valB = b.ttfb_avg_ms ?? 0
    return valB - valA
  })

  return (
    <div className={MONITOR_TABLE.outerWrapper}>
      <div className={BRAND_TABLE_SURFACE_GRADIENT} />
      <div className={MONITOR_TABLE.innerScroll}>
        <table className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition} ${MONITOR_TABLE.tableDense}`}>
          <thead>
            <tr className={MONITOR_TABLE.theadRow}>
              <th className="w-8 px-2 py-2">
                <PremiumTooltip content={isAllExpanded ? "Collapse all regions" : "Expand all regions"} position="top-center">
                  <button
                    onClick={toggleAll}
                    className="flex items-center justify-center w-full h-full text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label={isAllExpanded ? "Collapse all" : "Expand all"}
                  >
                    {isAllExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-left pl-0">
                <PremiumTooltip content="Geographic region" position="top-center" direction="top">Region</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Edge node location (PoP)" position="top-center" direction="top">Served from</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="CDN or edge provider" position="top-center" direction="top">Served by</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Cache efficiency" position="top-center" direction="top">Cache</PremiumTooltip>
              </th>
              {showSplitTtfb ? (
                <>
                  <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                    <PremiumTooltip content="Latency when served from cache" position="top-center" direction="top">Edge TTFB</PremiumTooltip>
                  </th>
                  <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER_ORIGIN}`}>
                    <PremiumTooltip content="Latency when bypassing cache" position="top-center" direction="top">Origin TTFB</PremiumTooltip>
                  </th>
                  <th className={`cs-table-compact-th !text-center border-l border-white/5 ${TH_TTFB_HEADER}`}>
                    <PremiumTooltip content="Average latency" position="top-center" direction="top">Avg TTFB</PremiumTooltip>
                  </th>
                  <th className="cs-table-compact-th !text-center">
                    <PremiumTooltip content="Performance compared to the global average" position="top-center" direction="top">vs Global</PremiumTooltip>
                  </th>
                </>
              ) : (
                <>
                  <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                    <PremiumTooltip content="Average latency" position="top-center" direction="top">Avg TTFB</PremiumTooltip>
                  </th>
                  <th className="cs-table-compact-th !text-center">
                    <PremiumTooltip content="Performance compared to the global average" position="top-center" direction="top">vs Global</PremiumTooltip>
                  </th>
                </>
              )}
              <th className="cs-table-compact-th !text-center whitespace-nowrap">
                <PremiumTooltip content="Minimum and maximum latency" position="top-center" direction="top">Min / Max</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-right">
                <PremiumTooltip content="Percentage of successful probes" position="top-center" direction="top">Uptime</PremiumTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((s) => {
              const servedFromLabel = regionRowServedFromLabel(s.common_served_by)
              const cdnLabel = regionRowCdnLabelTrimmed(s.common_cdn_provider, s.common_served_by)
              const isExpanded = !!expandedRegions[s.region]

              const waterfallProbe: WaterfallProbe = {
                region: s.region,
                dns_ms: s.dns_avg_ms,
                tls_ms: s.tls_avg_ms,
                ttfb_ms: s.ttfb_avg_ms,
                download_ms: s.download_avg_ms,
                total_ms: s.total_avg_ms,
                edge_ms: s.edge_avg_ms,
                origin_ms: s.origin_avg_ms,
                redirect_count: s.redirect_avg != null ? Math.round(s.redirect_avg) : null,
                cache_status: s.common_cache_status,
                served_by: s.common_served_by,
                cdn_provider: s.common_cdn_provider,
                age_s: s.max_age_s,
                server_timing_breakdown: s.tcp_avg_ms != null ? { tcp_ms: s.tcp_avg_ms } : null,
                probed_at: s.last_probe_at,
              }

              return (
                <Fragment key={s.region}>
                  <tr
                    className={`${MONITOR_TABLE.tbodyRow} cursor-pointer group/row transition-colors ${isExpanded ? 'bg-white/[0.03]' : ''}`}
                    onClick={(e) => toggleRegion(s.region, e)}
                  >
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center">
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 text-zinc-500 group-hover/row:text-zinc-300 transition-colors" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-zinc-500 group-hover/row:text-zinc-300 transition-colors" />
                        )}
                      </div>
                    </td>
                    <td className="cs-table-compact-td pl-0">
                      <PremiumTooltip content={regionDescriptions[s.region] ?? s.region} position="top-left">
                        <span className="font-bold text-zinc-200 group-hover/row:text-white transition-colors">
                          {regionLabels[s.region] ?? s.region}
                        </span>
                      </PremiumTooltip>
                    </td>
                    <td className="cs-table-compact-td text-center">
                      {servedFromLabel ? (
                        <PremiumTooltip content={extractPop(s.common_served_by) ? `PoP code detected: ${extractPop(s.common_served_by)}` : 'Location inferred from monitoring region'} position="top-left">
                          <span className="cs-pop-tag whitespace-nowrap uppercase">{servedFromLabel}</span>
                        </PremiumTooltip>
                      ) : (
                        <PremiumTooltip content={TOOLTIP_EDGE_DATA_UNAVAILABLE} position="top-center" direction="top">
                          <span className="cs-pop-tag max-w-[9rem] truncate">—</span>
                        </PremiumTooltip>
                      )}
                    </td>
                    <td className="cs-table-compact-td text-center">
                      {cdnLabel ? (
                        <PremiumTooltip content={s.common_served_by ? `served_by: ${s.common_served_by}` : 'No edge hint'} position="top-center" direction="top">
                          <span className="cs-pop-tag max-w-[9rem] truncate">{cdnLabel}</span>
                        </PremiumTooltip>
                      ) : (
                        <PremiumTooltip content={TOOLTIP_EDGE_DATA_UNAVAILABLE} position="top-center" direction="top">
                          <span className="cs-pop-tag max-w-[9rem] truncate">—</span>
                        </PremiumTooltip>
                      )}
                    </td>
                    <td className="cs-table-compact-td text-center">
                      {s.cache_hit_pct != null ? (
                        <PremiumTooltip 
                          content={Math.round(s.cache_hit_pct) === 0 && (!s.common_cache_status || s.common_cache_status.toUpperCase().includes('BYPASS')) 
                            ? 'Bypass or No Cache: Requests fetched directly from origin' 
                            : `${s.cache_hit_pct}% of requests were served from edge cache`} 
                          position="top-center" 
                          direction="top"
                        >
                          <VisualGlow value={s.cache_hit_pct}>
                            {Math.round(s.cache_hit_pct) >= 95 ? (
                              <span className="cs-badge-cache-hit">
                                <Zap className="h-[10px] w-[10px] shrink-0 fill-current" aria-hidden />
                                {Math.round(s.cache_hit_pct)}%
                              </span>
                            ) : Math.round(s.cache_hit_pct) >= 90 ? (
                              <span className="cs-badge-cache-hit">{Math.round(s.cache_hit_pct)}%</span>
                            ) : Math.round(s.cache_hit_pct) >= 50 ? (
                              <span className="cs-badge-cache-miss">{Math.round(s.cache_hit_pct)}%</span>
                            ) : (
                              Math.round(s.cache_hit_pct) === 0 && (!s.common_cache_status || isCacheBypass(s.common_cache_status)) ? (
                                <span className="cs-badge-cache-not-reported">
                                  {getCacheDisplayLabel(s.common_cache_status || 'BYPASS')}
                                </span>
                              ) : (
                                <span className="cs-badge-cache-hit-rate-low">{Math.round(s.cache_hit_pct)}%</span>
                              )
                            )}
                          </VisualGlow>
                        </PremiumTooltip>
                      ) : (
                        <span className="cs-badge-cache-dash">—</span>
                      )}
                    </td>

                    {showSplitTtfb ? (
                      <>
                        <td className={`${edgeTtfbMetricCellClass(s.edge_hit_avg_ms)} !text-[13px] !py-2`}>
                          <PremiumTooltip content="Average cache latency" position="top-right" direction="top">
                            <VisualGlow value={s.edge_hit_avg_ms}>
                              {s.edge_hit_avg_ms != null ? `${Math.round(s.edge_hit_avg_ms)}ms` : '—'}
                            </VisualGlow>
                          </PremiumTooltip>
                        </td>
                        <td className={`${originTtfbMetricCellClass(s.origin_miss_avg_ms)} !text-[13px] !py-2`}>
                          <PremiumTooltip content="Average origin latency" position="top-right" direction="top">
                            <VisualGlow value={s.origin_miss_avg_ms}>
                              {s.origin_miss_avg_ms != null ? `${Math.round(s.origin_miss_avg_ms)}ms` : '—'}
                            </VisualGlow>
                          </PremiumTooltip>
                        </td>
                        <td className={`${ttfbMetricCellClass(s.ttfb_avg_ms)} !text-[13px] !py-2 border-l border-white/5`}>
                          <PremiumTooltip content="Average latency for this region" position="top-right" direction="top">
                            <VisualGlow value={s.ttfb_avg_ms}>
                              {s.ttfb_avg_ms != null ? `${Math.round(s.ttfb_avg_ms)}ms` : '—'}
                            </VisualGlow>
                          </PremiumTooltip>
                        </td>
                        <td className="cs-table-compact-td-mono text-center">
                          {s.ttfb_avg_ms && globalAvgTtfb > 0 ? (() => {
                            const diff = ((s.ttfb_avg_ms - globalAvgTtfb) / globalAvgTtfb) * 100
                            const absDiff = Math.abs(diff)
                            
                            // Up to +5% is considered "good/green"
                            const colorClass = diff <= 5 ? 'text-emerald-400' : diff > 50 ? 'text-rose-400' : 'text-amber-400'
                            const sign = diff >= 0 ? '+' : '-'
                            
                            return (
                              <PremiumTooltip content={`${regionLabels[s.region] ?? s.region} is ${absDiff.toFixed(1)}% ${diff < 0 ? 'faster' : 'slower'} than the global average (${globalAvgTtfb}ms)`}>
                                <span className={`text-[12px] font-black tabular-nums ${colorClass}`}>
                                  {`${sign}${Math.round(absDiff)}%`}
                                </span>
                              </PremiumTooltip>
                            )
                          })() : <span className="text-zinc-600">—</span>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={`${ttfbMetricCellClass(s.ttfb_avg_ms)} !text-[13px] !py-2`}>
                          <VisualGlow value={s.ttfb_avg_ms}>
                            {s.ttfb_avg_ms != null ? `${Math.round(s.ttfb_avg_ms)}ms` : '—'}
                          </VisualGlow>
                        </td>
                        <td className="cs-table-compact-td-mono text-center">
                          {s.ttfb_avg_ms && globalAvgTtfb > 0 ? (() => {
                            const diff = ((s.ttfb_avg_ms - globalAvgTtfb) / globalAvgTtfb) * 100
                            const absDiff = Math.abs(diff)
                            
                            // Up to +5% is considered "good/green"
                            const colorClass = diff <= 5 ? 'text-emerald-400' : diff > 50 ? 'text-rose-400' : 'text-amber-400'
                            const sign = diff >= 0 ? '+' : '-'
                            
                            return (
                              <PremiumTooltip content={`${regionLabels[s.region] ?? s.region} is ${absDiff.toFixed(1)}% ${diff < 0 ? 'faster' : 'slower'} than the global average (${globalAvgTtfb}ms)`}>
                                <span className={`text-[12px] font-black tabular-nums ${colorClass}`}>
                                  {`${sign}${Math.round(absDiff)}%`}
                                </span>
                              </PremiumTooltip>
                            )
                          })() : <span className="text-zinc-600">—</span>}
                        </td>
                      </>
                    )}

                    <td className="cs-table-compact-td-mono text-right text-zinc-400">
                      {s.ttfb_min_ms != null ? (
                        <PremiumTooltip content={`Min: ${Math.round(s.ttfb_min_ms)}ms / Max: ${Math.round(s.ttfb_max_ms || 0)}ms recorded`} position="top-right">
                          <span className="whitespace-nowrap border-b border-dashed border-zinc-800 hover:border-zinc-600 transition-colors pb-0.5 cursor-help">
                            {Math.round(s.ttfb_min_ms)}<span className="opacity-30 mx-1">/</span>{Math.round(s.ttfb_max_ms || 0)}<span className="text-[9px] ml-0.5 opacity-50 font-sans">ms</span>
                          </span>
                        </PremiumTooltip>
                      ) : '—'}
                    </td>
                    <td className="cs-table-compact-td text-right">
                      {s.uptime_pct != null ? (
                        <PremiumTooltip content={`Uptime: ${Math.round(s.uptime_pct)}% of successful probes`} position="top-right" direction="top">
                          <span className={`cs-badge-flat ${s.uptime_pct >= 99 ? 'cs-badge-flat-success' : s.uptime_pct >= 95 ? 'cs-badge-flat-warning' : 'cs-badge-flat-danger'} font-bold`}>
                            {Math.round(s.uptime_pct)}%
                          </span>
                        </PremiumTooltip>
                      ) : '—'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={showSplitTtfb ? 11 : 9} className="bg-black/20 px-4 py-4 border-b border-white/[0.05]">
                        <div className="animate-[cs-fade-in_0.3s_ease-out]">
                          <ProbeWaterfall
                            probes={[waterfallProbe]}
                            regionLabels={regionLabels}
                            hideHeader={true}
                            hideLegend={false}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
