'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  HeartPulse,
  MapPin,
  ShieldCheck,
  TrendingDown,
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

// ─── Severity styles ──────────────────────────────────────────────────────────

type SeverityCfg = {
  tone:      'critical' | 'warning' | 'neutral'
  bg:        string
  bgHover:   string
  ring:      string
  badge:     string
  label:     string
  iconBg:    string
  iconColor: string
  dot:       string
  glow:      string
}

const SEVERITY: Record<Severity, SeverityCfg> = {
  critical: {
    tone:      'critical',
    bg:        'bg-white/[0.02]',
    bgHover:   'hover:bg-white/[0.035]',
    ring:      'ring-1 ring-inset ring-rose-500/20 hover:ring-rose-500/28',
    badge:     'bg-rose-500/10 text-rose-300/95 ring-rose-500/20',
    label:     'CRITICAL',
    iconBg:    'bg-rose-500/15 border border-rose-500/30',
    iconColor: 'text-rose-400',
    dot:       'bg-rose-400',
    glow:      'shadow-[0_0_32px_-12px_rgba(244,63,94,0.10)]',
  },
  warning: {
    tone:      'warning',
    bg:        'bg-white/[0.02]',
    bgHover:   'hover:bg-white/[0.035]',
    ring:      'ring-1 ring-inset ring-amber-500/18 hover:ring-amber-500/26',
    badge:     'bg-amber-500/10 text-amber-200/90 ring-amber-500/18',
    label:     'WARNING',
    iconBg:    'bg-amber-500/12 border border-amber-500/25',
    iconColor: 'text-amber-400',
    dot:       'bg-amber-400',
    glow:      '',
  },
  info: {
    tone:      'neutral',
    bg:        'bg-white/[0.02]',
    bgHover:   'hover:bg-white/[0.04]',
    ring:      '',
    badge:     'bg-blue-500/10 text-blue-300/90 ring-blue-500/20',
    label:     'ADVISORY',
    iconBg:    'bg-blue-500/10 border border-blue-500/20',
    iconColor: 'text-blue-400',
    dot:       'bg-blue-400',
    glow:      '',
  },
  success: {
    tone:      'neutral',
    bg:        'bg-white/[0.02]',
    bgHover:   'hover:bg-white/[0.04]',
    ring:      '',
    badge:     'bg-emerald-500/10 text-emerald-300/95 ring-emerald-500/20',
    label:     'STABLE',
    iconBg:    'bg-emerald-500/10 border border-emerald-500/20',
    iconColor: 'text-emerald-400',
    dot:       'bg-emerald-400',
    glow:      '',
  },
}

// ─── Icon mapping ─────────────────────────────────────────────────────────────

const INSIGHT_ICON: Record<string, LucideIcon> = {
  'critical-ttfb':    AlertTriangle,
  'high-ttfb':        Clock,
  'low-cache':        Zap,
  'slow-regions':     MapPin,
  'ttfb-degradation': TrendingDown,
  'all-healthy':      ShieldCheck,
}

// ─── TrendChart ───────────────────────────────────────────────────────────────

type TrendChartThresholds = { warn: number; critical: number }

type HoverState = {
  svgX:     number
  svgY:     number
  value:    number
  segColor: string
  idx:      number
} | null

function ttfbSegColor(value: number): string {
  if (value > 350) return '#f43f5e'
  if (value > 200) return '#f59e0b'
  return '#34d399'
}

function smoothLinePath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
  }
  return d
}

function TrendChart({
  data,
  color,
  id,
  height = 88,
  unit = '',
  thresholds,
}: {
  data:        number[]
  color:       string
  id:          string
  height?:     number
  unit?:       string
  thresholds?: TrendChartThresholds
}) {
  const [hovered, setHovered] = useState<HoverState>(null)

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-[11px] text-zinc-700">Collecting data…</span>
      </div>
    )
  }

  const W = 240
  const H = height
  const ml = 26
  const mr = 8
  const pt = 8
  const pb = 10
  const plotW = W - ml - mr

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => {
    const x = ml + (i / (data.length - 1)) * plotW
    const y = pt + (1 - (v - min) / range) * (H - pt - pb)
    return [x, y] as [number, number]
  })

  const linePath = smoothLinePath(pts)
  const area = [`${ml},${H}`, ...pts.map(([x, y]) => `${x},${y}`), `${ml + plotW},${H}`].join(' ')
  const gid     = `grad-${id}`
  const gridGid = `grid-${id}`
  const yTicks = [max, Math.round(min + range * 0.5), min]

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const idx  = Math.max(0, Math.min(Math.round(relX * (data.length - 1)), data.length - 1))
    const segC = thresholds ? ttfbSegColor(data[idx]) : color
    setHovered({ svgX: pts[idx][0], svgY: pts[idx][1], value: data[idx], segColor: segC, idx })
  }

  const hoursFromNow = (idx: number) =>
    Math.round(((data.length - 1 - idx) / (data.length - 1)) * 24)

  const timeLabel = (idx: number) => {
    const h = hoursFromNow(idx)
    return h <= 0 ? 'Now' : `${h}h ago`
  }

  return (
    <div className="relative pt-1">
      {/* Value readout strip */}
      <div
        className={`pointer-events-none absolute -top-1 left-0 right-0 flex items-center justify-between text-[10px] transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}
      >
        <span
          className="font-mono font-semibold tabular-nums tracking-tight"
          style={{ color: hovered?.segColor ?? color }}
        >
          {hovered?.value}{unit}
        </span>
        <span className="text-zinc-500">
          {hovered != null ? timeLabel(hovered.idx) : ''}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full cursor-crosshair"
        style={{ height, display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        aria-label="Trend chart"
        role="img"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.12" />
            <stop offset="70%"  stopColor={color} stopOpacity="0.04" />
            <stop offset="100%" stopColor={color} stopOpacity="0"    />
          </linearGradient>
          <pattern id={gridGid} x={ml} y={pt} width={plotW} height={(H - pt - pb) / 4} patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2={plotW} y2="0" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          </pattern>
        </defs>

        <rect x={ml} y={pt} width={plotW} height={H - pt - pb} fill={`url(#${gridGid})`} rx="1" />

        <polygon points={area} fill={`url(#${gid})`} />

        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {yTicks.map((tick, idx) => (
          <text
            key={idx}
            x={ml - 4}
            y={pt + (idx * (H - pt - pb)) / (yTicks.length - 1)}
            textAnchor="end"
            dominantBaseline={idx === 0 ? 'hanging' : idx === yTicks.length - 1 ? 'alphabetic' : 'middle'}
            fill="rgba(161,161,170,0.78)"
            fontSize="8"
            className="font-mono"
          >
            {tick}{unit}
          </text>
        ))}

        <text
          x={ml + plotW / 2}
          y={H - 1}
          textAnchor="middle"
          fill="rgba(113,113,122,0.85)"
          fontSize="7.5"
          className="font-medium"
        >
          last 24 hours
        </text>

        {hovered && (
          <line
            x1={hovered.svgX} y1={pt}
            x2={hovered.svgX} y2={H - pb}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0B1220] shadow-md transition-none"
          style={{
            left:            `${(hovered.svgX / W) * 100}%`,
            top:             `${(hovered.svgY / H) * 100}%`,
            backgroundColor: hovered.segColor,
          }}
        />
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute z-20 min-w-[7.5rem] -translate-x-1/2 rounded-lg border border-white/[0.12] bg-[#111d32]/98 px-3 py-2 text-left shadow-2xl ring-1 ring-white/[0.04] backdrop-blur-sm"
          style={{
            left:   `${Math.max(14, Math.min(86, (hovered.svgX / W) * 100))}%`,
            bottom: `calc(${(1 - hovered.svgY / H) * 100}% + 14px)`,
          }}
        >
          <p className="font-mono text-[12px] font-bold tabular-nums text-zinc-100">
            {hovered.value}
            <span className="text-[10px] font-semibold text-zinc-500">{unit}</span>
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-zinc-500">
            {timeLabel(hovered.idx)} · blended TTFB
          </p>
        </div>
      )}
    </div>
  )
}

// ─── MiniSparkline ────────────────────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const W = 100, H = 18
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W
      const y = 2 + (1 - (v - min) / range) * (H - 4)
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full opacity-40"
      style={{ height: H, display: 'block' }}
      aria-hidden
    >
      <polyline
        points={pts}
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
  const Icon = INSIGHT_ICON[insight.id] ?? AlertTriangle
  const strongTone = s.tone !== 'neutral'

  return (
    <article
      className={`cs-card group relative flex flex-col overflow-hidden ${s.bg} ${s.bgHover} ${s.ring} ${insight.severity === 'critical' ? s.glow : ''} px-5 py-4 animate-[cs-fade-in_0.45s_ease-out]`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="cs-card-wash" />

      {/* Top row: icon + badge + metric */}
      <div className="relative z-10 flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`rounded-xl ${strongTone ? 'p-2.5' : 'p-2'} ${s.iconBg} ${s.iconColor} transition-transform duration-300 group-hover:scale-[1.03]`}
          >
            <Icon className={strongTone ? 'h-5 w-5' : 'h-4 w-4'} strokeWidth={strongTone ? 2.25 : 2} />
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ring-1 ring-inset ${s.badge}`}
          >
            {s.tone !== 'neutral' && (
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.dot} animate-pulse`} />
            )}
            {s.label}
          </span>
        </div>

        {insight.metric && (
          <span className={`font-mono text-[15px] font-black tabular-nums ${s.iconColor}`}>
            {insight.metric}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1">
        <h3 className="mb-1.5 text-[13px] font-bold leading-snug text-zinc-100">
          {insight.title}
        </h3>
        <p className="text-[12px] leading-relaxed text-zinc-400/90">
          {insight.description}
        </p>
      </div>

      {/* Action */}
      <div className="relative z-10 mt-4">
        {insight.actionHref ? (
          <Link
            href={insight.actionHref}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-[11px] font-bold text-zinc-200 transition-all duration-200 hover:border-white/20 hover:bg-white/10"
          >
            {insight.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-[11px] font-bold text-zinc-300 hover:bg-white/8 hover:border-white/15 transition-all duration-200"
          >
            {insight.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
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
  const s          = SEVERITY[sev]
  const isCritical = sev === 'critical'
  const SevIcon    = isCritical ? AlertTriangle : Clock

  const displayName = monitor.name || safeHostname(monitor.url)
  const host        = safeHostname(monitor.url)

  return (
    <Link
      href={`/dashboard/monitors/${monitor.id}`}
      className={`cs-card group flex items-center gap-4 ${s.bg} ${s.bgHover} ${s.ring} ${isCritical ? s.glow : ''} px-4 py-4 sm:px-5 sm:py-5`}
    >
      {/* Severity icon */}
      <div
        className={`shrink-0 rounded-lg p-2 transition-transform duration-200 group-hover:scale-[1.03] ${s.iconBg} ${s.iconColor}`}
      >
        <SevIcon className={isCritical ? 'h-4 w-4' : 'h-4 w-4'} strokeWidth={isCritical ? 2.25 : 2} />
      </div>

      {/* Rank */}
      <span className="w-4 shrink-0 text-center text-[10px] font-black tabular-nums text-zinc-600">
        {rank}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-[13px] font-semibold tracking-tight text-zinc-100 transition-colors group-hover:text-white">
          {displayName}
        </p>
        <p className="mt-1 truncate text-[11px] font-medium leading-snug text-zinc-500">
          {host}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-zinc-400">
          {isHighTtfb && (
            <span className={isCritical ? 'font-semibold text-rose-400/95' : 'text-amber-400/90'}>
              {monitor.ttfbCurrent} ms TTFB
            </span>
          )}
          {isLowCache && (
            <span className={isCritical ? 'font-semibold text-rose-400/95' : 'text-amber-400/85'}>
              {monitor.cacheHitCurrent}% cache
            </span>
          )}
          {hasSlowR && (
            <span className="text-zinc-500">
              {monitor.slowRegionCount} slow {monitor.slowRegionCount === 1 ? 'region' : 'regions'}
            </span>
          )}
        </p>
      </div>

      {/* Badge + arrow */}
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ring-1 ring-inset ${s.badge}`}
        >
          {isCritical && <span className={`inline-block h-1.5 w-1.5 rounded-full ${s.dot} animate-pulse`} />}
          {s.label}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-700 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-zinc-500" />
      </div>
    </Link>
  )
}

// ─── MonitorQuickCard ─────────────────────────────────────────────────────────

function MonitorQuickCard({ monitor, rank }: { monitor: Monitor; rank: number }) {
  const ttfbClass =
    monitor.ttfbCurrent < 200 ? 'text-metric-ttfb-fast'
    : monitor.ttfbCurrent > 350 ? 'text-metric-ttfb-slow'
    : 'text-metric-ttfb-med'

  const sparkColor =
    monitor.ttfbCurrent < 200 ? '#34d399'
    : monitor.ttfbCurrent > 350 ? '#f43f5e'
    : '#f59e0b'

  const deltaSign  = monitor.ttfbCurrentDelta > 0 ? '+' : ''
  const deltaColor = monitor.ttfbCurrentDelta <= 0 ? 'text-emerald-500' : 'text-rose-500'

  return (
    <Link
      href={`/dashboard/monitors/${monitor.id}`}
      className="cs-card group relative flex h-full w-full min-h-[10.5rem] flex-col overflow-hidden px-5 py-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-600/90 hover:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.35)] sm:px-6"
    >
      <div className="cs-card-wash" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3.5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold leading-tight text-zinc-200 transition-colors group-hover:text-white">
              {monitor.name || safeHostname(monitor.url)}
            </p>
            <p className="mt-1 truncate text-[10px] leading-snug text-zinc-600">
              {safeHostname(monitor.url)}
            </p>
          </div>
          <span className="mt-0.5 shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 text-[9px] font-black tabular-nums text-zinc-500 ring-1 ring-inset ring-white/[0.06]">
            #{rank}
          </span>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 items-end gap-x-4 gap-y-1">
          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">TTFB</p>
            <div className="mt-1 flex items-baseline gap-1">
              <p className={`text-[20px] font-black tabular-nums leading-none ${ttfbClass}`}>
                {monitor.ttfbCurrent}
              </p>
              <span className="text-[9px] font-semibold text-zinc-600">ms</span>
            </div>
            {monitor.ttfbCurrentDelta !== 0 && (
              <p className={`mt-1 text-[9px] font-bold tabular-nums ${deltaColor}`}>
                {deltaSign}{monitor.ttfbCurrentDelta.toFixed(1)}%
              </p>
            )}
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">Cache</p>
            <div className="mt-1 flex items-baseline gap-1">
              {monitor.cacheHitCurrent !== null ? (
                <>
                  <p className="text-[20px] font-black tabular-nums leading-none text-zinc-300">
                    {monitor.cacheHitCurrent}
                  </p>
                  <span className="text-[9px] font-semibold text-zinc-600">%</span>
                </>
              ) : (
                <p className="text-[13px] font-bold text-zinc-700">N/A</p>
              )}
            </div>
          </div>
        </div>

        {/* Mini sparkline */}
        {monitor.ttfbSparkline.length >= 2 && (
          <div className="-mx-0.5 mt-auto pt-1">
            <MiniSparkline data={monitor.ttfbSparkline} color={sparkColor} />
          </div>
        )}
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

  const insights  = useMemo(() => deriveInsights(monitors), [monitors])
  const ttfbTrend = useMemo(() => aggregateTtfbTrend(monitors), [monitors])

  const alertMonitors = useMemo(
    () =>
      monitors
        .filter(
          m =>
            m.ttfbCurrent > 300 ||
            (m.cacheHitCurrent !== null && m.cacheHitCurrent < 70) ||
            m.slowRegionCount > 0,
        )
        .sort((a, b) => {
          // Critical first, then by TTFB
          const aScore = (a.ttfbCurrent > 500 ? 1000 : 0) + a.ttfbCurrent
          const bScore = (b.ttfbCurrent > 500 ? 1000 : 0) + b.ttfbCurrent
          return bScore - aScore
        })
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

  const criticalCount = alertMonitors.filter(
    m => m.ttfbCurrent > 500 || (m.cacheHitCurrent ?? 100) < 40,
  ).length

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
              avatarText="RS"
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

      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-10 pt-4 sm:px-8 lg:px-12">

        {/* ── Page hero ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between animate-[cs-fade-in_0.3s_ease-out]">
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">
              Advisor view
            </p>
            <h1 className="text-[36px] font-black tracking-tight text-zinc-50 leading-none sm:text-[40px]">
              Insights
            </h1>
            <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-zinc-500">
              {isLoading
                ? 'Gathering a clear picture of your monitors…'
                : `A steady read across ${activeCount} live path${activeCount !== 1 ? 's' : ''} — signals refresh as your edge changes.`}
            </p>
          </div>

          {!isLoading && (
            <div className="flex flex-col items-end gap-2">
              <span className={`cs-badge ${healthBadgeCls} !px-3 !py-1.5 text-[10px] font-black`}>
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${healthDotCls}`} />
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${healthDotCls}`} />
                </span>
                {healthLabel}
              </span>
              {criticalCount > 0 && (
                <span className="text-[10px] font-bold text-rose-500/80">
                  {criticalCount} critical {criticalCount === 1 ? 'issue' : 'issues'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── A. Global Health Overview ──────────────────────────────────────── */}
        <section aria-label="Global Health Overview">
          <h2 className="cs-view-section-title mb-3">Global Health Overview</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <GlobalMetricCard
              title="Health Score"
              value={isLoading ? '…' : `${healthScore}/100`}
              subtitle={isLoading ? 'Calculating…' : `${healthLabel} — ${activeCount} active monitors`}
              icon={HeartPulse}
              valueClassName="text-[28px] sm:text-[32px] font-black"
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
        <section aria-label="Insights and Recommendations">
          <h2 className="cs-view-section-title mb-3">Insights &amp; Recommendations</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="cs-card h-[180px] animate-[cs-fade-in_0.45s_ease-out]"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="cs-skeleton h-full w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : (
            <div
              className={`grid grid-cols-1 gap-4 ${
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
        <section aria-label="Performance Trends">
          <h2 className="cs-view-section-title mb-3">Performance Trends</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* TTFB 24h trend */}
            <article className="cs-card cs-card-glass animate-[cs-fade-in_0.5s_ease-out] p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="cs-metric-card-label mb-0 border-0 !text-[9px]">TTFB Trend (24h)</p>
                  <p
                    className={`mt-1.5 text-[24px] font-black tabular-nums leading-none ${
                      avgTtfb < 200 ? 'text-metric-ttfb-fast'
                      : avgTtfb > 350 ? 'text-metric-ttfb-slow'
                      : 'text-metric-ttfb-med'
                    }`}
                  >
                    {isLoading ? '…' : `${avgTtfb}ms`}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/5 p-2 text-zinc-500">
                  <BarChart3 className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-5">
                {ttfbTrend.length >= 2 ? (
                  <>
                    <TrendChart
                      data={ttfbTrend}
                      color="#22c55e"
                      id="ttfb"
                      height={92}
                      unit="ms"
                      thresholds={{ warn: 200, critical: 350 }}
                    />
                    <div className="mt-2.5 flex items-center justify-between text-[10px] font-medium">
                      <span className="text-zinc-700">24h ago</span>
                      <span className="font-mono text-zinc-600 tabular-nums">
                        range {Math.min(...ttfbTrend)}ms - {Math.max(...ttfbTrend)}ms
                      </span>
                      <span className="text-zinc-700">now</span>
                    </div>
                  </>
                ) : (
                  <div className="flex h-[92px] items-center justify-center text-[11px] text-zinc-700">
                    Collecting trend data…
                  </div>
                )}
              </div>
            </article>

            {/* Cache hit per monitor */}
            <article
              className="cs-card cs-card-glass animate-[cs-fade-in_0.5s_ease-out] p-5"
              style={{ animationDelay: '70ms' }}
            >
              <div className="mb-5 flex items-start justify-between gap-2">
                <div>
                  <p className="cs-metric-card-label mb-0 border-0 !text-[9px]">Cache Hit Rate</p>
                  <p className="mt-1.5 text-[24px] font-black tabular-nums leading-none text-zinc-100">
                    {isLoading ? '…' : `${avgHit}%`}
                    <span className="ml-1.5 text-[12px] font-semibold text-zinc-600">global avg</span>
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/5 p-2 text-zinc-500">
                  <Database className="h-4 w-4" />
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map(i => <div key={i} className="h-6 w-full rounded cs-skeleton" />)}
                </div>
              ) : cacheMonitors.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className="h-px w-5"
                      style={{ borderTop: '1px dashed rgba(255,255,255,0.18)' }}
                    />
                    <span className="text-[9px] font-medium tracking-wide text-zinc-500">
                      Target 80%
                    </span>
                  </div>

                  {cacheMonitors.map(m => {
                    const hit = m.cacheHitCurrent!
                    const grad =
                      hit >= 80
                        ? 'linear-gradient(90deg, #064e3b 0%, #059669 55%, #34d399 100%)'
                        : hit >= 60
                        ? 'linear-gradient(90deg, #022c22 0%, #047857 50%, #10b981 100%)'
                        : 'linear-gradient(90deg, #022c22 0%, #065f46 45%, #0d9488 100%)'
                    const glow =
                      hit >= 80
                        ? '0 0 10px rgba(16,185,129,0.18)'
                        : hit >= 60
                        ? '0 0 8px rgba(5,150,105,0.14)'
                        : '0 0 8px rgba(13,148,136,0.12)'

                    return (
                      <div key={m.id} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 truncate text-[10px] font-medium leading-snug text-zinc-400 sm:w-28">
                          {m.name || safeHostname(m.url)}
                        </span>
                        <div className="relative min-h-[1.125rem] flex-1 py-0.5">
                          <div className="relative h-2.5 overflow-visible rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/[0.04]">
                            <div
                              className="pointer-events-none absolute top-1/2 z-10 h-4 w-px -translate-y-1/2 bg-emerald-400/25"
                              style={{ left: '80%' }}
                              aria-hidden
                            />
                            <div
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{
                                width:      `${hit}%`,
                                background: grad,
                                boxShadow:  glow,
                              }}
                            />
                          </div>
                        </div>
                        <span className="w-[2.75rem] shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums tracking-tight text-zinc-200">
                          {hit}
                          <span className="text-[9px] font-medium text-zinc-500">%</span>
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
        <section aria-label="Active Alerts">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="cs-view-section-title">Active Alerts</h2>
              {!isLoading && alertMonitors.length > 0 && (
                <span
                  className={`cs-badge ${criticalCount > 0 ? 'cs-badge-error' : 'cs-badge-warning'} !px-2 !py-0.5 !text-[9px]`}
                >
                  {criticalCount > 0 && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                  )}
                  {alertMonitors.length} {alertMonitors.length === 1 ? 'issue' : 'issues'}
                </span>
              )}
            </div>
            {alertMonitors.length > 0 && (
              <Link
                href="/monitors?filter=degraded"
                className="text-[11px] font-semibold text-zinc-600 transition-colors hover:text-zinc-300"
              >
                View all alerts →
              </Link>
            )}
          </div>

          <div className="cs-card cs-card-glass animate-[cs-fade-in_0.55s_ease-out] overflow-hidden !p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-[72px] w-full rounded-xl cs-skeleton" />
                ))}
              </div>
            ) : alertMonitors.length > 0 ? (
              <div className="space-y-2 p-4">
                {alertMonitors.map((m, i) => (
                  <AlertRow key={m.id} monitor={m} rank={i + 1} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5 py-12 text-center">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500/60" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-zinc-500">No active alerts</p>
                  <p className="mt-0.5 text-[11px] text-zinc-700">
                    All endpoints are within healthy thresholds.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── E. Slowest Monitors ────────────────────────────────────────────── */}
        <section aria-label="Slowest Monitors">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="cs-view-section-title">Slowest Monitors</h2>
            <Link
              href="/monitors?sort=ttfbCurrent&dir=desc"
              className="text-[11px] font-semibold text-zinc-600 transition-colors hover:text-zinc-300"
            >
              View all →
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="cs-card h-[148px] animate-[cs-fade-in_0.45s_ease-out]"
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <div className="cs-skeleton h-full w-full rounded-xl" />
                </div>
              ))}
            </div>
          ) : slowest.length > 0 ? (
            <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {slowest.map((m, i) => (
                <div
                  key={m.id}
                  className="flex min-h-0 animate-[cs-fade-in_0.45s_ease-out]"
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <MonitorQuickCard monitor={m} rank={i + 1} />
                </div>
              ))}
            </div>
          ) : (
            <div className="cs-card flex flex-col items-center gap-3 py-12 text-center">
              <Activity className="h-8 w-8 text-zinc-700" />
              <p className="text-[12px] font-semibold text-zinc-600">No monitors yet</p>
              <Link href="/monitors/new" className="cs-btn-primary mt-1 h-8 px-4 text-[11px]">
                + Create Monitor
              </Link>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
