'use client'

import { useState } from 'react'
import {
  dowLabel,
  heatmapTtfbColor,
  heatmapCacheColor,
  buildHeatmapGrid,
  type HeatmapCell,
} from './ttfb-heatmap.helpers'

const CELL_W = 20
const CELL_H = 12
const CELL_GAP = 2
const PAD_LEFT = 28
const PAD_TOP = 20
const PAD_BOTTOM = 10
const SVG_W = PAD_LEFT + 7 * (CELL_W + CELL_GAP) + 20
const SVG_H = PAD_TOP + 24 * (CELL_H + CELL_GAP) + PAD_BOTTOM

type Mode = 'ttfb' | 'cache'

interface TooltipState {
  cell: HeatmapCell
  dow: number
  hour: number
  x: number
  y: number
}

export function TtfbHeatmap({ data }: { data: HeatmapCell[] }) {
  const [mode, setMode] = useState<Mode>('ttfb')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const grid = buildHeatmapGrid(data)
  const maxTtfb = Math.max(...data.map(c => c.ttfb_avg ?? 0), 1)

  const cellX = (dow: number) => PAD_LEFT + dow * (CELL_W + CELL_GAP)
  const cellY = (hour: number) => PAD_TOP + hour * (CELL_H + CELL_GAP)

  const hourLabels = [0, 6, 12, 18, 23]

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm relative">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight opacity-40">Pattern</span>
        <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
          {(['ttfb', 'cache'] as Mode[]).map(m => (
            <button
              key={m}
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
        {/* Day of week labels (X axis) */}
        {[0, 1, 2, 3, 4, 5, 6].map(dow => (
          <text
            key={dow}
            x={cellX(dow) + CELL_W / 2}
            y={PAD_TOP - 6}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.35}
          >
            {dowLabel(dow)}
          </text>
        ))}

        {/* Hour labels (Y axis) */}
        {hourLabels.map(h => (
          <text
            key={h}
            x={PAD_LEFT - 4}
            y={cellY(h) + CELL_H / 2 + 3}
            textAnchor="end"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.35}
          >
            {h}h
          </text>
        ))}

        {/* Grid cells */}
        {grid.map((hours, dow) =>
          hours.map((cell, hour) => {
            const fill = cell == null
              ? '#1F2A3A'
              : mode === 'ttfb'
                ? heatmapTtfbColor(cell.ttfb_avg, maxTtfb)
                : heatmapCacheColor(cell.cache_hit_pct)
            return (
              <rect
                key={`${dow}-${hour}`}
                x={cellX(dow)}
                y={cellY(hour)}
                width={CELL_W}
                height={CELL_H}
                rx={2}
                fill={fill}
                opacity={cell == null ? 0.3 : 0.85}
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
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
            {dowLabel(tooltip.dow)} {tooltip.hour}:00
          </p>
          <div className="space-y-0.5 tabular-nums">
            {tooltip.cell.ttfb_avg != null && (
              <div className="flex justify-between gap-3">
                <span className="text-[10px] text-zinc-400">TTFB avg</span>
                <span className="text-[11px] font-bold">{tooltip.cell.ttfb_avg}ms</span>
              </div>
            )}
            {tooltip.cell.cache_hit_pct != null && (
              <div className="flex justify-between gap-3">
                <span className="text-[10px] text-zinc-400">Cache</span>
                <span className="text-[10px] text-zinc-300">{tooltip.cell.cache_hit_pct}%</span>
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
