'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { SortingState } from '@tanstack/react-table'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Gauge,
  HeartPulse,
  Search,
} from 'lucide-react'
import { Logo } from '@/components/logo'
import { UserDropdown } from '@/components/dashboard/UserDropdown'
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

const NAV_ITEMS = [
  { label: 'Monitors',    href: '/monitors', isActive: true,  isDisabled: false },
  { label: 'Insights',    href: '/insights', isActive: false, isDisabled: false },
  { label: 'Diagnostics', href: '',          isActive: false, isDisabled: true  },
  { label: 'Alerts',      href: '',          isActive: false, isDisabled: true  },
  { label: 'Settings',    href: '',          isActive: false, isDisabled: true  },
]

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

  // ── "Last updated" counter ─────────────────────────────────────────────────
  const [secsAgo, setSecsAgo] = useState<number | null>(null)
  // Track previous dataUpdatedAt to restart the 1s ticker only when it changes
  const prevUpdatedAt = useRef(0)

  useEffect(() => {
    if (!dataUpdatedAt || dataUpdatedAt === prevUpdatedAt.current) return
    prevUpdatedAt.current = dataUpdatedAt
    const tick = () => setSecsAgo(Math.round((Date.now() - dataUpdatedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [dataUpdatedAt])

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

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleClearFilters = useCallback(() => {
    setSearchInput('')
    setSearchQuery('')
    setActiveFilter('all')
    setSorting([{ id: 'ttfbCurrent', desc: true }])
  }, [])

  // ── Metrics calculation ──────────────────────────────────────────────────
  const { activeCount, avgTtfb, avgHit, healthScore, ttfbDelta } = useMemo(() => {
    if (!monitors.length) return { activeCount: 0, avgTtfb: 0, avgHit: 0, healthScore: 0, ttfbDelta: 0 }
    
    const active = monitors.filter((m) => m.status === 'active')
    const avgTtfb = Math.round(monitors.reduce((sum, m) => sum + m.ttfbCurrent, 0) / monitors.length)

    // Exclude monitors with no cache data (null) from the average
    const withCacheData = monitors.filter((m) => m.cacheHitCurrent !== null)
    const avgHit = withCacheData.length > 0
      ? Number((withCacheData.reduce((sum, m) => sum + m.cacheHitCurrent!, 0) / withCacheData.length).toFixed(1))
      : 0

    // Global health Score: percentage of monitors which are NOT slow/critical
    const slowCount = monitors.filter(m => m.ttfbCurrent >= 500).length
    const score = monitors.length > 0 ? Math.round(((monitors.length - slowCount) / monitors.length) * 100) : 0

    // Global TTFB trend: average of each monitor's individual current-vs-24h delta
    const ttfbDelta = monitors.length > 0
      ? Math.round(
          monitors.reduce((sum, m) => sum + m.ttfbCurrentDelta, 0) / monitors.length * 10,
        ) / 10
      : 0

    return { activeCount: active.length, avgTtfb, avgHit, healthScore: score, ttfbDelta }
  }, [monitors])

  const ttfbImproved = ttfbDelta < 0

  return (
    <div className="min-h-full bg-background">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-[56px] w-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-8 lg:px-12">
          <Link
            href="/monitors"
            className="inline-flex items-center transition-transform duration-200 hover:scale-[1.01]"
            aria-label="CacheSnap home"
          >
            <Logo variant="header" className="h-8 w-auto sm:h-[2.2rem]" />
          </Link>

          <nav className="hidden items-center gap-5 lg:flex" aria-label="Main Navigation">
            {NAV_ITEMS.map((item) =>
              item.isDisabled ? (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="relative cursor-not-allowed px-1 py-1 text-[13px] font-semibold tracking-tight text-zinc-600"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.isActive ? 'page' : undefined}
                  className={`relative px-1 py-1 text-[13px] font-semibold tracking-tight transition-colors duration-200 ${
                    item.isActive ? 'text-emerald-300' : 'text-zinc-500 hover:text-zinc-200'
                  } after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:rounded-full after:transition-opacity after:duration-200 ${
                    item.isActive
                      ? 'after:bg-emerald-400/70 after:opacity-100'
                      : 'after:bg-white/30 after:opacity-0 hover:after:opacity-100'
                  }`}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="flex items-center gap-3">
            <UserDropdown email={userEmail} logoutAction={logoutAction} variant="monitorsBadge" avatarText="RS" />
            <Link
              href="/monitors/new"
              className="cs-btn-primary h-9 gap-2 px-4 text-[13px] font-bold"
              aria-label="Create a new monitor"
            >
              <span>+ Create Monitor</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-3.5 px-4 pb-8 pt-3 sm:px-8 lg:px-12">
        {/* ── Global Summary ───────────────────────────────────────────────── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="cs-view-section-title">Global Summary</h2>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <GlobalMetricCard
            title="Active Monitors"
            value={isLoading ? '...' : String(activeCount)}
            subtitle="All monitors reporting"
            icon={Activity}
            badge={{ text: 'LIVE', className: 'cs-badge-success', withPulseDot: true }}
            animationDelayMs={30}
          />
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
            animationDelayMs={90}
          />
          <GlobalMetricCard
            title="Avg Cache Hit (Current)"
            value={isLoading ? '...' : `${avgHit}%`}
            subtitle="Global distribution efficiency"
            icon={ArrowUp}
            valueClassName={getCacheColor(avgHit, 'global')}
            trend={{ value: '3.1%', tone: 'success', icon: ArrowUp }}
            metaBadge={{ text: 'HIT', className: 'cs-badge-cache-hit' }}
            animationDelayMs={150}
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
              dotClassName: healthScore >= GLOBAL_HEALTH.HEALTHY ? 'bg-emerald-400' : healthScore >= GLOBAL_HEALTH.DEGRADED ? 'bg-amber-400' : 'bg-rose-500'
            }}
            progress={isLoading ? 0 : healthScore}
            animationDelayMs={210}
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
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within/search-box:text-emerald-400" />
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
              {/* Last updated indicator */}
              {secsAgo !== null && !isLoading && (
                <span className="text-[10.5px] font-semibold tabular-nums text-zinc-500 transition-opacity duration-300">
                  Updated{' '}
                  <span className="text-zinc-400">
                    {secsAgo < 5 ? 'just now' : `${secsAgo}s ago`}
                  </span>
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
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
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
          />
        </section>
      </main>
    </div>
  )
}
