'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Gauge,
  Grid3X3,
  HeartPulse,
  Search,
  ShieldCheck,
  Table,
} from 'lucide-react'
import { Logo } from '@/components/logo'
import { GlobalMetricCard } from './global-metric-card'

type ViewMode = 'table' | 'grid'

type QuickFilter = {
  id: string
  label: string
}

const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', isActive: false, isDisabled: false },
  { label: 'Monitors', href: '/monitors', isActive: true, isDisabled: false },
  { label: 'Diagnostics', href: '', isActive: false, isDisabled: true },
  { label: 'Alerts', href: '', isActive: false, isDisabled: true },
  { label: 'Settings', href: '', isActive: false, isDisabled: true },
]

const QUICK_FILTERS: QuickFilter[] = [
  { id: 'all', label: 'All' },
  { id: 'healthy', label: 'Healthy' },
  { id: 'degraded', label: 'Degraded' },
  { id: 'high-ttfb', label: 'High TTFB' },
  { id: 'low-cache-hit', label: 'Low Cache Hit' },
]

export function MonitorsStageOne() {
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const globalAvgTtfbDelta = -12
  const ttfbImproved = globalAvgTtfbDelta < 0

  const quickFilterLabel = useMemo(() => {
    return QUICK_FILTERS.find((filter) => filter.id === activeFilter)?.label ?? 'All'
  }, [activeFilter])

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

      <main className="mx-auto w-full max-w-6xl space-y-3 px-4 pb-8 pt-2 sm:px-8 lg:px-12">
        <section className="flex justify-start">
          <div
            className="inline-flex h-[34px] items-center gap-1 rounded-lg border border-white/5 bg-zinc-900/50 p-1 backdrop-blur-sm"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 h-full text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                viewMode === 'table'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_-3px_rgba(16,185,129,0.5)]'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <Table className={`h-3 w-3 ${viewMode === 'table' ? 'stroke-[3]' : 'stroke-[2.5]'}`} />
              Table View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 h-full text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                viewMode === 'grid'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_-3px_rgba(16,185,129,0.5)]'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <Grid3X3 className={`h-3 w-3 ${viewMode === 'grid' ? 'stroke-[3]' : 'stroke-[2.5]'}`} />
              Card Grid
            </button>
          </div>
        </section>

        <section>
          <h2 className="cs-section-header mb-2.5">Global Summary</h2>
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

        <article className="cs-card group/search-box cs-card-glass space-y-3 !p-5 animate-[cs-fade-in_0.5s_ease-out]">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 max-w-2xl relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                id="monitor-search-input"
                type="text"
                className="cs-input-premium h-10 w-full !pl-10 pr-4 text-[13px] placeholder:text-zinc-600 focus:scale-[1.002]"
                placeholder="Filter Monitors (ex: microsoft, cache miss, TTFB > 300ms)"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_FILTERS.map((filter) => {
                const isActive = activeFilter === filter.id
                const isAll = filter.id === 'all'
                
                if (isAll && isActive) {
                  return (
                    <button
                      key={filter.id}
                      onClick={() => setActiveFilter(filter.id)}
                      className="h-7.5 rounded-lg bg-emerald-500 text-slate-950 px-3 text-[9px] font-black uppercase tracking-widest shadow-[0_0_10px_-2px_rgba(16,185,129,0.4)] transition-all"
                    >
                      {filter.label}
                    </button>
                  )
                }

                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActiveFilter(filter.id)}
                    aria-pressed={isActive}
                    className={`h-7.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      isActive
                        ? 'cs-badge cs-badge-success !px-3'
                        : 'border border-white/5 bg-white/[0.01] text-zinc-600 hover:text-zinc-400'
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
          <h2 className="cs-section-header mb-2.5">Monitors List</h2>
        </section>

        <section id="monitors-table-container" className="cs-card cs-card-glass min-h-[320px] !p-6 pt-5 animate-[cs-fade-in_0.6s_ease-out] relative">
          {/* Subtle status indicators in the corner */}
          <div className="absolute top-4 right-5 flex items-center gap-3">
             <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.03] border border-white/5 text-[9px] font-bold uppercase tracking-tight text-zinc-600">
               <div className="h-1 w-1 rounded-full bg-emerald-500/50" />
               {viewMode === 'table' ? 'Table' : 'Grid'}
             </div>
             <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.03] border border-white/5 text-[9px] font-bold uppercase tracking-tight text-zinc-600">
               {quickFilterLabel}
             </div>
          </div>

          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.01] px-6 text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-emerald-500/10 blur-xl rounded-full" />
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/5 bg-zinc-900/40">
                <Table className="h-5 w-5 text-emerald-400 stroke-[2.5]" />
              </div>
            </div>
            <h3 className="text-base font-black tracking-tight text-white/90 mb-1">
              Table View arriving soon
            </h3>
            <p className="max-w-[240px] text-[11px] font-medium leading-relaxed text-zinc-600">
              High-performance tabular interface coming in Etapa 2.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
