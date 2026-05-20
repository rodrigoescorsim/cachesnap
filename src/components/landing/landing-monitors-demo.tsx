'use client'

import { useMemo, useState, useCallback } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { HelpCircle, Search } from 'lucide-react'
import { ViewSection, ViewSectionHeader, LiveDot } from '@/components/dashboard/dashboard-ui'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { MonitorsTable } from '@/components/monitors/monitors-table'
import { type Monitor, type MonitorQuickFilterId, type MonitorRegion } from '@/types/monitor'

const QUICK_FILTERS: ReadonlyArray<{
  id: MonitorQuickFilterId
  label: string
  tooltip: string
  tone: 'success' | 'danger' | 'warning' | 'neutral'
}> = [
  { id: 'all', label: 'All', tooltip: 'Show all monitors without filtering.', tone: 'neutral' },
  { id: 'healthy', label: 'Healthy', tooltip: 'Show monitors performing within optimal thresholds.', tone: 'success' },
  { id: 'degraded', label: 'Degraded', tooltip: 'Show monitors with latency issues, partial outages, or low cache hit rates.', tone: 'warning' },
  { id: 'high-ttfb', label: 'High TTFB', tooltip: 'Show monitors with average latency above the FAST threshold.', tone: 'warning' },
  { id: 'down', label: 'DOWN', tooltip: 'Show monitors that are currently unreachable from all probe regions.', tone: 'danger' },
  { id: 'low-cache-hit', label: 'Low Cache', tooltip: 'Show monitors with cache performance below the GOOD threshold.', tone: 'warning' },
  { id: 'missing-cache-headers', label: 'Missing Headers', tooltip: 'Show monitors where no CDN cache status header was detected.', tone: 'warning' },
]

const SPARKLINE = [198, 205, 212, 208, 220, 218, 225, 222, 230, 228, 224, 220]

function mkRegion(code: string, flag: string, label: string, slow = false, error = false): MonitorRegion {
  return { code, flag, label, isSlow: slow, isError: error }
}

const REGIONS_8: MonitorRegion[] = [
  mkRegion('gru', '🇧🇷', 'São Paulo'),
  mkRegion('bom', '🇮🇳', 'Mumbai'),
  mkRegion('fra', '🇩🇪', 'Frankfurt'),
  mkRegion('iad', '🇺🇸', 'Virginia'),
  mkRegion('syd', '🇦🇺', 'Sydney', true),
  mkRegion('nrt', '🇯🇵', 'Tokyo'),
  mkRegion('pdx', '🇺🇸', 'Oregon'),
  mkRegion('cpt', '🇿🇦', 'Cape Town', true),
]

function demoMonitor(
  partial: Pick<Monitor, 'id' | 'name' | 'url'> & Partial<Monitor>,
): Monitor {
  const now = new Date()
  return {
    status: 'active',
    ttfbCurrent: 220,
    ttfbCurrentDelta: -4,
    ttfbAvg1h: 228,
    ttfbAvg24h: 244,
    ttfbSparkline: SPARKLINE,
    cacheHitCurrent: 85,
    cacheHitAvg1h: 83,
    cacheHitAvg24h: 79,
    cacheHitDelta: -3,
    cacheStatusCurrent: 'HIT',
    regions: REGIONS_8,
    slowRegionCount: 0,
    totalRegionCount: 8,
    errorRegionCount: 0,
    error5xxCount: 0,
    error4xxCount: 0,
    isWafBlocked: false,
    uptime24h: 100,
    lastCheckedAt: now,
    activeIncidentCount: 0,
    ...partial,
  }
}

const DEMO_MONITORS: Monitor[] = [
  demoMonitor({
    id: 'demo-stripe',
    name: 'stripe.com',
    url: 'https://stripe.com',
    ttfbCurrent: 142,
    ttfbAvg1h: 156,
    ttfbAvg24h: 168,
    cacheHitCurrent: 94,
    cacheHitAvg1h: 92,
    cacheHitAvg24h: 91,
    slowRegionCount: 0,
  }),
  demoMonitor({
    id: 'demo-github',
    name: 'github.com',
    url: 'https://github.com',
    ttfbCurrent: 198,
    ttfbAvg1h: 210,
    ttfbAvg24h: 218,
    cacheHitCurrent: 88,
    cacheHitAvg1h: 86,
    cacheHitAvg24h: 84,
  }),
  demoMonitor({
    id: 'demo-vercel',
    name: 'vercel.com',
    url: 'https://vercel.com',
    ttfbCurrent: 412,
    ttfbAvg1h: 385,
    ttfbAvg24h: 362,
    cacheHitCurrent: 72,
    cacheHitAvg1h: 74,
    cacheHitAvg24h: 76,
    slowRegionCount: 2,
    regions: REGIONS_8.map((r, i) => ({ ...r, isSlow: i === 4 || i === 7 })),
  }),
  demoMonitor({
    id: 'demo-cloudflare',
    name: 'cloudflare.com',
    url: 'https://www.cloudflare.com',
    ttfbCurrent: 95,
    ttfbAvg1h: 102,
    ttfbAvg24h: 108,
    cacheHitCurrent: 99,
    cacheHitAvg1h: 98,
    cacheHitAvg24h: 97,
  }),
  demoMonitor({
    id: 'demo-notion',
    name: 'notion.so',
    url: 'https://www.notion.so',
    ttfbCurrent: 268,
    ttfbAvg1h: 255,
    ttfbAvg24h: 248,
    cacheHitCurrent: 61,
    cacheHitAvg1h: 58,
    cacheHitAvg24h: 55,
    cacheStatusCurrent: 'MISS',
    slowRegionCount: 1,
    regions: REGIONS_8.map((r, i) => ({ ...r, isSlow: i === 2 })),
  }),
  demoMonitor({
    id: 'demo-shopify',
    name: 'shopify.com',
    url: 'https://www.shopify.com',
    status: 'paused',
    ttfbCurrent: 310,
    ttfbAvg1h: 298,
    ttfbAvg24h: 285,
    cacheHitCurrent: 45,
    cacheHitAvg1h: 48,
    cacheHitAvg24h: 52,
    slowRegionCount: 3,
  }),
]

export function LandingMonitorsDemo() {
  const [searchInput, setSearchInput] = useState('')
  const [activeFilter, setActiveFilter] = useState<MonitorQuickFilterId>('all')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'ttfbAvg1h', desc: true }])
  const [liveSync, setLiveSync] = useState(true)
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, 'active' | 'paused'>>({})

  const displayMonitors = useMemo(
    () =>
      DEMO_MONITORS.map((m) =>
        optimisticStatus[m.id] ? { ...m, status: optimisticStatus[m.id] } : m,
      ),
    [optimisticStatus],
  )

  const activeCount = displayMonitors.filter((m) => m.status === 'active').length

  const handleClearFilters = useCallback(() => {
    setSearchInput('')
    setActiveFilter('all')
  }, [])

  const handleOptimisticToggle = useCallback((id: string, status: 'active' | 'paused') => {
    setOptimisticStatus((prev) => ({ ...prev, [id]: status }))
  }, [])

  return (
    <div className="landing-showcase-live w-full max-w-[1224px] space-y-6">
      <ViewSection>
        <ViewSectionHeader title="Filter Monitors" showDot={false} />
      </ViewSection>

      <article className="cs-card group/search-box cs-card-glass space-y-3.5 !p-6 animate-[cs-fade-in_0.5s_ease-out]">
        <div className="flex flex-col gap-4 md:flex-row md:flex-nowrap md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within/search-box:text-metric-ttfb-fast" />
            <input
              id="landing-monitor-search-input"
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
                        <p className="text-[9px] font-bold uppercase text-metric-ttfb-fast">Latency</p>
                        <div className="flex gap-1.5">
                          <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">ttfb &gt; 300</code>
                          <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">&lt; 150</code>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold uppercase text-amber-400">Cache</p>
                        <div className="flex gap-1.5">
                          <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">hit &gt; 90</code>
                          <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-300">miss</code>
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

          <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Monitor filters">
            {QUICK_FILTERS.map((filter) => {
              const isActive = activeFilter === filter.id
              const toneClass =
                filter.tone === 'success'
                  ? 'cs-badge-success'
                  : filter.tone === 'danger'
                    ? 'cs-badge-danger'
                    : filter.tone === 'warning'
                      ? 'cs-badge-warning'
                      : 'cs-badge-success'

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

      <ViewSection>
        <ViewSectionHeader title="Monitors List" showDot={false}>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <span className="text-zinc-400">{activeCount}</span> Active Monitors
            </span>
            <button
              type="button"
              onClick={() => setLiveSync((v) => !v)}
              aria-pressed={liveSync}
              title={
                liveSync
                  ? 'Live Sync on — demo toggle'
                  : 'Live Sync off — demo toggle'
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

      <section className="cs-card cs-card-glass animate-[cs-fade-in_0.6s_ease-out] !p-0">
        <MonitorsTable
          monitors={displayMonitors}
          searchQuery={searchInput}
          activeFilter={activeFilter}
          sorting={sorting}
          onSortingChange={setSorting}
          onClearFilters={handleClearFilters}
          optimisticStatus={optimisticStatus}
          onOptimisticToggle={handleOptimisticToggle}
          previewMode
        />
      </section>
    </div>
  )
}
