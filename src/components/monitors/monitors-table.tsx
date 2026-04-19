'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type OnChangeFn,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pause, Play, Pencil, Search } from 'lucide-react'
import {
  type Monitor,
  type MonitorQuickFilterId,
  getTtfbTier,
  getCacheHitTier,
  monitorMatchesQuickFilter,
  monitorMatchesSearch,
} from '@/types/monitor'
import { PremiumTooltip } from '@/components/premium-tooltip'
import {
  BRAND_TABLE_SURFACE_GRADIENT,
  MONITOR_TABLE,
} from '@/app/dashboard/monitors/[id]/monitor-table-styles'

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_CLOCK = new Date('2026-04-19T15:00:00.000Z')
const MOCK_CLOCK_MS = MOCK_CLOCK.getTime()

const ago = (seconds: number) => new Date(MOCK_CLOCK_MS - seconds * 1000)

function hash01(seed: string, i: number): number {
  let h = 2166136261
  const s = `${seed}:${i}`
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 2 ** 32
}

function spark(base: number, seed: string, points = 24): number[] {
  return Array.from({ length: points }, (_, i) => {
    const noise = (hash01(seed, i) - 0.5) * base * 0.4
    const trend = Math.sin(i / 4) * base * 0.1
    return Math.max(10, base + noise + trend)
  })
}

const MOCK_MONITORS: Monitor[] = [
  {
    id: 'mon_microsoft',
    name: 'microsoft.com',
    url: 'https://www.microsoft.com',
    status: 'active',
    ttfbCurrent: 142,
    ttfbCurrentDelta: -8.2,
    ttfbAvg24h: 168,
    ttfbSparkline: spark(168, 'mon_microsoft'),
    cacheHitCurrent: 98.2,
    cacheHitAvg24h: 96.8,
    cacheHitDelta: 1.4,
    regions: [
      { code: 'gru', flag: '🇧🇷', label: 'SP', isSlow: false },
      { code: 'iad', flag: '🇺🇸', label: 'US-E', isSlow: false },
      { code: 'lhr', flag: '🇬🇧', label: 'LHR', isSlow: false },
      { code: 'nrt', flag: '🇯🇵', label: 'NRT', isSlow: false },
    ],
    slowRegionCount: 0,
    totalRegionCount: 8,
    lastCheckedAt: ago(22),
  },
  {
    id: 'mon_apple',
    name: 'apple.com',
    url: 'https://www.apple.com',
    status: 'active',
    ttfbCurrent: 89,
    ttfbCurrentDelta: -3.1,
    ttfbAvg24h: 95,
    ttfbSparkline: spark(95, 'mon_apple'),
    cacheHitCurrent: 99.5,
    cacheHitAvg24h: 99.1,
    cacheHitDelta: 0.4,
    regions: [
      { code: 'gru', flag: '🇧🇷', label: 'SP', isSlow: false },
      { code: 'iad', flag: '🇺🇸', label: 'US-E', isSlow: false },
    ],
    slowRegionCount: 0,
    totalRegionCount: 8,
    lastCheckedAt: ago(8),
  },
  {
    id: 'mon_nytimes',
    name: 'nytimes.com',
    url: 'https://www.nytimes.com',
    status: 'active',
    ttfbCurrent: 284,
    ttfbCurrentDelta: 12.5,
    ttfbAvg24h: 241,
    ttfbSparkline: spark(241, 'mon_nytimes'),
    cacheHitCurrent: 74.1,
    cacheHitAvg24h: 78.3,
    cacheHitDelta: -4.2,
    regions: [
      { code: 'gru', flag: '🇧🇷', label: 'SP', isSlow: true },
      { code: 'syd', flag: '🇦🇺', label: 'SYD', isSlow: true },
    ],
    slowRegionCount: 2,
    totalRegionCount: 8,
    lastCheckedAt: ago(51),
  },
  {
    id: 'mon_govbr',
    name: 'gov.br',
    url: 'https://www.gov.br',
    status: 'active',
    ttfbCurrent: 412,
    ttfbCurrentDelta: 28.7,
    ttfbAvg24h: 388,
    ttfbSparkline: spark(388, 'mon_govbr'),
    cacheHitCurrent: 52.4,
    cacheHitAvg24h: 58.1,
    cacheHitDelta: -5.7,
    regions: [
      { code: 'gru', flag: '🇧🇷', label: 'SP', isSlow: true },
      { code: 'iad', flag: '🇺🇸', label: 'US-E', isSlow: true },
      { code: 'lhr', flag: '🇬🇧', label: 'LHR', isSlow: true },
    ],
    slowRegionCount: 3,
    totalRegionCount: 8,
    lastCheckedAt: ago(37),
  },
  {
    id: 'mon_github',
    name: 'github.com',
    url: 'https://github.com',
    status: 'active',
    ttfbCurrent: 198,
    ttfbCurrentDelta: 4.3,
    ttfbAvg24h: 187,
    ttfbSparkline: spark(187, 'mon_github'),
    cacheHitCurrent: 88.7,
    cacheHitAvg24h: 86.2,
    cacheHitDelta: 2.5,
    regions: [
      { code: 'gru', flag: '🇧🇷', label: 'SP', isSlow: true },
      { code: 'nrt', flag: '🇯🇵', label: 'NRT', isSlow: false },
    ],
    slowRegionCount: 1,
    totalRegionCount: 8,
    lastCheckedAt: ago(15),
  },
  {
    id: 'mon_cloudflare',
    name: 'cloudflare.com',
    url: 'https://www.cloudflare.com',
    status: 'active',
    ttfbCurrent: 61,
    ttfbCurrentDelta: -1.8,
    ttfbAvg24h: 64,
    ttfbSparkline: spark(64, 'mon_cloudflare'),
    cacheHitCurrent: 99.9,
    cacheHitAvg24h: 99.7,
    cacheHitDelta: 0.2,
    regions: [
      { code: 'gru', flag: '🇧🇷', label: 'SP', isSlow: false },
      { code: 'iad', flag: '🇺🇸', label: 'US-E', isSlow: false },
    ],
    slowRegionCount: 0,
    totalRegionCount: 8,
    lastCheckedAt: ago(5),
  },
  {
    id: 'mon_netflix',
    name: 'netflix.com',
    url: 'https://www.netflix.com',
    status: 'paused',
    ttfbCurrent: 155,
    ttfbCurrentDelta: 2.1,
    ttfbAvg24h: 149,
    ttfbSparkline: spark(149, 'mon_netflix'),
    cacheHitCurrent: 91.3,
    cacheHitAvg24h: 90.8,
    cacheHitDelta: 0.5,
    regions: [
      { code: 'gru', flag: '🇧🇷', label: 'SP', isSlow: false },
    ],
    slowRegionCount: 0,
    totalRegionCount: 8,
    lastCheckedAt: ago(7200),
  },
  {
    id: 'mon_vercel',
    name: 'vercel.com',
    url: 'https://vercel.com',
    status: 'active',
    ttfbCurrent: 112,
    ttfbCurrentDelta: -5.4,
    ttfbAvg24h: 118,
    ttfbSparkline: spark(118, 'mon_vercel'),
    cacheHitCurrent: 95.8,
    cacheHitAvg24h: 94.1,
    cacheHitDelta: 1.7,
    regions: [
      { code: 'gru', flag: '🇧🇷', label: 'SP', isSlow: false },
      { code: 'iad', flag: '🇺🇸', label: 'US-E', isSlow: false },
    ],
    slowRegionCount: 0,
    totalRegionCount: 8,
    lastCheckedAt: ago(29),
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TTFB_CLASS: Record<string, string> = {
  fast: 'text-metric-ttfb-fast',
  med:  'text-metric-ttfb-med',
  slow: 'text-metric-ttfb-slow',
}

const TTFB_LABEL: Record<string, string> = {
  fast: 'Fast — under 150 ms',
  med:  'Moderate — 150–300 ms',
  slow: 'Slow — over 300 ms',
}

function ttfbClass(ms: number) { return TTFB_CLASS[getTtfbTier(ms)] }
function ttfbLabel(ms: number) { return `${TTFB_LABEL[getTtfbTier(ms)]}` }

function formatRelativeTime(date: Date): { text: string; isRecent: boolean } {
  const diffS = Math.floor((MOCK_CLOCK_MS - date.getTime()) / 1000)
  if (diffS < 60) return { text: diffS < 5 ? 'just now' : `${diffS}s ago`, isRecent: true }
  const diffM = Math.floor(diffS / 60)
  if (diffM < 60) return { text: `${diffM}m ago`, isRecent: diffM < 3 }
  const diffH = Math.floor(diffM / 60)
  return { text: `${diffH}h ago`, isRecent: false }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ data, delta }: { data: number[]; delta: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 60
  const H = 18

  // Smooth polyline using midpoint interpolation for a soft curve effect
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W
      const y = H - ((v - min) / range) * (H - 3) - 1.5
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  /** Alinhado a `--metric-slow` (globals); SVG não herda utilities Tailwind. */
  const color = delta < -1 ? '#34d399' : delta > 1 ? '#f43f5e' : '#f59e0b'
  const glowClass =
    delta < -1
      ? 'group-hover/row:[filter:drop-shadow(0_0_5px_rgba(52,211,153,0.55))]'
      : delta > 1
        ? 'group-hover/row:[filter:drop-shadow(0_0_5px_rgba(244,63,94,0.55))]'
        : 'group-hover/row:[filter:drop-shadow(0_0_5px_rgba(245,158,11,0.45))]'

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className={`shrink-0 opacity-85 transition-[filter,opacity] duration-300 ${glowClass}`}
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
  )
}

function CacheHitBadge({ pct }: { pct: number }) {
  const tier = getCacheHitTier(pct)
  if (tier === 'high') return <span className="cs-badge-cache-hit">{pct.toFixed(1)}%</span>
  if (tier === 'mid')  return <span className="cs-badge-cache-dynamic">{pct.toFixed(1)}%</span>
  return <span className="cs-badge-cache-miss">{pct.toFixed(1)}%</span>
}

// inverted=true: negative delta = improvement (TTFB going down is good)
function DeltaChip({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const improved = inverted ? value < 0 : value > 0
  const Icon = value < 0 ? ArrowDown : ArrowUp
  return (
    <span
      className={`inline-flex items-center gap-px text-[10px] font-black tabular-nums leading-none ${
        improved ? 'text-emerald-300' : 'text-metric-bad'
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

// ─── Column definitions ───────────────────────────────────────────────────────

const col = createColumnHelper<Monitor>()

const columns = [
  // 1. Monitor — name + url + status badge
  col.accessor('name', {
    id: 'monitor',
    header: 'Monitor',
    size: 27,
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
            {isActive ? (
              <span className="cs-badge cs-badge-success shrink-0 !gap-1 !px-1.5 !py-0 !text-[8px]">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Active
              </span>
            ) : (
              <span className="cs-badge cs-badge-warning shrink-0 !px-1.5 !py-0 !text-[8px]">
                Paused
              </span>
            )}
          </div>
          <span
            className="max-w-[220px] truncate font-mono text-[10px] text-zinc-500 transition-colors duration-150 group-hover/row:text-zinc-400"
            title={m.url}
          >
            {m.url.replace(/^https?:\/\//, '')}
          </span>
        </div>
      )
    },
  }),

  // 2. TTFB current + delta chip + tier tooltip
  col.accessor('ttfbCurrent', {
    header: 'TTFB Now',
    size: 10,
    enableSorting: true,
    cell: ({ getValue, row }) => {
      const ms = getValue()
      return (
        <div className="flex flex-col gap-[3px]">
          <PremiumTooltip
            content={
              <p className="text-[11px]">
                <span className="font-black text-white">{ms} ms</span>
                <span className="ml-1.5 text-zinc-400">{ttfbLabel(ms)}</span>
              </p>
            }
            position="bottom-left"
            direction="bottom"
          >
            <span className={`text-[14px] font-black leading-none tabular-nums ${ttfbClass(ms)}`}>
              {ms}<span className="ml-0.5 text-[9px] font-bold opacity-40">ms</span>
            </span>
          </PremiumTooltip>
          <DeltaChip value={row.original.ttfbCurrentDelta} inverted />
        </div>
      )
    },
  }),

  // 3. TTFB avg 24h + sparkline
  col.accessor('ttfbAvg24h', {
    header: 'Avg TTFB 24h',
    size: 13,
    enableSorting: true,
    cell: ({ getValue, row }) => {
      const ms = getValue()
      return (
        <div className="flex items-center gap-2.5">
          <span className={`text-[13px] font-black tabular-nums leading-none ${ttfbClass(ms)}`}>
            {ms}<span className="ml-0.5 text-[9px] font-bold opacity-40">ms</span>
          </span>
          <Sparkline data={row.original.ttfbSparkline} delta={row.original.ttfbCurrentDelta} />
        </div>
      )
    },
  }),

  // 4. Cache hit current — semantic badge
  col.accessor('cacheHitCurrent', {
    header: 'Cache Hit',
    size: 10,
    enableSorting: true,
    cell: ({ getValue }) => <CacheHitBadge pct={getValue()} />,
  }),

  // 5. Cache hit avg 24h + delta
  col.accessor('cacheHitAvg24h', {
    header: 'Hit 24h Avg',
    size: 10,
    enableSorting: true,
    cell: ({ getValue, row }) => {
      const pct = getValue()
      const tier = getCacheHitTier(pct)
      const textClass =
        tier === 'high' ? 'text-emerald-400'
        : tier === 'mid' ? 'text-amber-400'
        : 'text-metric-bad'
      return (
        <div className="flex flex-col gap-[3px]">
          <span className={`text-[13px] font-black tabular-nums leading-none ${textClass}`}>
            {pct.toFixed(1)}%
          </span>
          <DeltaChip value={row.original.cacheHitDelta} />
        </div>
      )
    },
  }),

  // 6. Regions — degraded region badges + count, or "All Clear" indicator
  col.accessor('slowRegionCount', {
    header: () => (
      <PremiumTooltip
        content={
          <div className="space-y-1 text-[11px]">
            <p className="font-black text-white">Degraded Regions</p>
            <p className="text-zinc-400">Regions where TTFB exceeds threshold. "All clear" means all monitored regions are healthy.</p>
          </div>
        }
        position="top-right"
        direction="top"
      >
        <span className="inline-flex items-center gap-0.5">
          Regions
          <span className="ml-0.5 inline-block h-1 w-1 rounded-full bg-zinc-600 opacity-60" />
        </span>
      </PremiumTooltip>
    ),
    size: 15,
    enableSorting: true,
    cell: ({ row }) => {
      const m = row.original
      if (m.slowRegionCount === 0) {
        return (
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 transition-colors duration-150 group-hover/row:text-zinc-500">
              All clear
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/40 ring-1 ring-emerald-500/20" />
          </div>
        )
      }
      const slowOnes = m.regions.filter((r) => r.isSlow)
      return (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {slowOnes.map((r) => (
            <span
              key={r.code}
              title={`${r.label} is degraded`}
              className="cs-badge cs-badge-warning !px-1 !py-[1px] !text-[8px]"
            >
              {r.flag} {r.label}
            </span>
          ))}
          <span className="text-[9px] font-bold tabular-nums text-zinc-600">
            {m.slowRegionCount}/{m.totalRegionCount}
          </span>
        </div>
      )
    },
  }),

  // 7. Last check — relative time, right-aligned
  col.accessor('lastCheckedAt', {
    header: 'Last Check',
    size: 9,
    enableSorting: true,
    sortingFn: (a, b) =>
      a.original.lastCheckedAt.getTime() - b.original.lastCheckedAt.getTime(),
    cell: ({ getValue }) => {
      const { text, isRecent } = formatRelativeTime(getValue())
      return (
        <span
          className={`block text-right text-[11px] font-bold tabular-nums transition-colors duration-150 ${
            isRecent ? 'text-emerald-400' : 'text-zinc-500 group-hover/row:text-zinc-400'
          }`}
        >
          {text}
        </span>
      )
    },
  }),

  // 8. Actions — revealed on row hover
  col.display({
    id: 'actions',
    header: '',
    size: 6,
    enableSorting: false,
    cell: ({ row }) => {
      const m = row.original
      const isPaused = m.status === 'paused'
      return (
        <div
          className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-200 group-hover/row:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn label="View details" href={`/dashboard/monitors/${m.id}`}>
            <Eye className="h-3 w-3" />
          </ActionBtn>
          <ActionBtn label={isPaused ? 'Resume monitor' : 'Pause monitor'}>
            {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </ActionBtn>
          <ActionBtn label="Edit monitor">
            <Pencil className="h-3 w-3" />
          </ActionBtn>
        </div>
      )
    },
  }),
]

// ─── ActionBtn ────────────────────────────────────────────────────────────────

function ActionBtn({
  children,
  label,
  href,
  onClick,
}: {
  children: React.ReactNode
  label: string
  href?: string
  onClick?: () => void
}) {
  const base =
    'flex h-[22px] w-[22px] items-center justify-center rounded border border-white/[0.06] bg-white/[0.02] text-zinc-500 transition-all duration-150 hover:border-white/10 hover:bg-white/[0.07] hover:text-white active:scale-95'
  if (href)
    return (
      <a href={href} aria-label={label} title={label} className={base}>
        {children}
      </a>
    )
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={base}>
      {children}
    </button>
  )
}

// ─── MonitorsTable ────────────────────────────────────────────────────────────

interface MonitorsTableProps {
  searchQuery?: string
  activeFilter?: MonitorQuickFilterId
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
}

export function MonitorsTable({
  searchQuery = '',
  activeFilter = 'all',
  sorting,
  onSortingChange,
}: MonitorsTableProps) {
  const router = useRouter()

  const filteredData = useMemo(() => {
    return MOCK_MONITORS.filter(
      (m) => monitorMatchesSearch(m, searchQuery) && monitorMatchesQuickFilter(m, activeFilter),
    )
  }, [searchQuery, activeFilter])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    enableMultiSort: false,
  })

  const handleRowClick = useCallback(
    (monitorId: string) => router.push(`/dashboard/monitors/${monitorId}`),
    [router],
  )

  const rows = table.getRowModel().rows

  // tbody key forces remount (and therefore stagger re-animation) on filter/search change
  const tbodyKey = `${activeFilter}:${searchQuery}`

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className={BRAND_TABLE_SURFACE_GRADIENT} aria-hidden />
      <div className={`${MONITOR_TABLE.innerScroll} cs-dropdown-scroll`}>
        <table className={`w-full border-collapse ${MONITOR_TABLE.transition}`}>

          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className={MONITOR_TABLE.theadRow}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const isRightAligned =
                    header.column.id === 'lastCheckedAt' ||
                    header.column.id === 'slowRegionCount'
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
                        'cs-table-compact-th !py-3 !text-[9px] !font-black !tracking-[0.12em] !text-zinc-600',
                        'select-none whitespace-nowrap transition-colors duration-150',
                        canSort ? 'cursor-pointer hover:text-zinc-300' : '',
                        isRightAligned ? 'text-right' : '',
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

          {/* tbody key triggers stagger re-animation on filter/search change */}
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
                  // Stagger fade-in — 25ms per row, max 8 rows visible
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
        </table>

        {/* Empty state */}
        {rows.length === 0 && (
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
                {searchQuery.trim()
                  ? <>Nothing matched <span className="font-bold text-zinc-500">"{searchQuery.trim()}"</span>. Try another name or URL.</>
                  : 'No monitors match this filter. Choose another chip above.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between border-t border-border/40 px-4 py-2.5"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="text-[9.5px] font-black uppercase tracking-[0.12em] text-zinc-600">
          {rows.length === 1 ? '1 MONITOR' : `${rows.length} MONITORS`}
          {rows.length < MOCK_MONITORS.length && (
            <span className="ml-1.5 font-medium normal-case tracking-normal text-zinc-700">
              of {MOCK_MONITORS.length}
            </span>
          )}
        </span>
        <span className="text-[9px] font-medium text-zinc-700">
          ↵ or click row · open details
        </span>
      </div>
    </div>
  )
}
