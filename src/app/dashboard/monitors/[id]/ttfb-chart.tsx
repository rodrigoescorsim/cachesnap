'use client'

import Link from 'next/link'
import { useState, useRef, useMemo } from 'react'
import { formatChartLabel, niceMax, globalBucketAverage } from './ttfb-chart.helpers'
import { TIMING } from './timing-metrics-palette'

export interface ChartPoint {
  bucket: string       // ISO string
  region: string
  ttfb_avg: number
  dns_avg: number | null
  tcp_avg: number | null
  tls_avg: number | null
  cache_hit_pct: number | null
}

interface RegionRenderMeta {
  label: string
  color: string
}

// SVG viewport
const W = 700, H = 180
const PAD = { top: 12, right: 16, bottom: 32, left: 48 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top  - PAD.bottom

export function TtfbChart({ data, range, regionMeta }: { data: ChartPoint[]; range: string; regionMeta: Record<string, RegionRenderMeta> }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const regions    = useMemo(() => [...new Set(data.map(d => d.region))].sort(), [data])
  const allBuckets = useMemo(() => [...new Set(data.map(d => d.bucket))].sort(), [data])

  // Index data by region for fast lookup
  const byRegion = useMemo(() => {
    const map: Record<string, Map<string, ChartPoint>> = {}
    for (const d of data) {
      if (!map[d.region]) map[d.region] = new Map()
      map[d.region].set(d.bucket, d)
    }
    return map
  }, [data])

  // ── Y scales ──────────────────────────────────────────────────────────────
  const maxTtfb     = Math.max(...data.map(d => d.ttfb_avg), 1)
  const niceMaxTtfb = niceMax(maxTtfb, 100)

  const maxNet      = Math.max(
    ...data.map(d => (d.dns_avg ?? 0) + (d.tcp_avg ?? 0) + (d.tls_avg ?? 0)),
    1,
  )
  const niceMaxNet  = niceMax(maxNet, 50)

  // ── X scale ───────────────────────────────────────────────────────────────
  const toX = (i: number) =>
    allBuckets.length < 2
      ? PAD.left + CW / 2
      : PAD.left + (i / (allBuckets.length - 1)) * CW

  // ── Y projectors ──────────────────────────────────────────────────────────
  const toYTtfb = (ms: number)  => PAD.top + (1 - ms  / niceMaxTtfb) * CH
  const toYNet  = (ms: number)  => PAD.top + (1 - ms  / niceMaxNet)  * CH
  const toYPct  = (pct: number) => PAD.top + (1 - pct / 100)         * CH

  // ── Interaction ──────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || allBuckets.length < 2) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePos({ x, y })

    // Find nearest bucket based on local SVG width scaling
    // We assume the SVG is responsive, so we need to account for its rendered width
    const svgElement = containerRef.current.querySelector('svg')
    if (!svgElement) return
    const svgRect = svgElement.getBoundingClientRect()
    const relativeX = (e.clientX - svgRect.left) * (W / svgRect.width)
    
    const idx = Math.round(((relativeX - PAD.left) / CW) * (allBuckets.length - 1))
    if (idx >= 0 && idx < allBuckets.length) {
      setHoveredIdx(idx)
    } else {
      setHoveredIdx(null)
    }
  }

  const handleMouseLeave = () => setHoveredIdx(null)

  // ── Global averages ───────────────────────────────────────────────────────
  const globalDns = globalBucketAverage(allBuckets, data, p => p.dns_avg)
  const globalTcp = globalBucketAverage(allBuckets, data, p => p.tcp_avg)
  const globalTls = globalBucketAverage(allBuckets, data, p => p.tls_avg)
  const hasCacheData = data.some(d => d.cache_hit_pct != null)

  // ── Sub-components ────────────────────────────────────────────────────────
  function XAxisLabels() {
    const n = Math.max(allBuckets.length - 1, 1)
    const xIdxs = [...new Set([0, Math.round(n / 3), Math.round(2 * n / 3), n])]
    return (
      <>
        {xIdxs.map((idx, i) => (
          <text
            key={idx}
            x={toX(idx)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === xIdxs.length - 1 ? 'end' : 'middle'}
            fontSize={8}
            fill="currentColor"
            fillOpacity={0.35}
          >
            {formatChartLabel(allBuckets[idx] ?? '', range)}
          </text>
        ))}
      </>
    )
  }

  function GuideLine({ projector }: { projector: (v: number) => number }) {
    if (hoveredIdx === null) return null
    return (
      <line
        x1={toX(hoveredIdx)} x2={toX(hoveredIdx)}
        y1={PAD.top} y2={H - PAD.bottom}
        stroke="currentColor" strokeOpacity={0.2}
        strokeWidth={1} strokeDasharray="3 2"
      />
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 relative" ref={containerRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      {/* Tooltip */}
      {hoveredIdx !== null && (
        <div 
          className="fixed z-[100] pointer-events-none bg-surface/95 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl text-white min-w-[180px]"
          style={{ left: mousePos.x + 20 + (containerRef.current?.getBoundingClientRect().left ?? 0), top: mousePos.y + 20 + (containerRef.current?.getBoundingClientRect().top ?? 0) }}
        >
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1.5 px-0.5">
            {formatChartLabel(allBuckets[hoveredIdx], range)} {range === '7d' ? '' : 'UTC'}
          </p>
          <div className="space-y-2">
            {regions.map(region => {
              const p = byRegion[region]?.get(allBuckets[hoveredIdx])
              if (!p) return null
              return (
                <div key={region} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: regionMeta[region]?.color ?? '#6b7280' }} />
                    <span className="text-[10px] font-medium text-zinc-400 capitalize whitespace-nowrap">
                      {(regionMeta[region]?.label ?? region).split(' ')[0]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-[11px] font-bold">{Math.round(p.ttfb_avg)}ms</span>
                    {p.cache_hit_pct != null && (
                      <span className={`text-[9px] font-medium px-1 rounded-sm ${p.cache_hit_pct >= 50 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {Math.round(p.cache_hit_pct)}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {allBuckets.length < 2 ? (
        <div className="rounded-2xl border border-border bg-surface/30 p-12 text-center">
          <p className="text-sm text-zinc-500 italic font-medium">Analyzing historical patterns...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Chart 1 — TTFB */}
            <div className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700">
              <div className="absolute top-4 right-4 text-[10px] font-bold text-zinc-400 uppercase tracking-tight opacity-40">TTFB</div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
                {/* Horizontal lines */}
                {[0, Math.round(niceMaxTtfb / 2), niceMaxTtfb].map(v => (
                  <g key={v}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={toYTtfb(v)} y2={toYTtfb(v)} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
                    <text x={PAD.left - 6} y={toYTtfb(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                  </g>
                ))}
                <XAxisLabels />
                <GuideLine projector={toYTtfb} />
                {regions.map(region => {
                  const m = byRegion[region]
                  if (!m) return null
                  const points = allBuckets.map((b, i) => m.has(b) ? `${toX(i)},${toYTtfb(m.get(b)!.ttfb_avg)}` : null).filter(Boolean).join(' ')
                  return <polyline key={region} points={points} fill="none" stroke={regionMeta[region]?.color ?? '#6b7280'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={hoveredIdx === null ? 1 : byRegion[region]?.has(allBuckets[hoveredIdx]) ? 1 : 0.2} />
                })}
              </svg>
            </div>

            {/* Chart 2 — Network */}
            <div className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700">
              <div className="absolute top-4 right-4 text-[10px] font-bold text-zinc-400 uppercase tracking-tight opacity-40">Network Load</div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
                {[0, Math.round(niceMaxNet / 2), niceMaxNet].map(v => (
                  <g key={v}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={toYNet(v)} y2={toYNet(v)} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
                    <text x={PAD.left - 6} y={toYNet(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                  </g>
                ))}
                <XAxisLabels />
                <GuideLine projector={toYNet} />
                <polyline points={globalDns.map((g, i) => `${toX(i)},${toYNet(g.value)}`).join(' ')} fill="none" stroke={TIMING.dns.stroke} strokeWidth={2} strokeDasharray="4 2" strokeOpacity={0.4} />
                <polyline points={globalTcp.map((g, i) => `${toX(i)},${toYNet(g.value)}`).join(' ')} fill="none" stroke={TIMING.tcp.stroke} strokeWidth={2} strokeDasharray="4 2" strokeOpacity={0.4} />
                <polyline points={globalTls.map((g, i) => `${toX(i)},${toYNet(g.value)}`).join(' ')} fill="none" stroke={TIMING.tls.stroke} strokeWidth={2} strokeDasharray="4 2" strokeOpacity={0.4} />
                {regions.map(region => {
                  const m = byRegion[region]
                  if (!m) return null
                  const points = allBuckets.map((b, i) => m.has(b)
                    ? `${toX(i)},${toYNet((m.get(b)!.dns_avg ?? 0) + (m.get(b)!.tcp_avg ?? 0) + (m.get(b)!.tls_avg ?? 0))}`
                    : null).filter(Boolean).join(' ')
                  return <polyline key={region} points={points} fill="none" stroke={regionMeta[region]?.color ?? '#6b7280'} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.2} />
                })}
              </svg>
            </div>
          </div>

          {/* Chart 3 — Cache */}
          {hasCacheData && (
            <div className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700">
              <div className="absolute top-4 right-4 text-[10px] font-bold text-zinc-400 uppercase tracking-tight opacity-40">Cache Stability</div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
                {[0, 50, 100].map(v => (
                  <g key={v}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={toYPct(v)} y2={toYPct(v)} stroke="currentColor" strokeOpacity={v === 50 ? 0.15 : 0.05} strokeWidth={1} strokeDasharray={v === 50 ? '4 3' : undefined} />
                    <text x={PAD.left - 6} y={toYPct(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}%</text>
                  </g>
                ))}
                <XAxisLabels />
                <GuideLine projector={toYPct} />
                {regions.map(region => {
                  const m = byRegion[region]
                  if (!m) return null
                  const points = allBuckets.map((b, i) => {
                    const p = m.get(b)
                    return p && p.cache_hit_pct != null ? `${toX(i)},${toYPct(p.cache_hit_pct)}` : null
                  }).filter(Boolean).join(' ')
                  if (!points) return null
                  return <polyline key={region} points={points} fill="none" stroke={regionMeta[region]?.color ?? '#6b7280'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={hoveredIdx === null ? 1 : byRegion[region]?.has(allBuckets[hoveredIdx]) ? 1 : 0.2} />
                })}
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-1 justify-between items-center opacity-80 group-hover:opacity-100 transition-opacity">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {regions.map(region => (
            <div key={region} className="flex items-center gap-1.5 border-b border-transparent hover:border-border transition-colors cursor-default">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: regionMeta[region]?.color ?? '#6b7280' }} />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
                {regionMeta[region]?.label ?? region}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-l border-zinc-200 dark:border-zinc-800 pl-4">
          <div className="flex items-center gap-1.5 group/label">
            <div className="w-3 h-0.5 border-t border-dashed border-purple-500 opacity-60" />
            <span className={`text-[9px] font-bold uppercase tracking-wider ${TIMING.dns.text}`}>DNS</span>
          </div>
          <div className="flex items-center gap-1.5 group/label">
            <div className="w-3 h-0.5 border-t border-dashed border-blue-500 opacity-60" />
            <span className={`text-[9px] font-bold uppercase tracking-wider ${TIMING.tcp.text}`}>TCP</span>
          </div>
          <div className="flex items-center gap-1.5 group/label">
            <div className="w-3 h-0.5 border-t border-dashed border-fuchsia-500 opacity-60" />
            <span className={`text-[9px] font-bold uppercase tracking-wider ${TIMING.tls.text}`}>TLS</span>
          </div>
        </div>
      </div>
    </div>
  )
}
