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
  isAuditButtonEnabled,
  warmupProgressPercent,
  remainingPairsNeeded,
  formatSnapshotReadiness,
} from './bypass-audit.helpers'

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

function ReadinessBadge({ readiness }: { readiness: AuditReadiness | null | undefined }) {
  const badge = formatAuditBadge(readiness)
  return <span className={badge.cssClass}>{badge.label}</span>
}

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

  if (state === 'warmup') {
    return (
      <PremiumTooltip content="Collecting evidence before audit can run." direction="top">
        <button
          disabled
          className="relative inline-flex h-9 items-center justify-center gap-2.5 rounded-xl border px-6 border-white/10 bg-white/5 text-zinc-500 cursor-not-allowed opacity-60 text-xs font-bold tracking-tight"
        >
          <Zap className="h-3.5 w-3.5" />
          Warming Up...
        </button>
      </PremiumTooltip>
    )
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

function WarmupProgress({ readiness }: { readiness: AuditReadiness }) {
  const pct = warmupProgressPercent(readiness)
  const remaining = remainingPairsNeeded(readiness)

  return (
    <div className="mt-2 space-y-1">
      <div className="flex justify-between text-[9px] font-black text-zinc-600 uppercase tracking-widest">
        <span>{readiness.comparable_pairs}/8 comparable pairs</span>
        <span>{remaining} remaining</span>
      </div>
      <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400/50 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
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
  const reason = resolveReason(readiness)
  const Icon = state === 'disabled' ? AlertTriangle : Clock
  const title = state === 'disabled' ? 'Edge Audit Unavailable' : 'Edge Audit Warming Up'

  return (
    <div className="cs-tint-warning p-4 flex gap-4 items-start">
      <div className="cs-card-wash opacity-40" />
      <Icon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
      <div className="relative z-10 space-y-1 flex-1">
        <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em]">
          {title}
        </h3>
        {reason && (
          <p className="text-xs leading-relaxed text-amber-200/60 font-medium">{reason}</p>
        )}
        {state === 'warmup' && <WarmupProgress readiness={readiness} />}
        <div className="pt-1">
          <RecheckButton monitorId={monitorId} />
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function BypassAudit({ data, regionLabels, readiness }: BypassAuditProps) {
  const { id } = useParams()
  const monitorId = id as string

  const state = resolveReadinessState(readiness)
  const badge = formatAuditBadge(readiness)
  const canAudit = isAuditButtonEnabled(readiness)

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

  const hours = useMemo(
    () => Object.keys(itemsByHour).sort((a, b) => b.localeCompare(a)),
    [itemsByHour],
  )
  const [selectedHour, setSelectedHour] = useState<string | null>(hours[0] || null)

  const currentItems = selectedHour ? itemsByHour[selectedHour] : []

  const confirmedHits = currentItems.filter(
    item =>
      item.edge_cache_status?.toUpperCase() === 'HIT' &&
      item.origin_cache_status?.toUpperCase() !== 'HIT' &&
      item.origin_cache_status?.toUpperCase() !== 'HIDDEN',
  )

  const bypassFails = currentItems.filter(
    item => item.origin_cache_status?.toUpperCase() === 'HIT',
  )

  const totalEdge = confirmedHits.reduce((sum, item) => sum + item.edge_ttfb, 0)
  const totalOrigin = confirmedHits.reduce((sum, item) => sum + item.origin_ttfb, 0)
  const avgSavingMs =
    confirmedHits.length > 0 ? (totalOrigin - totalEdge) / confirmedHits.length : 0
  const avgSavingPct = totalOrigin > 0 ? ((totalOrigin - totalEdge) / totalOrigin) * 100 : 0

  const hasData = hours.length > 0

  // Snapshot readiness for timeline headers (Melhoria — Task 3.4)
  const snapshotMeta = formatSnapshotReadiness(readiness)

  return (
    // min-h prevents layout shift when transitioning between states (Melhoria #4)
    <div className="space-y-6 min-h-[200px]">
      {/* Section header with permanent state badge — Task 3.1 */}
      <ViewSectionHeader title="Edge Audit" showDot={true}>
        <div className="flex items-center gap-3">
          <span className={badge.cssClass}>{badge.label}</span>
          <AuditCTA readiness={readiness} monitorId={monitorId} />
        </div>
      </ViewSectionHeader>

      {/* Reason banner (disabled / warmup) — Task 3.2 */}
      {shouldShowBanner(readiness) && readiness && (
        <ReadinessBanner readiness={readiness} monitorId={monitorId} />
      )}

      {/* No data and not enabled: don't show empty timeline */}
      {!hasData && state !== 'enabled' && (
        <div className="cs-card cs-card-glass p-8 text-center">
          <p className="text-sm text-zinc-500 italic">
            {state === 'warmup'
              ? 'Audit data will appear here once the first probe completes.'
              : 'No audit data yet. Enable effective caching to start.'}
          </p>
        </div>
      )}

      {/* Legacy empty state for enabled monitors with no data */}
      {!hasData && state === 'enabled' && (
        <div className="cs-card cs-card-glass p-12 text-center">
          <p className="text-sm text-zinc-400 italic">
            No hourly bypass events detected in the last 24h.
          </p>
          <p className="text-[11px] text-zinc-500 mt-2 uppercase tracking-widest font-bold">
            Bypass probes run once per hour per region.
          </p>
        </div>
      )}

      {/* Audit timeline — only rendered when there is data AND state is not disabled (Melhoria UX) */}
      {hasData && state !== 'disabled' && (
        <>
          {/* Time Explorer — Task 3.4: show comparable regions + confidence per snapshot */}
          <div className="space-y-3">
            <ViewSectionHeader title="Audit Timeline — Performance Snapshots" showDot={false}>
              {canAudit && <MonitorDispatchButtons monitorId={monitorId} variant="audit" />}
            </ViewSectionHeader>

            {/* Snapshot metadata row */}
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-600">
              <span>
                {snapshotMeta.comparableRegions} comparable{' '}
                {snapshotMeta.comparableRegions === 1 ? 'region' : 'regions'}
              </span>
              <span className="opacity-30">·</span>
              <span>Confidence: {snapshotMeta.confidence}</span>
              <span className="opacity-30">·</span>
              <span className={badge.cssClass} style={{ fontSize: '8px', padding: '1px 6px' }}>
                {badge.label}
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
              {hours.map(h => {
                const date = new Date(h)
                const isActive = selectedHour === h

                const diffMs = Date.now() - date.getTime()
                const diffMin = Math.floor(diffMs / 60000)
                const diffHours = Math.floor(diffMin / 60)

                let relativeTime = ''
                if (diffMin < 1) relativeTime = 'Just now'
                else if (diffMin < 60) relativeTime = `${diffMin}m ago`
                else if (diffHours < 24) relativeTime = `${diffHours}h ago`
                else
                  relativeTime = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })

                return (
                  <PremiumTooltip
                    key={h}
                    content={`${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                  >
                    <button
                      onClick={() => setSelectedHour(h)}
                      className={`shrink-0 flex flex-col items-center justify-center min-w-[100px] h-14 rounded-xl border transition-all duration-300 active:scale-95 ${
                        isActive
                          ? 'border-[rgba(34,255,136,0.3)] bg-[rgba(34,255,136,0.08)] text-white shadow-[0_0_15px_rgba(34,255,136,0.08)]'
                          : 'border-white/5 bg-white/[0.03] text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                      }`}
                    >
                      <span
                        className={`text-[12px] font-black uppercase tracking-tight ${isActive ? 'text-metric-ttfb-fast' : 'text-zinc-400'}`}
                      >
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
                    {bypassFails.length} {bypassFails.length === 1 ? 'region' : 'regions'}
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
                  {confirmedHits.length > 0 ? (
                    <>
                      <span
                        className={`text-5xl font-black tracking-tighter ${avgSavingMs > 0 ? 'text-metric-ttfb-fast drop-shadow-[0_0_12px_rgba(34,255,136,0.3)]' : 'text-amber-500'}`}
                      >
                        {avgSavingMs > 0 ? '-' : '+'}
                        {Math.abs(Math.round(avgSavingMs))}ms
                      </span>
                      <div className="flex flex-col">
                        <span
                          className={`text-base font-bold ${avgSavingMs > 0 ? 'text-metric-ttfb-fast' : 'text-amber-500'}`}
                        >
                          {avgSavingMs > 0 ? '-' : '+'}
                          {Math.abs(Math.round(avgSavingPct))}%{' '}
                          {avgSavingMs > 0 ? 'Saved' : 'Added'}
                        </span>
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                          {avgSavingMs > 0 ? 'CDN Edge Benefit' : 'Latency Penalty'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-5xl font-black tracking-tighter text-zinc-700">—ms</span>
                      <div className="flex flex-col">
                        <span className="text-base font-bold text-zinc-600">No comparison yet</span>
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
                  <span
                    className={`h-2 w-2 rounded-full ${confirmedHits.length > 0 ? 'bg-[var(--brand-primary)] animate-pulse' : 'bg-zinc-700'}`}
                  />
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
                  {currentItems.map(row => {
                    const isEdgeHit = row.edge_cache_status?.toUpperCase() === 'HIT'
                    const isOriginHit = row.origin_cache_status?.toUpperCase() === 'HIT'
                    const isValidComparison =
                      isEdgeHit &&
                      !isOriginHit &&
                      row.origin_cache_status?.toUpperCase() !== 'HIDDEN'

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
                                <span className="text-[10px] font-black uppercase tracking-widest">HIT</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                {row.edge_cache_status?.toUpperCase() || 'MISS'}
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
                              <span
                                className="text-[10px] font-black text-zinc-700 tracking-[0.4em] px-2"
                                title="Origin measurement unavailable (CDN served cache)"
                              >
                                ———
                              </span>
                            ) : (
                              <>
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                  {row.origin_cache_status?.toUpperCase() || 'MISS'}
                                </span>
                                <span className="text-zinc-500 font-mono font-medium text-xs">
                                  {Math.round(row.origin_ttfb)}ms
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-col items-end">
                            {isOriginHit ? (
                              <PremiumTooltip content="Origin latency unavailable because all requests were served from cache.">
                                <div className="flex flex-col items-end cursor-help">
                                  <span className="text-[11px] font-bold text-zinc-500 italic">
                                    Inconclusive
                                  </span>
                                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter">
                                    Origin Forced HIT
                                  </span>
                                </div>
                              </PremiumTooltip>
                            ) : !isValidComparison ? (
                              <div className="flex flex-col items-end opacity-40">
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-tight">
                                  Analysis Pending
                                </span>
                                <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-tighter">
                                  Wait for HIT/MISS
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
                                  className={`text-[9px] font-black uppercase tracking-widest ${isSaving ? 'text-metric-ttfb-fast opacity-60' : 'text-amber-600'}`}
                                >
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
            Statistical snapshots are persisted hourly. Previous windows provide a baseline for CDN
            propagation stability.
          </p>
        </>
      )}
    </div>
  )
}
