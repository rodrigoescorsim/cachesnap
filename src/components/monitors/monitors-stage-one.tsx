'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { SortingState } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  Gauge,
  HelpCircle,
  Minus,
  Zap,
  Search,
  Database,
} from 'lucide-react'
import { GlobalHeader } from '@/components/dashboard/global-header'
import { type MonitorQuickFilterId, monitorCacheHitIsComparable } from '@/types/monitor'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { GlobalMetricCard } from './global-metric-card'
import { MonitorsTable } from './monitors-table'
import { useMonitors } from '@/hooks/use-monitors'
import { ViewSection, ViewSectionHeader, LiveDot } from '@/components/dashboard/dashboard-ui'
import {
  GLOBAL_CACHE,
  getTtfbColorClass,
  getCacheColor,
} from '@/lib/thresholds'
import { calculateTrend } from '@/lib/metrics-math'
import {
  isCacheHit,
  getCacheDisplayLabel,
  isCacheBypass,
} from '@/lib/cache-utils'
import {
  GLOBAL_CACHE_TREND_TOOLTIP,
  GLOBAL_CACHE_VALUE_TOOLTIP,
  GLOBAL_TTFB_TREND_TOOLTIP,
  GLOBAL_TTFB_VALUE_TOOLTIP,
  globalCacheFooterContextCompact,
  globalCacheFooterPill,
  globalTtfbFooterContextCompact,
  globalTtfbFooterPill,
} from '@/lib/global-metric-copy'
import { AdvisorCard } from '@/components/advisor/advisor-card'
import { derivePortfolioAdvisor } from '@/components/advisor/advisor-card.helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const LIVE_SYNC_INTERVAL_MS = 30_000
/** Fast-poll while a newly-created monitor is waiting for its first probe results. */
const WARMUP_POLL_INTERVAL_MS = 5_000

const QUICK_FILTERS: ReadonlyArray<{ id: MonitorQuickFilterId; label: string; tooltip: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = [
  { id: 'all', label: 'All', tooltip: 'Show all monitors without filtering.', tone: 'neutral' },
  { id: 'healthy', label: 'Healthy', tooltip: 'Show monitors performing within optimal thresholds.', tone: 'success' },
  { id: 'degraded', label: 'Degraded', tooltip: 'Show monitors with latency issues, partial outages, or low cache hit rates.', tone: 'warning' },
  { id: 'high-ttfb', label: 'High TTFB', tooltip: 'Show monitors with average latency above the FAST threshold.', tone: 'warning' },
  { id: 'down', label: 'DOWN', tooltip: 'Show monitors that are currently unreachable from all probe regions.', tone: 'danger' },
  { id: 'low-cache-hit', label: 'Low Cache', tooltip: 'Show monitors with cache performance below the GOOD threshold.', tone: 'warning' },
  { id: 'missing-cache-headers', label: 'Missing Headers', tooltip: 'Show monitors where no CDN cache status header was detected.', tone: 'warning' },

]

const VALID_FILTER_IDS = new Set<string>(QUICK_FILTERS.map((f) => f.id))

function coerceFilter(value: string | null): MonitorQuickFilterId {
  return VALID_FILTER_IDS.has(value ?? '') ? (value as MonitorQuickFilterId) : 'all'
}

// ─── MonitorsStageOne ─────────────────────────────────────────────────────────

type MonitorsStageOneProps = {
  userEmail: string
  logoutAction: () => Promise<void>
}

export function MonitorsStageOne({ userEmail, logoutAction }: MonitorsStageOneProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ── URL → initial state ────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') ?? '')
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [activeFilter, setActiveFilter] = useState<MonitorQuickFilterId>(() =>
    coerceFilter(searchParams.get('filter')),
  )
  const [sorting, setSorting] = useState<SortingState>(() => {
    const col = searchParams.get('sort')
    const dir = searchParams.get('dir')
    if (col && (dir === 'asc' || dir === 'desc')) return [{ id: col, desc: dir === 'desc' }]
    // Worst performers first: highest TTFB 1h Avg
    return [{ id: 'ttfbAvg1h', desc: true }]
  })

  // ── Live Sync ──────────────────────────────────────────────────────────────
  const [liveSync, setLiveSync] = useState(true)

  // ── Data ───────────────────────────────────────────────────────────────────
  // Pass refetchInterval into the hook so TanStack Query manages the timer —
  // this respects tab visibility and avoids manual setInterval cleanup.
  const { monitors, isLoading, isFetching, isError, dataUpdatedAt, refetch } = useMonitors({
    refetchInterval: liveSync
      ? (data) => {
          // Warmup mode: at least one monitor exists but none has probe data yet.
          // Poll fast (5s) so the dashboard feels as responsive as the monitor detail page.
          const hasActiveData = data?.some(
            (m) => m.status === 'active' && m.ttfbAvg1h > 0
          )
          const hasMonitors = (data?.length ?? 0) > 0
          return hasMonitors && !hasActiveData ? WARMUP_POLL_INTERVAL_MS : LIVE_SYNC_INTERVAL_MS
        }
      : false,
  })

  // ── Debounce search ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── URL → State sync (Handles external navigation or AdvisorCard links) ───
  useEffect(() => {
    const urlFilter = coerceFilter(searchParams.get('filter'))
    if (urlFilter !== activeFilter) {
      Promise.resolve().then(() => {
        setActiveFilter(urlFilter)
      })
    }

    const urlSearch = searchParams.get('q') ?? ''
    if (urlSearch !== searchQuery) {
      Promise.resolve().then(() => {
        setSearchQuery(urlSearch)
        setSearchInput(urlSearch)
      })
    }
  }, [searchParams, activeFilter, searchQuery])

  // ── State → URL sync ───────────────────────────────────────────────────────
  // Using replace to avoid polluting history with every filter change
  useEffect(() => {
    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (activeFilter !== 'all') params.set('filter', activeFilter)
    if (sorting.length > 0) {
      params.set('sort', sorting[0].id)
      params.set('dir', sorting[0].desc ? 'desc' : 'asc')
    }

    const currentQs = searchParams.toString()
    const nextQs = params.toString()

    if (currentQs !== nextQs) {
      router.replace(`${pathname}${nextQs ? `?${nextQs}` : ''}`, { scroll: false })
    }
  }, [searchQuery, activeFilter, sorting, router, pathname, searchParams])

  // ── Optimistic state ───────────────────────────────────────────────────────
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, 'active' | 'paused'>>({})

  const displayMonitors = useMemo(() => {
    const monitorIds = new Set(monitors.map((m) => m.id))
    return monitors.map((m) =>
      monitorIds.has(m.id) && optimisticStatus[m.id] ? { ...m, status: optimisticStatus[m.id] } : m,
    )
  }, [monitors, optimisticStatus])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleClearFilters = useCallback(() => {
    setSearchInput('')
    setSearchQuery('')
    setActiveFilter('all')
    setSorting([{ id: 'ttfbAvg1h', desc: true }])
  }, [])

  // ── Metrics calculation ──────────────────────────────────────────────────

  // ── Global metrics ────────────────────────────────────────────────────────
  const { activeCount, avgTtfb1h, avgHit1h, avgTtfb24h, avgHit24h, ttfbDelta, hitDelta } = useMemo(() => {
    if (!displayMonitors.length) {
      return {
        activeCount: 0,
        avgTtfb1h: 0,
        avgHit1h: 0,
        avgTtfb24h: 0,
        avgHit24h: 0,
        ttfbDelta: 0,
        hitDelta: 0,
      }
    }

    const active = displayMonitors.filter((m) => m.status === 'active')

    // 1H Average (Rolling average for more stable portfolio summary)
    const avgTtfb1h = active.length > 0
      ? Math.round(active.reduce((s, m) => s + m.ttfbAvg1h, 0) / active.length)
      : 0

    const withCache1h = active.filter((m) => {
      if (m.cacheHitAvg1h === null) return false
      const label = getCacheDisplayLabel(m.cacheStatusCurrent)
      if (label === 'NO HEADER') return false
      if (isCacheBypass(m.cacheStatusCurrent)) return false
      return true
    })
    const avgHit1h = withCache1h.length > 0
      ? Number((withCache1h.reduce((sum, m) => sum + m.cacheHitAvg1h!, 0) / withCache1h.length).toFixed(1))
      : null

    // 24H Average (Historical average from all active monitors)
    const avgTtfb24h = active.length > 0
      ? Math.round(active.reduce((sum, m) => sum + m.ttfbAvg24h, 0) / active.length)
      : 0

    const withCache24h = active.filter((m) => {
      if (m.cacheHitAvg24h === null) return false
      const label = getCacheDisplayLabel(m.cacheStatusCurrent)
      if (label === 'NO HEADER') return false
      if (isCacheBypass(m.cacheStatusCurrent)) return false
      return true
    })
    const avgHit24h = withCache24h.length > 0
      ? Number((withCache24h.reduce((sum, m) => sum + m.cacheHitAvg24h!, 0) / withCache24h.length).toFixed(1))
      : null

    // Network-wide Trends (1h Rolling vs 24h Baseline)
    const ttfbDelta = calculateTrend(avgTtfb1h, avgTtfb24h)
    const hitDelta = (avgHit1h === null || avgHit24h === null) ? 0 : calculateTrend(avgHit1h, avgHit24h)

    return {
      activeCount: active.length,
      avgTtfb1h,
      avgHit1h,
      avgTtfb24h,
      avgHit24h,
      ttfbDelta,
      hitDelta,
    }
  }, [displayMonitors])

  const ttfbPill = globalTtfbFooterPill(avgTtfb1h)
  const cachePill = globalCacheFooterPill(avgHit1h ?? 0)
  const ttfbTrendTone = ttfbDelta < 0 ? 'success' : ttfbDelta > 0 ? 'danger' : 'neutral'
  const ttfbTrendIcon = ttfbDelta < 0 ? ArrowDown : ttfbDelta > 0 ? ArrowUp : Minus
  const hitTrendTone = hitDelta > 0 ? 'success' : hitDelta < 0 ? 'danger' : 'neutral'
  const hitTrendIcon = hitDelta > 0 ? ArrowUp : hitDelta < 0 ? ArrowDown : Minus

  const advisorState = useMemo(
    () => derivePortfolioAdvisor(displayMonitors),
    [displayMonitors],
  )

  // True when there are no active monitors with real probe data yet.
  // Covers both: (1) no monitors at all, (2) monitors exist but are still warming up.
  const hasNoData = !isLoading && !monitors.some(
    (m) => m.status === 'active' && m.ttfbAvg1h > 0
  )
  const hasNoCacheData = !isLoading && !monitors.some(
    (m) => m.status === 'active' && monitorCacheHitIsComparable(m) && m.cacheHitAvg1h !== null
  )
  const hasNoMonitors = !isLoading && monitors.length === 0

  const handleOptimisticToggle = useCallback((id: string, status: 'active' | 'paused') => {
    setOptimisticStatus((prev) => ({ ...prev, [id]: status }))
  }, [])

  return (
    <div className="min-h-full bg-background">
      <GlobalHeader userEmail={userEmail} logoutAction={logoutAction} />

      <main className="cs-container-adaptive space-y-3.5 pb-8 pt-3">
        {/* ── Global summary: design-system cards; compact metrics; list stays primary ── */}
        <ViewSection aria-label="Global summary">
          <ViewSectionHeader title="Global Summary" showDot={false} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch [&>article]:min-w-0">
              <GlobalMetricCard
                variant="compact"
                metricGroup="monitor"
                title="Avg. TTFB"
                value={isLoading ? '...' : hasNoData ? '—' : `${avgTtfb1h}ms`}
                valueTooltip={hasNoData ? undefined : GLOBAL_TTFB_VALUE_TOOLTIP}
                subtitle="1h avg"
                icon={Gauge}
              iconClassName="stroke-[2.5]"
              valueClassName={hasNoData ? 'text-zinc-600' : getTtfbColorClass(avgTtfb1h, 'global')}
              isElite={false}
              trend={hasNoData ? undefined : {
                value: `${Math.abs(ttfbDelta)}%`,
                tone: ttfbTrendTone,
                icon: ttfbTrendIcon,
                tooltip: GLOBAL_TTFB_TREND_TOOLTIP,
              }}
              statusFooter={
                isLoading || hasNoData
                  ? undefined
                  : {
                    label: ttfbPill.label,
                    tone: ttfbPill.tone,
                    context: globalTtfbFooterContextCompact(avgTtfb1h, ttfbDelta),
                  }
              }
              animationDelayMs={0}
            />
            <GlobalMetricCard
              variant="compact"
              metricGroup="monitor"
              title="Avg. Cache Hit"
              value={isLoading ? '...' : hasNoCacheData ? '—' : `${avgHit1h}%`}
              valueTooltip={hasNoCacheData ? undefined : GLOBAL_CACHE_VALUE_TOOLTIP}
              subtitle="1h avg"
              icon={Database}
              iconClassName={hasNoCacheData ? 'text-zinc-600' : `fill-current ${getCacheColor(avgHit1h ?? 0, 'global')} ${(avgHit1h ?? 0) >= 98 ? 'animate-[pulse_2s_infinite]' : ''}`}
              valueClassName={hasNoCacheData ? 'text-zinc-600' : getCacheColor(avgHit1h ?? 0, 'global')}
              isElite={!isLoading && !hasNoCacheData && (avgHit1h ?? 0) >= GLOBAL_CACHE.PERFECT}
              trend={hasNoCacheData || hitDelta === 0 ? undefined : {
                value: `${Math.abs(hitDelta)}%`,
                tone: hitTrendTone,
                icon: hitTrendIcon,
                tooltip: GLOBAL_CACHE_TREND_TOOLTIP,
              }}
              statusFooter={
                isLoading || hasNoCacheData
                  ? undefined
                  : {
                    label: cachePill.label,
                    tone: cachePill.tone,
                    context: globalCacheFooterContextCompact(avgHit1h ?? 0),
                  }
              }
              animationDelayMs={0}
            />
          </div>

          {/* Empty state nudge when no data is available */}
          {hasNoData && (
            <div className="flex items-center justify-center gap-2.5 rounded-lg border border-dashed border-white/8 bg-white/[0.015] px-4 py-3 animate-[cs-fade-in_0.4s_ease-out]">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {hasNoMonitors ? 'No monitors yet' : 'Awaiting data'}
              </span>
              <span className="text-zinc-700">·</span>
              <span className="text-[11px] text-zinc-500">
                {hasNoMonitors
                  ? 'Add your first monitor to start seeing real metrics here.'
                  : 'Metrics will appear once your monitors receive their first probe results.'}
              </span>
            </div>
          )}
        </ViewSection>

        {/* ── Advisor ─────────────────────────────────────────────────────── */}
        {!isLoading && advisorState && (
          <AdvisorCard state={advisorState} />
        )}

        {/* ── Search & Filter bar ──────────────────────────────────────────── */}
        <ViewSection>
          <ViewSectionHeader title="Filter Monitors" showDot={false} />
        </ViewSection>

        <article className="cs-card group/search-box cs-card-glass space-y-3.5 !p-6 animate-[cs-fade-in_0.5s_ease-out]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:flex-nowrap">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within/search-box:text-metric-ttfb-fast" />
              <input
                id="monitor-search-input"
                type="text"
                aria-label="Filter Monitors"
                className="cs-input-premium h-11 w-full !pl-11 !pr-12 text-[13px] placeholder:text-zinc-600 focus:scale-[1.002]"
                placeholder="Ex: microsoft, cache miss, TTFB > 300ms…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <div className="absolute right-4 top-1/2 z-20 -translate-y-1/2">
                <PremiumTooltip
                  position="top-right"
                  content={
                    <div className="w-56 space-y-3 p-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        Smart Search Tips
                      </p>
                      <div className="space-y-2.5">
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-metric-ttfb-fast uppercase">Latency</p>
                          <div className="flex gap-1.5">
                            <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">ttfb &gt; 300</code>
                            <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">&lt; 150</code>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-amber-400 uppercase">Cache</p>
                          <div className="flex gap-1.5">
                            <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">hit &gt; 90</code>
                            <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">miss</code>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-zinc-400 uppercase">Status</p>
                          <div className="flex gap-1.5">
                            <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">active</code>
                            <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">paused</code>
                          </div>
                        </div>
                      </div>
                      <p className="border-t border-white/5 pt-2 text-[9px] leading-relaxed text-zinc-500">
                        Combine terms with commas for advanced filtering.
                      </p>
                    </div>
                  }
                >
                  <HelpCircle className="h-4 w-4 cursor-help text-zinc-500 transition-colors hover:text-zinc-300" />
                </PremiumTooltip>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-1.5"
              role="toolbar"
              aria-label="Monitor filters"
            >
              {QUICK_FILTERS.map((filter) => {
                const isActive = activeFilter === filter.id
                const toneClass =
                  filter.tone === 'success' ? 'cs-badge-success' :
                    filter.tone === 'danger' ? 'cs-badge-danger' :
                      filter.tone === 'warning' ? 'cs-badge-warning' :
                        'cs-badge-success' // Default for 'all' / neutral

                return (
                  <PremiumTooltip key={filter.id} content={filter.tooltip} position="top-center">
                    <button
                      type="button"
                      onClick={() => setActiveFilter(filter.id)}
                      aria-pressed={isActive}
                      className={`inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${isActive
                        ? `cs-badge ${toneClass} !min-h-0 !px-2.5 !py-0 shadow-lg shadow-black/20`
                        : 'border border-white/5 bg-white/[0.01] text-zinc-500 hover:border-white/10 hover:text-zinc-300'
                        }`}
                    >
                      {filter.label}
                    </button>
                  </PremiumTooltip>
                )
              })}
            </div>
          </div>
        </article>

        {/* ── Monitors List header ─────────────────────────────────────────── */}
        <ViewSection>
          <ViewSectionHeader title="Monitors List" showDot={false}>
            <div className="flex items-center gap-3">
              {/* Active monitors count */}
              {!isLoading && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 transition-opacity duration-300">
                  <span className="text-zinc-400">{activeCount}</span> Active Monitors
                </span>
              )}

              {/* Live Sync toggle */}
              <button
                type="button"
                onClick={() => setLiveSync((v) => !v)}
                aria-pressed={liveSync}
                title={
                  liveSync
                    ? 'Live Sync on — refreshes every 5s during warmup, every 30s otherwise. Click to disable.'
                    : 'Live Sync off. Click to enable auto-refresh.'
                }
                className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${liveSync
                  ? 'cs-badge cs-badge-success !min-h-0 !px-3 !py-0'
                  : 'border border-white/5 bg-white/[0.01] text-zinc-500 hover:border-white/10 hover:text-zinc-300'
                  }`}
              >
                {liveSync && <LiveDot />}
                Live Sync
              </button>
            </div>
          </ViewSectionHeader>
        </ViewSection>

        {/* ── Monitors Table ───────────────────────────────────────────────── */}
        <section className="cs-card cs-card-glass animate-[cs-fade-in_0.6s_ease-out] !p-0">
          <MonitorsTable
            monitors={monitors}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            onRetry={refetch}
            onClearFilters={handleClearFilters}
            searchQuery={searchQuery}
            activeFilter={activeFilter}
            sorting={sorting}
            onSortingChange={setSorting}
            optimisticStatus={optimisticStatus}
            onOptimisticToggle={handleOptimisticToggle}
          />
        </section>
      </main>
    </div>

  )
}
