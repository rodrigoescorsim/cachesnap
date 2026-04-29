'use client'

import React, { useState } from 'react'
import { Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { VisualGlow } from '../../visual-glow'
import { 
  MONITOR_TABLE, 
  BRAND_TABLE_SURFACE_GRADIENT, 
  ttfbMetricCellClass 
} from './monitor-table-styles'
import { 
  extractPop, 
  popToCity, 
  resolveCdnLabel 
} from '@/lib/edge-helpers'
import { 
  ProbeWaterfall, 
  WaterfallLegend,
  type WaterfallProbe 
} from './probe-waterfall'
import { isCacheHit } from '@/lib/cache-utils'

interface BreakdownTableProps {
  probes: WaterfallProbe[]
  regionLabels: Record<string, string>
  regionDescriptions: Record<string, string>
}

export function BreakdownTable({ probes, regionLabels, regionDescriptions }: BreakdownTableProps) {
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({})

  const toggleRegion = (region: string) => {
    setExpandedRegions(prev => ({
      ...prev,
      [region]: !prev[region]
    }))
  }

  const getCacheVariant = (status: string | null) => {
    const normalized = status?.toUpperCase() ?? null
    if (isCacheHit(normalized)) return 'hit'
    if (normalized === 'MISS') return 'miss'
    if (normalized === 'BYPASS') return 'bypass'
    if (normalized === 'DYNAMIC') return 'dynamic'
    return 'not_reported'
  }

  // Scale: max total_ms across all regions (floor 100ms for readability)
  const maxTotal = Math.max(100, ...probes.map(p => p.total_ms ?? p.ttfb_ms ?? 0))

  return (
    <div className="space-y-4">
      <WaterfallLegend maxTotal={maxTotal} />
      <div className={MONITOR_TABLE.outerWrapper}>
      <div className={BRAND_TABLE_SURFACE_GRADIENT} />
      <div className={MONITOR_TABLE.innerScroll}>
        <table className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition} ${MONITOR_TABLE.tableDense}`}>
          <thead>
            <tr className={MONITOR_TABLE.theadRow}>
              <th className="cs-table-compact-th w-8"></th>
              <th className="cs-table-compact-th !text-left">Region</th>
              <th className="cs-table-compact-th !text-center">Served from</th>
              <th className="cs-table-compact-th !text-center">Served by</th>
              <th className="cs-table-compact-th !text-center">Cache</th>
              <th className="cs-table-compact-th !text-center">TTFB</th>
              <th className="cs-table-compact-th !text-center">Sync</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {probes.map((p) => {
              const isExpanded = expandedRegions[p.region]
              const pop = extractPop(p.served_by)
              const cdnLabel = resolveCdnLabel(p.cdn_provider, p.served_by)
              const cacheVariant = getCacheVariant(p.cache_status)
              
              return (
                <React.Fragment key={p.region}>
                  <tr 
                    className={`${MONITOR_TABLE.tbodyRow} cursor-pointer hover:bg-white/[0.02] transition-colors`}
                    onClick={() => toggleRegion(p.region)}
                  >
                    <td className="cs-table-compact-td text-center">
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-zinc-500" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                      )}
                    </td>
                    <td className="cs-table-compact-td font-bold text-zinc-200">
                      <PremiumTooltip content={regionDescriptions[p.region] ?? p.region} position="top-left">
                        {regionLabels[p.region] ?? p.region}
                      </PremiumTooltip>
                    </td>
                    <td className="cs-table-compact-td text-center">
                      <span className="cs-pop-tag uppercase">{pop ? popToCity(pop) || pop : '—'}</span>
                    </td>
                    <td className="cs-table-compact-td text-center">
                      <span className="cs-pop-tag truncate max-w-[100px]">{cdnLabel || '—'}</span>
                    </td>
                    <td className="cs-table-compact-td text-center">
                      {cacheVariant === 'hit' && (
                        <PremiumTooltip content="Cache hit observed" position="top-center" direction="top">
                          <span className="cs-badge-cache-hit">
                            <Zap className="h-[10px] w-[10px] fill-current" />
                            {p.cache_status}
                          </span>
                        </PremiumTooltip>
                      )}
                      {cacheVariant === 'miss' && (
                        <PremiumTooltip content="Cacheable but not found in edge cache" position="top-center" direction="top">
                          <span className="cs-badge-cache-miss">MISS</span>
                        </PremiumTooltip>
                      )}
                      {cacheVariant !== 'hit' && cacheVariant !== 'miss' && (
                        <PremiumTooltip content={p.cache_status?.includes(':') ? p.cache_status.split(':')[1] : (p.cache_status || 'No cache header detected')} position="top-center" direction="top">
                          <span className="cs-badge-cache-not-reported">BYPASS</span>
                        </PremiumTooltip>
                      )}
                    </td>
                    <td className={`${ttfbMetricCellClass(p.ttfb_ms)} !px-3 !py-2 text-[13px] text-center`}>
                      <VisualGlow value={p.ttfb_ms}>
                        {p.ttfb_ms != null ? `${Math.round(p.ttfb_ms)}ms` : '—'}
                      </VisualGlow>
                    </td>
                    <td className="cs-table-compact-td text-right !text-[10px] tabular-nums text-zinc-500">
                      {p.probed_at ? new Date(p.probed_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="bg-black/20 px-4 py-6 border-b border-white/[0.05]">
                        <div className="animate-[cs-fade-in_0.3s_ease-out]">
                          <ProbeWaterfall 
                            probes={[p]} 
                            regionLabels={regionLabels} 
                            hideHeader={true} 
                            hideLegend={true} 
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
  </div>
  )
}


