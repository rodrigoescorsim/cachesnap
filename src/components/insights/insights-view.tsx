'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  Globe,
  HeartPulse,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Logo } from '@/components/logo'
import { UserDropdown } from '@/components/dashboard/UserDropdown'
import { GlobalMetricCard } from '@/components/monitors/global-metric-card'
import { useMonitors } from '@/hooks/use-monitors'
import type { Monitor } from '@/types/monitor'
import {
  type Severity,
  type Insight,
  deriveInsights,
  aggregateTtfbTrend,
  safeHostname,
} from './insights.helpers'

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Monitors',    href: '/monitors', isActive: false, isDisabled: false },
  { label: 'Insights',    href: '/insights', isActive: true,  isDisabled: false },
  { label: 'Diagnostics', href: '',          isActive: false, isDisabled: true  },
  { label: 'Alerts',      href: '',          isActive: false, isDisabled: true  },
  { label: 'Settings',    href: '',          isActive: false, isDisabled: true  },
]

// ─── Severity styles (view concern — Tailwind classes) ────────────────────────

type SeverityCfg = {
  borderL: string
  bg:      string
  badge:   string
  label:   string
  iconBg:  string
  icon:    string
  dot:     string
}

const SEVERITY: Record<Severity, SeverityCfg> = {
  critical: {
    borderL: 'border-l-rose-500/70',
    bg:      'bg-rose-500/[0.04]',
    badge:   'bg-rose-500/15 text-rose-400 ring-rose-500/25',
    label:   'Critical',
    iconBg:  'bg-rose-500/10 border-rose-500/20',
    icon:    'text-rose-400',
    dot:     'bg-rose-400',
  },
  warning: {
    borderL: 'border-l-amber-500/60',
    bg:      'bg-amber-500/[0.03]',
    badge:   'bg-amber-500/15 text-amber-400 ring-amber-500/25',
    label:   'Warning',
    iconBg:  'bg-amber-500/10 border-amber-500/20',
    icon:    'text-amber-400',
    dot:     'bg-amber-400',
  },
  info: {
    borderL: 'border-l-blue-500/60',
    bg:      'bg-blue-500/[0.03]',
    badge:   'bg-blue-500/15 text-blue-400 ring-blue-500/25',
    label:   'Info',
    iconBg:  'bg-blue-500/10 border-blue-500/20',
    icon:    'text-blue-400',
    dot:     'bg-blue-400',
  },
  success: {
    borderL: 'border-l-emerald-500/60',
    bg:      'bg-emerald-500/[0.03]',
    badge:   'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
    label:   'Healthy',
    iconBg:  'bg-emerald-500/10 border-emerald-500/20',
    icon:    'text-emerald-400',
    dot:     'bg-emerald-400',
  },
}

// ─── Icon mapping (by insight ID) ────────────────────────────────────────────

const INSIGHT_ICON: Record<string, LucideIcon> = {
  'critical-ttfb':    Zap,
  'high-ttfb':        Clock,
  'low-cache':        Database,
  'slow-regions':     Globe,
  'ttfb-degradation': TrendingUp,
  'all-healthy':      CheckCircle2,
}

// ─── TrendChart ───────────────────────────────────────────────────────────────

function TrendChart({
  data,
  color,
  id,
  height = 72,
}: {
  data:    number[]
  color:   string
  id:      string
  height?: number
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-[11px] text-zinc-700">Collecting data…</span>
      </div>
    )
  }

  const W = 200, H = height, pt = 4, pb = 4
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = pt + (1 - (v - min) / range) * (H - pt - pb)
    return [x, y] as [number, number]
  })

  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const area     = [`0,${H}`, ...pts.map(([x, y]) => `${x},${y}`), `${W},${H}`].join(' ')
  const gid      = `grad-${id}`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      aria-label="Trend chart"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.22" />
          <stop offset="85%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ─── InsightCard ──────────────────────────────────────────────────────────────

function InsightCard({ insight, delay }: { insight: Insight; delay: number }) {
  const s    = SEVERITY[insight.severity]
  const Icon = INSIGHT_ICON[insight.id] ?? Zap

  return (
    <article
      className={`relative overflow-hidden rounded-xl border border-border border-l-2 ${s.borderL} ${s.bg} px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-xl animate-[cs-fade-in_0.45s_ease-out]`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="cs-card-wash" />
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`rounded-lg border p-1.5 ${s.iconBg} ${s.icon}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ring-1 ring-inset ${s.badge}`}
            >
              {s.label}
            </span>
          </div>
          {insight.metric && (
            <span className="font-mono text-[13px] font-bold text-zinc-300 tabular-nums">
              {insight.metric}
            </span>
          )}
        </div>

        <div>
          <h3 className="mb-1 text-[13px] font-bold leading-snug text-zinc-100">
            {insight.title}
          </h3>
          <p className="text-[12px] leading-relaxed text-zinc-400">
            {insight.description}
          </p>
        </div>

        {insight.actionHref ? (
          <Link
            href={insight.actionHref}
            className="cs-btn-primary mt-1 h-8 self-start px-3.5 text-[11px] font-bold"
          >
            {insight.actionLabel}
          </Link>
        ) : (
          <button
            type="button"
            className="cs-btn-primary mt-1 h-8 self-start px-3.5 text-[11px] font-bold"
          >
            {insight.actionLabel}
          </button>
        )}
      </div>
    </article>
  )
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────

function AlertRow({ monitor, rank }: { monitor: Monitor; rank: number }) {
  const isHighTtfb = monitor.ttfbCurrent > 300
  const isLowCache = monitor.cacheHitCurrent !== null && monitor.cacheHitCurrent < 70
  const hasSlowR   = monitor.slowRegionCount > 0

  const sev: Severity =
    monitor.ttfbCurrent > 500 || (monitor.cacheHitCurrent ?? 100) < 40
      ? 'critical'
      : 'warning'
  const s = SEVERITY[sev]

  return (
    <Link
      href={`/dashboard/monitors/${monitor.id}`}
      className={`group flex items-center gap-4 rounded-lg border-l-2 ${s.borderL} bg-white/[0.02] px-4 py-3 transition-all duration-200 hover:bg-white/[0.04]`}
    >
      <span className="w-4 shrink-0 text-center text-[10px] font-black tabular-nums text-zinc-700">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-zinc-200 group-hover:text-white">
          {monitor.name || safeHostname(monitor.url)}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
          {isHighTtfb && <span className="text-amber-400">{monitor.ttfbCurrent}ms TTFB</span>}
          {isLowCache  && <span className="text-metric-slow">{monitor.cacheHitCurrent}% cache hit</span>}
          {hasSlowR    && (
            <span className="text-amber-400/80">
              {monitor.slowRegionCount} slow {monitor.slowRegionCount === 1 ? 'region' : 'regions'}
            </span>
          )}
        </p>
      </div>
      <span
        className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ring-1 ring-inset ${s.badge}`}
      >
        {s.label}
      </span>
    </Link>
  )
}

// ─── MonitorQuickCard ─────────────────────────────────────────────────────────

function MonitorQuickCard({ monitor, rank }: { monitor: Monitor; rank: number }) {
  const ttfbClass =
    monitor.ttfbCurrent < 200 ? 'text-metric-ttfb-fast'
    : monitor.ttfbCurrent > 350 ? 'text-metric-ttfb-slow'
    : 'text-metric-ttfb-med'

  return (
    <Link
      href={`/dashboard/monitors/${monitor.id}`}
      className="cs-card group relative block overflow-hidden px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-600"
    >
      <div className="cs-card-wash" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-zinc-200 group-hover:text-white">
              {monitor.name || safeHostname(monitor.url)}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-zinc-600">
              {safeHostname(monitor.url)}
            </p>
          </div>
          <span className="shrink-0 text-[9px] font-black tabular-nums text-zinc-700">#{rank}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">TTFB</p>
            <p className={`mt-0.5 text-[17px] font-black tabular-nums leading-none ${ttfbClass}`}>
              {monitor.ttfbCurrent}
              <span className="ml-0.5 text-[9px] font-semibold text-zinc-600">ms</span>
            </p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">Cache</p>
            <p className="mt-0.5 text-[17px] font-black tabular-nums leading-none text-zinc-300">
              {monitor.cacheHitCurrent !== null ? (
                <>
                  {monitor.cacheHitCurrent}
                  <span className="ml-0.5 text-[9px] font-semibold text-zinc-600">%</span>
                </>
              ) : (
                <span className="text-[12px] text-zinc-700">N/A</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── InsightsView ─────────────────────────────────────────────────────────────

type InsightsViewProps = {
  userEmail:    string
  logoutAction: () => Promise<void>
}

export function InsightsView({ userEmail, logoutAction }: InsightsViewProps) {
  const { monitors, isLoading } = useMonitors({ refetchInterval: 60_000 })

  // ── Global metrics ────────────────────────────────────────────────────────
  const { activeCount, avgTtfb, avgHit, healthScore, ttfbDelta } = useMemo(() => {
    if (!monitors.length) return { activeCount: 0, avgTtfb: 0, avgHit: 0, healthScore: 0, ttfbDelta: 0 }

    const active  = monitors.filter(m => m.status === 'active')
    const avgTtfb = Math.round(monitors.reduce((s, m) => s + m.ttfbCurrent, 0) / monitors.length)

    const cm     = monitors.filter(m => m.cacheHitCurrent !== null)
    const avgHit = cm.length
      ? Number((cm.reduce((s, m) => s + m.cacheHitCurrent!, 0) / cm.length).toFixed(1))
      : 0

    const healthyCount = monitors.filter(
      m => m.ttfbCurrent < 200 && (m.cacheHitCurrent === null || m.cacheHitCurrent > 80),
    ).length
    const healthScore = Math.round((healthyCount / monitors.length) * 100)

    const ttfbDelta = Math.round(
      (monitors.reduce((s, m) => s + m.ttfbCurrentDelta, 0) / monitors.length) * 10,
    ) / 10

    return { activeCount: active.length, avgTtfb, avgHit, healthScore, ttfbDelta }
  }, [monitors])

  const ttfbImproved = ttfbDelta < 0

  const healthLabel    = healthScore >= 90 ? 'Healthy' : healthScore >= 70 ? 'Degraded' : 'Critical'
  const healthBadgeCls = healthScore >= 90 ? 'cs-badge-success' : healthScore >= 70 ? 'cs-badge-warning' : 'cs-badge-error'
  const healthDotCls   = healthScore >= 90 ? 'bg-emerald-400' : healthScore >= 70 ? 'bg-amber-400' : 'bg-rose-400'

  const insights       = useMemo(() => deriveInsights(monitors), [monitors])
  const ttfbTrend      = useMemo(() => aggregateTtfbTrend(monitors), [monitors])
  const ttfbColor      = avgTtfb < 200 ? '#34d399' : avgTtfb > 350 ? '#f43f5e' : '#f59e0b'

  const alertMonitors = useMemo(
    () =>
      monitors
        .filter(
          m =>
            m.ttfbCurrent > 300 ||
            (m.cacheHitCurrent !== null && m.cacheHitCurrent < 70) ||
            m.slowRegionCount > 0,
        )
        .sort((a, b) => b.ttfbCurrent - a.ttfbCurrent)
        .slice(0, 6),
    [monitors],
  )

  const slowest = useMemo(
    () => [...monitors].sort((a, b) => b.ttfbCurrent - a.ttfbCurrent).slice(0, 5),
    [monitors],
  )

  const cacheMonitors = useMemo(
    () => monitors.filter(m => m.cacheHitCurrent !== null).slice(0, 6),
    [monitors],
  )

  return (
    <div className="min-h-full bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
            {NAV_ITEMS.map(item =>
              item.isDisabled ? (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="cursor-not-allowed px-1 py-1 text-[13px] font-semibold tracking-tight text-zinc-600"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.isActive ? 'page' : undefined}
                  className={`relative px-1 py-1 text-[13px] font-semibold tracking-tight transition-colors duration-200 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:rounded-full after:transition-opacity after:duration-200 ${
                    item.isActive
                      ? 'text-emerald-300 after:bg-emerald-400/70 after:opacity-100'
                      : 'text-zinc-500 hover:text-zinc-200 after:bg-white/30 after:opacity-0 hover:after:opacity-100'
                  }`}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="flex items-center gap-3">
            <UserDropdown
              email={userEmail}
              logoutAction={logoutAction}
              variant="monitorsBadge"
            />
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

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-14 pt-5 sm:px-8 lg:px-12">

        {/* ── Page hero ─────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between animate-[cs-fade-in_0.3s_ease-out]">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">
                Performance Advisor
              </span>
              <span className="h-px w-5 bg-zinc-800" />
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">
                {isLoading ? '…' : `${activeCount} active`}
              </span>
            </div>
            <h1 className="text-[24px] font-black tracking-tight text-zinc-50 leading-none">
              Insights
            </h1>
          </div>

          {!isLoading && (
            <span className={`cs-badge ${healthBadgeCls} !px-3 !py-1.5 text-[10px] font-black`}>
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${healthDotCls}`} />
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${healthDotCls}`} />
              </span>
              {healthLabel}
            </span>
          )}
        </div>

        {/* ── A. Global Health Overview ──────────────────────────────────────── */}
        <section>
          <h2 className="cs-view-section-title mb-3">Global Health Overview</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <GlobalMetricCard
              title="Health Score"
              value={isLoading ? '…' : `${healthScore}/100`}
              subtitle={isLoading ? 'Calculating…' : `${healthLabel} — ${activeCount} active monitors`}
              icon={HeartPulse}
              valueClassName="text-[26px] sm:text-[30px] font-black"
              badge={{
                text:         healthLabel,
                className:    `${healthBadgeCls} !py-0.5 !px-1.5 !text-[9px]`,
                withPulseDot: !isLoading,
              }}
              progress={isLoading ? 0 : healthScore}
              animationDelayMs={0}
            />
            <GlobalMetricCard
              title="Avg TTFB (Global)"
              value={isLoading ? '…' : `${avgTtfb} ms`}
              subtitle="Average response time across all endpoints"
              icon={Gauge}
              valueClassName={
                avgTtfb < 200 ? 'text-metric-ttfb-fast'
                : avgTtfb > 350 ? 'text-metric-ttfb-slow'
                : 'text-metric-ttfb-med'
              }
              trend={{
                value: `${Math.abs(ttfbDelta)}%`,
                tone:  ttfbImproved ? 'success' : 'danger',
                icon:  ttfbImproved ? ArrowDown : ArrowUp,
              }}
              animationDelayMs={70}
            />
            <GlobalMetricCard
              title="Avg Cache Hit"
              value={isLoading ? '…' : `${avgHit}%`}
              subtitle="Global CDN cache efficiency"
              icon={Activity}
              trend={{
                value: avgHit >= 80 ? 'Good' : avgHit >= 60 ? 'Fair' : 'Low',
                tone:  avgHit >= 80 ? 'success' : avgHit >= 60 ? 'warning' : 'danger',
              }}
              metaBadge={{ text: 'HIT', className: 'cs-badge-cache-hit' }}
              animationDelayMs={140}
            />
          </div>
        </section>

        {/* ── B. Insights & Recommendations ─────────────────────────────────── */}
        <section>
          <h2 className="cs-view-section-title mb-3">Insights &amp; Recommendations</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="cs-card h-[152px]">
                  <div className="cs-skeleton h-full w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : (
            <div
              className={`grid grid-cols-1 gap-3 ${
                insights.length >= 3 ? 'sm:grid-cols-2 xl:grid-cols-3'
                : insights.length === 2 ? 'sm:grid-cols-2'
                : ''
              }`}
            >
              {insights.map((insight, i) => (
                <InsightCard key={insight.id} insight={insight} delay={i * 65} />
              ))}
            </div>
          )}
        </section>

        {/* ── C. Performance Trends ─────────────────────────────────────────── */}
        <section>
          <h2 className="cs-view-section-title mb-3">Performance Trends</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            <article className="cs-card cs-card-glass animate-[cs-fade-in_0.5s_ease-out] p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="cs-metric-card-label mb-0 border-0 !text-[9px]">TTFB Trend (24h)</p>
                  <p
                    className={`mt-1.5 text-[22px] font-black tabular-nums leading-none ${
                      avgTtfb < 200 ? 'text-metric-ttfb-fast'
                      : avgTtfb > 350 ? 'text-metric-ttfb-slow'
                      : 'text-metric-ttfb-med'
                    }`}
                  >
                    {isLoading ? '…' : `${avgTtfb}ms`}
                  </p>
                </div>
                <div className="rounded border border-white/5 bg-white/5 p-1.5 text-zinc-500">
                  <BarChart3 className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="mt-4">
                {ttfbTrend.length >= 2 ? (
                  <>
                    <TrendChart data={ttfbTrend} color={ttfbColor} id="ttfb" height={72} />
                    <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-zinc-700">
                      <span>24h ago</span>
                      <span className="text-zinc-600">
                        {Math.min(...ttfbTrend)}ms – {Math.max(...ttfbTrend)}ms
                      </span>
                      <span>now</span>
                    </div>
                  </>
                ) : (
                  <div className="flex h-[72px] items-center justify-center text-[11px] text-zinc-700">
                    Collecting trend data…
                  </div>
                )}
              </div>
            </article>

            <article
              className="cs-card cs-card-glass animate-[cs-fade-in_0.5s_ease-out] p-5"
              style={{ animationDelay: '70ms' }}
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <p className="cs-metric-card-label mb-0 border-0 !text-[9px]">Cache Hit Rate</p>
                  <p className="mt-1.5 text-[22px] font-black tabular-nums leading-none text-zinc-100">
                    {isLoading ? '…' : `${avgHit}%`}
                    <span className="ml-1.5 text-[11px] font-semibold text-zinc-600">avg</span>
                  </p>
                </div>
                <div className="rounded border border-white/5 bg-white/5 p-1.5 text-zinc-500">
                  <Database className="h-3.5 w-3.5" />
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-2.5">
                  {[0, 1, 2, 3].map(i => <div key={i} className="h-5 w-full rounded cs-skeleton" />)}
                </div>
              ) : cacheMonitors.length > 0 ? (
                <div className="space-y-2.5">
                  {cacheMonitors.map(m => {
                    const hit   = m.cacheHitCurrent!
                    const barCl = hit >= 80 ? '#34d399' : hit >= 60 ? '#f59e0b' : '#f43f5e'
                    return (
                      <div key={m.id} className="flex items-center gap-2.5">
                        <span className="w-[90px] shrink-0 truncate text-[10px] font-medium text-zinc-500">
                          {m.name || safeHostname(m.url)}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${hit}%`, backgroundColor: barCl }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right font-mono text-[10px] font-bold tabular-nums text-zinc-400">
                          {hit}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex h-[80px] items-center justify-center text-[11px] text-zinc-700">
                  No cache data available
                </div>
              )}
            </article>
          </div>
        </section>

        {/* ── D. Active Alerts ───────────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="cs-view-section-title">Active Alerts</h2>
            {!isLoading && alertMonitors.length > 0 && (
              <span className="cs-badge cs-badge-warning !px-2 !py-0.5 !text-[9px]">
                {alertMonitors.length} {alertMonitors.length === 1 ? 'issue' : 'issues'}
              </span>
            )}
          </div>

          <div className="cs-card cs-card-glass animate-[cs-fade-in_0.55s_ease-out] overflow-hidden !p-0">
            {isLoading ? (
              <div className="space-y-1.5 p-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-14 w-full rounded-lg cs-skeleton" />
                ))}
              </div>
            ) : alertMonitors.length > 0 ? (
              <div className="space-y-1 p-3">
                {alertMonitors.map((m, i) => (
                  <AlertRow key={m.id} monitor={m} rank={i + 1} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/30" />
                <p className="text-[12px] font-semibold text-zinc-600">No active alerts</p>
                <p className="text-[11px] text-zinc-700">
                  All monitored endpoints are within healthy thresholds.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── E. Slowest Monitors ────────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="cs-view-section-title">Slowest Monitors</h2>
            <Link
              href="/monitors"
              className="text-[11px] font-semibold text-zinc-600 transition-colors hover:text-zinc-300"
            >
              View all →
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="cs-card h-[110px] animate-[cs-fade-in_0.45s_ease-out]"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="cs-skeleton h-full w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : slowest.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 animate-[cs-fade-in_0.6s_ease-out]">
              {slowest.map((m, i) => (
                <MonitorQuickCard key={m.id} monitor={m} rank={i + 1} />
              ))}
            </div>
          ) : (
            <div className="cs-card flex flex-col items-center gap-2 py-10 text-center">
              <Activity className="h-8 w-8 text-zinc-700" />
              <p className="text-[12px] font-semibold text-zinc-600">No monitors yet</p>
              <Link href="/monitors/new" className="cs-btn-primary mt-2 h-8 px-4 text-[11px]">
                + Create Monitor
              </Link>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
