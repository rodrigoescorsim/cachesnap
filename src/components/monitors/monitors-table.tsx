'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pause, Play, Pencil } from 'lucide-react'
import { type Monitor, getTtfbTier, getCacheHitTier } from '@/types/monitor'

// ─── Mock data ────────────────────────────────────────────────────────────────

function spark(base: number, points = 24): number[] {
  return Array.from({ length: points }, (_, i) => {
    const noise = (Math.random() - 0.5) * base * 0.4
    const trend = Math.sin(i / 4) * base * 0.1
    return Math.max(10, base + noise + trend)
  })
}

const NOW = new Date()
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000)

const MOCK_MONITORS: Monitor[] = [
  {
    id: 'mon_microsoft',
    name: 'microsoft.com',
    url: 'https://www.microsoft.com',
    status: 'active',
    ttfbCurrent: 142,
    ttfbCurrentDelta: -8.2,
    ttfbAvg24h: 168,
    ttfbSparkline: spark(168),
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
    ttfbSparkline: spark(95),
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
    ttfbSparkline: spark(241),
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
    ttfbSparkline: spark(388),
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
    ttfbSparkline: spark(187),
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
    ttfbSparkline: spark(64),
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
    ttfbSparkline: spark(149),
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
    ttfbSparkline: spark(118),
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
  med: 'text-metric-ttfb-med',
  slow: 'text-metric-ttfb-slow',
}

function ttfbClass(ms: number) {
  return TTFB_CLASS[getTtfbTier(ms)]
}

function formatRelativeTime(date: Date): { text: string; isRecent: boolean } {
  const diffS = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffS < 60) return { text: diffS < 5 ? 'just now' : `${diffS}s ago`, isRecent: true }
  const diffM = Math.floor(diffS / 60)
  if (diffM < 60) return { text: `${diffM}m ago`, isRecent: false }
  const diffH = Math.floor(diffM / 60)
  return { text: `${diffH}h ago`, isRecent: false }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ data, tier }: { data: number[]; tier: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 64
  const H = 18
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W
      const y = H - ((v - min) / range) * (H - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const color = tier === 'fast' ? '#34d399' : tier === 'med' ? '#f59e0b' : '#fb7185'
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="shrink-0 opacity-80"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CacheHitBadge({ pct }: { pct: number }) {
  const tier = getCacheHitTier(pct)
  if (tier === 'high') return <span className="cs-badge-cache-hit">{pct.toFixed(1)}%</span>
  if (tier === 'mid') return <span className="cs-badge-cache-dynamic">{pct.toFixed(1)}%</span>
  return <span className="cs-badge-cache-miss">{pct.toFixed(1)}%</span>
}

function DeltaChip({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const improved = inverted ? value > 0 : value < 0
  const tone = improved ? 'text-emerald-400' : 'text-rose-400'
  const Icon = value < 0 ? ArrowDown : ArrowUp
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${tone}`}>
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function SortIcon({ isSorted }: { isSorted: false | 'asc' | 'desc' }) {
  if (isSorted === 'asc') return <ArrowUp className="ml-1 inline h-3 w-3 text-emerald-400" />
  if (isSorted === 'desc') return <ArrowDown className="ml-1 inline h-3 w-3 text-emerald-400" />
  return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30 group-hover/th:opacity-60" />
}

// ─── Column definitions ───────────────────────────────────────────────────────

const col = createColumnHelper<Monitor>()

const columns = [
  col.accessor('name', {
    id: 'monitor',
    header: 'Monitor',
    size: 30,
    enableSorting: true,
    cell: ({ row }) => {
      const m = row.original
      const isActive = m.status === 'active'
      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-black tracking-tight text-white">
              {m.name}
            </span>
            <span
              className={`cs-badge shrink-0 !py-0 !px-1.5 !text-[9px] ${
                isActive ? 'cs-badge-success' : 'cs-badge-muted'
              }`}
            >
              {isActive ? (
                <span className="relative mr-1 flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
              ) : null}
              {isActive ? 'Active' : 'Paused'}
            </span>
          </div>
          <span
            className="max-w-[200px] truncate text-[10px] text-zinc-600"
            title={m.url}
          >
            {m.url.replace(/^https?:\/\//, '')}
          </span>
        </div>
      )
    },
  }),

  col.accessor('ttfbCurrent', {
    header: 'TTFB Now',
    size: 12,
    enableSorting: true,
    cell: ({ getValue, row }) => {
      const ms = getValue()
      const delta = row.original.ttfbCurrentDelta
      return (
        <div className="flex flex-col gap-0.5">
          <span className={`text-[15px] font-black leading-none tabular-nums ${ttfbClass(ms)}`}>
            {ms} <span className="text-[10px] font-bold opacity-60">ms</span>
          </span>
          <DeltaChip value={delta} inverted />
        </div>
      )
    },
  }),

  col.accessor('ttfbAvg24h', {
    header: 'Avg TTFB 24h',
    size: 14,
    enableSorting: true,
    cell: ({ getValue, row }) => {
      const ms = getValue()
      const tier = getTtfbTier(ms)
      return (
        <div className="flex items-center gap-2.5">
          <div className="flex flex-col gap-0.5">
            <span className={`text-[13px] font-black tabular-nums ${ttfbClass(ms)}`}>
              {ms} <span className="text-[10px] font-bold opacity-60">ms</span>
            </span>
          </div>
          <Sparkline data={row.original.ttfbSparkline} tier={tier} />
        </div>
      )
    },
  }),

  col.accessor('cacheHitCurrent', {
    header: 'Cache Hit',
    size: 12,
    enableSorting: true,
    cell: ({ getValue }) => <CacheHitBadge pct={getValue()} />,
  }),

  col.accessor('cacheHitAvg24h', {
    header: 'Hit 24h Avg',
    size: 10,
    enableSorting: true,
    cell: ({ getValue, row }) => {
      const pct = getValue()
      const tier = getCacheHitTier(pct)
      const textClass =
        tier === 'high'
          ? 'text-emerald-400'
          : tier === 'mid'
            ? 'text-amber-400'
            : 'text-rose-400'
      return (
        <div className="flex flex-col gap-0.5">
          <span className={`text-[13px] font-black tabular-nums ${textClass}`}>
            {pct.toFixed(1)}%
          </span>
          <DeltaChip value={row.original.cacheHitDelta} />
        </div>
      )
    },
  }),

  col.accessor('slowRegionCount', {
    header: 'Regions',
    size: 10,
    enableSorting: true,
    cell: ({ row }) => {
      const m = row.original
      if (m.slowRegionCount === 0) {
        return (
          <span className="text-[11px] font-semibold text-zinc-600">
            Global
          </span>
        )
      }
      const slowOnes = m.regions.filter((r) => r.isSlow)
      return (
        <div className="flex flex-wrap gap-1">
          {slowOnes.map((r) => (
            <span
              key={r.code}
              className="cs-badge cs-badge-warning !py-0 !px-1.5 !text-[9px]"
              title={`${r.label} degraded`}
            >
              {r.flag} {r.label}
            </span>
          ))}
          <span className="text-[9px] font-bold text-zinc-600 self-center">
            {m.slowRegionCount}/{m.totalRegionCount}
          </span>
        </div>
      )
    },
  }),

  col.accessor('lastCheckedAt', {
    header: 'Last Check',
    size: 8,
    enableSorting: true,
    sortingFn: (a, b) =>
      b.original.lastCheckedAt.getTime() - a.original.lastCheckedAt.getTime(),
    cell: ({ getValue }) => {
      const { text, isRecent } = formatRelativeTime(getValue())
      return (
        <span
          className={`text-[11px] font-bold tabular-nums ${
            isRecent ? 'text-emerald-400' : 'text-zinc-500'
          }`}
        >
          {text}
        </span>
      )
    },
  }),

  col.display({
    id: 'actions',
    header: '',
    size: 4,
    cell: ({ row }) => {
      const m = row.original
      const isPaused = m.status === 'paused'
      return (
        <div
          className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn label="View details" href={`/dashboard/monitors/${m.id}`}>
            <Eye className="h-3.5 w-3.5" />
          </ActionBtn>
          <ActionBtn label={isPaused ? 'Resume monitor' : 'Pause monitor'}>
            {isPaused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </ActionBtn>
          <ActionBtn label="Edit monitor">
            <Pencil className="h-3.5 w-3.5" />
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
    'flex h-6 w-6 items-center justify-center rounded-md border border-white/5 bg-white/[0.02] text-zinc-500 transition-all duration-150 hover:border-white/10 hover:bg-white/[0.06] hover:text-white'
  if (href) {
    return (
      <a href={href} aria-label={label} className={base} title={label}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={base}>
      {children}
    </button>
  )
}

// ─── MonitorsTable ────────────────────────────────────────────────────────────

export function MonitorsTable() {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data: MOCK_MONITORS,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const handleRowClick = useCallback(
    (monitorId: string) => {
      router.push(`/dashboard/monitors/${monitorId}`)
    },
    [router],
  )

  return (
    <div className="overflow-hidden rounded-xl">
      <div className="overflow-x-auto cs-dropdown-scroll">
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-white/[0.05]">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  return (
                    <th
                      key={header.id}
                      className={`cs-table-compact-th group/th whitespace-nowrap bg-white/[0.01] ${
                        canSort ? 'cursor-pointer select-none hover:text-zinc-300' : ''
                      }`}
                      style={{ width: `${header.column.columnDef.size}%` }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      aria-sort={
                        header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : undefined
                      }
                    >
                      {header.isPlaceholder ? null : (
                        <span className="inline-flex items-center">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort ? (
                            <SortIcon isSorted={header.column.getIsSorted()} />
                          ) : null}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => handleRowClick(row.original.id)}
                className={`group/row cursor-pointer border-b border-white/[0.03] transition-all duration-150 hover:bg-emerald-500/[0.04] hover:shadow-[inset_0_0_0_1px_rgba(52,211,153,0.06)] ${
                  i % 2 === 1 ? 'bg-white/[0.012]' : ''
                } ${row.original.status === 'paused' ? 'opacity-60' : ''}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="cs-table-compact-td">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {table.getRowModel().rows.length === 0 && (
          <div className="flex min-h-[120px] items-center justify-center text-[12px] font-semibold text-zinc-600">
            No monitors found
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.04] px-3 py-2.5">
        <span className="text-[10px] font-semibold text-zinc-600">
          {table.getRowModel().rows.length} monitors
        </span>
        <span className="text-[10px] font-semibold text-zinc-700">
          Click a row to open monitor details
        </span>
      </div>
    </div>
  )
}
