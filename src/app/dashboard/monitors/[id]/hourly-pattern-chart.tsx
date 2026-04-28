'use client'

import { useState } from 'react'
import {
  normalizeHourlyData,
  worstHours,
  bestHours,
  hourlyBarColor,
  type HourlyPoint,
} from './hourly-pattern.helpers'

const W = 700
const H = 220
const PAD = { top: 24, right: 16, bottom: 32, left: 36 }
const CHART_W = W - PAD.left - PAD.right
const CHART_H = H - PAD.top - PAD.bottom
const BAR_COUNT = 24
const BAR_GAP = 2
const BAR_W = (CHART_W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT

interface Tooltip {
  hour: number
  point: HourlyPoint
  x: number
  y: number
}

export function HourlyPatternChart({ data, range }: { data: HourlyPoint[]; range: string }) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  const normalized = normalizeHourlyData(data)
  const worst3 = new Set(worstHours(data, 3, 3).map(p => p.hour_of_day))
  const best3  = new Set(bestHours(data, 3, 3).map(p => p.hour_of_day))

  const maxTtfb = Math.max(...data.map(p => p.ttfb_avg), 1)

  const toX = (hour: number) => PAD.left + hour * (BAR_W + BAR_GAP)
  const barH = (ttfb: number) => Math.max((ttfb / maxTtfb) * CHART_H, 2)

  // Cache hit polyline (right axis 0–100%)
  const cachePoints = normalized
    .map((p, i) => p?.cache_hit_pct != null
      ? `${toX(i) + BAR_W / 2},${PAD.top + (1 - p.cache_hit_pct / 100) * CHART_H}`
      : null)
    .filter(Boolean)
    .join(' ')

  const xAxisLabels = [0, 6, 12, 18, 23]

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Horizontal guide lines */}
        {[0, 0.5, 1].map(t => (
          <line
            key={t}
            x1={PAD.left} x2={W - PAD.right}
            y1={PAD.top + (1 - t) * CHART_H} y2={PAD.top + (1 - t) * CHART_H}
            stroke="currentColor" strokeOpacity={0.05} strokeWidth={1}
          />
        ))}

        {/* Bars */}
        {normalized.map((point, hour) => {
          if (!point) return null
          const x = toX(hour)
          const bh = barH(point.ttfb_avg)
          const y = PAD.top + CHART_H - bh
          const color = hourlyBarColor(point.ttfb_avg)
          const isNight = hour < 6 || hour >= 22
          return (
            <rect
              key={hour}
              x={x}
              y={y}
              width={BAR_W}
              height={bh}
              fill={color}
              opacity={isNight ? 0.4 : 0.75}
              rx={1}
              onMouseEnter={(e) => {
                const svg = (e.currentTarget as SVGRectElement).ownerSVGElement!
                const rect = svg.getBoundingClientRect()
                setTooltip({
                  hour,
                  point,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                })
              }}
              style={{ cursor: 'default' }}
            />
          )
        })}

        {/* Cache hit rate polyline (secondary) */}
        {cachePoints && (
          <polyline
            points={cachePoints}
            fill="none"
            stroke="var(--metric-fast, #22FF88)"
            strokeWidth={1.5}
            strokeOpacity={0.5}
            strokeLinejoin="round"
          />
        )}

        {/* Worst hour badges */}
        {normalized.map((point, hour) => {
          if (!point || !worst3.has(hour)) return null
          const x = toX(hour) + BAR_W / 2
          return (
            <text key={`worst-${hour}`} x={x} y={PAD.top - 6} textAnchor="middle" fontSize={8} fill="var(--metric-slow, #f43f5e)" fillOpacity={0.9}>▲</text>
          )
        })}

        {/* Best hour badges */}
        {normalized.map((point, hour) => {
          if (!point || !best3.has(hour)) return null
          const x = toX(hour) + BAR_W / 2
          return (
            <text key={`best-${hour}`} x={x} y={PAD.top - 6} textAnchor="middle" fontSize={8} fill="var(--metric-fast, #22FF88)" fillOpacity={0.9}>★</text>
          )
        })}

        {/* X axis labels */}
        {xAxisLabels.map(h => (
          <text
            key={h}
            x={toX(h) + BAR_W / 2}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.35}
          >
            {h}h
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none bg-surface/95 backdrop-blur-xl border border-white/10 p-2.5 rounded-xl shadow-2xl text-white min-w-[140px]"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">{tooltip.hour}:00 UTC</p>
          <div className="space-y-0.5 tabular-nums">
            <div className="flex justify-between gap-3">
              <span className="text-[10px] text-zinc-400">avg</span>
              <span className="text-[11px] font-bold">{tooltip.point.ttfb_avg}ms</span>
            </div>
            {tooltip.point.ttfb_p95 != null && (
              <div className="flex justify-between gap-3">
                <span className="text-[10px] text-zinc-400">p95</span>
                <span className="text-[10px] text-zinc-300">{tooltip.point.ttfb_p95}ms</span>
              </div>
            )}
            {tooltip.point.cache_hit_pct != null && (
              <div className="flex justify-between gap-3">
                <span className="text-[10px] text-zinc-400">cache</span>
                <span className="text-[10px] text-zinc-300">{tooltip.point.cache_hit_pct}%</span>
              </div>
            )}
            <div className="flex justify-between gap-3 pt-0.5 border-t border-white/5">
              <span className="text-[10px] text-zinc-500">samples</span>
              <span className="text-[10px] text-zinc-500">{tooltip.point.sample_count}</span>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[var(--metric-fast,#22FF88)] opacity-50" />
          <span className="text-[9px] text-zinc-500 uppercase tracking-tight">Cache hit</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--metric-slow,#f43f5e)]">▲</span>
          <span className="text-[9px] text-zinc-500">worst hours</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--metric-fast,#22FF88)]">★</span>
          <span className="text-[9px] text-zinc-500">best hours</span>
        </div>
      </div>
    </div>
  )
}
