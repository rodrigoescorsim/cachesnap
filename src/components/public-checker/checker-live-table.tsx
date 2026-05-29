'use client'

import { useState } from 'react'
import { Zap, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { VisualGlow } from '@/app/dashboard/visual-glow'
import {
  MONITOR_TABLE,
  BRAND_TABLE_SURFACE_GRADIENT,
  ttfbMetricCellClass,
  TH_TTFB_HEADER,
} from '@/app/dashboard/monitors/[id]/monitor-table-styles'
import { ProbeWaterfall, type WaterfallProbe } from '@/app/dashboard/monitors/[id]/probe-waterfall'
import { extractPop, popToCity, resolveCdnLabel } from '@/lib/edge-helpers'
import { isCacheHit, isCacheMiss, getCacheDisplayLabel, getCacheStatusTooltip } from '@/lib/cache-utils'
import { getTtfbTooltip, MONITOR_TTFB, ttfbRowFastMs } from '@/lib/thresholds'
import { formatCacheAgeShort, cacheAgeColumnVisual } from '@/lib/cache-age-display'
import {
  PUBLIC_PROBE_REGION_IDS,
  PUBLIC_REGION_LABELS,
  PUBLIC_REGION_DESCRIPTIONS,
} from '@/lib/public-regions'
import type { CheckResult } from './types'

interface Props {
  results: CheckResult[]
  pendingRegionIds?: string[]
  loading?: boolean
}

function hasTimingData(result: CheckResult): boolean {
  return (
    result.ttfb_ms != null &&
    (result.dns_ms != null ||
      result.tls_ms != null ||
      result.edge_ms != null ||
      result.origin_ms != null ||
      (result.server_timing_breakdown != null &&
        Object.keys(result.server_timing_breakdown).length > 0))
  )
}

function toWaterfallProbe(result: CheckResult): WaterfallProbe {
  return {
    region: result.region,
    dns_ms: result.dns_ms ?? null,
    tls_ms: result.tls_ms ?? null,
    ttfb_ms: result.ttfb_ms ?? null,
    download_ms: result.download_ms ?? null,
    total_ms: result.total_ms ?? null,
    edge_ms: result.edge_ms ?? null,
    origin_ms: result.origin_ms ?? null,
    redirect_count: result.redirect_count ?? null,
    cache_status: result.cache_status ?? null,
    served_by: result.served_by ?? null,
    cdn_provider: result.cdn_provider ?? null,
    age_s: result.age_s ?? null,
    server_timing_breakdown: {
      ...(result.server_timing_breakdown ?? {}),
      ...(result.tcp_ms != null && !(result.server_timing_breakdown?.tcp_ms)
        ? { tcp_ms: result.tcp_ms }
        : {}),
    } as Record<string, number>,
    probed_at: result.probed_at ? new Date(result.probed_at) : null,
  }
}

function LoadingRow({ regionId }: { regionId: string }) {
  return (
    <tr className={`${MONITOR_TABLE.tbodyRow} opacity-60`}>
      <td className="cs-table-compact-td font-bold text-zinc-500">
        {PUBLIC_REGION_LABELS[regionId] ?? regionId}
      </td>
      <td className="cs-table-compact-td text-center"><div className="cs-skeleton mx-auto h-5 w-16 rounded-md" /></td>
      <td className="cs-table-compact-td text-center"><div className="cs-skeleton mx-auto h-5 w-20 rounded-md" /></td>
      <td className="cs-table-compact-td text-center"><div className="cs-skeleton mx-auto h-5 w-14 rounded-md" /></td>
      <td className="cs-table-compact-td text-center"><div className="cs-skeleton mx-auto h-4 w-12 rounded" /></td>
      <td className="cs-table-compact-td text-center"><div className="cs-skeleton mx-auto h-5 w-8 rounded-md" /></td>
      <td className="cs-table-compact-td text-center"><div className="cs-skeleton mx-auto h-5 w-10 rounded-md" /></td>
    </tr>
  )
}

function ResultRow({
  result,
  expanded,
  onToggle,
}: {
  result: CheckResult
  expanded: boolean
  onToggle: () => void
}) {
  const pop = extractPop(result.served_by)
  const cdnLabel = resolveCdnLabel(result.cdn_provider, result.served_by)
  const isError = !!result.error && (result.ttfb_ms === null || result.ttfb_ms === undefined)
  const age = Number(result.age_s ?? 0)
  const ageVisual = age > 0 ? cacheAgeColumnVisual(age, false, 72) : null
  const isWafBlock = result.status_code === 401 || result.status_code === 403
  const isRedirect =
    result.status_code != null && result.status_code >= 300 && result.status_code < 400
  const isStatusErr =
    isError || (result.status_code != null && result.status_code >= 400)
  const statusColorClass =
    result.status_code != null && result.status_code < 300
      ? 'cs-badge-flat-success'
      : 'cs-badge-flat-danger'
  const regionLabel = PUBLIC_REGION_LABELS[result.region] ?? result.region
  const ttfbFastMs = ttfbRowFastMs(result.cache_status)
  const hops = Number(result.redirect_count ?? 0)

  const canExpand = hasTimingData(result)

  return (
    <>
      <tr
        className={`${MONITOR_TABLE.tbodyRow} hover:bg-white/[0.02] transition-colors ${canExpand ? 'cursor-pointer' : ''}`}
        onClick={canExpand ? onToggle : undefined}
      >
        <td className="cs-table-compact-td font-bold text-zinc-200">
          <div className="flex items-center gap-1.5">
            {canExpand ? (
              expanded
                ? <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
                : <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <PremiumTooltip
              content={PUBLIC_REGION_DESCRIPTIONS[result.region] ?? result.region}
              position="top-left"
            >
              {regionLabel}
            </PremiumTooltip>
          </div>
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
            <PremiumTooltip content={result.served_by || 'No edge hint'} position="top-center" direction="top">
              <span className="cs-pop-tag truncate max-w-[140px]">{cdnLabel}</span>
            </PremiumTooltip>
          ) : (
            <span className="cs-pop-tag">—</span>
          )}
        </td>
        <td className="cs-table-compact-td text-center">
          {(() => {
            const status = result.cache_status
            if (isError && !status) {
              return (
                <PremiumTooltip content={result.error || 'Connection failed'} position="top-center" direction="top">
                  <span className="cs-badge-cache-miss">ERROR</span>
                </PremiumTooltip>
              )
            }
            if (!status) {
              return (
                <PremiumTooltip content="No cache header detected" position="top-center" direction="top">
                  <span className="cs-badge-cache-not-reported">NO HEADER</span>
                </PremiumTooltip>
              )
            }
            const displayStatus = getCacheDisplayLabel(status)
            const cacheTip = getCacheStatusTooltip(status)
            if (isCacheHit(status)) {
              return (
                <PremiumTooltip content={cacheTip} position="top-center" direction="top">
                  <span className="cs-badge-cache-hit">
                    <Zap className="h-[10px] w-[10px] fill-current" />
                    {displayStatus}
                  </span>
                </PremiumTooltip>
              )
            }
            if (isCacheMiss(status)) {
              return (
                <PremiumTooltip content={cacheTip} position="top-center" direction="top">
                  <span className="cs-badge-cache-miss">{displayStatus}</span>
                </PremiumTooltip>
              )
            }
            return (
              <PremiumTooltip content={cacheTip} position="top-center" direction="top">
                <span className="cs-badge-cache-not-reported">{displayStatus}</span>
              </PremiumTooltip>
            )
          })()}
        </td>
        <td
          className={`${
            isError
              ? 'cs-table-compact-td'
              : ttfbMetricCellClass(result.ttfb_ms, ttfbFastMs, MONITOR_TTFB.SLOW)
          } !px-3 !py-2 text-[13px] text-center ${isWafBlock ? '!text-zinc-500' : ''}`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <PremiumTooltip
              content={
                isError
                  ? result.error || 'Connection failed'
                  : isWafBlock
                    ? 'WAF detected: this latency reflects security filtering, not page load speed.'
                    : result.ttfb_ms != null
                      ? getTtfbTooltip(result.ttfb_ms, 'monitor', ttfbFastMs, MONITOR_TTFB.SLOW)
                      : 'No data'
              }
              position="top-right"
              direction="top"
            >
              <div className="flex items-center justify-center gap-1.5">
                {isWafBlock && <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />}
                <VisualGlow value={isWafBlock || isError ? null : result.ttfb_ms}>
                  {result.ttfb_ms != null && !isError ? `${Math.round(result.ttfb_ms)}ms` : '—'}
                </VisualGlow>
              </div>
            </PremiumTooltip>
          </div>
        </td>
        <td className="cs-table-compact-td text-right">
          {age > 0 && ageVisual ? (
            <div className="flex justify-end">
              <PremiumTooltip content={ageVisual.tooltip} position="top-right" direction="top">
                <span className={ageVisual.className}>{formatCacheAgeShort(age)}</span>
              </PremiumTooltip>
            </div>
          ) : (
            <span className="cs-pop-tag">—</span>
          )}
        </td>
        <td className="cs-table-compact-td text-center">
          <div className="flex items-center justify-end gap-1">
            {hops > 0 && (
              <PremiumTooltip
                content={`This request was redirected ${hops} time${hops === 1 ? '' : 's'}.`}
                position="top-right"
              >
                <span className="cs-badge-flat cs-badge-flat-muted" style={{ fontSize: '8px' }}>
                  {hops}↷
                </span>
              </PremiumTooltip>
            )}
            {isRedirect ? (
              <PremiumTooltip
                content="HTTP redirect. Metrics reflect this response, not the final page after redirects."
                position="top-right"
                direction="top"
              >
                <span className="cs-badge-flat cs-badge-flat-warning">{result.status_code}</span>
              </PremiumTooltip>
            ) : isStatusErr ? (
              <PremiumTooltip
                content={
                  isWafBlock
                    ? 'Blocked by edge security (WAF)'
                    : result.error || 'The edge server returned an error status or connection failed.'
                }
                position="top-right"
                direction="top"
              >
                <span className="cs-badge-flat cs-badge-flat-danger">{result.status_code || 'ERR'}</span>
              </PremiumTooltip>
            ) : (
              <PremiumTooltip content="Successful request" position="top-right" direction="top">
                <span className={`cs-badge-flat ${statusColorClass}`}>{result.status_code ?? '200'}</span>
              </PremiumTooltip>
            )}
          </div>
        </td>
      </tr>

      {expanded && canExpand && (
        <tr className={MONITOR_TABLE.tbodyRow}>
          <td colSpan={7} className="px-4 pb-4 pt-0">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <ProbeWaterfall
                probes={[toWaterfallProbe(result)]}
                regionLabels={PUBLIC_REGION_LABELS}
                hideHeader
                hideLegend={false}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function CheckerLiveTable({ results, pendingRegionIds = [], loading }: Props) {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())

  const sortedResults = [...results].sort((a, b) => (b.ttfb_ms ?? 0) - (a.ttfb_ms ?? 0))

  const pendingSet = new Set(pendingRegionIds)
  const orderedPending = PUBLIC_PROBE_REGION_IDS.filter((id) => pendingSet.has(id))

  const showFullSkeleton = loading && results.length === 0 && pendingRegionIds.length === 0

  const expandableIds = sortedResults.filter(hasTimingData).map(r => r.region)
  const allExpanded = expandableIds.length > 0 && expandableIds.every(id => expandedRegions.has(id))

  function toggleAll() {
    setExpandedRegions(allExpanded ? new Set() : new Set(expandableIds))
  }

  function toggleOne(region: string) {
    setExpandedRegions(prev => {
      const next = new Set(prev)
      next.has(region) ? next.delete(region) : next.add(region)
      return next
    })
  }

  return (
    <div className={MONITOR_TABLE.outerWrapper}>
      <div className={BRAND_TABLE_SURFACE_GRADIENT} />
      <div className={MONITOR_TABLE.innerScroll}>
        <table className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition} ${MONITOR_TABLE.tableDense}`}>
          <thead>
            <tr className={MONITOR_TABLE.theadRow}>
              <th className="cs-table-compact-th !text-left">
                <button
                  onClick={expandableIds.length > 0 ? toggleAll : undefined}
                  className={`flex items-center gap-1.5 ${expandableIds.length > 0 ? 'cursor-pointer hover:text-zinc-300 transition-colors' : 'cursor-default'}`}
                >
                  {expandableIds.length > 0 ? (
                    allExpanded
                      ? <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
                      : <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <PremiumTooltip content="Click to expand timing breakdown for all regions" position="top-left" direction="top">
                    Region
                  </PremiumTooltip>
                </button>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Edge node location (PoP)" position="top-center" direction="top">
                  Served from
                </PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="CDN or edge provider" position="top-center" direction="top">
                  Served by
                </PremiumTooltip>
              </th>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Cache hit or miss" position="top-center" direction="top">
                  Cache
                </PremiumTooltip>
              </th>
              <th className={`cs-table-compact-th !text-center ${TH_TTFB_HEADER}`}>
                <PremiumTooltip content="Time to first byte" position="top-center" direction="top">
                  TTFB
                </PremiumTooltip>
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
                <PremiumTooltip content="HTTP response code" position="top-center" direction="top">
                  Status
                </PremiumTooltip>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {showFullSkeleton
              ? PUBLIC_PROBE_REGION_IDS.map((id) => <LoadingRow key={id} regionId={id} />)
              : (
                <>
                  {sortedResults.map((r) => (
                    <ResultRow
                      key={r.region}
                      result={r}
                      expanded={expandedRegions.has(r.region)}
                      onToggle={() => toggleOne(r.region)}
                    />
                  ))}
                  {orderedPending.map((id) => (
                    <LoadingRow key={`pending-${id}`} regionId={id} />
                  ))}
                </>
              )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
