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
  const { activeCount, avgTtfb, avgHit, healthScore, ttfbDelta } = useMemo(() => {
    if (!displayMonitors.length) return { activeCount: 0, avgTtfb: 0, avgHit: 0, healthScore: 0, ttfbDelta: 0 }
    
    const active = displayMonitors.filter((m) => m.status === 'active')
    const avgTtfb = Math.round(displayMonitors.reduce((sum, m) => sum + m.ttfbCurrent, 0) / displayMonitors.length)

    // Exclude monitors with no cache data (null) from the average
    const withCacheData = displayMonitors.filter((m) => m.cacheHitCurrent !== null)
    const avgHit = withCacheData.length > 0
      ? Number((withCacheData.reduce((sum, m) => sum + m.cacheHitCurrent!, 0) / withCacheData.length).toFixed(1))
      : 0

    // Global health Score: percentage of monitors which are NOT slow/critical
    const slowCount = displayMonitors.filter(m => m.ttfbCurrent >= 500).length
    const score = displayMonitors.length > 0 ? Math.round(((displayMonitors.length - slowCount) / displayMonitors.length) * 100) : 0

    // Global TTFB trend: average of each monitor's individual current-vs-24h delta
    const ttfbDelta = displayMonitors.length > 0
      ? Math.round(
          displayMonitors.reduce((sum, m) => sum + m.ttfbCurrentDelta, 0) / displayMonitors.length * 10,
        ) / 10
      : 0

    return { activeCount: active.length, avgTtfb, avgHit, healthScore: score, ttfbDelta }
  }, [displayMonitors])

  const ttfbImproved = ttfbDelta < 0

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
            title="Avg TTFB (Current)"
            value={isLoading ? '...' : `${avgTtfb} ms`}
            subtitle="Average across all endpoints"
            icon={Gauge}
            valueClassName={getTtfbColorClass(avgTtfb, 'global')}
            trend={{
              value: `${Math.abs(ttfbDelta)}%`,
              tone: ttfbImproved ? 'success' : 'danger',
              icon: ttfbImproved ? ArrowDown : ArrowUp,
            }}
            animationDelayMs={30}
          />
          <GlobalMetricCard
            title="Avg Cache Hit (Current)"
            value={isLoading ? '...' : `${avgHit}%`}
            subtitle="Global distribution efficiency"
            icon={ArrowUp}
            valueClassName={getCacheColor(avgHit, 'global')}
            trend={{ value: '3.1%', tone: 'success', icon: ArrowUp }}
            metaBadge={{ text: 'HIT', className: 'cs-badge-cache-hit' }}
            animationDelayMs={90}
          />
          <GlobalMetricCard
            title="Health Score"
            value={isLoading ? '...' : `${healthScore}/100`}
            subtitle="Global edge resilience"
            icon={HeartPulse}
            valueClassName={`text-[24px] sm:text-[28px] font-black ${getHealthColor(healthScore)}`}
            badge={{ 
              text: healthScore >= GLOBAL_HEALTH.HEALTHY ? 'STABLE' : healthScore >= GLOBAL_HEALTH.DEGRADED ? 'DEGRADED' : 'CRITICAL', 
              className: `${healthScore >= GLOBAL_HEALTH.HEALTHY ? 'cs-badge-success' : healthScore >= GLOBAL_HEALTH.DEGRADED ? 'cs-badge-warning' : 'cs-badge-error'} !py-0.5 !px-1.5 !text-[9px]`,
              withPulseDot: !isLoading,
              dotClassName: healthScore >= GLOBAL_HEALTH.HEALTHY ? 'bg-[var(--brand-primary)]' : healthScore >= GLOBAL_HEALTH.DEGRADED ? 'bg-amber-400' : 'bg-rose-500'
            }}
            progress={isLoading ? 0 : healthScore}
            animationDelayMs={150}
          />
        </section>

        {/* ── Search & Filter bar ──────────────────────────────────────────── */}
        <article className="cs-card group/search-box cs-card-glass space-y-3.5 !p-6 animate-[cs-fade-in_0.5s_ease-out]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 max-w-2xl">
              <label
                htmlFor="monitor-search-input"
                className="absolute -top-4.5 left-0 text-[10px] font-bold uppercase tracking-widest text-zinc-600"
              >
                Filter Monitors
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within/search-box:text-metric-ttfb-fast" />
              <input
                id="monitor-search-input"
                type="text"
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
