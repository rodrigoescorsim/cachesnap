'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { SortingState } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  Gauge,
  HeartPulse,
  Minus,
  Search,
} from 'lucide-react'
import { GlobalHeader } from '@/components/dashboard/global-header'
import { monitorHealthScore, type MonitorQuickFilterId } from '@/types/monitor'
import { GlobalMetricCard } from './global-metric-card'
import { MonitorsTable } from './monitors-table'
import { useMonitors } from '@/hooks/use-monitors'
import {
  GLOBAL_HEALTH,
  getTtfbColorClass,
  getHealthColor,
  getCacheColor,
} from '@/lib/thresholds'
import { calculateTrend } from '@/lib/metrics-math'
import {
  GLOBAL_CACHE_TREND_TOOLTIP,
  GLOBAL_CACHE_VALUE_TOOLTIP,
  GLOBAL_TTFB_TREND_TOOLTIP,
  GLOBAL_TTFB_VALUE_TOOLTIP,
  globalCacheFooterContext,
  globalCacheFooterPill,
  globalTtfbFooterContext,
  globalTtfbFooterPill,
} from '@/lib/global-metric-copy'

// ─── Constants ────────────────────────────────────────────────────────────────

const LIVE_SYNC_INTERVAL_MS = 30_000

const QUICK_FILTERS: ReadonlyArray<{ id: MonitorQuickFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'healthy', label: 'Healthy' },
  { id: 'degraded', label: 'Degraded' },
  { id: 'high-ttfb', label: 'High TTFB' },
  { id: 'low-cache-hit', label: 'Low Cache Hit' },
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
    // Worst performers first: highest TTFB Now
    return [{ id: 'ttfbCurrent', desc: true }]
  })

  // ── Live Sync ──────────────────────────────────────────────────────────────
  const [liveSync, setLiveSync] = useState(true)

  // ── Data ───────────────────────────────────────────────────────────────────
  // Pass refetchInterval into the hook so TanStack Query manages the timer —
  // this respects tab visibility and avoids manual setInterval cleanup.
  const { monitors, isLoading, isFetching, isError, dataUpdatedAt, refetch } = useMonitors({
    refetchInterval: liveSync ? LIVE_SYNC_INTERVAL_MS : false,
  })

  // ── Debounce search ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

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

  // Clear optimistic status when underlying data updates (prop monitors change or refetch occurs)
  useEffect(() => {
    setOptimisticStatus({})
  }, [monitors])

  const displayMonitors = useMemo(() => {
    return monitors.map((m) =>
      optimisticStatus[m.id] ? { ...m, status: optimisticStatus[m.id] } : m,
    )
  }, [monitors, optimisticStatus])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleClearFilters = useCallback(() => {
    setSearchInput('')
    setSearchQuery('')
    setActiveFilter('all')
    setSorting([{ id: 'ttfbCurrent', desc: true }])
  }, [])

  // ── Metrics calculation ──────────────────────────────────────────────────

  // ── Global metrics ────────────────────────────────────────────────────────
  const { activeCount, liveTtfb, liveHit, avgTtfb24h, avgHit24h, healthScore, ttfbDelta, hitDelta } = useMemo(() => {
    if (!displayMonitors.length) return { activeCount: 0, liveTtfb: 0, liveHit: 0, avgTtfb24h: 0, avgHit24h: 0, healthScore: 0, ttfbDelta: 0, hitDelta: 0 }

    const active  = displayMonitors.filter((m) => m.status === 'active')
    
    // Live Average (Current sample from all active monitors)
    const liveTtfb = active.length > 0
      ? Math.round(active.reduce((sum, m) => sum + m.ttfbCurrent, 0) / active.length)
      : 0

    const withCacheData = active.filter((m) => m.cacheHitCurrent !== null)
    const liveHit = withCacheData.length > 0
      ? Number((withCacheData.reduce((sum, m) => sum + m.cacheHitCurrent!, 0) / withCacheData.length).toFixed(1))
      : 0

    // 24H Average (Historical average from all active monitors)
    const avgTtfb24h = active.length > 0
      ? Math.round(active.reduce((sum, m) => sum + m.ttfbAvg24h, 0) / active.length)
      : 0
    
    const withCache24h = active.filter((m) => m.cacheHitAvg24h !== null)
    const avgHit24h = withCache24h.length > 0
      ? Number((withCache24h.reduce((sum, m) => sum + m.cacheHitAvg24h!, 0) / withCache24h.length).toFixed(1))
      : 0

    // Global health Score: weighted average of individual monitor health scores
    const score = displayMonitors.length > 0 
      ? Math.round(displayMonitors.reduce((sum, m) => sum + monitorHealthScore(m), 0) / displayMonitors.length) 
      : 0

    // Network-wide Trends (Real-time vs 24h Baseline)
    const ttfbDelta = calculateTrend(liveTtfb, avgTtfb24h)
    const hitDelta  = calculateTrend(liveHit, avgHit24h)

    return { 
      activeCount: active.length, 
      liveTtfb, 
      liveHit, 
      avgTtfb24h, 
      avgHit24h, 
      healthScore: score, 
      ttfbDelta,
      hitDelta
    }
  }, [displayMonitors])

  const ttfbPill = globalTtfbFooterPill(liveTtfb)
  const cachePill = globalCacheFooterPill(liveHit)
  const ttfbTrendTone = ttfbDelta < 0 ? 'success' : ttfbDelta > 0 ? 'danger' : 'neutral'
  const ttfbTrendIcon = ttfbDelta < 0 ? ArrowDown : ttfbDelta > 0 ? ArrowUp : Minus
  const hitTrendTone = hitDelta > 0 ? 'success' : hitDelta < 0 ? 'danger' : 'neutral'
  const hitTrendIcon = hitDelta > 0 ? ArrowUp : hitDelta < 0 ? ArrowDown : Minus

  return (
    <div className="min-h-full bg-background">
      <GlobalHeader userEmail={userEmail} logoutAction={logoutAction} />

      <main className="cs-container-adaptive space-y-3.5 pb-8 pt-3">
        {/* ── Global Summary ───────────────────────────────────────────────── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="cs-view-section-title">Global Summary</h2>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <GlobalMetricCard
            title="Global Resilience Score"
            value={isLoading ? '...' : `${healthScore}/100`}
            subtitle={isLoading ? 'Calculating health...' : `${healthScore >= GLOBAL_HEALTH.HEALTHY ? 'Excellent' : healthScore >= GLOBAL_HEALTH.DEGRADED ? 'Fair' : 'Poor'} system-wide resilience`}
            icon={HeartPulse}
            valueClassName={getHealthColor(healthScore)}
            badge={{ 
              text: healthScore >= GLOBAL_HEALTH.HEALTHY ? 'STABLE' : healthScore >= GLOBAL_HEALTH.DEGRADED ? 'DEGRADED' : 'CRITICAL', 
              className: `${healthScore >= GLOBAL_HEALTH.HEALTHY ? 'cs-badge-success' : healthScore >= GLOBAL_HEALTH.DEGRADED ? 'cs-badge-warning' : 'cs-badge-error'}`,
              withPulseDot: !isLoading,
              dotClassName: healthScore >= GLOBAL_HEALTH.HEALTHY ? 'bg-[var(--brand-primary)]' : healthScore >= GLOBAL_HEALTH.DEGRADED ? 'bg-amber-400' : 'bg-rose-500'
            }}
            progress={isLoading ? 0 : healthScore}
            animationDelayMs={30}
          />
          <GlobalMetricCard
            title="Global Avg. TTFB"
            value={isLoading ? '...' : `${liveTtfb}ms`}
            valueTooltip={GLOBAL_TTFB_VALUE_TOOLTIP}
            subtitle=""
            icon={Gauge}
            valueClassName={getTtfbColorClass(liveTtfb, 'global')}
            trend={{
              value: `${Math.abs(ttfbDelta)}%`,
              tone: ttfbTrendTone,
              icon: ttfbTrendIcon,
              tooltip: GLOBAL_TTFB_TREND_TOOLTIP,
            }}
            statusFooter={
              isLoading
                ? undefined
                : {
                    label: ttfbPill.label,
                    tone: ttfbPill.tone,
                    context: globalTtfbFooterContext(liveTtfb, ttfbDelta),
                  }
            }
            animationDelayMs={90}
          />
          <GlobalMetricCard
            title="Global Cache Hit"
            value={isLoading ? '...' : `${liveHit}%`}
            valueTooltip={GLOBAL_CACHE_VALUE_TOOLTIP}
            subtitle=""
            icon={ArrowUp}
            valueClassName={getCacheColor(liveHit, 'global')}
            trend={{
              value: `${Math.abs(hitDelta)}%`,
              tone: hitTrendTone,
              icon: hitTrendIcon,
              tooltip: GLOBAL_CACHE_TREND_TOOLTIP,
            }}
            statusFooter={
              isLoading
                ? undefined
                : {
                    label: cachePill.label,
                    tone: cachePill.tone,
                    context: globalCacheFooterContext(liveHit),
                  }
            }
            animationDelayMs={150}
          />
        </section>

        {/* ── Search & Filter bar ──────────────────────────────────────────── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="cs-view-section-title">Filter Monitors</h2>
          </div>
        </section>

        <article className="cs-card group/search-box cs-card-glass space-y-3.5 !p-6 animate-[cs-fade-in_0.5s_ease-out]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-2xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within/search-box:text-metric-ttfb-fast" />
              <input
                id="monitor-search-input"
                type="text"
                aria-label="Filter Monitors"
                className="cs-input-premium h-11 w-full !pl-11 pr-5 text-[13px] placeholder:text-zinc-600 focus:scale-[1.002]"
                placeholder="Ex: microsoft, cache miss, TTFB > 300ms…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            <div
              className="flex flex-wrap items-center gap-1.5"
              role="toolbar"
              aria-label="Monitor filters"
            >
              {QUICK_FILTERS.map((filter) => {
                const isActive = activeFilter === filter.id
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActiveFilter(filter.id)}
                    aria-pressed={isActive}
                    className={`inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-lg px-3.5 text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${
                      isActive
                        ? 'cs-badge cs-badge-success !min-h-0 !px-3.5 !py-0'
                        : 'border border-white/5 bg-white/[0.01] text-zinc-500 hover:border-white/10 hover:text-zinc-300'
                    }`}
                  >
                    {filter.label}
                  </button>
                )
              })}
            </div>
          </div>
        </article>

        {/* ── Monitors List header ─────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="cs-view-section-title">Monitors List</h2>

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
                    ? 'Live Sync on — refreshes every 30s. Click to disable.'
                    : 'Live Sync off. Click to enable auto-refresh every 30s.'
                }
                className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${
                  liveSync
                    ? 'cs-badge cs-badge-success !min-h-0 !px-3 !py-0'
                    : 'border border-white/5 bg-white/[0.01] text-zinc-500 hover:border-white/10 hover:text-zinc-300'
                }`}
              >
                {liveSync && (
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-primary)] opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
                  </span>
                )}
                Live Sync
              </button>
            </div>
          </div>
        </section>

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
            onOptimisticToggle={(id, status) => setOptimisticStatus((prev) => ({ ...prev, [id]: status }))}
          />
        </section>
      </main>
    </div>
  )
}
