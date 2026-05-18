'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { formatChartLabel, niceMax, globalBucketAverage, buildP95BandPath } from './ttfb-chart.helpers'
import { TIMING } from './timing-metrics-palette'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { getTtfbColorClass, getCacheColor } from '@/lib/thresholds'
import { AlertTriangle, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Activity, Link as LinkIcon, Unlink } from 'lucide-react'
import { buildViewHref, TIMEFRAME_TOOLTIPS } from './monitor-href'
import Link from 'next/link'
import { ViewSectionHeader } from '@/components/dashboard/dashboard-ui'

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
const CH = H - PAD.top - PAD.bottom

export function TtfbChart({
  data,
  range,
  regionMeta,
  cacheHitThresholdPct,
  isDown,
  monitorId,
}: {
  data: ChartPoint[]
  range: string
  regionMeta: Record<string, RegionRenderMeta>
  cacheHitThresholdPct?: number | null
  isDown?: boolean
  monitorId: string
}) {
  const [hoveredTtfbIdx, setHoveredTtfbIdx] = useState<number | null>(null)
  const [hoveredCacheIdx, setHoveredCacheIdx] = useState<number | null>(null)
  const [hoveredNetIdx, setHoveredNetIdx] = useState<number | null>(null)

  const [hoveredChart, setHoveredChart] = useState<'ttfb' | 'cache' | 'network' | null>(null)

  const [activeTtfbRegion, setActiveTtfbRegion] = useState<string | 'global' | null>('global')
  const [activeCacheRegion, setActiveCacheRegion] = useState<string | 'global' | null>('global')
  const [activeNetRegion, setActiveNetRegion] = useState<string | 'global' | null>('global')

  const [hoveredTtfbRegion, setHoveredTtfbRegion] = useState<string | null>(null)
  const [hoveredCacheRegion, setHoveredCacheRegion] = useState<string | null>(null)
  const [hoveredNetRegion, setHoveredNetRegion] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, clientX: 0, clientY: 0, isRight: false, isBottom: false })
  const [isSynced, setIsSynced] = useState(true)

  const [ttfbHistory, setTtfbHistory] = useState<string[]>([])
  const [cacheHistory, setCacheHistory] = useState<string[]>([])
  const [netHistory, setNetHistory] = useState<string[]>([])

  const [showGlobalTtfb, setShowGlobalTtfb] = useState(true)
  const [selectedTtfbRegions, setSelectedTtfbRegions] = useState<Set<string>>(new Set())
  const [showGlobalCache, setShowGlobalCache] = useState(true)
  const [selectedCacheRegions, setSelectedCacheRegions] = useState<Set<string>>(new Set())
  const [showGlobalNet, setShowGlobalNet] = useState(true)
  const [selectedNetRegions, setSelectedNetRegions] = useState<Set<string>>(new Set())
  const [networkMetric, setNetworkMetric] = useState<'dns' | 'tcp' | 'tls' | 'net'>('net')
  const containerRef = useRef<HTMLDivElement>(null)

  const regions = useMemo(() => [...new Set(data.map(d => d.region))].sort(), [data])
  const allBuckets = useMemo(() => [...new Set(data.map(d => d.bucket))].sort(), [data])
  const regionAbbreviations = useMemo(() => {
    // Standard tech region mappings to avoid country confusion (e.g. FRA -> FRK)
    const MAPPING: Record<string, string> = {
      'frankfurt': 'FRK',
      'london': 'LDN',
      'tokyo': 'TYO',
      'singapore': 'SGP',
      'mumbai': 'MUM',
      'sydney': 'SYD',
      'sao paulo': 'SPO',
      'são paulo': 'SPO',
      'paris': 'PAR',
      'seoul': 'SEL',
      'hong kong': 'HKG',
      'oregon': 'ORE',
      'ohio': 'OHI',
      'northern virginia': 'NVA',
      'virginia': 'VIR',
      'cape town': 'CPT',
    }

    const toAbbreviation = (label: string, fallbackRegion: string) => {
      const low = label.toLowerCase()
      // 1. Direct match in mapping
      for (const [key, val] of Object.entries(MAPPING)) {
        if (low.includes(key)) return val
      }

      const cleaned = label
        .replace(/[^A-Za-z\s]/g, ' ')
        .trim()

      if (!cleaned) return fallbackRegion.slice(0, 3).toUpperCase()

      const parts = cleaned.split(/\s+/).filter(Boolean)

      // 2. Multi-word: take first letters (e.g. North Virginia -> NV)
      if (parts.length >= 2) {
        return parts.slice(0, 3).map(part => part[0]?.toUpperCase() ?? '').join('')
      }

      // 3. One word: use first 3, but if it ends in 'a' and it's long, try to pick a consonant
      // (This is a heuristic to avoid FRA, BRA, etc. if it's not in mapping)
      const raw = cleaned.toUpperCase()
      if (raw.length > 3 && (raw.startsWith('FRA') || raw.startsWith('BRA') || raw.startsWith('ITA'))) {
        return (raw[0] + raw[1] + raw[3]).slice(0, 3) // Pick 1, 2, 4
      }

      return raw.slice(0, 3)
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

  // ── Sync Logic ─────────────────────────────────────────────────────────────
  const toggleGlobal = (source: 'ttfb' | 'cache' | 'net') => {
    const isShowing = source === 'ttfb' ? showGlobalTtfb : source === 'cache' ? showGlobalCache : showGlobalNet
    const currentActive = source === 'ttfb' ? activeTtfbRegion : source === 'cache' ? activeCacheRegion : activeNetRegion

    if (currentActive !== 'global') {
      updateActiveRegion('global', source)
      if (!isShowing) {
        if (isSynced) {
          setShowGlobalTtfb(true)
          setShowGlobalCache(true)
          setShowGlobalNet(true)
        } else {
          if (source === 'ttfb') setShowGlobalTtfb(true)
          if (source === 'cache') setShowGlobalCache(true)
          if (source === 'net') setShowGlobalNet(true)
        }
      }
      return
    }

    if (isSynced) {
      const next = !isShowing
      setShowGlobalTtfb(next)
      setShowGlobalCache(next)
      setShowGlobalNet(next)
    } else {
      if (source === 'ttfb') setShowGlobalTtfb(!showGlobalTtfb)
      if (source === 'cache') setShowGlobalCache(!showGlobalCache)
      if (source === 'net') setShowGlobalNet(!showGlobalNet)
    }
  }

  const toggleAllRegions = (source: 'ttfb' | 'cache' | 'net') => {
    const current = source === 'ttfb' ? selectedTtfbRegions : source === 'cache' ? selectedCacheRegions : selectedNetRegions
    const isAllSelected = current.size === regions.length
    const next = isAllSelected ? new Set<string>() : new Set(regions)

    if (isSynced) {
      setSelectedTtfbRegions(new Set(next))
      setSelectedCacheRegions(new Set(next))
      setSelectedNetRegions(new Set(next))
    } else {
      if (source === 'ttfb') setSelectedTtfbRegions(next)
      if (source === 'cache') setSelectedCacheRegions(next)
      if (source === 'net') setSelectedNetRegions(next)
    }
  }

  const updateActiveRegion = (region: string | 'global' | null, source: 'ttfb' | 'cache' | 'net') => {
    if (isSynced) {
      setActiveTtfbRegion(region)
      setActiveCacheRegion(region)
      setActiveNetRegion(region)
    } else {
      if (source === 'ttfb') setActiveTtfbRegion(region)
      if (source === 'cache') setActiveCacheRegion(region)
      if (source === 'net') setActiveNetRegion(region)
    }

    // Update history
    if (region && region !== 'global') {
      const setHistory = source === 'ttfb' ? setTtfbHistory : source === 'cache' ? setCacheHistory : setNetHistory
      setHistory(prev => {
        const filtered = prev.filter(r => r !== region)
        return [...filtered, region]
      })
    }
  }

  const handleLineClick = (region: string | 'global', source: 'ttfb' | 'cache' | 'net') => {
    const currentActive = source === 'ttfb' ? activeTtfbRegion : source === 'cache' ? activeCacheRegion : activeNetRegion
    if (currentActive === region) {
      updateActiveRegion(null, source)
    } else {
      updateActiveRegion(region, source)
    }
  }

  const updateHoveredRegion = (region: string | null, source: 'ttfb' | 'cache' | 'net') => {
    if (isSynced) {
      setHoveredTtfbRegion(region)
      setHoveredCacheRegion(region)
      setHoveredNetRegion(region)
    } else {
      if (source === 'ttfb') setHoveredTtfbRegion(region)
      if (source === 'cache') setHoveredCacheRegion(region)
      if (source === 'net') setHoveredNetRegion(region)
    }
  }

  const updateHoveredIdx = (idx: number | null, source: 'ttfb' | 'cache' | 'net') => {
    if (isSynced) {
      setHoveredTtfbIdx(idx)
      setHoveredCacheIdx(idx)
      setHoveredNetIdx(idx)
    } else {
      if (source === 'ttfb') setHoveredTtfbIdx(idx)
      if (source === 'cache') setHoveredCacheIdx(idx)
      if (source === 'net') setHoveredNetIdx(idx)
    }
  }

  const toggleRegion = (region: string, source: 'ttfb' | 'cache' | 'net') => {
    const current = source === 'ttfb' ? selectedTtfbRegions : source === 'cache' ? selectedCacheRegions : selectedNetRegions
    const currentActive = source === 'ttfb' ? activeTtfbRegion : source === 'cache' ? activeCacheRegion : activeNetRegion
    const isShowing = current.has(region)

    if (currentActive !== region) {
      updateActiveRegion(region, source)
      if (!isShowing) {
        const next = new Set(current)
        next.add(region)
        if (isSynced) {
          setSelectedTtfbRegions(new Set(next))
          setSelectedCacheRegions(new Set(next))
          setSelectedNetRegions(new Set(next))
        } else {
          if (source === 'ttfb') setSelectedTtfbRegions(next)
          if (source === 'cache') setSelectedCacheRegions(next)
          if (source === 'net') setSelectedNetRegions(next)
        }
      }
      return
    }

    const next = new Set(current)
    next.delete(region)

    // Selection history logic
    const history = source === 'ttfb' ? ttfbHistory : source === 'cache' ? cacheHistory : netHistory
    const setHistory = source === 'ttfb' ? setTtfbHistory : source === 'cache' ? setCacheHistory : setNetHistory

    const nextHistory = history.filter(r => r !== region)
    setHistory(nextHistory)

    const lastRegion = nextHistory.length > 0 ? nextHistory[nextHistory.length - 1] : 'global'
    updateActiveRegion(lastRegion, source)

    if (isSynced) {
      setSelectedTtfbRegions(new Set(next))
      setSelectedCacheRegions(new Set(next))
      setSelectedNetRegions(new Set(next))
    } else {
      if (source === 'ttfb') setSelectedTtfbRegions(next)
      if (source === 'cache') setSelectedCacheRegions(next)
      if (source === 'net') setSelectedNetRegions(next)
    }
  }

  // ── Auto-selection Logic ──────────────────────────────────────────────────
  useEffect(() => {
    // TTFB
    const ttfbVisible = Array.from(selectedTtfbRegions)
    const ttfbTotal = (showGlobalTtfb ? 1 : 0) + ttfbVisible.length
    if (ttfbTotal === 1) {
      const remaining = showGlobalTtfb ? 'global' : ttfbVisible[0]
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (activeTtfbRegion !== remaining) setActiveTtfbRegion(remaining)
    }

    // Cache
    const cacheVisible = Array.from(selectedCacheRegions)
    const cacheTotal = (showGlobalCache ? 1 : 0) + cacheVisible.length
    if (cacheTotal === 1) {
      const remaining = showGlobalCache ? 'global' : cacheVisible[0]
      if (activeCacheRegion !== remaining) setActiveCacheRegion(remaining)
    }

    // Network
    const netVisible = Array.from(selectedNetRegions)
    const netTotal = (showGlobalNet ? 1 : 0) + netVisible.length
    if (netTotal === 1) {
      const remaining = showGlobalNet ? 'global' : netVisible[0]
      if (activeNetRegion !== remaining) setActiveNetRegion(remaining)
    }
  }, [
    showGlobalTtfb, selectedTtfbRegions, activeTtfbRegion,
    showGlobalCache, selectedCacheRegions, activeCacheRegion,
    showGlobalNet, selectedNetRegions, activeNetRegion
  ])

  const byRegion = useMemo(() => {
    const map: Record<string, Map<string, ChartPoint>> = {}
    for (const d of data) {
      if (!map[d.region]) map[d.region] = new Map()
      map[d.region].set(d.bucket, d)
    }
    return map
  }, [data])

  // ── Global averages ───────────────────────────────────────────────────────
  const globalDns = globalBucketAverage(allBuckets, data, p => p.dns_avg)
  const globalTcp = globalBucketAverage(allBuckets, data, p => p.tcp_avg)
  const globalTls = globalBucketAverage(allBuckets, data, p => p.tls_avg)
  const globalTtfb = globalBucketAverage(allBuckets, data, p => p.ttfb_avg)
  const globalP95 = globalBucketAverage(allBuckets, data, p => p.ttfb_p95)
  const globalCache = globalBucketAverage(allBuckets, data, p => p.cache_hit_pct)
  const globalNet = globalDns.map((d, i) => {
    let value = 0
    if (networkMetric === 'dns') value = d.value
    else if (networkMetric === 'tcp') value = globalTcp[i].value
    else if (networkMetric === 'tls') value = globalTls[i].value
    else value = d.value + globalTcp[i].value + globalTls[i].value
    return { bucket: d.bucket, value }
  })
  const hasCacheData = data.some(d => d.cache_hit_pct != null)
  const isCacheNotReported = !hasCacheData

  // ── Network Insights (Max, Min, Spikes) ───────────────────────────────────
  const netInsights = useMemo(() => {
    const insights = new Map<string, Array<{ idx: number, type: 'max' | 'min' | 'spike-up' | 'spike-down', diff?: number, pct?: number, value: number }>>()

    const processSeries = (name: string, series: Array<{ value: number }>) => {
      if (series.length < 2) return
      const res: Array<{ idx: number, type: 'max' | 'min' | 'spike-up' | 'spike-down', diff?: number, pct?: number, value: number }> = []

      // Calculate average for this series to use as relevance threshold
      const validPoints = series.filter(s => s.value > 0)
      if (validPoints.length === 0) return
      const avg = validPoints.reduce((acc, curr) => acc + curr.value, 0) / validPoints.length

      let maxVal = -Infinity
      let maxIdx = -1
      let minVal = Infinity
      let minIdx = -1

      for (let i = 0; i < series.length; i++) {
        const v = series[i].value
        if (v === 0) continue
        if (v > maxVal) { maxVal = v; maxIdx = i }
        if (v < minVal) { minVal = v; minIdx = i }

        if (i > 0) {
          const prev = series[i - 1].value
          if (prev > 0) {
            const pct = ((v - prev) / prev) * 100
            const diff = Math.abs(v - prev)
            // Spike Up: > 100% change AND > 100ms diff AND > 25% above average
            if (pct > 100 && diff > 100 && v > avg * 1.25) {
              res.push({ idx: i, type: 'spike-up', diff: v - prev, pct, value: v })
            }
            // Spike Down: < -50% change AND > 100ms diff AND < 25% below average
            else if (pct < -50 && diff > 100 && v < avg * 0.75) {
              res.push({ idx: i, type: 'spike-down', diff: v - prev, pct, value: v })
            }
          }
        }
      }

      // Only add Max/Min if they are significant relative to the average (25% threshold)
      if (maxIdx !== -1 && maxVal > avg * 1.25) res.push({ idx: maxIdx, type: 'max', value: maxVal })
      if (minIdx !== -1 && minVal < avg * 0.75) res.push({ idx: minIdx, type: 'min', value: minVal })

      // Strictly limit to 3 worst and 3 best points per region
      const badPoints = res.filter(r => r.type === 'max' || r.type === 'spike-up')
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)

      const goodPoints = res.filter(r => r.type === 'min' || r.type === 'spike-down')
        .sort((a, b) => a.value - b.value)
        .slice(0, 3)

      const unique = Array.from(new Map([...badPoints, ...goodPoints].map(r => [r.idx + '-' + r.type, r])).values())
      insights.set(name, unique)
    }

    processSeries('global', globalNet)
    for (const region of regions) {
      const m = byRegion[region]
      if (!m) continue
      const series = allBuckets.map(b => {
        const p = m.get(b)
        if (!p) return { value: 0 }
        let val = 0
        if (networkMetric === 'dns') val = p.dns_avg ?? 0
        else if (networkMetric === 'tcp') val = p.tcp_avg ?? 0
        else if (networkMetric === 'tls') val = p.tls_avg ?? 0
        else val = (p.dns_avg ?? 0) + (p.tcp_avg ?? 0) + (p.tls_avg ?? 0)
        return { value: val }
      })
      processSeries(region, series)
    }
    return insights
  }, [globalNet, byRegion, regions, allBuckets, networkMetric])

  const timeframeAvg = useMemo(() => {
    let series = []
    if (networkMetric === 'dns') series = globalDns
    else if (networkMetric === 'tcp') series = globalTcp
    else if (networkMetric === 'tls') series = globalTls
    else series = globalNet

    if (series.length === 0) return 0
    const validPoints = series.filter(p => p.value > 0)
    if (validPoints.length === 0) return 0
    const sum = validPoints.reduce((acc, curr) => acc + curr.value, 0)
    return sum / validPoints.length
  }, [globalDns, globalTcp, globalTls, globalNet, networkMetric])

  const regionNetAvgs = useMemo(() => {
    const avgs = new Map<string, number>()
    for (const region of regions) {
      const m = byRegion[region]
      if (!m) continue
      const series = allBuckets.map(b => {
        const p = m.get(b)
        if (!p) return 0
        if (networkMetric === 'dns') return p.dns_avg ?? 0
        if (networkMetric === 'tcp') return p.tcp_avg ?? 0
        if (networkMetric === 'tls') return p.tls_avg ?? 0
        return (p.dns_avg ?? 0) + (p.tcp_avg ?? 0) + (p.tls_avg ?? 0)
      }).filter(v => v > 0)
      if (series.length > 0) {
        avgs.set(region, series.reduce((acc, v) => acc + v, 0) / series.length)
      }
    }
    return avgs
  }, [byRegion, regions, allBuckets, networkMetric])

  // ── TTFB Insights (Max, Min, Spikes) ──────────────────────────────────────

  // ── TTFB Insights (Max, Min, Spikes) ──────────────────────────────────────
  const ttfbInsights = useMemo(() => {
    const insights = new Map<string, Array<{ idx: number, type: 'max' | 'min' | 'spike-up' | 'spike-down', diff?: number, pct?: number, value: number }>>()

    const processSeries = (name: string, series: Array<{ value: number }>) => {
      if (series.length < 2) return
      const res: Array<{ idx: number, type: 'max' | 'min' | 'spike-up' | 'spike-down', diff?: number, pct?: number, value: number }> = []

      // Calculate average for this series to use as relevance threshold
      const validPoints = series.filter(s => s.value > 0)
      if (validPoints.length === 0) return
      const avg = validPoints.reduce((acc, curr) => acc + curr.value, 0) / validPoints.length

      let maxVal = -Infinity
      let maxIdx = -1
      let minVal = Infinity
      let minIdx = -1

      for (let i = 0; i < series.length; i++) {
        const v = series[i].value
        if (v === 0) continue
        if (v > maxVal) { maxVal = v; maxIdx = i }
        if (v < minVal) { minVal = v; minIdx = i }

        if (i > 0) {
          const prev = series[i - 1].value
          if (prev > 0) {
            const pct = ((v - prev) / prev) * 100
            const diff = Math.abs(v - prev)
            // Spike Up: > 100% change AND > 100ms diff AND > 25% above average
            if (pct > 100 && diff > 100 && v > avg * 1.25) {
              res.push({ idx: i, type: 'spike-up', diff: v - prev, pct, value: v })
            }
            // Spike Down: < -50% change AND > 100ms diff AND < 25% below average
            else if (pct < -50 && diff > 100 && v < avg * 0.75) {
              res.push({ idx: i, type: 'spike-down', diff: v - prev, pct, value: v })
            }
          }
        }
      }

      // Only add Max/Min if they are significant relative to the average (25% threshold)
      if (maxIdx !== -1 && maxVal > avg * 1.25) res.push({ idx: maxIdx, type: 'max', value: maxVal })
      if (minIdx !== -1 && minVal < avg * 0.75) res.push({ idx: minIdx, type: 'min', value: minVal })

      // Strictly limit to 3 worst and 3 best points per region
      const badPoints = res.filter(r => r.type === 'max' || r.type === 'spike-up')
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)

      const goodPoints = res.filter(r => r.type === 'min' || r.type === 'spike-down')
        .sort((a, b) => a.value - b.value)
        .slice(0, 3)

      const unique = Array.from(new Map([...badPoints, ...goodPoints].map(r => [r.idx + '-' + r.type, r])).values())
      insights.set(name, unique)
    }

    processSeries('global', globalTtfb)
    for (const region of regions) {
      const m = byRegion[region]
      if (!m) continue
      const series = allBuckets.map(b => ({ value: m.get(b)?.ttfb_avg ?? 0 }))
      processSeries(region, series)
    }
    return insights
  }, [globalTtfb, byRegion, regions, allBuckets])

  const ttfbTimeframeAvg = useMemo(() => {
    if (globalTtfb.length === 0) return 0
    const validPoints = globalTtfb.filter(p => p.value > 0)
    if (validPoints.length === 0) return 0
    const sum = validPoints.reduce((acc, curr) => acc + curr.value, 0)
    return sum / validPoints.length
  }, [globalTtfb])

  const regionTtfbAvgs = useMemo(() => {
    const avgs = new Map<string, number>()
    for (const region of regions) {
      const m = byRegion[region]
      if (!m) continue
      const series = allBuckets.map(b => m.get(b)?.ttfb_avg ?? 0).filter(v => v > 0)
      if (series.length > 0) {
        avgs.set(region, series.reduce((acc, v) => acc + v, 0) / series.length)
      }
    }
    return avgs
  }, [byRegion, regions, allBuckets])

  // ── Cache Insights (Max, Min, Spikes) ─────────────────────────────────────
  const cacheInsights = useMemo(() => {
    const insights = new Map<string, Array<{ idx: number, type: 'max' | 'min' | 'spike-up' | 'spike-down', diff?: number, pct?: number, value: number }>>()

    const processSeries = (name: string, series: Array<{ value: number }>) => {
      if (series.length < 2) return
      const res: Array<{ idx: number, type: 'max' | 'min' | 'spike-up' | 'spike-down', diff?: number, pct?: number, value: number }> = []

      // Calculate average for this series to use as relevance threshold
      const validPoints = series.filter(s => s.value != null && s.value >= 0)
      if (validPoints.length === 0) return
      const avg = validPoints.reduce((acc, curr) => acc + curr.value, 0) / validPoints.length

      let maxVal = -Infinity
      let maxIdx = -1
      let minVal = Infinity
      let minIdx = -1

      const validValues = validPoints.map(s => s.value)
      if (validValues.length < 2) return

      const vMax = Math.max(...validValues)
      const vMin = Math.min(...validValues)
      // STABILITY CHECK: If the variation is too small (e.g. < 2%), do not show insights for Cache
      if (vMax - vMin < 2) return

      for (let i = 0; i < series.length; i++) {
        const v = series[i].value
        if (v == null || v < 0) continue
        if (v > maxVal) { maxVal = v; maxIdx = i }
        if (v < minVal) { minVal = v; minIdx = i }

        if (i > 0) {
          const prev = series[i - 1].value
          if (prev != null && prev > 0) {
            const diff = v - prev
            // For cache: 30 absolute percentage points diff AND 25% deviation from average
            if (diff > 30 && v > avg * 1.25) res.push({ idx: i, type: 'spike-up', diff, value: v })
            else if (diff < -30 && v < avg * 0.75) res.push({ idx: i, type: 'spike-down', diff, value: v })
          }
        }
      }

      // Only add Max/Min if they are significant relative to the average (25% threshold)
      if (maxIdx !== -1 && maxVal > avg * 1.25) res.push({ idx: maxIdx, type: 'max', value: maxVal })
      if (minIdx !== -1 && minVal < avg * 0.75) res.push({ idx: minIdx, type: 'min', value: minVal })

      // For Cache: lowest values are bad, highest are good
      const badPoints = res.filter(r => r.type === 'min' || r.type === 'spike-down')
        .sort((a, b) => a.value - b.value)
        .slice(0, 3)

      const goodPoints = res.filter(r => r.type === 'max' || r.type === 'spike-up')
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)

      const unique = Array.from(new Map([...badPoints, ...goodPoints].map(r => [r.idx + '-' + r.type, r])).values())
      insights.set(name, unique)
    }

    processSeries('global', globalCache)
    for (const region of regions) {
      const m = byRegion[region]
      if (!m) continue
      const series = allBuckets.map(b => ({ value: m.get(b)?.cache_hit_pct ?? -1 }))
      processSeries(region, series)
    }
    return insights
  }, [globalCache, byRegion, regions, allBuckets])

  const cacheTimeframeAvg = useMemo(() => {
    if (globalCache.length === 0) return 0
    const validPoints = globalCache.filter(p => p.value >= 0)
    if (validPoints.length === 0) return 0
    const sum = validPoints.reduce((acc, curr) => acc + curr.value, 0)
    return sum / validPoints.length
  }, [globalCache])

  const regionCacheAvgs = useMemo(() => {
    const avgs = new Map<string, number>()
    for (const region of regions) {
      const m = byRegion[region]
      if (!m) continue
      const series = allBuckets.map(b => m.get(b)?.cache_hit_pct ?? -1).filter(v => v >= 0)
      if (series.length > 0) {
        avgs.set(region, series.reduce((acc, v) => acc + v, 0) / series.length)
      }
    }
    return avgs
  }, [byRegion, regions, allBuckets])

  // ── Y scales (Dynamic based on visible data) ─────────────────────────────
  const maxTtfb = useMemo(() => {
    let max = 1
    if (showGlobalTtfb) {
      for (const p of globalTtfb) {
        if (p.value > max) max = p.value
      }
    }
    for (const region of selectedTtfbRegions) {
      const m = byRegion[region]
      if (!m) continue
      for (const p of m.values()) {
        if (p.ttfb_avg > max) max = p.ttfb_avg
        if (p.ttfb_p95 != null && p.ttfb_p95 > max) max = p.ttfb_p95
      }
    }
    return max
  }, [showGlobalTtfb, selectedTtfbRegions, globalTtfb, byRegion])

  const niceMaxTtfb = niceMax(maxTtfb, 100)

  const maxNet = useMemo(() => {
    let max = 1
    if (showGlobalNet) {
      for (const p of globalNet) {
        if (p.value > max) max = p.value
      }
    }
    for (const region of selectedNetRegions) {
      const m = byRegion[region]
      if (!m) continue
      for (const p of m.values()) {
        let val = 0
        if (networkMetric === 'dns') val = p.dns_avg ?? 0
        else if (networkMetric === 'tcp') val = p.tcp_avg ?? 0
        else if (networkMetric === 'tls') val = p.tls_avg ?? 0
        else val = (p.dns_avg ?? 0) + (p.tcp_avg ?? 0) + (p.tls_avg ?? 0)
        if (val > max) max = val
      }
    }
    return max
  }, [showGlobalNet, selectedNetRegions, globalNet, byRegion, networkMetric])

  const niceMaxNet = niceMax(maxNet, 50)

  // ── X scale ───────────────────────────────────────────────────────────────
  const toX = (i: number) =>
    allBuckets.length < 2
      ? PAD.left + CW / 2
      : PAD.left + (i / (allBuckets.length - 1)) * CW

  // ── Y projectors ──────────────────────────────────────────────────────────
  const toYTtfb = (ms: number) => PAD.top + (1 - ms / niceMaxTtfb) * CH
  const toYNet = (ms: number) => PAD.top + (1 - ms / niceMaxNet) * CH
  const toYCache = (pct: number) => {
    const min = 0
    const max = 100
    const clamped = Math.max(min, Math.min(max, pct))
    return PAD.top + (1 - (clamped - min) / (max - min)) * CH
  }

  /**
   * Build an SVG polyline path from bucket-indexed values.
   * When a single point exists, draws a flat horizontal segment from the chart's
   * left padding so the chart isn't visually empty while a second bucket is forming.
   * `getY` may return null to skip missing data points.
   */
  const pathFromBuckets = (getY: (b: string, i: number) => number | null): string => {
    const points: Array<{ x: number; y: number }> = []
    for (let i = 0; i < allBuckets.length; i++) {
      const y = getY(allBuckets[i], i)
      if (y !== null && !Number.isNaN(y)) points.push({ x: toX(i), y })
    }
    if (points.length === 0) return ''
    if (points.length === 1) {
      const { x, y } = points[0]
      return `M ${PAD.left} ${y} L ${x} ${y}`
    }
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }

  // ── Interaction ──────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || allBuckets.length < 2) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const isRight = e.clientX > (typeof window !== 'undefined' ? window.innerWidth * 0.5 : 800)
    const isBottom = e.clientY > (typeof window !== 'undefined' ? window.innerHeight * 0.5 : 500)
    setMousePos({ x, y, clientX: e.clientX, clientY: e.clientY, isRight, isBottom })

    const svgElement = (e.target as Element | null)?.closest('svg')
    if (!svgElement) {
      updateHoveredIdx(null, 'ttfb')
      updateHoveredIdx(null, 'cache')
      updateHoveredIdx(null, 'net')
      return
    }

    const chartType: 'ttfb' | 'cache' | 'net' = hoveredChart === 'network'
      ? 'net'
      : hoveredChart === 'cache'
        ? 'cache'
        : 'ttfb'
    const svgRect = svgElement.getBoundingClientRect()
    const relativeX = (e.clientX - svgRect.left) * (W / svgRect.width)

    const idx = Math.round(((relativeX - PAD.left) / CW) * (allBuckets.length - 1))
    if (idx >= 0 && idx < allBuckets.length) {
      updateHoveredIdx(idx, chartType)
    } else {
      updateHoveredIdx(null, chartType)
    }
  }

  const handleMouseLeave = () => {
    updateHoveredIdx(null, 'ttfb')
    updateHoveredIdx(null, 'cache')
    updateHoveredIdx(null, 'net')
    setHoveredChart(null)
  }


  const cachePlateauState = useMemo(() => {
    if (isCacheNotReported) return null
    const values = globalCache
      .map(point => point.value)
      .filter((value): value is number => value != null)

    if (values.length < 3) return null

    const transitions = values.length - 1
    if (transitions <= 0) return null

    let stableTransitions = 0
    let perfectTransitions = 0
    for (let i = 1; i < values.length; i++) {
      const diff = Math.abs(values[i] - values[i - 1])
      if (diff < 1) stableTransitions += 1
      if (diff === 0) perfectTransitions += 1
    }

    const stableRatio = stableTransitions / transitions
    const isTrulyFlat = perfectTransitions === transitions

    if (stableRatio < 0.7) return null

    const average = values.reduce((sum, value) => sum + value, 0) / values.length

    // Wording based on actual behavior vs mathematical plateau
    const statusText = isTrulyFlat
      ? 'Perfectly consistent'
      : average >= 99.9
        ? 'Near-perfect consistency'
        : 'Highly stable performance'

    if (average >= 99) {
      return {
        label: '100% Cache Hit Rate',
        statusText,
        className: 'border-emerald-300/45 bg-emerald-500/16 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.22),0_0_14px_rgba(16,185,129,0.12)]',
      }
    }

    if (average <= 1) {
      return {
        label: '0% Cache Hit Rate',
        statusText: isTrulyFlat ? 'Consistently bypassing' : 'Persistent cache misses',
        className: 'border-red-300/45 bg-red-500/16 text-red-200 shadow-[0_0_0_1px_rgba(248,113,113,0.22),0_0_14px_rgba(239,68,68,0.14)]',
      }
    }

    return null
  }, [globalCache, isCacheNotReported])
  const cacheGridOpacity = (value: number) => (value === 95 ? 0.1 : 0.04)
  const cacheThresholdOpacity = 0.3

  const renderXAxisLabels = () => {
    if (allBuckets.length === 0) return null
    if (allBuckets.length === 1) {
      return (
        <g>
          <text
            x={toX(0)}
            y={H - 4}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.3}
          >
            {formatChartLabel(allBuckets[0], range)}
          </text>
        </g>
      )
    }
    const count = allBuckets.length
    const step = Math.max(1, Math.floor(count / 5))
    const indices = []
    for (let i = 0; i < count; i += step) indices.push(i)
    if (indices[indices.length - 1] !== count - 1) indices.push(count - 1)

    return (
      <g>
        {indices.map(i => (
          <text
            key={i}
            x={toX(i)}
            y={H - 4}
            textAnchor={i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle'}
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.3}
          >
            {formatChartLabel(allBuckets[i], range)}
          </text>
        ))}
      </g>
    )
  }

  const renderGuideLine = (source: 'ttfb' | 'cache' | 'net') => {
    const idx = source === 'ttfb' ? hoveredTtfbIdx : source === 'cache' ? hoveredCacheIdx : hoveredNetIdx
    if (idx === null) return null
    const x = toX(idx)
    return (
      <line
        x1={x}
        x2={x}
        y1={PAD.top}
        y2={H - PAD.bottom}
        stroke="currentColor"
        strokeOpacity={0.1}
        strokeWidth={1}
        strokeDasharray="4 4"
        className="pointer-events-none"
      />
    )
  }

  const currentHoveredIdx = hoveredChart === 'network' ? hoveredNetIdx : hoveredChart === 'cache' ? hoveredCacheIdx : hoveredTtfbIdx
  const currentActiveRegion = hoveredChart === 'network' ? activeNetRegion : hoveredChart === 'cache' ? activeCacheRegion : activeTtfbRegion

  const hoveredBucket = currentHoveredIdx != null ? allBuckets[currentHoveredIdx] : null
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

  const hoveredWorstRegionTtfb = hoveredBucket != null
    ? regions
      .map(region => {
        const ttfbValue = byRegion[region]?.get(hoveredBucket)?.ttfb_avg
        return ttfbValue != null ? { region, value: ttfbValue } : null
      })
      .filter((entry): entry is { region: string; value: number } => entry != null)
      .sort((a, b) => b.value - a.value)[0] ?? null
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 relative" ref={containerRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      {/* Tooltip */}
      {hoveredChart !== null && currentHoveredIdx !== null && (
        <div
          className={`fixed z-[100] pointer-events-none bg-surface/95 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl text-white transition-all duration-300 ease-out ${hoveredChart === 'network' ? 'min-w-[400px]' : 'min-w-[260px]'}`}
          style={{
            left: `${mousePos.clientX}px`,
            top: `${mousePos.clientY}px`,
            transform: `translate(
              calc(-${(mousePos.clientX / (typeof window !== 'undefined' ? window.innerWidth : 1920)) * 100}% + ${mousePos.clientX > (typeof window !== 'undefined' ? window.innerWidth * 0.5 : 800) ? '-24px' : '24px'}), 
              ${mousePos.isBottom ? 'calc(-100% - 24px)' : '24px'}
            )`
          }}
        >
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 border-b border-white/5 pb-1.5 px-0.5">
            {formatChartLabel(allBuckets[currentHoveredIdx], range)} {range === '7d' || range === '30d' || range === '90d' ? '' : 'UTC'}
          </p>

          {hoveredChart === 'network' ? (
            <>
              <div className="space-y-1.5 mt-2">
                <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-1 mb-1">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Region</span>
                  <div className="flex items-center gap-2">
                    <span className="w-[85px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">NET</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">AVG</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">DNS</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">TCP</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">TLS</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">TTFB</span>
                  </div>
                </div>

                {/* Global Row */}
                {showGlobalNet && (() => {
                  const insights = netInsights.get('global')
                  const pointInsight = insights?.find(ins => ins.idx === currentHoveredIdx)
                  const isBad = pointInsight?.type === 'max' || pointInsight?.type === 'spike-up'
                  const baselineValue = timeframeAvg
                  const relDiff = pointInsight ? pointInsight.value - baselineValue : 0
                  const relPct = baselineValue > 0 ? (relDiff / baselineValue) * 100 : 0

                  return (
                    <div
                      className={`flex items-center justify-between gap-4 px-1 py-1 rounded-md transition-all duration-300 ${currentActiveRegion === 'global' ? 'bg-cyan-400/10 ring-1 ring-cyan-400/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border border-transparent'}`}
                    >
                      <div className="flex items-center gap-2 min-w-[70px]">
                        <div className={`w-1.5 h-1.5 rounded-full transition-transform ${currentActiveRegion === 'global' ? 'scale-125 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'bg-cyan-400/40'}`} />
                        <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${currentActiveRegion === 'global' ? 'text-cyan-300' : 'text-zinc-300'}`}>GLOBAL</span>
                      </div>
                      <div className="flex items-center gap-2 tabular-nums">
                        <div className="w-[85px] flex items-center justify-end gap-1.5">
                          {pointInsight && (
                            <div className={`flex items-center gap-1 px-1 py-0.5 rounded-md border text-[8px] font-black animate-in fade-in zoom-in-95 duration-300 ${isBad ? 'bg-red-500/15 border-red-500/20 text-red-400' : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400'}`}>
                              {isBad ? <AlertTriangle size={9} className="shrink-0" /> : <TrendingDown size={9} className="shrink-0" />}
                              <span>{relPct > 0 ? '+' : ''}{Math.round(relPct)}%</span>
                            </div>
                          )}
                          <span className="text-[10px] font-black text-cyan-300">{Math.round(globalDns[currentHoveredIdx].value + globalTcp[currentHoveredIdx].value + globalTls[currentHoveredIdx].value)}ms</span>
                        </div>

                        <span className="w-[42px] text-right text-[9px] font-medium text-zinc-500 tabular-nums">{Math.round(timeframeAvg)}ms</span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.dns.text}`}>{Math.round(globalDns[currentHoveredIdx].value)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.tcp.text}`}>{Math.round(globalTcp[currentHoveredIdx].value)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.tls.text}`}>{Math.round(globalTls[currentHoveredIdx].value)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>

                        <span className={`w-[42px] text-right text-[10px] font-black ${getTtfbColorClass(globalTtfb[currentHoveredIdx].value, 'global')}`}>{Math.round(globalTtfb[currentHoveredIdx].value)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                      </div>
                    </div>
                  )
                })()}

                {regions.map(region => {
                  if (!selectedNetRegions.has(region)) return null
                  const p = byRegion[region]?.get(allBuckets[currentHoveredIdx])
                  if (!p) return null
                  const isHovered = currentActiveRegion === region
                  const netValue = (p.dns_avg ?? 0) + (p.tcp_avg ?? 0) + (p.tls_avg ?? 0)

                  const insights = netInsights.get(region)
                  const pointInsight = insights?.find(ins => ins.idx === currentHoveredIdx)
                  const isBad = pointInsight?.type === 'max' || pointInsight?.type === 'spike-up'
                  const baselineValue = regionNetAvgs.get(region) || timeframeAvg
                  const relDiff = pointInsight ? pointInsight.value - baselineValue : 0
                  const relPct = baselineValue > 0 ? (relDiff / baselineValue) * 100 : 0

                  return (
                    <div
                      key={region}
                      className="flex items-center justify-between gap-4 px-1 py-0.5 rounded-md transition-all duration-300"
                      style={isHovered ? {
                        backgroundColor: `${regionMeta[region]?.color ?? '#6b7280'}25`,
                        boxShadow: `0 0 15px ${(regionMeta[region]?.color ?? '#6b7280')}15`,
                        border: `1px solid ${(regionMeta[region]?.color ?? '#6b7280')}50`,
                      } : {
                        border: '1px solid transparent'
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-[70px] overflow-hidden">
                        <div className={`w-1 h-1 rounded-full shrink-0 transition-transform ${isHovered ? 'scale-125' : ''}`} style={{ backgroundColor: regionMeta[region]?.color ?? '#6b7280' }} />
                        <span className={`text-[9px] font-bold capitalize truncate transition-colors ${isHovered ? 'text-white' : 'text-zinc-300'}`}>
                          {regionMeta[region]?.label ?? region}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 tabular-nums">
                        <div className="w-[85px] flex items-center justify-end gap-1.5">
                          {pointInsight && (
                            <div className={`flex items-center gap-1 px-1 py-0.5 rounded-md border text-[8px] font-black animate-in fade-in zoom-in-95 duration-300 ${isBad ? 'bg-red-500/15 border-red-500/20 text-red-400' : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400'}`}>
                              {isBad ? <AlertTriangle size={9} className="shrink-0" /> : <TrendingDown size={9} className="shrink-0" />}
                              <span>{relPct > 0 ? '+' : ''}{Math.round(relPct)}%</span>
                            </div>
                          )}
                          <span className="text-[10px] font-black text-cyan-300">{Math.round(netValue)}ms</span>
                        </div>

                        <span className="w-[42px] text-right text-[9px] font-medium text-zinc-500 tabular-nums">{Math.round(baselineValue)}ms</span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.dns.text}`}>{Math.round(p.dns_avg ?? 0)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.tcp.text}`}>{Math.round(p.tcp_avg ?? 0)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.tls.text}`}>{Math.round(p.tls_avg ?? 0)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>

                        <span className={`w-[42px] text-right text-[10px] font-black ${getTtfbColorClass(p.ttfb_avg, 'monitor')}`}>{Math.round(p.ttfb_avg)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between gap-6 border-b border-white/5 pb-1 mb-1">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Region</span>
                  <div className="flex items-center gap-3">
                    {hoveredChart === 'ttfb' ? (
                      <>
                        <span className="w-[95px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">TTFB</span>
                        <span className="w-[42px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">AVG</span>
                        <span className="w-[42px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">P95</span>
                        <span className="w-[42px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">Cache</span>
                      </>
                    ) : (
                      <>
                        <span className="w-[95px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">Cache</span>
                        <span className="w-[42px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">AVG</span>
                        <span className="w-[42px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">TTFB</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Global Row */}
                {((hoveredChart === 'ttfb' && showGlobalTtfb) || (hoveredChart === 'cache' && showGlobalCache)) && (() => {
                  const insights = hoveredChart === 'ttfb' ? ttfbInsights.get('global') : cacheInsights.get('global')
                  const pointInsight = insights?.find(ins => ins.idx === currentHoveredIdx)
                  const isBad = hoveredChart === 'ttfb'
                    ? (pointInsight?.type === 'max' || pointInsight?.type === 'spike-up')
                    : (pointInsight?.type === 'min' || pointInsight?.type === 'spike-down')

                  const baselineValue = hoveredChart === 'ttfb' ? ttfbTimeframeAvg : cacheTimeframeAvg
                  const relDiff = pointInsight ? pointInsight.value - baselineValue : 0
                  const relPct = baselineValue > 0 ? (relDiff / baselineValue) * 100 : 0

                  return (
                    <div
                      className={`flex items-center justify-between gap-6 px-1 py-1 rounded-md transition-all duration-300 ${currentActiveRegion === 'global' ? 'bg-cyan-400/10 ring-1 ring-cyan-400/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border border-transparent'}`}
                    >
                      <div className="flex items-center gap-2 min-w-[70px]">
                        <div className={`w-1.5 h-1.5 rounded-full transition-transform ${currentActiveRegion === 'global' ? 'scale-125 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'bg-cyan-400/40'}`} />
                        <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${currentActiveRegion === 'global' ? 'text-cyan-300' : 'text-zinc-300'}`}>GLOBAL</span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums">
                        {hoveredChart === 'ttfb' ? (
                          <>
                            <div className="w-[95px] flex items-center justify-end gap-2">
                              {pointInsight && (
                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-black animate-in fade-in zoom-in-95 duration-300 ${isBad ? 'bg-red-500/15 border-red-500/20 text-red-400' : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400'}`}>
                                  {isBad ? <AlertTriangle size={10} className="shrink-0" /> : <TrendingDown size={10} className="shrink-0" />}
                                  <span>{relPct > 0 ? '+' : ''}{Math.round(relPct)}%</span>
                                </div>
                              )}
                              <span className={`text-[11px] font-black transition-colors ${getTtfbColorClass(globalTtfb[currentHoveredIdx].value, 'global')}`}>{Math.round(globalTtfb[currentHoveredIdx].value)}ms</span>
                            </div>
                            <span className="w-[42px] text-right text-[9px] font-medium text-zinc-500 tabular-nums">{Math.round(ttfbTimeframeAvg)}ms</span>
                            <span className={`w-[42px] text-right text-[9px] font-medium text-zinc-500`}>—</span>
                            <div className="w-[42px] flex justify-end">
                              {hoveredGlobalCache != null ? (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md transition-all ${getCacheColor(hoveredGlobalCache, 'global').replace('text-', 'bg-').replace('-400', '-500')}/10 ${getCacheColor(hoveredGlobalCache, 'global')}`}>
                                  {Math.round(hoveredGlobalCache)}%
                                </span>
                              ) : (
                                <span className="text-[9px] text-zinc-500">—</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-[95px] flex items-center justify-end gap-2">
                              {pointInsight && (
                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-black animate-in fade-in zoom-in-95 duration-300 ${isBad ? 'bg-red-500/15 border-red-500/20 text-red-400' : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400'}`}>
                                  {isBad ? <AlertTriangle size={10} className="shrink-0" /> : <TrendingUp size={10} className="shrink-0" />}
                                  <span>{relPct > 0 ? '+' : ''}{Math.round(relPct)}%</span>
                                </div>
                              )}
                              {hoveredGlobalCache != null ? (
                                <span className={`text-[11px] font-black transition-all ${getCacheColor(hoveredGlobalCache, 'global')}`}>
                                  {Math.round(hoveredGlobalCache)}%
                                </span>
                              ) : (
                                <span className="text-[11px] text-zinc-500">—</span>
                              )}
                            </div>
                            <span className="w-[42px] text-right text-[9px] font-medium text-zinc-500 tabular-nums">{Math.round(cacheTimeframeAvg)}%</span>
                            <span className={`w-[42px] text-right text-[10px] font-black ${getTtfbColorClass(globalTtfb[currentHoveredIdx].value, 'global')}`}>{Math.round(globalTtfb[currentHoveredIdx].value)}ms</span>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })()}
                {regions.map(region => {
                  const isVisible = hoveredChart === 'ttfb' ? selectedTtfbRegions.has(region) : selectedCacheRegions.has(region)
                  if (!isVisible) return null
                  const p = byRegion[region]?.get(allBuckets[currentHoveredIdx])
                  if (!p) return null
                  const isHovered = currentActiveRegion === region

                  const insights = hoveredChart === 'ttfb' ? ttfbInsights.get(region) : cacheInsights.get(region)
                  const pointInsight = insights?.find(ins => ins.idx === currentHoveredIdx)
                  const isBad = hoveredChart === 'ttfb'
                    ? (pointInsight?.type === 'max' || pointInsight?.type === 'spike-up')
                    : (pointInsight?.type === 'min' || pointInsight?.type === 'spike-down')

                  const baselineValue = hoveredChart === 'ttfb'
                    ? (regionTtfbAvgs.get(region) || ttfbTimeframeAvg)
                    : (regionCacheAvgs.get(region) || cacheTimeframeAvg)
                  const relDiff = pointInsight ? pointInsight.value - baselineValue : 0
                  const relPct = baselineValue > 0 ? (relDiff / baselineValue) * 100 : 0

                  return (
                    <div
                      key={region}
                      className="flex items-center justify-between gap-6 px-1 py-0.5 rounded-md transition-all duration-300"
                      style={isHovered ? {
                        backgroundColor: `${regionMeta[region]?.color ?? '#6b7280'}25`,
                        boxShadow: `0 0 15px ${(regionMeta[region]?.color ?? '#6b7280')}15`,
                        border: `1px solid ${(regionMeta[region]?.color ?? '#6b7280')}50`,
                      } : {
                        border: '1px solid transparent'
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-[70px] overflow-hidden">
                        <div className={`w-1.5 h-1.5 rounded-full transition-transform ${isHovered ? 'scale-125' : ''}`} style={{ backgroundColor: regionMeta[region]?.color ?? '#6b7280' }} />
                        <span className={`text-[10px] font-bold capitalize whitespace-nowrap transition-colors ${isHovered ? 'text-white' : 'text-zinc-300'}`}>
                          {regionMeta[region]?.label ?? region}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums">
                        {hoveredChart === 'ttfb' ? (
                          <>
                            <div className="w-[95px] flex items-center justify-end gap-2">
                              {pointInsight && (
                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-black animate-in fade-in zoom-in-95 duration-300 ${isBad ? 'bg-red-500/15 border-red-500/20 text-red-400' : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400'}`}>
                                  {isBad ? <AlertTriangle size={10} className="shrink-0" /> : <TrendingDown size={10} className="shrink-0" />}
                                  <span>{relPct > 0 ? '+' : ''}{Math.round(relPct)}%</span>
                                </div>
                              )}
                              <span className={`text-[11px] font-black transition-colors ${getTtfbColorClass(p.ttfb_avg, 'monitor')}`}>{Math.round(p.ttfb_avg)}ms</span>
                            </div>
                            <span className="w-[42px] text-right text-[9px] font-medium text-zinc-500 tabular-nums">{Math.round(baselineValue)}ms</span>
                            <span className={`w-[42px] text-right text-[9px] font-medium transition-colors ${isHovered ? 'text-zinc-200' : 'text-zinc-400'}`}>
                              {p.ttfb_p95 != null ? `${p.ttfb_p95}ms` : '—'}
                            </span>
                            <div className="w-[42px] flex justify-end">
                              {p.cache_hit_pct != null ? (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md transition-all ${getCacheColor(p.cache_hit_pct, 'monitor').replace('text-', 'bg-').replace('-400', '-500')}/10 ${getCacheColor(p.cache_hit_pct, 'monitor')}`}>
                                  {Math.round(p.cache_hit_pct)}%
                                </span>
                              ) : (
                                <span className="text-[9px] text-zinc-500">—</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-[95px] flex items-center justify-end gap-2">
                              {pointInsight && (
                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-black animate-in fade-in zoom-in-95 duration-300 ${isBad ? 'bg-red-500/15 border-red-500/20 text-red-400' : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400'}`}>
                                  {isBad ? <AlertTriangle size={10} className="shrink-0" /> : <TrendingUp size={10} className="shrink-0" />}
                                  <span>{relPct > 0 ? '+' : ''}{Math.round(relPct)}%</span>
                                </div>
                              )}
                              {p.cache_hit_pct != null ? (
                                <span className={`text-[11px] font-black transition-all ${getCacheColor(p.cache_hit_pct, 'monitor')}`}>
                                  {Math.round(p.cache_hit_pct)}%
                                </span>
                              ) : (
                                <span className="text-[11px] text-zinc-500">—</span>
                              )}
                            </div>
                            <span className="w-[42px] text-right text-[9px] font-medium text-zinc-500 tabular-nums">{Math.round(baselineValue)}%</span>
                            <span className={`w-[42px] text-right text-[10px] font-black ${getTtfbColorClass(p.ttfb_avg, 'monitor')}`}>{Math.round(p.ttfb_avg)}ms</span>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {allBuckets.length === 0 ? (
        <section className="space-y-4">
          <ViewSectionHeader
            title={
              <div className="flex items-baseline gap-2">
                <span>Trends</span>
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-zinc-400 opacity-70">
                  · {range.toUpperCase()}
                </span>
              </div>
            }
          >
            <div className="flex h-9 items-center gap-1.5 rounded-xl bg-zinc-100 dark:bg-white/5 px-1.5 border border-zinc-200 dark:border-white/10">
              {(['1h', '4h', '24h', '7d', '30d', '90d'] as const).map((r) => (
                <PremiumTooltip key={r} content={TIMEFRAME_TOOLTIPS[r]}>
                  <Link
                    href={buildViewHref('trends', r, monitorId)}
                    className={`px-3 h-6 flex items-center justify-center rounded-lg text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${range === r
                      ? 'bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-lg shadow-black/5 ring-1 ring-black/5'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                      }`}
                  >
                    {r}
                  </Link>
                </PremiumTooltip>
              ))}
            </div>
          </ViewSectionHeader>
          <div className="rounded-2xl border border-border bg-surface/30 p-12 text-center">
            {isDown ? (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 mb-1">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
                  </span>
                </div>
                <p className="text-sm font-bold text-red-400">Site Unreachable</p>
                <p className="text-xs text-red-300/60 max-w-sm mx-auto">
                  No performance metrics available for this time window due to connection failures.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm text-zinc-300 font-medium">No data points in this time window.</p>
                <p className="text-xs text-zinc-500">
                  Try a different range or wait for the next probe.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <>
            <ViewSectionHeader
              title={
                <div className="flex items-baseline gap-2">
                  <span>Trends</span>
                  <span className="text-[11px] font-black uppercase tracking-[0.1em] text-zinc-400 opacity-70">
                    · {range.toUpperCase()}
                  </span>
                </div>
              }
            >
              <div className="flex items-center gap-3">
                <PremiumTooltip
                  content={isSynced ? "Charts are synchronized. Click to decouple." : "Charts are independent. Click to synchronize."}
                  position="bottom-center"
                >
                  <button
                    onClick={() => setIsSynced(!isSynced)}
                    className={`flex h-9 items-center justify-center gap-1.5 px-2 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 ${isSynced
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400/90 shadow-indigo-500/10'
                      : 'border-white/10 bg-white/[0.05] text-zinc-500 hover:border-white/15 hover:text-zinc-300'
                      }`}
                  >
                    <div className={`${isSynced ? 'text-indigo-400' : 'text-zinc-500'} transition-colors`}>
                      {isSynced ? <LinkIcon size={10} /> : <Unlink size={10} />}
                    </div>
                    {isSynced ? 'Synced' : 'Decoupled'}
                  </button>
                </PremiumTooltip>

                <div className="flex h-9 items-center gap-1.5 rounded-xl bg-zinc-100 dark:bg-white/5 px-1.5 border border-zinc-200 dark:border-white/10">
                  {(['1h', '4h', '24h', '7d', '30d', '90d'] as const).map((r) => (
                    <PremiumTooltip key={r} content={TIMEFRAME_TOOLTIPS[r]}>
                      <Link
                        href={buildViewHref('trends', r, monitorId)}
                        className={`px-3 h-6 flex items-center justify-center rounded-lg text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${range === r
                          ? 'bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-lg shadow-black/5 ring-1 ring-black/5'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                          }`}
                      >
                        {r}
                      </Link>
                    </PremiumTooltip>
                  ))}
                </div>
              </div>
            </ViewSectionHeader>
          </>

          <div className="space-y-4">
            <div
              className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-tight opacity-80">TTFB Trend</div>
                  <div className="h-3 w-px bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">Global Avg</span>
                    <span className="text-[10px] font-black text-cyan-300 tabular-nums leading-none mb-[1px]">{Math.round(ttfbTimeframeAvg)}ms</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGlobal('ttfb')}
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-all duration-300 ${showGlobalTtfb
                      ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/30'
                      : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/15 hover:text-zinc-300'}`}
                  >
                    GLOBAL
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleAllRegions('ttfb')}
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-all duration-300 ${selectedTtfbRegions.size === regions.length
                      ? 'border-zinc-500/50 bg-zinc-500/20 text-zinc-200'
                      : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/15 hover:text-zinc-300'}`}
                  >
                    {selectedTtfbRegions.size === regions.length ? 'CLEAR' : 'ALL'}
                  </button>

                  {regions.map(region => {
                    const active = selectedTtfbRegions.has(region)
                    const regionLabel = regionMeta[region]?.label ?? region
                    return (
                      <PremiumTooltip
                        key={`region-tip-${region}`}
                        content={regionLabel}
                        position="bottom-center"
                        panelSizing="hug"
                      >
                        <button
                          type="button"
                          onClick={() => toggleRegion(region, 'ttfb')}
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
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto overflow-visible"
                onMouseEnter={() => setHoveredChart('ttfb')}
                onMouseLeave={() => setHoveredChart(null)}
              >
                {[0, Math.round(niceMaxTtfb / 2), niceMaxTtfb].map(v => (
                  <g key={v}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={toYTtfb(v)} y2={toYTtfb(v)} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
                    <text x={PAD.left - 6} y={toYTtfb(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                  </g>
                ))}
                {renderXAxisLabels()}
                {renderGuideLine('ttfb')}
                {regions.map(region => {
                  if (!selectedTtfbRegions.has(region)) return null
                  const m = byRegion[region]
                  if (!m) return null
                  const bandPath = buildP95BandPath(allBuckets, m, toX, toYTtfb)
                  if (!bandPath) return null
                  const isActive = activeTtfbRegion === region
                  return (
                    <g
                      key={region}
                      onClick={() => handleLineClick(region, 'ttfb')}
                      className="cursor-pointer"
                    >
                      <path d={bandPath} fill={regionMeta[region]?.color ?? '#6b7280'} fillOpacity={isActive ? 0.08 : 0.03} />
                      <path
                        d={pathFromBuckets(b => toYTtfb(m.get(b)?.ttfb_avg ?? 0))}
                        fill="none"
                        stroke={regionMeta[region]?.color ?? '#6b7280'}
                        strokeWidth={isActive ? 3.5 : 1.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeOpacity={isActive ? 1 : 0.35}
                        className="transition-all duration-300"
                      />
                    </g>
                  )
                })}
                {showGlobalTtfb && (
                  <g onClick={() => handleLineClick('global', 'ttfb')} className="cursor-pointer">
                    <path
                      d={pathFromBuckets((_b, i) => toYTtfb(globalTtfb[i]?.value ?? 0))}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth={activeTtfbRegion === 'global' ? 4 : 2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeOpacity={activeTtfbRegion === 'global' ? 1 : 0.5}
                      className="transition-all duration-300"
                    />
                  </g>
                )}

                {/* Render insights ONLY for the active/hovered series */}
                {['global', ...regions].map(target => {
                  const currentActive = hoveredTtfbRegion || activeTtfbRegion || 'global'
                  if (target !== currentActive) return null

                  const isGlobalVisible = target === 'global' && showGlobalTtfb
                  const isRegionVisible = target !== 'global' && selectedTtfbRegions.has(target)
                  if (!isGlobalVisible && !isRegionVisible) return null

                  const insights = ttfbInsights.get(target)
                  if (!insights) return null

                  return insights.map((ins, i) => {
                    const color = ins.type === 'max' || ins.type === 'spike-up' ? '#f43f5e' : '#10b981'
                    const isHoveredPoint = hoveredTtfbIdx === ins.idx
                    const isActiveTarget = activeTtfbRegion === target
                    const isHoveredTarget = hoveredTtfbRegion === target

                    return (
                      <g key={`insight-ttfb-${target}-${ins.type}-${ins.idx}`} className="pointer-events-none">
                        <circle
                          cx={toX(ins.idx)}
                          cy={toYTtfb(ins.value)}
                          r={isHoveredPoint ? 10 : 5.5}
                          fill={color}
                          fillOpacity={0.4}
                        >
                          <animate attributeName="r" from="4" to="14" dur="1.5s" repeatCount="indefinite" />
                          <animate attributeName="fill-opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                        <circle
                          cx={toX(ins.idx)}
                          cy={toYTtfb(ins.value)}
                          r={isHoveredPoint ? 5 : 4}
                          fill={color}
                          stroke="#0B1220"
                          strokeWidth={1.5}
                          className="transition-all duration-300"
                        />
                      </g>
                    )
                  })
                })}
              </svg>
            </div>

            <div
              className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-tight opacity-80">Cache Hit Rate</div>
                  {isCacheNotReported && (
                    <span className="inline-flex items-center rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight text-zinc-300">
                      Not Reported
                    </span>
                  )}
                  {!isCacheNotReported && (
                    <>
                      <div className="h-3 w-px bg-white/10 ml-1" />
                      <div className="flex items-center gap-1.5 ml-1">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">Global Avg</span>
                        <span className="text-[10px] font-black text-emerald-400 tabular-nums leading-none mb-[1px]">
                          {Math.round(cacheTimeframeAvg)}%
                        </span>
                      </div>
                    </>
                  )}
                  {!isCacheNotReported && cachePlateauState && (
                    <>
                      <span className={`ml-[15px] inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tight ${cachePlateauState.className}`}>
                        {cachePlateauState.label}
                      </span>
                      <span className="text-[10px] font-medium tracking-tight text-zinc-400">
                        {cachePlateauState.statusText}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasCacheData && (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleGlobal('cache')}
                        className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-all duration-300 ${showGlobalCache
                          ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/30'
                          : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/15 hover:text-zinc-300'}`}
                      >
                        GLOBAL
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleAllRegions('cache')}
                        className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-all duration-300 ${selectedCacheRegions.size === regions.length
                          ? 'border-zinc-500/50 bg-zinc-500/20 text-zinc-200'
                          : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/15 hover:text-zinc-300'}`}
                      >
                        {selectedCacheRegions.size === regions.length ? 'CLEAR' : 'ALL'}
                      </button>

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
                              onClick={() => toggleRegion(region, 'cache')}
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
                <div className="mt-1 rounded-xl border border-dashed border-white/8 bg-white/[0.015] px-4 py-3 text-[11px] text-zinc-500">
                  No cache headers detected in the selected timeframe.
                </div>
              ) : (
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full h-auto overflow-visible"
                  onMouseEnter={() => setHoveredChart('cache')}
                  onMouseLeave={() => setHoveredChart(null)}
                >
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
                        strokeDasharray={v === cacheHitThresholdPct ? "4 4" : "0"}
                      />
                      {v === cacheHitThresholdPct && (
                        <line
                          x1={PAD.left}
                          x2={W - PAD.right}
                          y1={toYCache(v)}
                          y2={toYCache(v)}
                          stroke="#ef4444"
                          strokeOpacity={cacheThresholdOpacity}
                          strokeWidth={1}
                          strokeDasharray="4 4"
                        />
                      )}
                      <text x={PAD.left - 6} y={toYCache(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}%</text>
                    </g>
                  ))}
                  {renderXAxisLabels()}
                  {renderGuideLine('cache')}

                  {hasCacheData ? (
                    <>
                      {regions.map(region => {
                        if (!selectedCacheRegions.has(region)) return null
                        const m = byRegion[region]
                        if (!m) return null
                        const dPath = pathFromBuckets(b => {
                          const p = m.get(b)
                          return (p && p.cache_hit_pct != null) ? toYCache(p.cache_hit_pct) : null
                        })
                        if (!dPath) return null

                        return (
                          <g
                            key={`cache-region-group-${region}`}
                            onMouseEnter={() => updateHoveredRegion(region, 'cache')}
                            onMouseLeave={() => updateHoveredRegion(null, 'cache')}
                            onClick={() => handleLineClick(region, 'cache')}
                            className="cursor-pointer"
                          >
                            <path
                              d={dPath}
                              fill="none"
                              stroke={regionMeta[region]?.color ?? '#6b7280'}
                              strokeWidth={activeCacheRegion === region ? 3.5 : hoveredCacheRegion === region ? 2.5 : 1.5}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              strokeOpacity={activeCacheRegion === region ? 1 : hoveredCacheRegion === region ? 0.6 : 0.35}
                              className="transition-all duration-300"
                            />
                          </g>
                        )
                      })}

                      {showGlobalCache && (
                        <g
                          onClick={() => handleLineClick('global', 'cache')}
                          className="cursor-pointer"
                        >
                          <path
                            d={pathFromBuckets((_b, i) => {
                              const v = globalCache[i]?.value
                              return v != null ? toYCache(v) : null
                            })}
                            fill="none"
                            stroke="#22d3ee"
                            strokeWidth={activeCacheRegion === 'global' ? 4 : 2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            strokeOpacity={activeCacheRegion === 'global' ? 1 : 0.5}
                            className="transition-all duration-300"
                          />
                        </g>
                      )}

                      {/* Render insights ONLY for the active/hovered series */}
                      {['global', ...regions].map(target => {
                        const currentActive = hoveredCacheRegion || activeCacheRegion || 'global'
                        if (target !== currentActive) return null

                        const isGlobalVisible = target === 'global' && showGlobalCache
                        const isRegionVisible = target !== 'global' && selectedCacheRegions.has(target)
                        if (!isGlobalVisible && !isRegionVisible) return null

                        const insights = cacheInsights.get(target)
                        if (!insights) return null

                        return insights.map((ins, i) => {
                          const isBad = ins.type === 'min' || ins.type === 'spike-down'
                          const color = isBad ? '#f43f5e' : '#10b981'
                          const isHoveredPoint = hoveredCacheIdx === ins.idx
                          const isActiveTarget = activeCacheRegion === target
                          const isHoveredTarget = hoveredCacheRegion === target

                          return (
                            <g key={`insight-cache-${target}-${ins.type}-${ins.idx}`} className="pointer-events-none">
                              <circle
                                cx={toX(ins.idx)}
                                cy={toYCache(ins.value)}
                                r={isHoveredPoint ? 10 : 5.5}
                                fill={color}
                                fillOpacity={0.4}
                              >
                                <animate attributeName="r" from="4" to="14" dur="1.5s" repeatCount="indefinite" />
                                <animate attributeName="fill-opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                              </circle>
                              <circle
                                cx={toX(ins.idx)}
                                cy={toYCache(ins.value)}
                                r={isHoveredPoint ? 5 : 4}
                                fill={color}
                                stroke="#0B1220"
                                strokeWidth={1.5}
                                className="transition-all duration-300"
                              />
                            </g>
                          )
                        })
                      })}
                    </>
                  ) : (
                    <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.35}>No cache data</text>
                  )}
                </svg>
              )}
            </div>

            <div
              className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-tight opacity-80">Connection Time</div>
                  <div className="h-3 w-px bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">Global Avg</span>
                    <span className={`text-[10px] font-black tabular-nums leading-none mb-[1px] transition-colors ${networkMetric === 'dns' ? 'text-purple-400' :
                      networkMetric === 'tcp' ? 'text-blue-400' :
                        networkMetric === 'tls' ? 'text-fuchsia-400' :
                          'text-cyan-300'
                      }`}>
                      {Math.round(timeframeAvg)}ms
                    </span>
                  </div>
                  <div className="h-3 w-px bg-white/10" />
                  <div className="flex items-center gap-1">
                    {(['net', 'dns', 'tcp', 'tls'] as const).map(m => (
                      <PremiumTooltip
                        key={m}
                        content={
                          m === 'dns' ? "Domain name resolution time." :
                            m === 'tcp' ? "Connection establishment time." :
                              m === 'tls' ? "Security handshake duration." :
                                "Total network time (DNS + TCP + TLS)."
                        }
                        position="bottom-center"
                        panelSizing="hug"
                      >
                        <button
                          type="button"
                          onClick={() => setNetworkMetric(m)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter transition-all ${networkMetric === m
                            ? (m === 'net' ? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/30' :
                              m === 'dns' ? 'bg-purple-400/20 text-purple-400 ring-1 ring-purple-400/30' :
                                m === 'tcp' ? 'bg-blue-400/20 text-blue-400 ring-1 ring-blue-400/30' :
                                  'bg-fuchsia-400/20 text-fuchsia-400 ring-1 ring-fuchsia-400/30')
                            : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                          {m}
                        </button>
                      </PremiumTooltip>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGlobal('net')}
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-all duration-300 ${showGlobalNet
                      ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/30'
                      : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/15 hover:text-zinc-300'}`}
                  >
                    GLOBAL
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleAllRegions('net')}
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-all duration-300 ${selectedNetRegions.size === regions.length
                      ? 'border-zinc-500/50 bg-zinc-500/20 text-zinc-200'
                      : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/15 hover:text-zinc-300'}`}
                  >
                    {selectedNetRegions.size === regions.length ? 'CLEAR' : 'ALL'}
                  </button>

                  {regions.map(region => {
                    const active = selectedNetRegions.has(region)
                    const regionLabel = regionMeta[region]?.label ?? region
                    return (
                      <PremiumTooltip
                        key={`net-region-tip-${region}`}
                        content={regionLabel}
                        position="bottom-center"
                        panelSizing="hug"
                      >
                        <button
                          type="button"
                          onClick={() => toggleRegion(region, 'net')}
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
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto overflow-visible"
                onMouseEnter={() => setHoveredChart('network')}
                onMouseLeave={() => setHoveredChart(null)}
              >
                {[0, Math.round(niceMaxNet / 2), niceMaxNet].map(v => (
                  <g key={v}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={toYNet(v)} y2={toYNet(v)} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
                    <text x={PAD.left - 6} y={toYNet(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                  </g>
                ))}
                {renderXAxisLabels()}
                {renderGuideLine('net')}
                {showGlobalNet && (
                  <g onClick={() => handleLineClick('global', 'net')} className="cursor-pointer">
                    <path
                      d={pathFromBuckets((_b, i) => toYNet(globalNet[i]?.value ?? 0))}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth={activeNetRegion === 'global' ? 4 : 2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeOpacity={activeNetRegion === 'global' ? 1 : 0.5}
                      className="transition-all duration-300"
                    />
                  </g>
                )}


                {regions.map(region => {
                  if (!selectedNetRegions.has(region)) return null
                  const m = byRegion[region]
                  if (!m) return null
                  const dPath = pathFromBuckets(b => {
                    const p = m.get(b)
                    if (!p) return null
                    let val = 0
                    if (networkMetric === 'dns') val = p.dns_avg ?? 0
                    else if (networkMetric === 'tcp') val = p.tcp_avg ?? 0
                    else if (networkMetric === 'tls') val = p.tls_avg ?? 0
                    else val = (p.dns_avg ?? 0) + (p.tcp_avg ?? 0) + (p.tls_avg ?? 0)
                    return toYNet(val)
                  })
                  if (!dPath) return null

                  return (
                    <g
                      key={`net-group-${region}`}
                      onClick={() => handleLineClick(region, 'net')}
                      className="cursor-pointer"
                    >
                      <path
                        d={dPath}
                        fill="none"
                        stroke={regionMeta[region]?.color ?? '#6b7280'}
                        strokeWidth={activeNetRegion === region ? 3.5 : 1.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeOpacity={activeNetRegion === region ? 1 : 0.35}
                        className="transition-all duration-300"
                      />
                    </g>
                  )
                })}

                {/* Render insights ONLY for the active/hovered series */}
                {['global', ...regions].map(target => {
                  const currentActive = hoveredNetRegion || activeNetRegion || 'global'
                  if (target !== currentActive) return null

                  const isGlobalVisible = target === 'global' && showGlobalNet
                  const isRegionVisible = target !== 'global' && selectedNetRegions.has(target)
                  if (!isGlobalVisible && !isRegionVisible) return null

                  const insights = netInsights.get(target)
                  if (!insights) return null

                  return insights.map((ins, i) => {
                    const color = ins.type === 'max' || ins.type === 'spike-up' ? '#f43f5e' : '#10b981'
                    const isHoveredPoint = hoveredNetIdx === ins.idx
                    const isActiveTarget = activeNetRegion === target
                    const isHoveredTarget = hoveredNetRegion === target

                    return (
                      <g key={`insight-net-${target}-${ins.type}-${ins.idx}`} className="pointer-events-none">
                        <circle
                          cx={toX(ins.idx)}
                          cy={toYNet(ins.value)}
                          r={isHoveredPoint ? 10 : 5.5}
                          fill={color}
                          fillOpacity={0.4}
                        >
                          <animate attributeName="r" from="4" to="14" dur="1.5s" repeatCount="indefinite" />
                          <animate attributeName="fill-opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                        <circle
                          cx={toX(ins.idx)}
                          cy={toYNet(ins.value)}
                          r={isHoveredPoint ? 5 : 4}
                          fill={color}
                          stroke="#0B1220"
                          strokeWidth={1.5}
                          className="transition-all duration-300"
                        />
                      </g>
                    )
                  })
                })}
              </svg>
            </div>
          </div>
        </section>
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
