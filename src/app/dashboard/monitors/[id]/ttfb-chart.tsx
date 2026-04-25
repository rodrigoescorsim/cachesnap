'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { formatChartLabel, niceMax, globalBucketAverage, buildP95BandPath } from './ttfb-chart.helpers'
import { TIMING } from './timing-metrics-palette'
import { PremiumTooltip } from '@/components/premium-tooltip'

export interface ChartPoint {
  bucket: string       // ISO string
  region: string
  ttfb_avg: number
  ttfb_p95: number | null
  dns_avg: number | null
  tcp_avg: number | null
  tls_avg: number | null
  cache_hit_pct: number | null
}

interface RegionRenderMeta {
  label: string
  color: string
}

function withAlpha(color: string, alpha: number): string {
  const normalized = color.trim()
  const safeAlpha = Math.max(0, Math.min(1, alpha))
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      if (![r, g, b].some(Number.isNaN)) return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if (![r, g, b].some(Number.isNaN)) return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`
    }
  }
  return normalized
}

// SVG viewport
const W = 700, H = 180
const PAD = { top: 12, right: 16, bottom: 32, left: 48 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top  - PAD.bottom

export function TtfbChart({
  data,
  range,
  regionMeta,
  cacheHitThresholdPct,
}: {
  data: ChartPoint[]
  range: string
  regionMeta: Record<string, RegionRenderMeta>
  cacheHitThresholdPct?: number | null
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [showGlobalTtfb, setShowGlobalTtfb] = useState(true)
  const [selectedTtfbRegions, setSelectedTtfbRegions] = useState<Set<string>>(new Set())
  const [showGlobalCache, setShowGlobalCache] = useState(true)
  const [selectedCacheRegions, setSelectedCacheRegions] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const didInitTtfbDefaultsRef = useRef(false)
  const didInitCacheDefaultsRef = useRef(false)

  const regions    = useMemo(() => [...new Set(data.map(d => d.region))].sort(), [data])
  const allBuckets = useMemo(() => [...new Set(data.map(d => d.bucket))].sort(), [data])
  const regionAbbreviations = useMemo(() => {
    const toAbbreviation = (label: string, fallbackRegion: string) => {
      const cleaned = label
        .replace(/[^A-Za-z\s]/g, ' ')
        .trim()
      if (!cleaned) return fallbackRegion.slice(0, 3).toUpperCase()
      const parts = cleaned.split(/\s+/).filter(Boolean)
      if (parts.length >= 2) {
        return parts.slice(0, 3).map(part => part[0]?.toUpperCase() ?? '').join('')
      }
      return cleaned.slice(0, 3).toUpperCase()
    }

    const map: Record<string, string> = {}
    for (const region of regions) {
      map[region] = toAbbreviation(regionMeta[region]?.label ?? region, region)
    }
    return map
  }, [regions, regionMeta])
  const regionToggleStyle = (region: string, active: boolean): React.CSSProperties => {
    const lineColor = regionMeta[region]?.color ?? '#6b7280'
    if (active) {
      return {
        borderColor: lineColor,
        backgroundColor: withAlpha(lineColor, 0.18),
        color: withAlpha(lineColor, 1),
        boxShadow: `0 0 8px ${withAlpha(lineColor, 0.3)}`,
      }
    }
    return {
      borderColor: withAlpha(lineColor, 0.28),
      backgroundColor: 'transparent',
      color: withAlpha(lineColor, 0.5),
      boxShadow: undefined,
    }
  }

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
  const toYCache = (pct: number) => {
    const min = 0
    const max = 100
    const clamped = Math.max(min, Math.min(max, pct))
    return PAD.top + (1 - (clamped - min) / (max - min)) * CH
  }

  // ── Interaction ──────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || allBuckets.length < 2) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePos({ x, y })

    const svgElement = (e.target as Element | null)?.closest('svg')
    if (!svgElement) {
      setHoveredIdx(null)
      return
    }
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
  const globalTtfb = globalBucketAverage(allBuckets, data, p => p.ttfb_avg)
  const hasCacheData = data.some(d => d.cache_hit_pct != null)
  const isCacheNotReported = !hasCacheData

  const defaultTtfbRegions = useMemo(() => {
    const ranked = regions
      .map(region => {
        const points = data.filter(point => point.region === region)
        if (points.length === 0) return null
        const avg = points.reduce((sum, point) => sum + point.ttfb_avg, 0) / points.length
        return { region, avg }
      })
      .filter((entry): entry is { region: string; avg: number } => entry != null)
      .sort((a, b) => a.avg - b.avg)

    if (ranked.length === 0) return new Set<string>()

    const defaults = new Set<string>()
    defaults.add(ranked[0].region)
    defaults.add(ranked[ranked.length - 1].region)
    return defaults
  }, [regions, data])

  const defaultCacheRegions = useMemo(() => {
    const ranked = regions
      .map(region => {
        const points = data
          .filter(point => point.region === region && point.cache_hit_pct != null)
          .map(point => point.cache_hit_pct as number)
        if (points.length === 0) return null
        const avg = points.reduce((sum, value) => sum + value, 0) / points.length
        return { region, avg }
      })
      .filter((entry): entry is { region: string; avg: number } => entry != null)
      .sort((a, b) => a.avg - b.avg)

    if (ranked.length === 0) return new Set<string>()

    const defaults = new Set<string>()
    defaults.add(ranked[0].region)
    defaults.add(ranked[ranked.length - 1].region)
    return defaults
  }, [regions, data])
  const globalCache = useMemo(() => {
    return allBuckets.map(bucket => {
      const bucketValues = data
        .filter(point => point.bucket === bucket && point.cache_hit_pct != null)
        .map(point => point.cache_hit_pct as number)
      if (bucketValues.length === 0) return { bucket, value: null as number | null }
      const total = bucketValues.reduce((sum, value) => sum + value, 0)
      return { bucket, value: total / bucketValues.length }
    })
  }, [allBuckets, data])
  const cachePlateauState = useMemo(() => {
    if (isCacheNotReported) return null
    const values = globalCache
      .map(point => point.value)
      .filter((value): value is number => value != null)

    if (values.length < 5) return null

    const transitions = values.length - 1
    if (transitions <= 0) return null

    let stableTransitions = 0
    for (let i = 1; i < values.length; i++) {
      if (Math.abs(values[i] - values[i - 1]) < 1) stableTransitions += 1
    }

    const stableRatio = stableTransitions / transitions
    if (stableRatio <= 0.8) return null

    const average = values.reduce((sum, value) => sum + value, 0) / values.length

    if (average >= 99) {
      return {
        label: 'Stable at 100%',
        className: 'border-emerald-300/45 bg-emerald-500/16 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.22),0_0_14px_rgba(16,185,129,0.12)]',
      }
    }

    if (average <= 1) {
      return {
        label: 'Critical at 0%',
        className: 'border-red-300/45 bg-red-500/16 text-red-200 shadow-[0_0_0_1px_rgba(248,113,113,0.22),0_0_14px_rgba(239,68,68,0.14)]',
      }
    }

    return null
  }, [globalCache, isCacheNotReported])
  const cacheGridOpacity = (value: number) => (value === 95 ? 0.1 : 0.04)
  const cacheThresholdOpacity = 0.3

  useEffect(() => {
    if (!didInitTtfbDefaultsRef.current && defaultTtfbRegions.size > 0) {
      setSelectedTtfbRegions(new Set(defaultTtfbRegions))
      didInitTtfbDefaultsRef.current = true
    }
  }, [defaultTtfbRegions])

  useEffect(() => {
    if (!didInitCacheDefaultsRef.current && defaultCacheRegions.size > 0) {
      setSelectedCacheRegions(new Set(defaultCacheRegions))
      didInitCacheDefaultsRef.current = true
    }
  }, [defaultCacheRegions])

  const hoveredBucket = hoveredIdx != null ? allBuckets[hoveredIdx] : null
  const hoveredGlobalCache = hoveredBucket != null
    ? globalCache.find(bucket => bucket.bucket === hoveredBucket)?.value ?? null
    : null
  const hoveredWorstRegionCache = hoveredBucket != null
    ? regions
      .map(region => {
        const cacheValue = byRegion[region]?.get(hoveredBucket)?.cache_hit_pct
        return cacheValue != null ? { region, value: cacheValue } : null
      })
      .filter((entry): entry is { region: string; value: number } => entry != null)
      .sort((a, b) => a.value - b.value)[0] ?? null
    : null

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

  function GuideLine() {
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
            {formatChartLabel(allBuckets[hoveredIdx], range)} {range === '7d' || range === '30d' || range === '90d' ? '' : 'UTC'}
          </p>
          {(hoveredGlobalCache != null || hoveredWorstRegionCache != null) && (
            <div className="mb-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px]">
              {hoveredGlobalCache != null && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Global cache hit</span>
                  <span className="font-bold text-cyan-300 tabular-nums">{Math.round(hoveredGlobalCache)}%</span>
                </div>
              )}
              {hoveredWorstRegionCache != null && (
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Worst region</span>
                  <span className="font-bold text-red-300 tabular-nums">{(regionMeta[hoveredWorstRegionCache.region]?.label ?? hoveredWorstRegionCache.region).split(' ')[0]} {Math.round(hoveredWorstRegionCache.value)}%</span>
                </div>
              )}
            </div>
          )}
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
                  <div className="flex flex-col items-end tabular-nums">
                    <span className="text-[11px] font-bold">{Math.round(p.ttfb_avg)}ms</span>
                    {p.ttfb_p95 != null && (
                      <span className="text-[9px] text-zinc-500">p95 {p.ttfb_p95}ms</span>
                    )}
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
          <div className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-tight opacity-80">TTFB Trend</div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowGlobalTtfb(prev => !prev)}
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors ${showGlobalTtfb ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-border bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                >
                  Global
                </button>
                <PremiumTooltip
                  content="Select all regions."
                  position="bottom-center"
                  panelSizing="hug"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTtfbRegions(prev => {
                        const allSelected = regions.length > 0 && regions.every(region => prev.has(region))
                        return allSelected ? new Set() : new Set(regions)
                      })
                    }}
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors ${selectedTtfbRegions.size === regions.length && regions.length > 0 ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-border bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                  >
                    All
                  </button>
                </PremiumTooltip>
                {regions.map(region => {
                  const active = selectedTtfbRegions.has(region)
                  const regionLabel = regionMeta[region]?.label ?? region
                  return (
                    <PremiumTooltip
                      key={`ttfb-region-tip-${region}`}
                      content={regionLabel}
                      position="bottom-center"
                      panelSizing="hug"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTtfbRegions(prev => {
                            const next = new Set(prev)
                            if (next.has(region)) {
                              next.delete(region)
                            } else {
                              next.add(region)
                            }
                            return next
                          })
                        }}
                        className="inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors hover:brightness-110"
                        style={regionToggleStyle(region, active)}
                      >
                        {regionAbbreviations[region] ?? region.slice(0, 3).toUpperCase()}
                      </button>
                    </PremiumTooltip>
                  )
                })}
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
              {[0, Math.round(niceMaxTtfb / 2), niceMaxTtfb].map(v => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={toYTtfb(v)} y2={toYTtfb(v)} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
                  <text x={PAD.left - 6} y={toYTtfb(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                </g>
              ))}
              <XAxisLabels />
              <GuideLine />
              {regions.map(region => {
                if (!selectedTtfbRegions.has(region)) return null
                const m = byRegion[region]
                if (!m) return null
                const bandPath = buildP95BandPath(allBuckets, m, toX, toYTtfb)
                if (!bandPath) return null
                return (
                  <path
                    key={`band-${region}`}
                    d={bandPath}
                    fill={regionMeta[region]?.color ?? '#6b7280'}
                    fillOpacity={0.08}
                    stroke="none"
                  />
                )
              })}
              {regions.map(region => {
                if (!selectedTtfbRegions.has(region)) return null
                const m = byRegion[region]
                if (!m) return null
                const points = allBuckets.map((b, i) => m.has(b) ? `${toX(i)},${toYTtfb(m.get(b)!.ttfb_avg)}` : null).filter(Boolean).join(' ')
                return <polyline key={region} points={points} fill="none" stroke={regionMeta[region]?.color ?? '#6b7280'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={hoveredIdx === null ? 1 : byRegion[region]?.has(allBuckets[hoveredIdx]) ? 1 : 0.2} />
              })}
              {showGlobalTtfb && (
                <polyline
                  points={globalTtfb.map((bucket, i) => `${toX(i)},${toYTtfb(bucket.value)}`).join(' ')}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth={2.4}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </div>

          <div className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-tight opacity-80">Cache Hit Rate</div>
                {isCacheNotReported && (
                  <span className="inline-flex items-center rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight text-zinc-300">
                    Not Reported
                  </span>
                )}
                {!isCacheNotReported && cachePlateauState && (
                  <>
                    <span className={`ml-[15px] inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tight ${cachePlateauState.className}`}>
                      {cachePlateauState.label}
                    </span>
                    <span className="text-[10px] font-medium tracking-tight text-zinc-400">
                      No variation in selected window
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasCacheData && (
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowGlobalCache(prev => !prev)}
                      className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors ${showGlobalCache ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-border bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                    >
                      Global
                    </button>
                    <PremiumTooltip
                      content="Select all regions."
                      position="bottom-center"
                      panelSizing="hug"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCacheRegions(prev => {
                            const allSelected = regions.length > 0 && regions.every(region => prev.has(region))
                            return allSelected ? new Set() : new Set(regions)
                          })
                        }}
                        className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors ${selectedCacheRegions.size === regions.length && regions.length > 0 ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-border bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                      >
                        All
                      </button>
                    </PremiumTooltip>
                    {regions.map(region => {
                      const active = selectedCacheRegions.has(region)
                      const regionLabel = regionMeta[region]?.label ?? region
                      return (
                        <PremiumTooltip
                          key={`cache-region-tip-${region}`}
                          content={regionLabel}
                          position="bottom-center"
                          panelSizing="hug"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCacheRegions(prev => {
                                const next = new Set(prev)
                                if (next.has(region)) {
                                  next.delete(region)
                                } else {
                                  next.add(region)
                                }
                                return next
                              })
                            }}
                            className="inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors hover:brightness-110"
                            style={regionToggleStyle(region, active)}
                          >
                            {regionAbbreviations[region] ?? region.slice(0, 3).toUpperCase()}
                          </button>
                        </PremiumTooltip>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            {isCacheNotReported ? (
              <div className="mt-1 rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/20 px-4 py-3 text-[11px] text-zinc-500">
                Cache header data is not reported for this monitor in the selected window.
              </div>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
              <rect x={PAD.left} y={toYCache(100)} width={CW} height={toYCache(95) - toYCache(100)} fill="#10b981" fillOpacity={0.04} />
              <rect x={PAD.left} y={toYCache(95)} width={CW} height={toYCache(90) - toYCache(95)} fill="#f59e0b" fillOpacity={0.035} />
              <rect x={PAD.left} y={toYCache(90)} width={CW} height={toYCache(0) - toYCache(90)} fill="#ef4444" fillOpacity={0.03} />

              {[0, 25, 50, 75, 90, 95, 100].map(v => (
                <g key={v}>
                  <line
                    x1={PAD.left}
                    x2={W - PAD.right}
                    y1={toYCache(v)}
                    y2={toYCache(v)}
                    stroke="currentColor"
                    strokeOpacity={cacheGridOpacity(v)}
                    strokeWidth={1}
                    strokeDasharray={v === 95 ? '4 3' : undefined}
                  />
                  <text x={PAD.left - 6} y={toYCache(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}%</text>
                </g>
              ))}
              <XAxisLabels />
              <GuideLine />

              {cacheHitThresholdPct != null && (
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={toYCache(cacheHitThresholdPct)}
                  y2={toYCache(cacheHitThresholdPct)}
                  stroke="var(--brand-warning, #f59e0b)"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  strokeOpacity={cacheThresholdOpacity}
                />
              )}

              {hasCacheData ? (
                <>
                  {regions.map(region => {
                    if (!selectedCacheRegions.has(region)) return null
                    const m = byRegion[region]
                    if (!m) return null
                    const points = allBuckets.map((b, i) => {
                      const p = m.get(b)
                      return p && p.cache_hit_pct != null ? `${toX(i)},${toYCache(p.cache_hit_pct)}` : null
                    }).filter(Boolean).join(' ')
                    if (!points) return null
                    return <polyline key={region} points={points} fill="none" stroke={regionMeta[region]?.color ?? '#6b7280'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={hoveredIdx === null ? 1 : byRegion[region]?.has(allBuckets[hoveredIdx]) ? 1 : 0.2} />
                  })}

                  {showGlobalCache && (
                    <polyline
                      points={globalCache.map((bucket, i) => bucket.value != null ? `${toX(i)},${toYCache(bucket.value)}` : null).filter(Boolean).join(' ')}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth={2.4}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                </>
              ) : (
                <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.35}>No cache data</text>
              )}
              </svg>
            )}
          </div>

          <div className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700">
            <div className="absolute top-4 right-4 text-[11px] font-bold text-zinc-300 uppercase tracking-tight opacity-65">Network Load</div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
              {[0, Math.round(niceMaxNet / 2), niceMaxNet].map(v => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={toYNet(v)} y2={toYNet(v)} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
                  <text x={PAD.left - 6} y={toYNet(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                </g>
              ))}
              <XAxisLabels />
              <GuideLine />
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
