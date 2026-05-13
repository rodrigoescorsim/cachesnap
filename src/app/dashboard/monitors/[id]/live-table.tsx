'use client'

import React, { useState } from 'react'
import { Zap, ChevronDown, ChevronUp, Activity, ShieldAlert } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { VisualGlow } from '../../visual-glow'
import {
  MONITOR_TABLE,
  BRAND_TABLE_SURFACE_GRADIENT,
  ttfbMetricCellClass,
  TH_TTFB_HEADER
} from './monitor-table-styles'
import {
  extractPop,
  popToCity,
  resolveCdnLabel
} from '@/lib/edge-helpers'
import {
  ProbeWaterfall
} from './probe-waterfall'
import { isCacheHit, isCacheMiss, getCacheDisplayLabel } from '@/lib/cache-utils'
import { getTtfbTooltip, getTtfbColorClass } from '@/lib/thresholds'

export interface LiveProbe {
  region: string
  ttfb_ms: number | null
  download_ms: number | null
  total_ms: number | null
  dns_ms: number | null
  tcp_ms: number | null
  tls_ms: number | null
  edge_ms: number | null
  origin_ms: number | null
  redirect_count: number | null
  common_served_by: string | null
  common_cdn_provider: string | null
  common_http_version: string | null
  common_cache_status: string | null
  status_code: number | null
  error: string | null
  max_age_s: number | null
  last_probe_at: Date | null
  probe_version: string | null
  server_timing_breakdown: Record<string, number> | null
}

interface LiveTableProps {
  probes: LiveProbe[]
  regionLabels: Record<string, string>
  regionDescriptions: Record<string, string>
  globalAvgTtfb: number
  thresholdMs?: number
  thresholdHitMs?: number
  /** When false, Age column stays neutral gray; tooltips describe duration only. */
  alertCacheAgeEnabled?: boolean
  alertCacheAgeThresholdHours?: number
}

function formatCacheAgeShort(seconds: number): React.ReactNode {
  const unitStyle = "text-[9px] opacity-70 ml-0.5 font-medium"
  if (seconds < 60) return <>{seconds}<span className={unitStyle}>s</span></>
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return <>{minutes}<span className={unitStyle}>m</span></>
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return <>{hours}<span className={unitStyle}>h</span></>
  const days = Math.floor(hours / 24)
  return <>{days}<span className={unitStyle}>d</span></>
}

/** Full-word duration for tooltips (no s/m/h/d abbreviations). */
function formatCacheAgeVerbose(seconds: number): string {
  const s = Math.floor(Math.max(0, seconds))
  let rem = s
  const days = Math.floor(rem / 86400)
  rem %= 86400
  const hours = Math.floor(rem / 3600)
  rem %= 3600
  const minutes = Math.floor(rem / 60)
  const secs = rem % 60
  const parts: string[] = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  if (secs || parts.length === 0) parts.push(`${secs} second${secs === 1 ? '' : 's'}`)
  return parts.join(', ')
}

function cacheAgeColumnVisual(
  ageSeconds: number,
  alertEnabled: boolean,
  thresholdHours: number
): { className: string; tooltip: string } {
  const verbose = formatCacheAgeVerbose(ageSeconds)
  if (!alertEnabled) {
    return {
      className: 'cs-badge-live-age cs-badge-live-age-muted',
      tooltip: `Edge-reported cache age: ${verbose}.`,
    }
  }
  const limitSeconds = Math.max(1, Math.floor(thresholdHours)) * 3600
  const limitVerbose = formatCacheAgeVerbose(limitSeconds)
  const within = ageSeconds <= limitSeconds
  return {
    className: `cs-badge-live-age ${within ? 'cs-badge-live-age-success' : 'cs-badge-live-age-danger'}`,
    tooltip: within
      ? `${verbose}. Within the Cache Age Alert limit (${limitVerbose}).`
      : `${verbose}. Above the Cache Age Alert limit (${limitVerbose}).`,
  }
}

function getSyncStatus(lastProbeAt: Date | null): { colorClass: string; tooltip: string; text: string } {
  if (!lastProbeAt) return { colorClass: 'text-zinc-500', tooltip: 'No data', text: '—' }
  const date = new Date(lastProbeAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  const timeText = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (diffHours > 24) return { colorClass: 'text-red-400', tooltip: `Last probe on ${date.toLocaleDateString()} — no data today`, text: timeText }
  if (diffHours > 1) return { colorClass: 'text-amber-400', tooltip: `Last probe over 1h ago at ${date.toLocaleString()}`, text: timeText }
  return { colorClass: 'text-zinc-500', tooltip: `Probe synchronized at ${date.toLocaleString()}`, text: timeText }
}

export function LiveTable({
  probes,
  regionLabels,
  regionDescriptions,
  globalAvgTtfb,
  thresholdMs,
  thresholdHitMs,
  alertCacheAgeEnabled = false,
  alertCacheAgeThresholdHours = 72,
}: LiveTableProps) {
  const isDebug = process.env.NODE_ENV === 'development'
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({})

  const toggleRegion = (region: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button')) return

    setExpandedRegions(prev => ({
      ...prev,
      [region]: !prev[region]
    }))
  }

  const isAllExpanded = probes.length > 0 && probes.every(p => expandedRegions[p.region])

  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedRegions({})
    } else {
      const all: Record<string, boolean> = {}
      probes.forEach(p => {
        all[p.region] = true
      })
      setExpandedRegions(all)
    }
  }

  const sortedProbes = [...probes].sort((a, b) => {
    const valA = a.ttfb_ms ?? 0
    const valB = b.ttfb_ms ?? 0
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
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Geographic region" position="top-center" direction="top">Region</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Edge node location (PoP)" position="top-center" direction="top">Served from</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="CDN or edge provider" position="top-center" direction="top">Served by</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Cache hit or miss" position="top-center" direction="top">Cache</PremiumTooltip>
              </th>
              <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                <PremiumTooltip content="Time to first byte" position="top-center" direction="top">TTFB</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Performance compared to the live global average" position="top-center" direction="top">vs Global</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip
                  content="HTTP Age: time this object has been served from edge cache."
                  position="top-center"
                  direction="top"
                >
                  Age
                </PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="HTTP response code" position="top-center" direction="top">Status</PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Time of last check" position="top-center" direction="top">Sync</PremiumTooltip>
              </th>
              {isDebug && (
                <th className="cs-table-compact-th !text-center">
                  <PremiumTooltip content="Probe lambda version" position="top-center" direction="top">Version</PremiumTooltip>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {sortedProbes.map((p) => {
              const isExpanded = expandedRegions[p.region]
              const pop = extractPop(p.common_served_by)
              const cdnLabel = resolveCdnLabel(p.common_cdn_provider, p.common_served_by)

              const isCacheHitStatus = isCacheHit(p.common_cache_status)
              const normalizedStatus = p.common_cache_status?.toUpperCase()

              const isError = !!p.error
              const age = Number(p.max_age_s ?? 0)
              const ageVisual = age > 0 ? cacheAgeColumnVisual(age, alertCacheAgeEnabled, alertCacheAgeThresholdHours) : null
              const sync = getSyncStatus(p.last_probe_at)
              const hops = Number(p.redirect_count ?? 0)
              const isStatusErr = isError || (p.status_code != null && p.status_code >= 400)
              const isWafBlock = p.status_code === 401 || p.status_code === 403
              const statusColorClass = p.status_code != null && p.status_code < 400 ? 'cs-badge-flat-success' : 'cs-badge-flat-danger'

              return (
                <React.Fragment key={p.region}>
                  <tr
                    className={`${MONITOR_TABLE.tbodyRow} cursor-pointer hover:bg-white/[0.02] transition-colors`}
                    onClick={(e) => toggleRegion(p.region, e)}
                  >
                    <td className="cs-table-compact-td text-center">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
                    </td>
                    <td className="cs-table-compact-td font-bold text-zinc-200">
                      <PremiumTooltip content={regionDescriptions[p.region] ?? p.region} position="top-left">
                        {regionLabels[p.region] ?? p.region}
                      </PremiumTooltip>
                    </td>
                    <td className="cs-table-compact-td text-center">
                      {pop ? (
                        <PremiumTooltip content={`PoP code: ${pop}`} position="top-center" direction="top">
                          <span className="cs-pop-tag uppercase whitespace-nowrap">{popToCity(pop) || pop}</span>
                        </PremiumTooltip>
                      ) : (
                        <span className="cs-pop-tag">—</span>
                      )}
                    </td>
                    <td className="cs-table-compact-td text-center">
                      {cdnLabel ? (
                        <PremiumTooltip content={p.common_served_by || 'No edge hint'} position="top-center" direction="top">
                          <span className="cs-pop-tag truncate max-w-[100px]">{cdnLabel}</span>
                        </PremiumTooltip>
                      ) : (
                        <span className="cs-pop-tag">—</span>
                      )}
                    </td>
                    <td className="cs-table-compact-td text-center">
                      {(() => {
                        const status = p.common_cache_status
                        if (!status) {
                          return (
                            <PremiumTooltip content="No cache header detected" position="top-center" direction="top">
                              <span className="cs-badge-cache-not-reported">NO HEADER</span>
                            </PremiumTooltip>
                          )
                        }

                        const upper = status.toUpperCase()
                        const displayStatus = getCacheDisplayLabel(status)

                        if (isCacheHit(status)) {
                          return (
                            <PremiumTooltip content={upper.includes(':') ? upper.split(':')[1].trim() : 'Cache hit observed'} position="top-center" direction="top">
                              <span className="cs-badge-cache-hit">
                                <Zap className="h-[10px] w-[10px] fill-current" />
                                {displayStatus}
                              </span>
                            </PremiumTooltip>
                          )
                        }

                        if (isCacheMiss(status)) {
                          return (
                            <PremiumTooltip content={upper.includes(':') ? upper.split(':')[1].trim() : 'Request was cacheable but not found in edge cache'} position="top-center" direction="top">
                              <span className="cs-badge-cache-miss">{displayStatus}</span>
                            </PremiumTooltip>
                          )
                        }

                        return (
                          <PremiumTooltip content={upper.includes(':') ? upper.split(':')[1].trim() : 'Bypassed edge cache'} position="top-center" direction="top">
                            <span className="cs-badge-cache-not-reported">{displayStatus}</span>
                          </PremiumTooltip>
                        )
                      })()}
                    </td>
                    <td className={`${isError ? 'cs-table-compact-td' : ttfbMetricCellClass(p.ttfb_ms, isCacheHit(p.common_cache_status) ? thresholdHitMs : thresholdMs)} !px-3 !py-2 text-[13px] text-center ${isWafBlock ? '!text-zinc-500' : ''}`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <PremiumTooltip 
                          content={isError ? (p.error || 'Connection failed') : isWafBlock ? "WAF detected: this latency reflects security filtering, not page load speed." : (p.ttfb_ms ? getTtfbTooltip(p.ttfb_ms, 'monitor', isCacheHit(p.common_cache_status) ? thresholdHitMs : thresholdMs, thresholdMs) : 'No data')}
                          position="top-right" 
                          direction="top"
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            {isWafBlock && <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />}
                            <VisualGlow value={isWafBlock || isError ? null : p.ttfb_ms}>
                              {p.ttfb_ms != null && !isError ? `${Math.round(p.ttfb_ms)}ms` : '—'}
                            </VisualGlow>
                          </div>
                        </PremiumTooltip>
                      </div>
                    </td>
                    <td className="cs-table-compact-td-mono text-center">
                      {!isError && p.ttfb_ms && globalAvgTtfb > 0 ? (() => {
                        const diff = ((p.ttfb_ms - globalAvgTtfb) / globalAvgTtfb) * 100
                        const absDiff = Math.abs(diff)

                        // Up to +5% is considered "good/green"
                        const colorClass = diff <= 5 ? 'text-emerald-400' : diff > 50 ? 'text-rose-400' : 'text-amber-400'
                        const sign = diff >= 0 ? '+' : '-'

                        return (
                          <PremiumTooltip content={`${regionLabels[p.region] ?? p.region} is currently ${absDiff.toFixed(1)}% ${diff < 0 ? 'faster' : 'slower'} than the live global average (${globalAvgTtfb}ms)`}>
                            <span className={`text-[12px] font-black tabular-nums ${isWafBlock ? 'text-zinc-500' : colorClass}`}>
                              {`${sign}${Math.round(absDiff)}%`}
                            </span>
                          </PremiumTooltip>
                        )
                      })() : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="cs-table-compact-td text-right">
                      {age > 0 && ageVisual ? (
                        <div className="flex justify-end">
                          <PremiumTooltip content={ageVisual.tooltip} position="top-right" direction="top">
                            <span className={ageVisual.className}>
                              {formatCacheAgeShort(age)}
                            </span>
                          </PremiumTooltip>
                        </div>
                      ) : (
                        <span className="cs-pop-tag">—</span>
                      )}
                    </td>
                    <td className="cs-table-compact-td text-center">
                      <div className="flex items-center justify-end gap-1">
                        {hops > 0 && (
                          <PremiumTooltip content={`This request was redirected ${hops} times.`} position="top-right">
                            <span className="cs-badge-flat cs-badge-flat-muted" style={{ fontSize: '8px' }}>{hops}↷</span>
                          </PremiumTooltip>
                        )}
                        {isStatusErr ? (
                          <div className="flex items-center gap-1.5">
                            <PremiumTooltip content={isWafBlock ? 'Blocked by edge security (WAF)' : (p.error || 'The edge server returned an error status or connection failed.')} position="top-right" direction="top">
                              <span className="cs-badge-flat cs-badge-flat-danger">{p.status_code || 'ERR'}</span>
                            </PremiumTooltip>
                          </div>
                        ) : (
                          <PremiumTooltip content="Successful request" position="top-right" direction="top">
                            <span className={`cs-badge-flat ${statusColorClass}`}>{p.status_code || '200'}</span>
                          </PremiumTooltip>
                        )}
                      </div>
                    </td>
                    <td className={`cs-table-compact-td text-right !text-[10px] tabular-nums ${sync.colorClass}`}>
                      <PremiumTooltip content={sync.tooltip} position="top-right" direction="top">
                        {sync.text}
                      </PremiumTooltip>
                    </td>
                    {isDebug && (
                      <td className="cs-table-compact-td text-center text-[10px] text-zinc-500 font-mono">
                        {p.probe_version || '—'}
                      </td>
                    )}
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={isDebug ? 11 : 10} className="bg-black/20 px-4 py-3 border-b border-white/[0.05]">
                        <div className="animate-[cs-fade-in_0.3s_ease-out]">
                          <ProbeWaterfall
                            probes={[{
                              region: p.region,
                              dns_ms: p.dns_ms,
                              tls_ms: p.tls_ms,
                              ttfb_ms: p.ttfb_ms,
                              download_ms: p.download_ms,
                              total_ms: p.total_ms,
                              edge_ms: p.edge_ms,
                              origin_ms: p.origin_ms,
                              redirect_count: p.redirect_count,
                              cache_status: p.common_cache_status,
                              served_by: p.common_served_by,
                              cdn_provider: p.common_cdn_provider,
                              age_s: p.max_age_s,
                              server_timing_breakdown: p.server_timing_breakdown,
                              probed_at: p.last_probe_at
                            }]}
                            regionLabels={regionLabels}
                            hideHeader={true}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
