'use client'

import Link from 'next/link'
import { useState } from 'react'
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
import { type MonitorQuickFilterId } from '@/types/monitor'
import { GlobalMetricCard } from './global-metric-card'
import { MonitorsTable } from './monitors-table'

const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', isActive: false, isDisabled: false },
  { label: 'Monitors', href: '/monitors', isActive: true, isDisabled: false },
  { label: 'Diagnostics', href: '', isActive: false, isDisabled: true },
  { label: 'Alerts', href: '', isActive: false, isDisabled: true },
  { label: 'Settings', href: '', isActive: false, isDisabled: true },
]

const QUICK_FILTERS: ReadonlyArray<{ id: MonitorQuickFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'healthy', label: 'Healthy' },
  { id: 'degraded', label: 'Degraded' },
  { id: 'high-ttfb', label: 'High TTFB' },
  { id: 'low-cache-hit', label: 'Low Cache Hit' },
]

export function MonitorsStageOne() {
  const [activeFilter, setActiveFilter] = useState<MonitorQuickFilterId>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const globalAvgTtfbDelta = -12
  const ttfbImproved = globalAvgTtfbDelta < 0

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-[56px] w-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-8 lg:px-12">
          <Link
            href="/monitors"
            className="inline-flex items-center transition-transform duration-200 hover:scale-[1.01]"
            aria-label="CacheSnap home"
          >
            <Logo variant="header" className="h-6 w-auto sm:h-8" />
          </Link>

          <nav className="hidden items-center gap-5 lg:flex" aria-label="Main Navigation">
            {NAV_ITEMS.map((item) => (
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
                    item.isActive
                      ? 'text-emerald-300'
                      : 'text-zinc-500 hover:text-zinc-200'
                  } after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:rounded-full after:transition-opacity after:duration-200 ${
                    item.isActive
                      ? 'after:bg-emerald-400/70 after:opacity-100'
                      : 'after:bg-white/30 after:opacity-0 hover:after:opacity-100'
                  }`}
                >
                  {item.label}
                </Link>
              )
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-[11px] font-black text-emerald-400 shadow-[inset_0_0_12px_rgba(16,185,129,0.1)] ring-1 ring-white/5 transition-transform hover:scale-105">
              RS
            </div>
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
        <section>
          <h2 className="cs-section-header !mb-2">Global Summary</h2>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <GlobalMetricCard
            title="Active Monitors"
            value="23"
            subtitle="All monitors reporting"
            icon={Activity}
            badge={{ text: 'LIVE', className: 'cs-badge-success', withPulseDot: true }}
            animationDelayMs={30}
          />
          <GlobalMetricCard
            title="Global Avg TTFB (24h)"
            value="248 ms"
            subtitle="Last 24 hours | P50"
            icon={Gauge}
            valueClassName="text-metric-ttfb-fast"
            trend={{
              value: `${Math.abs(globalAvgTtfbDelta)}%`,
              tone: ttfbImproved ? 'success' : 'danger',
              icon: ttfbImproved ? ArrowDown : ArrowUp,
            }}
            animationDelayMs={90}
          />
          <GlobalMetricCard
            title="Overall Cache Hit Rate (24h)"
            value="87.4%"
            subtitle="Last 24 hours"
            icon={ArrowUp}
            trend={{ value: '3.1%', tone: 'success', icon: ArrowUp }}
            metaBadge={{ text: 'HIT', className: 'cs-badge-cache-hit' }}
            animationDelayMs={150}
          />
          <GlobalMetricCard
            title="Health Score"
            value="94/100"
            subtitle="Global edge resilience"
            icon={HeartPulse}
            valueClassName="text-[24px] sm:text-[28px] font-black"
            badge={{ text: 'STABLE', className: 'cs-badge-success !py-0.5 !px-1.5 !text-[9px]' }}
            progress={94}
            animationDelayMs={210}
          />
        </section>

        <article className="cs-card group/search-box cs-card-glass space-y-3.5 !p-6 animate-[cs-fade-in_0.5s_ease-out]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 max-w-2xl relative">
              <label htmlFor="monitor-search-input" className="absolute -top-4.5 left-0 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                Filter Monitors
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within/search:text-emerald-400" />
              <input
                id="monitor-search-input"
                type="text"
                className="cs-input-premium h-11 w-full !pl-11 pr-5 text-[13px] placeholder:text-zinc-600 focus:scale-[1.002]"
                placeholder="Ex: microsoft, cache miss, TTFB > 300ms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Monitor filters">
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

        <section>
          <h2 className="cs-section-header !mb-2">Monitors List</h2>
        </section>

        <section className="cs-card cs-card-glass animate-[cs-fade-in_0.6s_ease-out] overflow-hidden !p-0">
          <MonitorsTable
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
