'use client'

import { Zap, ShieldAlert } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { VisualGlow } from '@/app/dashboard/visual-glow'
import {
  MONITOR_TABLE,
  BRAND_TABLE_SURFACE_GRADIENT,
  ttfbMetricCellClass,
  TH_TTFB_HEADER,
} from '@/app/dashboard/monitors/[id]/monitor-table-styles'
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

function ResultRow({ result }: { result: CheckResult }) {
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

  return (
    <tr className={`${MONITOR_TABLE.tbodyRow} hover:bg-white/[0.02] transition-colors`}>
      <td className="cs-table-compact-td font-bold text-zinc-200">
        <PremiumTooltip
          content={PUBLIC_REGION_DESCRIPTIONS[result.region] ?? result.region}
          position="top-left"
        >
          {regionLabel}
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
  )
}

export function CheckerLiveTable({ results, pendingRegionIds = [], loading }: Props) {
  const resultMap = new Map(results.map((r) => [r.region, r]))
  const sortedResults = [...results].sort((a, b) => (b.ttfb_ms ?? 0) - (a.ttfb_ms ?? 0))

  const pendingSet = new Set(pendingRegionIds)
  const orderedPending = PUBLIC_PROBE_REGION_IDS.filter((id) => pendingSet.has(id))

  const showFullSkeleton = loading && results.length === 0 && pendingRegionIds.length === 0

  return (
    <div className={MONITOR_TABLE.outerWrapper}>
      <div className={BRAND_TABLE_SURFACE_GRADIENT} />
      <div className={MONITOR_TABLE.innerScroll}>
        <table className={`${MONITOR_TABLE.tableBase} ${MONITOR_TABLE.transition} ${MONITOR_TABLE.tableDense}`}>
          <thead>
            <tr className={MONITOR_TABLE.theadRow}>
              <th className="cs-table-compact-th !text-center">
                <PremiumTooltip content="Geographic region" position="top-center" direction="top">
                  Region
                </PremiumTooltip>
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
                    <ResultRow key={r.region} result={r} />
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
