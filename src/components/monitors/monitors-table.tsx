'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type OnChangeFn,
  type SortingState,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Globe,
  ShieldAlert,
} from 'lucide-react'
import { MonitorDeleteConfirm } from '@/app/dashboard/monitors/[id]/monitor-delete-confirm'
import {
  type Monitor,
  type MonitorQuickFilterId,
  getTtfbTier,
  getCacheHitTier,
  monitorHealthScore,
  monitorMatchesQuickFilter,
  monitorMatchesSearch,
} from '@/types/monitor'
import { PremiumTooltip } from '@/components/premium-tooltip'
import {
  BRAND_TABLE_SURFACE_GRADIENT,
  MONITOR_TABLE,
} from '@/app/dashboard/monitors/[id]/monitor-table-styles'

import { MONITOR_TTFB, MONITOR_CACHE, getTtfbColorClass, getCacheColor, getTtfbTooltip, getCacheTooltip } from '@/lib/thresholds'
import { isCacheHit, getCacheDisplayLabel, isCacheBypass } from '@/lib/cache-utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TTFB_CLASS: Record<string, string> = {
  fast: 'text-metric-ttfb-fast',
  med: 'text-metric-ttfb-med',
  slow: 'text-metric-ttfb-slow',
}

const TTFB_LABEL: Record<string, string> = {
  fast: `Fast — under ${MONITOR_TTFB.FAST} ms`,
  med: `Moderate — ${MONITOR_TTFB.FAST}–${MONITOR_TTFB.SLOW} ms`,
  slow: `Slow — over ${MONITOR_TTFB.SLOW} ms`,
}

function ttfbClass(ms: number) { return TTFB_CLASS[getTtfbTier(ms)] }
function ttfbLabel(ms: number) { return TTFB_LABEL[getTtfbTier(ms)] }

function formatRelativeTime(date: Date | null | undefined): { text: string; isRecent: boolean; freshness: 'live' | 'stale' | 'offline' } {
  if (!date || date.getTime() <= 0 || date.getFullYear() < 2000) {
    return { text: '—', isRecent: false, freshness: 'offline' }
  }
  const diffS = Math.floor((Date.now() - date.getTime()) / 1000)

  // Freshness: same calendar day & <1h = live; same day & >1h = stale; different day = offline
  const now = new Date()
  const isDifferentDay =
    date.getUTCFullYear() !== now.getUTCFullYear() ||
    date.getUTCMonth() !== now.getUTCMonth() ||
    date.getUTCDate() !== now.getUTCDate()
  const freshness: 'live' | 'stale' | 'offline' = isDifferentDay
    ? 'offline'
    : diffS > 3600
      ? 'stale'
      : 'live'

  if (diffS < 60) return { text: diffS < 5 ? 'just now' : `${diffS}s ago`, isRecent: true, freshness }
  const diffM = Math.floor(diffS / 60)
  if (diffM < 60) return { text: `${diffM}m ago`, isRecent: diffM < 3, freshness }
  const diffH = Math.floor(diffM / 60)
  return { text: `${diffH}h ago`, isRecent: false, freshness }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SPARK_W = 60
const SPARK_H = 18

function Sparkline({ data, delta }: { data: number[]; delta: number }) {
  const [tip, setTip] = useState<{ idx: number; px: number } | null>(null)

  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * SPARK_W
      const y = SPARK_H - ((v - min) / range) * (SPARK_H - 3) - 1.5
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const color = delta < -1 ? '#34d399' : delta > 1 ? '#f43f5e' : '#f59e0b'
  const glowClass =
    delta < -1
      ? 'group-hover/row:[filter:drop-shadow(0_0_5px_rgba(52,211,153,0.55))]'
      : delta > 1
        ? 'group-hover/row:[filter:drop-shadow(0_0_5px_rgba(244,63,94,0.55))]'
        : 'group-hover/row:[filter:drop-shadow(0_0_5px_rgba(245,158,11,0.45))]'

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    const t = SPARK_W <= 0 ? 0 : Math.min(1, Math.max(0, x / SPARK_W))
    const idx = Math.round(t * (data.length - 1))
    setTip({ idx, px: (idx / (data.length - 1)) * SPARK_W })
  }

  const tipMs = tip !== null ? Math.round(data[tip.idx]) : null

  return (
    <div className="relative inline-flex shrink-0">
      {tip !== null && tipMs !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-20 mb-6 min-w-[3rem] -translate-x-1/2 rounded border border-white/[0.12] bg-zinc-950/95 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-zinc-200 shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
          style={{ left: `${tip.px}px` }}
        >
          {tipMs} ms
        </div>
      )}
      <svg
        width={SPARK_W}
        height={SPARK_H}
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        aria-hidden="true"
        className={`shrink-0 cursor-crosshair opacity-90 transition-[filter,opacity] duration-300 ${glowClass}`}
        onMouseMove={handleMove}
        onMouseLeave={() => setTip(null)}
      >
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function cacheHitTooltipText(pct: number): string {
  return getCacheTooltip(pct, 'monitor')
}

function CacheHitBadge({ pct, status }: { pct: number | null; status: string | null }) {
  const displayLabel = getCacheDisplayLabel(status)
  // Strictly only show gray text for intentional categories. 
  // If status is MISS, it must be shown as 0% (red).
  const isIntentional = isCacheBypass(status) && displayLabel !== 'MISS' && displayLabel !== 'HIT'

  if (pct === null || (Math.round(pct) === 0 && isIntentional)) {
    return (
      <PremiumTooltip
        content={pct === null ? "No cache-status header detected on recent probes." : "Site is intentionally dynamic: All requests fetched from origin."}
        position="top-center"
        direction="top"
      >
        <div className="flex flex-col gap-[3px]">
          <span className="text-[10px] font-black uppercase text-zinc-500/90 tabular-nums">
            {displayLabel}
          </span>
        </div>
      </PremiumTooltip>
    )
  }
  const tip = cacheHitTooltipText(pct)
  const tier = getCacheHitTier(pct)
  const textClass = getCacheColor(pct, 'monitor') === 'text-metric-elite' ? 'text-metric-elite' : (
    tier === 'high' ? 'text-emerald-400'
      : tier === 'mid' ? 'text-amber-400'
        : 'text-metric-bad'
  )

  return (
    <PremiumTooltip content={tip} position="top-center" direction="top">
      <span className={`${textClass} text-[13px] font-black tabular-nums leading-none`}>
        {pct.toFixed(1)}%
      </span>
    </PremiumTooltip>
  )
}

function DeltaChip({ value, inverted = false }: { value: number | null; inverted?: boolean }) {
  if (value === null) return null
  const improved = inverted ? value < 0 : value > 0
  const Icon = value < 0 ? ArrowDown : ArrowUp
  return (
    <span
      className={`inline-flex items-center gap-px text-[11px] font-extrabold tabular-nums leading-none ${improved ? 'text-emerald-300' : 'text-metric-bad'
        }`}
    >
      <Icon className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function SortIcon({ isSorted }: { isSorted: false | 'asc' | 'desc' }) {
  if (isSorted === 'asc')
    return <ArrowUp className="ml-1 inline h-[9px] w-[9px] shrink-0 text-emerald-400" />
  if (isSorted === 'desc')
    return <ArrowDown className="ml-1 inline h-[9px] w-[9px] shrink-0 text-emerald-400" />
  return (
    <ArrowUpDown className="ml-1 inline h-[9px] w-[9px] shrink-0 opacity-20 transition-opacity duration-150 group-hover/th:opacity-60" />
  )
}

function MonitorsThTooltip({ label, description }: { label: ReactNode; description: string }) {
  return (
    <PremiumTooltip
      content={
        <p className="text-[11px] font-normal leading-relaxed tracking-normal text-zinc-300">
          {description}
        </p>
      }
      position="top-center"
      direction="top"
    >
      <span className="cursor-help">{label}</span>
    </PremiumTooltip>
  )
}

function RowActionsDropdown({
  monitor,
  onDelete,
  onView,
  isOpen,
  setIsOpen,
  onOptimisticToggle,
}: {
  monitor: Monitor
  onDelete: (id: string) => void
  onView: (id: string) => void
  isOpen: boolean
  setIsOpen: (id: string | null) => void
  onOptimisticToggle: (id: string, status: 'active' | 'paused') => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isPaused = monitor.status === 'paused'

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: rect.top,
      left: rect.right,
    })
  }, [])

  const handleToggleActive = () => {
    const nextStatus = isPaused ? 'active' : 'paused'
    onOptimisticToggle(monitor.id, nextStatus)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${monitor.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: isPaused }),
        })
        if (res.ok) {
          router.refresh()
          setIsOpen(null)
        }
      } catch (err) {
        console.error('Failed to toggle monitor status', err)
      }
    })
  }

  useEffect(() => {
    if (!isOpen) return
    updateCoords()

    const handleDown = (e: MouseEvent | globalThis.MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.cs-row-actions-dropdown-panel') &&
        !(e.target as HTMLElement).closest('.cs-row-actions-trigger')) {
        setIsOpen(null)
      }
    }
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)

    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
  }, [isOpen, updateCoords, setIsOpen])

  const menu = isOpen && coords && typeof document !== 'undefined' ? createPortal(
    <div
      className="cs-row-actions-dropdown-panel fixed z-[9999] w-40 overflow-hidden rounded-xl border border-slate-500/25 bg-[#172033] p-1.5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset] animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: coords.top - 6,
        left: coords.left,
        transform: 'translate(-100%, -100%)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onView(monitor.id)
          setIsOpen(null)
        }}
        className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
      >
        <Eye className="h-3.5 w-3.5 text-slate-500 transition-colors group-hover:text-zinc-200" />
        View details
      </button>

      <button
        disabled={isPending}
        onClick={handleToggleActive}
        className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
      >
        {isPaused ? (
          <>
            <Play className="h-3.5 w-3.5 text-emerald-400/80 transition-colors group-hover:text-emerald-400" />
            Resume
          </>
        ) : (
          <>
            <Pause className="h-3.5 w-3.5 text-amber-500/80 transition-colors group-hover:text-amber-400" />
            Pause
          </>
        )}
      </button>

      <button
        onClick={() => {
          router.push(`/dashboard/monitors/${monitor.id}?tab=settings`)
          setIsOpen(null)
        }}
        className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
      >
        <Pencil className="h-3.5 w-3.5 text-slate-500 transition-colors group-hover:text-zinc-200" />
        Edit
      </button>

      <div className="my-1.5 border-t border-slate-600/30" />

      <button
        onClick={() => {
          onDelete(monitor.id)
          setIsOpen(null)
        }}
        className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-500/70 transition-colors group-hover:text-red-400" />
        Remove
      </button>
    </div>,
    document.body
  ) : null

  return (
    <div className="relative flex items-center justify-end">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(isOpen ? null : monitor.id)
        }}
        className="cs-row-actions-trigger flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-500 transition-all hover:border-white/10 hover:bg-white/[0.07] hover:text-white active:scale-95"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {menu}
    </div>
  )
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({
  delay = 0,
  includeHit24hAvg = true,
}: {
  delay?: number
  includeHit24hAvg?: boolean
}) {
  return (
    <tr
      style={{ animationDelay: `${delay}ms` }}
      className="animate-[cs-fade-in_0.22s_ease-out_both] border-b border-border/20"
      aria-hidden="true"
    >
      <td className="cs-table-compact-td !py-3">
        <div className="flex flex-col gap-[5px]">
          <div className="cs-skeleton h-3.5 w-32" />
          <div className="cs-skeleton h-2.5 w-48" />
        </div>
      </td>
      <td className="cs-table-compact-td !py-3">
        <div className="flex flex-col gap-[5px]">
          <div className="cs-skeleton h-3.5 w-11" />
          <div className="cs-skeleton h-2.5 w-8" />
        </div>
      </td>
      <td className="cs-table-compact-td !py-3">
        <div className="flex items-center gap-2.5">
          <div className="cs-skeleton h-3.5 w-11" />
          <div className="cs-skeleton h-[18px] w-[60px]" />
        </div>
      </td>
      <td className="cs-table-compact-td !py-3">
        <div className="cs-skeleton h-5 w-14 rounded-full" />
      </td>
      {includeHit24hAvg && (
        <td className="cs-table-compact-td !py-3">
          <div className="flex flex-col gap-[5px]">
            <div className="cs-skeleton h-3.5 w-11" />
            <div className="cs-skeleton h-2.5 w-8" />
          </div>
        </td>
      )}
      <td className="cs-table-compact-td !py-3">
        <div className="flex justify-end">
          <div className="cs-skeleton h-2.5 w-14" />
        </div>
      </td>
      <td className="cs-table-compact-td !py-3">
        <div className="flex justify-end">
          <div className="cs-skeleton h-2.5 w-10" />
        </div>
      </td>
      <td className="cs-table-compact-td !py-3" />
    </tr>
  )
}

// ─── Column header help text ──────────────────────────────────────────────────

const HEADER_HELP: Record<string, string> = {
  monitor: 'The monitored application and URL. Click to view detailed diagnostics.',
  ttfbNow: 'Latency from the most recent check. Lower is better.',
  avgTtfb24h: 'Average latency over the last 24 hours (P50).',
  cacheHit: 'Percentage of requests served from the CDN in the latest check. Higher is better.',
  hit24hAvg: 'Average cache efficiency over the last 24 hours.',
  regions: 'Latency breakdown across geographic regions. "Clear" means no slow or failing regions.',
  lastCheck: 'Time elapsed since the last data update.',
}

// ─── Column definitions ───────────────────────────────────────────────────────

function buildMonitorColumns(
  monitorWidthPct: number,
  includeHit24hAvg: boolean,
  onDelete: (id: string) => void,
  onView: (id: string) => void,
  activeDropdownId: string | null,
  setActiveDropdownId: (id: string | null) => void,
  onOptimisticToggle: (id: string, status: 'active' | 'paused') => void,
) {
  const col = createColumnHelper<Monitor>()

  const hit24hAvgColumn = col.accessor('cacheHitAvg24h', {
    id: 'cacheHitAvg24h',
    header: () => <MonitorsThTooltip label="Hit 24h Avg" description={HEADER_HELP.hit24hAvg} />,
    size: 10,
    enableSorting: true,
    cell: ({ getValue, row }) => {
      const pct = getValue()
      const m = row.original
      const displayLabel = getCacheDisplayLabel(m.cacheStatusCurrent)
      const isIntentional = isCacheBypass(m.cacheStatusCurrent) && displayLabel !== 'MISS' && displayLabel !== 'HIT'
      if (pct === null || (Math.round(Number(pct)) === 0 && isIntentional)) {
        const displayLabel = getCacheDisplayLabel(m.cacheStatusCurrent)
        return (
          <div className="flex flex-col gap-[3px]">
            <span className="text-[10px] font-black uppercase text-zinc-500/90 tabular-nums">
              {displayLabel}
            </span>
          </div>
        )
      }
      const tier = getCacheHitTier(Number(pct))
      const textClass =
        tier === 'high' ? 'text-emerald-400'
          : tier === 'mid' ? 'text-amber-400'
            : 'text-metric-bad'
      return (
        <div className="flex flex-col gap-[3px]">
          <span className={`text-[13px] font-black tabular-nums leading-none ${textClass}`}>
            {Number(pct).toFixed(1)}%
          </span>
          <DeltaChip value={row.original.cacheHitDelta} />
        </div>
      )
    },
  })

  return [
    col.accessor('name', {
      id: 'monitor',
      header: () => <MonitorsThTooltip label="Monitor" description={HEADER_HELP.monitor} />,
      size: monitorWidthPct,
      enableSorting: true,
      cell: ({ row }) => {
        const m = row.original
        const isActive = m.status === 'active'
        return (
          <div className="flex min-w-0 flex-col gap-[3px]">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-black tracking-tight text-white/90 transition-colors duration-150 group-hover/row:text-white">
                {m.name}
              </span>
              {(() => {
                const { freshness } = formatRelativeTime(m.lastCheckedAt)
                const hasNeverBeenChecked = m.lastCheckedAt.getTime() === 0
                const isDown = isActive && m.totalRegionCount > 0 && m.errorRegionCount >= m.totalRegionCount
                const isDegraded = isActive && m.errorRegionCount > 0 && !isDown

                if (isActive && hasNeverBeenChecked) {
                  return (
                    <span
                      className="cs-badge shrink-0 !gap-1 !px-1.5 !py-0 !text-[8px] !font-black"
                      style={{
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        color: '#38bdf8',
                        borderColor: 'rgba(56, 189, 248, 0.2)',
                      }}
                    >
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
                      </span>
                      ANALYZING
                    </span>
                  )
                }

                if (isDown) {
                  return (
                    <span className="cs-badge cs-badge-danger shrink-0 !gap-1 !px-2 !py-0.5 !text-[8.5px] !font-bold tracking-wider uppercase">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
                      </span>
                      DOWN
                    </span>
                  )
                }
                if (isDegraded) {
                  return (
                    <span className="cs-badge cs-badge-danger shrink-0 !gap-1 !px-2 !py-0.5 !text-[8.5px] !font-bold tracking-wider uppercase">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
                      </span>
                      DEGRADED
                    </span>
                  )
                }
                // Show actual sync status instead of misleading "Active" when data is old
                if (isActive && freshness === 'offline' && !hasNeverBeenChecked) {
                  return (
                    <span className="cs-badge cs-badge-danger shrink-0 !gap-1 !px-2 !py-0.5 !text-[8.5px] !font-bold tracking-wider uppercase">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
                      </span>
                      Offline
                    </span>
                  )
                }
                if (isActive && freshness === 'stale') {
                  return (
                    <span className="cs-badge cs-badge-warning shrink-0 !gap-1 !px-2 !py-0.5 !text-[8.5px] !font-bold tracking-wider uppercase">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
                      </span>
                      Stale
                    </span>
                  )
                }
                if (isActive) {
                  return (
                    <span className="cs-badge cs-badge-success shrink-0 !gap-1.5 !px-2 !py-0.5 !text-[8.5px] !font-bold tracking-wider uppercase">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </span>
                      Active
                    </span>
                  )
                }
                return (
                  <span className="cs-badge cs-badge-warning shrink-0 !px-2 !py-0.5 !text-[8.5px] !font-bold tracking-wider uppercase">
                    Paused
                  </span>
                )
              })()}

              {m.isWafBlocked && (
                <PremiumTooltip content="Security interference (WAF) detected in multiple regions. Latency metrics reflect filtering speed, not site performance.">
                  <span className="cs-badge shrink-0 !gap-1.5 !px-2 !py-0.5 !text-[8.5px] !font-bold tracking-wider uppercase"
                    style={{
                      backgroundColor: 'rgba(249, 115, 22, 0.1)',
                      color: '#fb923c',
                      borderColor: 'rgba(249, 115, 22, 0.2)',
                    }}
                  >
                    <ShieldAlert className="h-2.5 w-2.5 text-orange-400" />
                    WAF Active
                  </span>
                </PremiumTooltip>
              )}
            </div>
            <PremiumTooltip
              content={
                <p className="break-all font-mono text-[11px] font-normal leading-snug tracking-normal text-zinc-200">
                  {m.url}
                </p>
              }
              position="top-left"
              direction="top"
            >
              <span className="max-w-[220px] cursor-default truncate font-mono text-[10.5px] font-medium text-zinc-400 transition-colors duration-150 group-hover/row:text-zinc-300">
                {m.url.replace(/^https?:\/\//, '')}
              </span>
            </PremiumTooltip>
          </div>
        )
      },
    }),

    col.accessor('ttfbCurrent', {
      header: () => <MonitorsThTooltip label="TTFB Now" description={HEADER_HELP.ttfbNow} />,
      size: 10,
      enableSorting: true,
      sortingFn: (rowA, rowB, columnId) => {
        const m1 = rowA.original
        const m2 = rowB.original
        const getWeight = (m: Monitor) => {
          const isDown = m.status === 'active' && m.totalRegionCount > 0 && m.errorRegionCount >= m.totalRegionCount
          const isAnalyzing = m.status === 'active' && m.lastCheckedAt.getTime() === 0
          if (isDown) return 1000000
          if (isAnalyzing) return 999999
          return m.ttfbCurrent
        }
        const a = getWeight(m1)
        const b = getWeight(m2)
        if (a !== b) return a - b
        return monitorHealthScore(m2) - monitorHealthScore(m1)
      },
      cell: ({ getValue, row }) => {
        const ms = getValue()
        const m = row.original
        const isDown = m.totalRegionCount > 0 && m.errorRegionCount >= m.totalRegionCount
        if (isDown) {
          return (
            <PremiumTooltip content="Site unreachable — connection failed in all regions" position="top-center" direction="top">
              <span className="text-[13px] font-black leading-none text-red-400">—</span>
            </PremiumTooltip>
          )
        }
        if (m.lastCheckedAt.getTime() === 0) {
          return (
            <span className="text-[13px] font-black leading-none text-zinc-500/70">—</span>
          )
        }
        return (
          <div className="flex flex-col gap-[3px]">
            <PremiumTooltip
              content={m.isWafBlocked ? "WAF detected: this latency reflects security filtering, not page load speed." : getTtfbTooltip(ms, 'monitor')}
              position="top-center"
              direction="top"
            >
              <div className="flex items-center gap-1.5">
                {m.isWafBlocked && <ShieldAlert className="h-3.5 w-3.5 text-orange-400" />}
                <span className={`text-[14px] font-black leading-none tabular-nums ${m.isWafBlocked ? 'text-zinc-500' : ttfbClass(ms)}`}>
                  {ms}<span className="ml-0.5 text-[9px] font-bold opacity-[0.55]">ms</span>
                </span>
              </div>
            </PremiumTooltip>
            <DeltaChip value={row.original.ttfbCurrentDelta} inverted />
          </div>
        )
      },
    }),

    col.accessor('ttfbAvg24h', {
      header: () => <MonitorsThTooltip label="Avg TTFB 24h" description={HEADER_HELP.avgTtfb24h} />,
      size: 13,
      enableSorting: true,
      cell: ({ getValue, row }) => {
        const ms = getValue()
        const m = row.original
        if (m.lastCheckedAt.getTime() === 0) {
          return (
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-bold text-zinc-500/70">—</span>
            </div>
          )
        }
        if (ms === 0) {
          return (
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] font-black leading-none text-red-400">—</span>
            </div>
          )
        }
        return (
          <div className="flex items-center gap-2.5">
            <span className={`text-[13px] font-black tabular-nums leading-none ${m.isWafBlocked ? 'text-zinc-500' : ttfbClass(ms)}`}>
              {ms}<span className="ml-0.5 text-[9px] font-bold opacity-[0.55]">ms</span>
            </span>
            <Sparkline data={row.original.ttfbSparkline} delta={row.original.ttfbCurrentDelta} />
          </div>
        )
      },
    }),

    col.accessor('cacheHitCurrent', {
      header: () => <MonitorsThTooltip label="Cache Hit" description={HEADER_HELP.cacheHit} />,
      size: 10,
      enableSorting: true,
      cell: ({ getValue, row }) => <CacheHitBadge pct={getValue()} status={row.original.cacheStatusCurrent} />,
    }),

    ...(includeHit24hAvg ? [hit24hAvgColumn] : []),

    col.accessor('slowRegionCount', {
      header: () => (
        <MonitorsThTooltip
          label={
            <span className="inline-flex items-center gap-0.5">
              Regions
              <span className="ml-0.5 inline-block h-1 w-1 rounded-full bg-zinc-500 opacity-70" aria-hidden />
            </span>
          }
          description={HEADER_HELP.regions}
        />
      ),
      size: 15,
      enableSorting: true,
      cell: ({ row }) => {
        const m = row.original
        const errorOnes = m.regions.filter((r) => r.isError)
        const slowOnes = m.regions.filter((r) => r.isSlow)
        const hasIssues = errorOnes.length > 0 || slowOnes.length > 0
        const isNew = m.status === 'active' && m.lastCheckedAt.getTime() === 0

        if (isNew) {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 transition-colors duration-150 group-hover/row:text-zinc-400">
                Waiting...
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500/40 ring-1 ring-sky-500/20 animate-pulse" />
            </div>
          )
        }

        return (
          <div className="flex flex-col gap-1 pl-4">
            <div className="flex items-center gap-1.5">
              <Globe className={`h-3 w-3 ${hasIssues ? (errorOnes.length > 0 ? 'text-red-400/50' : 'text-amber-400/50') : 'text-emerald-500/40'}`} />
              <span className={`text-[11px] font-black uppercase tracking-tight ${m.isWafBlocked ? 'text-orange-400/80' : (hasIssues ? (errorOnes.length > 0 ? 'text-red-400' : 'text-amber-400') : 'text-zinc-400 group-hover/row:text-zinc-300')}`}>
                {m.isWafBlocked
                  ? 'WAF DETECTED'
                  : (hasIssues
                    ? (errorOnes.length > 0 ? `${errorOnes.length} FAILING` : `${slowOnes.length} SLOW`)
                    : '8 REGIONS OK')}
              </span>
            </div>

            {/* Segmented health strip: Using a visible 'track' to prevent the choppy/broken look */}
            <div className="flex items-center gap-[2px] pl-[18px]">
              {m.regions.map((r) => {
                const status = r.isError ? 'error' : r.isSlow ? 'slow' : 'healthy'
                const bgColor = status === 'error' ? '#f43f5e' : status === 'slow' ? '#F59E0B' : '#22FF88'

                return (
                  <PremiumTooltip
                    key={r.code}
                    content={
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm shrink-0">{r.flag}</span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-black uppercase tracking-tight text-[11px] leading-tight text-white">{r.label}</span>
                          <span className="text-[10px] text-zinc-400 font-semibold leading-tight">
                            {status === 'error' ? 'Connection failed' : status === 'slow' ? 'Slow latency' : 'Healthy performance'}
                          </span>
                        </div>
                      </div>
                    }
                    position="top-center"
                  >
                    <div
                      className="h-2 w-3 rounded-[1px] transition-all duration-300"
                      style={{
                        backgroundColor: bgColor,
                        opacity: status === 'healthy' ? 0.4 : 1,
                        boxShadow: status === 'error' ? '0 0 12px rgba(244, 63, 94, 0.5)' : status === 'slow' ? '0 0 12px rgba(245, 158, 11, 0.3)' : 'none'
                      }}
                    />
                  </PremiumTooltip>
                )
              })}
            </div>
          </div>
        )
      },
    }),

    col.accessor('lastCheckedAt', {
      header: () => <MonitorsThTooltip label="Last Check" description={HEADER_HELP.lastCheck} />,
      size: 9,
      enableSorting: true,
      sortingFn: (a, b) =>
        a.original.lastCheckedAt.getTime() - b.original.lastCheckedAt.getTime(),
      cell: ({ getValue, row }) => {
        const at = getValue()
        const m = row.original
        const { text, isRecent, freshness } = formatRelativeTime(at)
        const isFullyDown = m.totalRegionCount > 0 && m.errorRegionCount >= m.totalRegionCount
        const colorClass =
          isFullyDown ? 'text-red-400'
            : freshness === 'offline' ? 'text-red-400'
              : freshness === 'stale' ? 'text-amber-400'
                : isRecent ? 'text-emerald-400'
                  : 'text-zinc-400 group-hover/row:text-zinc-300'
        const tooltipContent = isFullyDown
          ? `Site is unreachable — connection failed in all ${m.totalRegionCount} regions`
          : m.errorRegionCount > 0
            ? `${m.errorRegionCount} of ${m.totalRegionCount} regions reported a connection error`
            : freshness === 'offline'
              ? `Last check on ${at.toLocaleDateString()} — no data today`
              : freshness === 'stale'
                ? `Last check over 1h ago at ${at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })}`
                : `Last check at ${at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })}.`
        return (
          <PremiumTooltip
            content={tooltipContent}
            position="top-right"
            direction="top"
          >
            <span
              className={`block cursor-default text-right text-[11px] font-semibold tabular-nums transition-colors duration-150 ${colorClass}`}
            >
              {text}
            </span>
          </PremiumTooltip>
        )
      },
    }),

    col.display({
      id: 'actions',
      header: '',
      size: 6,
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original
        const isPaused = m.status === 'paused'
        return (
          <RowActionsDropdown
            monitor={m}
            onDelete={onDelete}
            onView={onView}
            isOpen={activeDropdownId === m.id}
            setIsOpen={setActiveDropdownId}
            onOptimisticToggle={onOptimisticToggle}
          />
        )
      },
    }),
  ]
}

// ─── MonitorsTable ────────────────────────────────────────────────────────────

const SKELETON_COUNT = 5

interface MonitorsTableProps {
  monitors: Monitor[]
  isLoading?: boolean
  /** True during background refetches — shows a subtle sync dot, not skeletons. */
  isFetching?: boolean
  isError?: boolean
  onRetry?: () => void
  onClearFilters?: () => void
  searchQuery?: string
  activeFilter?: MonitorQuickFilterId
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  optimisticStatus: Record<string, 'active' | 'paused'>
  onOptimisticToggle: (id: string, status: 'active' | 'paused') => void
}

export function MonitorsTable({
  monitors,
  isLoading = false,
  isFetching = false,
  isError = false,
  onRetry,
  onClearFilters,
  searchQuery = '',
  activeFilter = 'all',
  sorting,
  onSortingChange,
  optimisticStatus,
  onOptimisticToggle,
}: MonitorsTableProps) {
  const router = useRouter()
  const [deleteMonitorId, setDeleteMonitorId] = useState<string | null>(null)
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null)

  const displayMonitors = useMemo(() => {
    return monitors.map((m) =>
      optimisticStatus[m.id] ? { ...m, status: optimisticStatus[m.id] } : m,
    )
  }, [monitors, optimisticStatus])

  const filteredData = useMemo(
    () =>
      displayMonitors.filter(
        (m) => monitorMatchesSearch(m, searchQuery) && monitorMatchesQuickFilter(m, activeFilter),
      ),
    [displayMonitors, searchQuery, activeFilter],
  )

  const showHit24hAvgColumn = useMemo(() => {
    if (displayMonitors.length === 0) return true
    return displayMonitors.some((m) => m.cacheHitAvg24h !== null)
  }, [displayMonitors])

  const monitorWidthPct = showHit24hAvgColumn ? 27 : 37

  const columns = useMemo(
    () => buildMonitorColumns(
      monitorWidthPct,
      showHit24hAvgColumn,
      (id) => setDeleteMonitorId(id),
      (id) => router.push(`/dashboard/monitors/${id}`),
      activeDropdownId,
      setActiveDropdownId,
      onOptimisticToggle
    ),
    [monitorWidthPct, showHit24hAvgColumn, router, activeDropdownId, onOptimisticToggle],
  )

  useEffect(() => {
    // Only auto-reset if the column actually disappeared while it was being sorted
    if (!showHit24hAvgColumn && sorting.length > 0 && sorting[0].id === 'cacheHitAvg24h') {
      onSortingChange([{ id: 'ttfbCurrent', desc: true }])
    }
  }, [showHit24hAvgColumn, onSortingChange]) // Removed 'sorting' from dependencies to avoid loop

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    enableMultiSort: false,
    autoResetPageIndex: false,
  })

  const handleRowClick = useCallback(
    (monitorId: string) => router.push(`/dashboard/monitors/${monitorId}`),
    [router],
  )

  const rows = table.getRowModel().rows
  const tbodyKey = `${activeFilter}:${searchQuery}`
  const hasActiveFilters = searchQuery.trim() !== '' || activeFilter !== 'all'

  return (
    <div className="relative rounded-xl">
      <div className={BRAND_TABLE_SURFACE_GRADIENT} aria-hidden />
      <div className={`${MONITOR_TABLE.innerScroll} cs-dropdown-scroll`}>
        <table className={`w-full table-fixed border-collapse ${MONITOR_TABLE.transition}`}>

          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className={MONITOR_TABLE.theadRow}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const isRightAligned = header.column.id === 'lastCheckedAt'
                  return (
                    <th
                      key={header.id}
                      style={{ width: `${header.column.columnDef.size}%` }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      aria-sort={
                        header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      className={[
                        'cs-table-compact-th !py-3 !text-[9px] !font-black !tracking-[0.12em] !text-zinc-500',
                        'select-none whitespace-nowrap transition-colors duration-150',
                        canSort ? 'cursor-pointer hover:text-zinc-300' : '',
                        isRightAligned ? 'text-right pr-4' : 'pl-4',
                        header.column.getIsSorted() ? '!text-zinc-300' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {header.isPlaceholder ? null : (
                        <span className="group/th inline-flex items-center">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort ? <SortIcon isSorted={header.column.getIsSorted()} /> : null}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          {/* Loading skeleton */}
          {isLoading && (
            <tbody aria-label="Loading monitors…">
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <SkeletonRow
                  key={i}
                  delay={i * 40}
                  includeHit24hAvg={showHit24hAvgColumn}
                />
              ))}
            </tbody>
          )}

          {/* Data rows */}
          {!isLoading && !isError && (
            <tbody key={tbodyKey}>
              {rows.map((row, i) => {
                const isPaused = row.original.status === 'paused'
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`View details for ${row.original.name}`}
                    onClick={() => handleRowClick(row.original.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleRowClick(row.original.id)
                      }
                    }}
                    style={{ animationDelay: `${Math.min(i, 7) * 25}ms` }}
                    className={[
                      MONITOR_TABLE.tbodyRow,
                      'group/row cursor-pointer',
                      'animate-[cs-fade-in_0.22s_ease-out_both]',
                      'active:bg-white/[0.03]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/15',
                      isPaused ? 'opacity-40 saturate-0 hover:opacity-60 hover:saturate-50' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="cs-table-compact-td !py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          )}
        </table>

        {deleteMonitorId && (
          <MonitorDeleteConfirm
            monitorId={deleteMonitorId}
            onClose={() => setDeleteMonitorId(null)}
          />
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div
            className="flex min-h-[220px] flex-col items-center justify-center gap-4 border-t border-border/40 py-14"
            role="alert"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] shadow-[0_0_24px_-8px_rgba(244,63,94,0.12)]">
              <AlertTriangle className="h-5 w-5 text-rose-400" aria-hidden />
            </div>
            <div className="max-w-xs text-center">
              <p className="text-[13px] font-black tracking-tight text-zinc-400">
                Failed to load monitors
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                Something went wrong while fetching your data. Your monitors are still running.
              </p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-[11px] font-bold text-zinc-400 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.07] hover:text-zinc-200 active:scale-95"
              >
                <RefreshCw className="h-3 w-3" aria-hidden />
                Try again
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && rows.length === 0 && (
          <div
            className="flex min-h-[220px] flex-col items-center justify-center gap-4 border-t border-border/40 py-14"
            role="status"
            aria-live="polite"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.025] shadow-[0_0_24px_-8px_rgba(52,211,153,0.08)]">
              <Search className="h-5 w-5 text-zinc-600" aria-hidden />
            </div>
            <div className="max-w-xs text-center">
              <p className="text-[13px] font-black tracking-tight text-zinc-400">
                No monitors match
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                {searchQuery.trim() ? (
                  <>
                    Nothing matched{' '}
                    <span className="font-bold text-zinc-500">&quot;{searchQuery.trim()}&quot;</span>.
                    Try another name or URL.
                  </>
                ) : (
                  'No monitors match this filter. Choose another chip above.'
                )}
              </p>
            </div>
            {hasActiveFilters && onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-[11px] font-bold text-zinc-400 transition-all duration-200 hover:border-emerald-500/25 hover:bg-emerald-500/[0.06] hover:text-emerald-300 active:scale-95"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between border-t border-border/40 px-4 py-2.5"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="inline-flex items-center gap-2 text-[9.5px] font-black uppercase tracking-[0.12em] text-zinc-500">
          {isLoading ? (
            <span className="text-zinc-600">Loading…</span>
          ) : (
            <>
              {rows.length === 1 ? '1 MONITOR' : `${rows.length} MONITORS`}
              {rows.length < monitors.length && (
                <span className="ml-1.5 font-medium normal-case tracking-normal text-zinc-500">
                  of {monitors.length}
                </span>
              )}
            </>
          )}
          {/* Background sync indicator — visible only during refetch after initial load */}
          {isFetching && !isLoading && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500/60 ring-2 ring-emerald-500/20 animate-pulse"
              title="Syncing…"
              aria-label="Syncing data"
            />
          )}
        </span>
        <span className="text-[9px] font-medium text-zinc-500">
          ↵ or click row · open details
        </span>
      </div>
    </div>
  )
}
