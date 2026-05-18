'use client'

import { useState } from 'react'
import {
  dowLabel,
  heatmapTtfbColor,
  heatmapCacheColor,
  buildHeatmapGrid,
  type HeatmapCell,
} from './ttfb-heatmap.helpers'
import { getTtfbTooltip, getTtfbColorClass, getCacheColor, getCacheTooltip } from '@/lib/thresholds'

const CELL_W = 30
const CELL_H = 30
const CELL_GAP = 2
const PAD_LEFT = 44
const PAD_TOP = 28
const PAD_BOTTOM = 12
const SVG_W = PAD_LEFT + 24 * (CELL_W + CELL_GAP) + 16
const SVG_H = PAD_TOP + 7 * (CELL_H + CELL_GAP) + PAD_BOTTOM

type Mode = 'ttfb' | 'cache'

interface TooltipState {
  cell: HeatmapCell
  dow: number
  hour: number
  x: number
  y: number
}

export function TtfbHeatmap({ data, thresholdMs, thresholdHitMs, cacheWarnPct, cacheCriticalPct }: {
  data: HeatmapCell[]
  thresholdMs?: number
  thresholdHitMs?: number
  cacheWarnPct?: number
  cacheCriticalPct?: number
}) {
  const [mode, setMode] = useState<Mode>('ttfb')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const grid = buildHeatmapGrid(data)
  const validTtfbs = data.map(c => c.ttfb_avg).filter((v): v is number => v !== null)
  const avgTtfb = validTtfbs.length > 0 
    ? validTtfbs.reduce((a, b) => a + b, 0) / validTtfbs.length 
    : 200

  const cellX = (hour: number) => PAD_LEFT + hour * (CELL_W + CELL_GAP)
  const cellY = (dow: number) => PAD_TOP + dow * (CELL_H + CELL_GAP)

  const hourLabels = [0, 6, 12, 18, 23]

  return (
    <div className="cs-panel p-4">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight opacity-40">Weekly Pattern</span>
        <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
          {(['ttfb', 'cache'] as Mode[]).map(m => (
            <button
              key={m}
              id={`btn-heatmap-mode-${m}`}
              onClick={() => setMode(m)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
                mode === m
                  ? 'bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {m === 'ttfb' ? 'TTFB' : 'Cache'}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Hour labels (X axis) */}
        {hourLabels.map(h => (
          <text
            key={h}
            x={cellX(h) + CELL_W / 2}
            y={PAD_TOP - 12}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.35}
            fontWeight="bold"
          >
            {h}h
          </text>
        ))}

        {/* Day of week labels (Y axis) */}
        {[0, 1, 2, 3, 4, 5, 6].map(dow => (
          <text
            key={dow}
            x={PAD_LEFT - 10}
            y={cellY(dow) + CELL_H / 2 + 4}
            textAnchor="end"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.35}
            fontWeight="bold"
          >
            {dowLabel(dow).substring(0, 3)}
          </text>
        ))}

        {/* Grid cells */}
        {grid.map((hours, dow) =>
          hours.map((cell, hour) => {
            const fill = cell == null
              ? '#1F2A3A'
              : mode === 'ttfb'
                ? heatmapTtfbColor(cell.ttfb_avg, avgTtfb)
                : heatmapCacheColor(cell.cache_hit_pct)
            return (
              <rect
                key={`${dow}-${hour}`}
                x={cellX(hour)}
                y={cellY(dow)}
                width={CELL_W}
                height={CELL_H}
                rx={1.5}
                fill={fill}
                opacity={cell == null ? 0.2 : 0.85}
                onMouseEnter={(e) => {
                  if (!cell) return
                  const svg = (e.currentTarget as SVGRectElement).ownerSVGElement!
                  const rect = svg.getBoundingClientRect()
                  setTooltip({ cell, dow, hour, x: e.clientX - rect.left, y: e.clientY - rect.top })
                }}
                style={{ cursor: cell ? 'default' : 'default' }}
              />
            )
          })
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none bg-surface/95 backdrop-blur-xl border border-white/10 p-2.5 rounded-xl shadow-2xl text-white min-w-[150px]"
          style={{ left: tooltip.x + 20, top: tooltip.y + 20 }}
        >
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
            {dowLabel(tooltip.dow)} {tooltip.hour}:00
          </p>
          <div className="space-y-0.5 tabular-nums">
            {tooltip.cell.ttfb_avg != null && (
              <div className="space-y-1 pb-1.5 mb-1.5 border-b border-white/5">
                <div className="flex justify-between gap-3">
                  <span className="text-[10px] text-zinc-400">TTFB avg</span>
                  <span className={`text-[11px] font-bold ${getTtfbColorClass(tooltip.cell.ttfb_avg, 'monitor', thresholdHitMs, thresholdMs)}`}>
                    {tooltip.cell.ttfb_avg}ms
                  </span>
                </div>
                <p className="text-[9px] text-zinc-500 leading-tight">
                  {getTtfbTooltip(tooltip.cell.ttfb_avg, 'monitor', thresholdHitMs, thresholdMs).split(':')[0]}
                </p>
              </div>
            )}
            {tooltip.cell.cache_hit_pct != null && (
              <div className="flex justify-between gap-3 pb-1.5">
                <span className="text-[10px] text-zinc-400">Cache</span>
                <span className={`text-[10px] font-medium ${getCacheColor(tooltip.cell.cache_hit_pct, 'monitor', cacheWarnPct, cacheCriticalPct)}`}>
                  {tooltip.cell.cache_hit_pct}%
                </span>
              </div>
            )}
            <div className="flex justify-between gap-3 pt-0.5 border-t border-white/5">
              <span className="text-[10px] text-zinc-500">samples</span>
              <span className="text-[10px] text-zinc-500">{tooltip.cell.sample_count}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
