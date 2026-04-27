'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { formatChartLabel, niceMax, globalBucketAverage, buildP95BandPath } from './ttfb-chart.helpers'
import { TIMING } from './timing-metrics-palette'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { getTtfbColorClass, getCacheColor } from '@/lib/thresholds'
import { AlertTriangle, TrendingUp, TrendingDown, ChevronUp, ChevronDown } from 'lucide-react'

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
}: {
  data: ChartPoint[]
  range: string
  regionMeta: Record<string, RegionRenderMeta>
  cacheHitThresholdPct?: number | null
  isDown?: boolean
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [hoveredChart, setHoveredChart] = useState<'ttfb' | 'cache' | 'network' | null>(null)
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, clientX: 0, clientY: 0, isRight: false, isBottom: false })
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
            if (pct > 40) res.push({ idx: i, type: 'spike-up', diff: v - prev, pct, value: v })
            else if (pct < -40) res.push({ idx: i, type: 'spike-down', diff: v - prev, pct, value: v })
          }
        }
      }

      if (maxIdx !== -1) res.push({ idx: maxIdx, type: 'max', value: maxVal })
      if (minIdx !== -1) res.push({ idx: minIdx, type: 'min', value: minVal })

      const unique = Array.from(new Map(res.map(r => [r.idx + '-' + r.type, r])).values())
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
            if (pct > 40) res.push({ idx: i, type: 'spike-up', diff: v - prev, pct, value: v })
            else if (pct < -40) res.push({ idx: i, type: 'spike-down', diff: v - prev, pct, value: v })
          }
        }
      }

      if (maxIdx !== -1) res.push({ idx: maxIdx, type: 'max', value: maxVal })
      if (minIdx !== -1) res.push({ idx: minIdx, type: 'min', value: minVal })

      const unique = Array.from(new Map(res.map(r => [r.idx + '-' + r.type, r])).values())
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

      let maxVal = -Infinity
      let maxIdx = -1
      let minVal = Infinity
      let minIdx = -1

      const validValues = series.filter(s => s.value != null && s.value >= 0).map(s => s.value)
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
            // For cache, spikes are absolute percentage points usually, 
            // but we'll use a 10pt shift as a "spike" or keep the 40% relative if it's low
            if (diff > 20) res.push({ idx: i, type: 'spike-up', diff, value: v })
            else if (diff < -20) res.push({ idx: i, type: 'spike-down', diff, value: v })
          }
        }
      }

      if (maxIdx !== -1 && maxVal < 100) res.push({ idx: maxIdx, type: 'max', value: maxVal })
      if (minIdx !== -1 && minVal > 0) res.push({ idx: minIdx, type: 'min', value: minVal })

      const unique = Array.from(new Map(res.map(r => [r.idx + '-' + r.type, r])).values())
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

  const handleMouseLeave = () => {
    setHoveredIdx(null)
    setHoveredRegion(null)
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
        label: 'Perfect cache (100%)',
        statusText,
        className: 'border-emerald-300/45 bg-emerald-500/16 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.22),0_0_14px_rgba(16,185,129,0.12)]',
      }
    }

    if (average <= 1) {
      return {
        label: 'All misses (0%)',
        statusText: isTrulyFlat ? 'Consistently bypassing' : 'Persistent cache misses',
        className: 'border-red-300/45 bg-red-500/16 text-red-200 shadow-[0_0_0_1px_rgba(248,113,113,0.22),0_0_14px_rgba(239,68,68,0.14)]',
      }
    }

    return null
  }, [globalCache, isCacheNotReported])
  const cacheGridOpacity = (value: number) => (value === 95 ? 0.1 : 0.04)
  const cacheThresholdOpacity = 0.3


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

  const hoveredWorstRegionTtfb = hoveredBucket != null
    ? regions
      .map(region => {
        const ttfbValue = byRegion[region]?.get(hoveredBucket)?.ttfb_avg
        return ttfbValue != null ? { region, value: ttfbValue } : null
      })
      .filter((entry): entry is { region: string; value: number } => entry != null)
      .sort((a, b) => b.value - a.value)[0] ?? null
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
            {formatChartLabel(allBuckets[hoveredIdx], range)} {range === '7d' || range === '30d' || range === '90d' ? '' : 'UTC'}
          </p>

          {hoveredChart === 'network' ? (
            /* CONNECTION TIME TOOLTIP */
            <>
              <div className={`mb-1.5 px-1.5 py-1 flex flex-col border-b border-white/5 pb-1.5 rounded-md transition-all duration-300 ${hoveredRegion === 'global' ? 'bg-cyan-400/10 ring-1 ring-cyan-400/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : ''}`}>
                <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${hoveredRegion === 'global' ? 'text-cyan-300' : 'text-zinc-400'}`}>GLOBAL</span>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] font-bold uppercase text-zinc-500 tracking-tight">DNS</span>
                    <span className={`text-[11px] font-black tabular-nums ${TIMING.dns.text}`}>{Math.round(globalDns[hoveredIdx].value)}ms</span>
                  </div>
                  <div className="w-px h-2 bg-white/5" />
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] font-bold uppercase text-zinc-500 tracking-tight">TCP</span>
                    <span className={`text-[11px] font-black tabular-nums ${TIMING.tcp.text}`}>{Math.round(globalTcp[hoveredIdx].value)}ms</span>
                  </div>
                  <div className="w-px h-2 bg-white/5" />
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] font-bold uppercase text-zinc-500 tracking-tight">TLS</span>
                    <span className={`text-[11px] font-black tabular-nums ${TIMING.tls.text}`}>{Math.round(globalTls[hoveredIdx].value)}ms</span>
                  </div>
                  <div className="w-px h-2 bg-white/5" />
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] font-bold uppercase text-zinc-500 tracking-tight">NET</span>
                    <span className="text-[11px] font-black tabular-nums text-cyan-300">{Math.round(globalDns[hoveredIdx].value + globalTcp[hoveredIdx].value + globalTls[hoveredIdx].value)}ms</span>
                  </div>
                  <div className="w-px h-2 bg-white/5" />
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] font-bold uppercase text-zinc-500 tracking-tight">TTFB</span>
                    <span className={`text-[11px] font-black tabular-nums ${getTtfbColorClass(globalTtfb[hoveredIdx].value, 'global')}`}>{Math.round(globalTtfb[hoveredIdx].value)}ms</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                {/* Header row */}
                <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-1 mb-1">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Region</span>
                  <div className="flex items-center gap-2">
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">DNS</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">TCP</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">TLS</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">NET</span>
                    <span className="w-[42px] text-right text-[8px] font-black text-zinc-500 uppercase tracking-widest">TTFB</span>
                  </div>
                </div>

                {regions.map(region => {
                  const p = byRegion[region]?.get(allBuckets[hoveredIdx])
                  if (!p) return null
                  const isHovered = hoveredRegion === region
                  const netValue = (p.dns_avg ?? 0) + (p.tcp_avg ?? 0) + (p.tls_avg ?? 0)
                  return (
                    <div
                      key={region}
                      className="flex items-center justify-between gap-4 px-1 py-0.5 rounded-md transition-all duration-300"
                      style={isHovered ? {
                        backgroundColor: `${regionMeta[region]?.color ?? '#6b7280'}15`,
                        boxShadow: `0 0 15px ${(regionMeta[region]?.color ?? '#6b7280')}08`,
                        border: `1px solid ${(regionMeta[region]?.color ?? '#6b7280')}30`,
                      } : {
                        border: '1px solid transparent'
                      }}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={`w-1 h-1 rounded-full shrink-0 transition-transform ${isHovered ? 'scale-125' : ''}`} style={{ backgroundColor: regionMeta[region]?.color ?? '#6b7280' }} />
                        <span className={`text-[9px] font-bold capitalize truncate transition-colors ${isHovered ? 'text-white' : 'text-zinc-300'}`}>
                          {regionMeta[region]?.label ?? region}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 tabular-nums">
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.dns.text}`}>{Math.round(p.dns_avg ?? 0)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.tcp.text}`}>{Math.round(p.tcp_avg ?? 0)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${TIMING.tls.text}`}>{Math.round(p.tls_avg ?? 0)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                        <span className="w-[42px] text-right text-[10px] font-black text-cyan-300">{Math.round(netValue)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                        <span className={`w-[42px] text-right text-[10px] font-black ${getTtfbColorClass(p.ttfb_avg, 'monitor')}`}>{Math.round(p.ttfb_avg)}<span className="text-[8px] opacity-60 ml-0.5">ms</span></span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Performance Advisory Section in Tooltip */}
              {(() => {
                const targetRegion = hoveredRegion || 'global'
                const insights = netInsights.get(targetRegion)
                const pointInsight = insights?.find(ins => ins.idx === hoveredIdx)
                if (!pointInsight) return null

                const isBad = pointInsight.type === 'max' || pointInsight.type === 'spike-up'
                const label = pointInsight.type === 'max' ? 'Peak Latency' :
                  pointInsight.type === 'min' ? 'Best Performance' :
                    pointInsight.type === 'spike-up' ? 'Performance Drop' : 'Performance Boost'

                const description = pointInsight.type === 'max' ? "Slowest response in this period." :
                  pointInsight.type === 'min' ? "Fastest response in this period." :
                    pointInsight.type === 'spike-up' ? "Latency is higher than the average." :
                      "Latency is lower than the average."

                const diffVsBaseline = pointInsight.value - timeframeAvg
                const pctVsBaseline = timeframeAvg > 0 ? (diffVsBaseline / timeframeAvg) * 100 : 0

                const baselineValue = targetRegion === 'global' ? timeframeAvg : (regionNetAvgs.get(targetRegion) || timeframeAvg)
                const baselineLabel = targetRegion === 'global' ? 'global avg' : 'region avg'
                const relDiff = pointInsight.value - baselineValue
                const relPct = baselineValue > 0 ? (relDiff / baselineValue) * 100 : 0

                return (
                  <div className={`mt-2 px-2 py-1.5 rounded-lg border animate-in fade-in slide-in-from-top-1 duration-300 ${isBad ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    {/* Row 1: Label and Value */}
                    <div className="flex items-center justify-between gap-4">
                      <div className={`flex items-center gap-1.5 font-black text-[10px] uppercase tracking-wider ${isBad ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isBad ? <AlertTriangle size={11} className="animate-pulse" /> : <TrendingDown size={11} />}
                        {label}
                      </div>
                      <span className={`text-[11px] font-black tabular-nums ${isBad ? 'text-red-400' : 'text-emerald-400'}`}>
                        {Math.round(pointInsight.value)}ms
                      </span>
                    </div>

                    {/* Row 2: Description and Percentage vs Contextual Baseline */}
                    <div className="flex items-center justify-between gap-4 mt-1 text-[10px] font-medium">
                      <span className="text-zinc-400 italic shrink truncate mr-2">{description}</span>
                      <span className={`font-bold tabular-nums shrink-0 ${relDiff > 0 ? 'text-red-400/90' : 'text-emerald-400/90'}`}>
                        {relDiff > 0 ? '+' : ''}{Math.round(relPct)}% vs {baselineLabel}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </>
          ) : (
            /* DEFAULT TTFB / CACHE TOOLTIP */
            <>
              <div className={`mb-1.5 px-1.5 py-0.5 flex items-center justify-between border-b border-white/5 pb-1.5 rounded-md transition-all duration-300 ${hoveredRegion === 'global' ? 'bg-cyan-400/10 ring-1 ring-cyan-400/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : ''}`}>
                <div className="flex flex-col gap-0.5">
                  <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${hoveredRegion === 'global' ? 'text-cyan-300' : 'text-zinc-400'}`}>GLOBAL</span>
                  <div className="flex items-center gap-4 mt-0.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-sm font-black tabular-nums transition-colors ${getTtfbColorClass(globalTtfb[hoveredIdx].value, 'global')}`}>
                        {Math.round(globalTtfb[hoveredIdx].value)}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-tight transition-colors ${hoveredRegion === 'global' ? 'text-cyan-400/60' : 'text-zinc-500'}`}>ms</span>
                    </div>
                    <div className="w-px h-3 bg-white/5" />
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-sm font-black tabular-nums transition-colors ${hoveredGlobalCache != null ? getCacheColor(hoveredGlobalCache, 'global') : 'text-zinc-500'}`}>
                        {hoveredGlobalCache != null ? Math.round(hoveredGlobalCache) : '—'}%
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-tight transition-colors ${hoveredRegion === 'global' ? 'text-cyan-400/60' : 'text-zinc-500'}`}>cache</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {/* Header row */}
                <div className="flex items-center justify-between gap-6 border-b border-white/5 pb-1 mb-1">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Region</span>
                  <div className="flex items-center gap-3">
                    <span className="w-[42px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">TTFB</span>
                    <span className="w-[42px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">P95</span>
                    <span className="w-[42px] text-right text-[9px] font-black text-zinc-500 uppercase tracking-widest">Cache</span>
                  </div>
                </div>

                {regions.map(region => {
                  const p = byRegion[region]?.get(allBuckets[hoveredIdx])
                  if (!p) return null
                  const isHovered = hoveredRegion === region
                  return (
                    <div
                      key={region}
                      className="flex items-center justify-between gap-6 px-1 py-0.5 rounded-md transition-all duration-300"
                      style={isHovered ? {
                        backgroundColor: `${regionMeta[region]?.color ?? '#6b7280'}15`,
                        boxShadow: `0 0 15px ${(regionMeta[region]?.color ?? '#6b7280')}08`,
                        border: `1px solid ${(regionMeta[region]?.color ?? '#6b7280')}30`,
                      } : {
                        border: '1px solid transparent'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full transition-transform ${isHovered ? 'scale-125' : ''}`} style={{ backgroundColor: regionMeta[region]?.color ?? '#6b7280' }} />
                        <span className={`text-[10px] font-bold capitalize whitespace-nowrap transition-colors ${isHovered ? 'text-white' : 'text-zinc-300'}`}>
                          {regionMeta[region]?.label ?? region}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums">
                        <span className={`w-[42px] text-right text-[11px] font-black transition-colors ${getTtfbColorClass(p.ttfb_avg, 'monitor')}`}>{Math.round(p.ttfb_avg)}ms</span>
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
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* TTFB Performance Advisory Section */}
              {hoveredChart === 'ttfb' && (() => {
                const targetRegion = hoveredRegion || 'global'
                const insights = ttfbInsights.get(targetRegion)
                const pointInsight = insights?.find(ins => ins.idx === hoveredIdx)
                if (!pointInsight) return null

                const isBad = pointInsight.type === 'max' || pointInsight.type === 'spike-up'
                const label = pointInsight.type === 'max' ? 'Peak TTFB' :
                  pointInsight.type === 'min' ? 'Best TTFB' :
                    pointInsight.type === 'spike-up' ? 'Performance Drop' : 'Performance Boost'

                const description = pointInsight.type === 'max' ? "Highest latency in this period." :
                  pointInsight.type === 'min' ? "Lowest latency in this period." :
                    pointInsight.type === 'spike-up' ? "Performance drop in this period." :
                      "Performance boost in this period."

                const baselineValue = targetRegion === 'global' ? ttfbTimeframeAvg : (regionTtfbAvgs.get(targetRegion) || ttfbTimeframeAvg)
                const baselineLabel = targetRegion === 'global' ? 'global avg' : 'region avg'
                const relDiff = pointInsight.value - baselineValue
                const relPct = baselineValue > 0 ? (relDiff / baselineValue) * 100 : 0

                return (
                  <div className={`mt-3 px-2 py-1.5 rounded-lg border animate-in fade-in slide-in-from-top-1 duration-300 ${isBad ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className={`flex items-center gap-1.5 font-black text-[10px] uppercase tracking-wider ${isBad ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isBad ? <AlertTriangle size={11} className="animate-pulse" /> : <TrendingDown size={11} />}
                        {label}
                      </div>
                      <span className={`text-[11px] font-black tabular-nums ${isBad ? 'text-red-400' : 'text-emerald-400'}`}>
                        {Math.round(pointInsight.value)}ms
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 mt-1 text-[10px] font-medium">
                      <span className="text-zinc-400 italic shrink truncate mr-2">{description}</span>
                      <span className={`font-bold tabular-nums shrink-0 ${relDiff > 0 ? 'text-red-400/90' : 'text-emerald-400/90'}`}>
                        {relDiff > 0 ? '+' : ''}{Math.round(relPct)}% vs {baselineLabel}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Cache Performance Advisory Section */}
              {hoveredChart === 'cache' && (() => {
                const targetRegion = hoveredRegion || 'global'
                const insights = cacheInsights.get(targetRegion)
                const pointInsight = insights?.find(ins => ins.idx === hoveredIdx)
                if (!pointInsight) return null

                const isBad = pointInsight.type === 'min' || pointInsight.type === 'spike-down'
                const label = pointInsight.type === 'max' ? 'Peak Efficiency' :
                  pointInsight.type === 'min' ? 'Cache Drop' :
                    pointInsight.type === 'spike-up' ? 'Cache Boost' : 'Cache Drop'

                const description = pointInsight.type === 'max' ? "Best hit rate in this period." :
                  pointInsight.type === 'min' ? "Lowest hit rate in this period." :
                    pointInsight.type === 'spike-up' ? "Efficiency is higher than the average." :
                      "Efficiency is lower than the average."

                const baselineValue = targetRegion === 'global' ? cacheTimeframeAvg : (regionCacheAvgs.get(targetRegion) || cacheTimeframeAvg)
                const baselineLabel = targetRegion === 'global' ? 'global avg' : 'region avg'
                const relDiff = pointInsight.value - baselineValue

                return (
                  <div className={`mt-3 px-2 py-1.5 rounded-lg border animate-in fade-in slide-in-from-top-1 duration-300 ${isBad ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className={`flex items-center gap-1.5 font-black text-[10px] uppercase tracking-wider ${isBad ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isBad ? <AlertTriangle size={11} className="animate-pulse" /> : <TrendingDown size={11} />}
                        {label}
                      </div>
                      <span className={`text-[11px] font-black tabular-nums ${isBad ? 'text-red-400' : 'text-emerald-400'}`}>
                        {Math.round(pointInsight.value)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 mt-1 text-[10px] font-medium">
                      <span className="text-zinc-400 italic shrink truncate mr-2">{description}</span>
                      <span className={`font-bold tabular-nums shrink-0 ${relDiff > 0 ? 'text-emerald-400/90' : 'text-red-400/90'}`}>
                        {relDiff > 0 ? '+' : ''}{Math.round(relDiff)}% vs {baselineLabel}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {allBuckets.length < 2 ? (
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
            <p className="text-sm text-zinc-500 italic font-medium">Not enough data points in this time window.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700"
            onMouseEnter={() => setHoveredChart('ttfb')}
            onMouseLeave={() => setHoveredChart(null)}
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
                const isHovered = hoveredRegion === region
                const isOtherHovered = hoveredRegion !== null && !isHovered
                return (
                  <path
                    key={`band-${region}`}
                    d={bandPath}
                    fill={regionMeta[region]?.color ?? '#6b7280'}
                    fillOpacity={isHovered ? 0.15 : isOtherHovered ? 0.02 : 0.08}
                    stroke="none"
                    className="transition-all duration-300 pointer-events-none"
                  />
                )
              })}
              {regions.map(region => {
                if (!selectedTtfbRegions.has(region)) return null
                const m = byRegion[region]
                if (!m) return null
                const points = allBuckets.map((b, i) => m.has(b) ? `${toX(i)},${toYTtfb(m.get(b)!.ttfb_avg)}` : null).filter(Boolean).join(' ')
                const isHovered = hoveredRegion === region
                const isOtherHovered = hoveredRegion !== null && !isHovered
                return (
                  <g key={`group-${region}`} onMouseEnter={() => setHoveredRegion(region)} onMouseLeave={() => setHoveredRegion(null)}>
                    {/* Transparent hit area for easier hovering */}
                    <polyline
                      points={points}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      className="cursor-pointer"
                    />
                    <polyline
                      points={points}
                      fill="none"
                      stroke={regionMeta[region]?.color ?? '#6b7280'}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeOpacity={isHovered ? 1 : isOtherHovered ? 0.15 : (hoveredIdx === null ? 1 : byRegion[region]?.has(allBuckets[hoveredIdx]) ? 1 : 0.2)}
                      className="transition-all duration-300 pointer-events-none"
                    />
                  </g>
                )
              })}
              {showGlobalTtfb && (
                <g onMouseEnter={() => setHoveredRegion('global')} onMouseLeave={() => setHoveredRegion(null)}>
                  {/* Hit area for global line */}
                  <polyline
                    points={globalTtfb.map((bucket, i) => `${toX(i)},${toYTtfb(bucket.value)}`).join(' ')}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    className="cursor-pointer"
                  />
                  <polyline
                    points={globalTtfb.map((bucket, i) => `${toX(i)},${toYTtfb(bucket.value)}`).join(' ')}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth={hoveredRegion === 'global' ? 3.5 : 2.4}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeOpacity={hoveredRegion === 'global' ? 1 : hoveredRegion !== null ? 0.15 : 1}
                    className="transition-all duration-300 pointer-events-none"
                  />
                </g>
              )}

              {/* Advisory Markers (Max, Min, Spikes) */}
              {(() => {
                const targetRegion = hoveredRegion || 'global'
                const insights = ttfbInsights.get(targetRegion)
                if (!insights) return null

                const isGlobalVisible = showGlobalTtfb && targetRegion === 'global'
                const isRegionVisible = selectedTtfbRegions.has(targetRegion)

                if (!isGlobalVisible && !isRegionVisible) return null

                return insights.map((ins, i) => {
                  const color = ins.type === 'max' || ins.type === 'spike-up' ? '#f43f5e' : '#10b981'
                  const isHoveredPoint = hoveredIdx === ins.idx

                  return (
                    <g key={`ttfb-insight-${targetRegion}-${ins.type}-${ins.idx}`} className="pointer-events-none">
                      <circle
                        cx={toX(ins.idx)}
                        cy={toYTtfb(ins.value)}
                        r={isHoveredPoint ? 8 : 4}
                        fill={color}
                        fillOpacity={0.2}
                      >
                        <animate attributeName="r" from="4" to="12" dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="fill-opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                      <circle
                        cx={toX(ins.idx)}
                        cy={toYTtfb(ins.value)}
                        r={isHoveredPoint ? 4 : 3}
                        fill={color}
                        stroke="#0B1220"
                        strokeWidth={1}
                        className="transition-all duration-300"
                      />
                    </g>
                  )
                })
              })()}
            </svg>
          </div>

          <div
            className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700"
            onMouseEnter={() => setHoveredChart('cache')}
            onMouseLeave={() => setHoveredChart(null)}
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
                  <div className="flex items-center gap-1.5 ml-2">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">Global Avg</span>
                    <span className="text-[10px] font-black text-emerald-400 tabular-nums leading-none mb-[1px]">
                      {Math.round(cacheTimeframeAvg)}%
                    </span>
                  </div>
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
                      onClick={() => setShowGlobalCache(prev => !prev)}
                      className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors ${showGlobalCache ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-border bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                    >
                      Global
                    </button>
                    <PremiumTooltip
                      content="Show all regions."
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

                      const isHovered = hoveredRegion === region
                      const isOtherHovered = hoveredRegion !== null && !isHovered

                      return (
                        <g key={`cache-group-${region}`} onMouseEnter={() => setHoveredRegion(region)} onMouseLeave={() => setHoveredRegion(null)}>
                          {/* Hit area */}
                          <polyline
                            points={points}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={12}
                            className="cursor-pointer"
                          />
                          <polyline
                            points={points}
                            fill="none"
                            stroke={regionMeta[region]?.color ?? '#6b7280'}
                            strokeWidth={isHovered ? 2.5 : 1.5}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            strokeOpacity={isHovered ? 1 : isOtherHovered ? 0.15 : (hoveredIdx === null ? 1 : byRegion[region]?.has(allBuckets[hoveredIdx]) ? 1 : 0.2)}
                            className="transition-all duration-300 pointer-events-none"
                          />
                        </g>
                      )
                    })}

                    {showGlobalCache && (
                      <g onMouseEnter={() => setHoveredRegion('global')} onMouseLeave={() => setHoveredRegion(null)}>
                        {/* Hit area for global cache */}
                        <polyline
                          points={globalCache.map((bucket, i) => bucket.value != null ? `${toX(i)},${toYCache(bucket.value)}` : null).filter(Boolean).join(' ')}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={12}
                          className="cursor-pointer"
                        />
                        <polyline
                          points={globalCache.map((bucket, i) => bucket.value != null ? `${toX(i)},${toYCache(bucket.value)}` : null).filter(Boolean).join(' ')}
                          fill="none"
                          stroke="#22d3ee"
                          strokeWidth={hoveredRegion === 'global' ? 3.5 : 2.4}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          strokeOpacity={hoveredRegion === 'global' ? 1 : (hoveredRegion !== null ? 0.15 : 1)}
                          className="transition-all duration-300 pointer-events-none"
                        />
                      </g>
                    )}

                    {/* Advisory Markers (Max, Min, Spikes) */}
                    {(() => {
                      const targetRegion = hoveredRegion || 'global'
                      const insights = cacheInsights.get(targetRegion)
                      if (!insights) return null

                      const isGlobalVisible = showGlobalCache && targetRegion === 'global'
                      const isRegionVisible = selectedCacheRegions.has(targetRegion)

                      if (!isGlobalVisible && !isRegionVisible) return null

                      return insights.map((ins, i) => {
                        const isBad = ins.type === 'min' || ins.type === 'spike-down'
                        const color = isBad ? '#f43f5e' : '#10b981'
                        const isHoveredPoint = hoveredIdx === ins.idx

                        return (
                          <g key={`cache-insight-${targetRegion}-${ins.type}-${ins.idx}`} className="pointer-events-none">
                            <circle
                              cx={toX(ins.idx)}
                              cy={toYCache(ins.value)}
                              r={isHoveredPoint ? 8 : 4}
                              fill={color}
                              fillOpacity={0.2}
                            >
                              <animate attributeName="r" from="4" to="12" dur="1.5s" repeatCount="indefinite" />
                              <animate attributeName="fill-opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite" />
                            </circle>
                            <circle
                              cx={toX(ins.idx)}
                              cy={toYCache(ins.value)}
                              r={isHoveredPoint ? 4 : 3}
                              fill={color}
                              stroke="#0B1220"
                              strokeWidth={1}
                              className="transition-all duration-300"
                            />
                          </g>
                        )
                      })
                    })()}
                  </>
                ) : (
                  <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.35}>No cache data</text>
                )}
              </svg>
            )}
          </div>

          <div
            className="group rounded-2xl border border-border bg-surface p-4 shadow-sm relative overflow-hidden transition-all hover:border-zinc-700"
            onMouseEnter={() => setHoveredChart('network')}
            onMouseLeave={() => setHoveredChart(null)}
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
                  {(['dns', 'tcp', 'tls', 'net'] as const).map(m => (
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
                  onClick={() => setShowGlobalNet(prev => !prev)}
                  className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors ${showGlobalNet ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-border bg-white/5 text-zinc-400 hover:bg-white/10'}`}
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
                      setSelectedNetRegions(prev => {
                        const allSelected = regions.length > 0 && regions.every(region => prev.has(region))
                        return allSelected ? new Set() : new Set(regions)
                      })
                    }}
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-tight transition-colors ${selectedNetRegions.size === regions.length && regions.length > 0 ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-border bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                  >
                    All
                  </button>
                </PremiumTooltip>
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
                        onClick={() => {
                          setSelectedNetRegions(prev => {
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
              {[0, Math.round(niceMaxNet / 2), niceMaxNet].map(v => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={toYNet(v)} y2={toYNet(v)} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
                  <text x={PAD.left - 6} y={toYNet(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                </g>
              ))}
              <XAxisLabels />
              <GuideLine />
              {showGlobalNet && (
                <g onMouseEnter={() => setHoveredRegion('global')} onMouseLeave={() => setHoveredRegion(null)}>
                  {/* Global Net (Sum or specific metric) */}
                  <polyline
                    points={globalNet.map((g, i) => `${toX(i)},${toYNet(g.value)}`).join(' ')}
                    fill="none"
                    stroke={networkMetric === 'dns' ? TIMING.dns.stroke : networkMetric === 'tcp' ? TIMING.tcp.stroke : networkMetric === 'tls' ? TIMING.tls.stroke : '#22d3ee'}
                    strokeWidth={hoveredRegion === 'global' ? 3.5 : 2.4}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeOpacity={hoveredRegion === 'global' ? 1 : (hoveredRegion !== null ? 0.15 : 1)}
                    className="transition-all duration-300 pointer-events-none"
                  />
                  {/* Hit area */}
                  <polyline
                    points={globalNet.map((g, i) => `${toX(i)},${toYNet(g.value)}`).join(' ')}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className="cursor-pointer"
                  />
                </g>
              )}


              {regions.map(region => {
                if (!selectedNetRegions.has(region)) return null
                const m = byRegion[region]
                if (!m) return null
                const points = allBuckets.map((b, i) => {
                  const p = m.get(b)
                  if (!p) return null
                  let val = 0
                  if (networkMetric === 'dns') val = p.dns_avg ?? 0
                  else if (networkMetric === 'tcp') val = p.tcp_avg ?? 0
                  else if (networkMetric === 'tls') val = p.tls_avg ?? 0
                  else val = (p.dns_avg ?? 0) + (p.tcp_avg ?? 0) + (p.tls_avg ?? 0)
                  return `${toX(i)},${toYNet(val)}`
                }).filter(Boolean).join(' ')

                const isHovered = hoveredRegion === region
                const isOtherHovered = hoveredRegion !== null && !isHovered

                return (
                  <g key={`net-group-${region}`} onMouseEnter={() => setHoveredRegion(region)} onMouseLeave={() => setHoveredRegion(null)}>
                    {/* Transparent hit area */}
                    <polyline
                      points={points}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      className="cursor-pointer"
                    />
                    <polyline
                      points={points}
                      fill="none"
                      stroke={regionMeta[region]?.color ?? '#6b7280'}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeOpacity={isHovered ? 1 : isOtherHovered ? 0.15 : (hoveredIdx === null ? 1 : byRegion[region]?.has(allBuckets[hoveredIdx]) ? 1 : 0.2)}
                      className="transition-all duration-300 pointer-events-none"
                    />
                  </g>
                )
              })}

              {/* Advisory Markers (Max, Min, Spikes) */}
              {(() => {
                const targetRegion = hoveredRegion || 'global'
                const insights = netInsights.get(targetRegion)
                if (!insights) return null

                // Only show markers for the currently active/hovered context to avoid clutter
                const isGlobalVisible = showGlobalNet && targetRegion === 'global'
                const isRegionVisible = selectedNetRegions.has(targetRegion)

                if (!isGlobalVisible && !isRegionVisible) return null

                return insights.map((ins, i) => {
                  const color = ins.type === 'max' || ins.type === 'spike-up' ? '#f43f5e' : '#10b981'
                  const isHoveredPoint = hoveredIdx === ins.idx

                  return (
                    <g key={`insight-${targetRegion}-${ins.type}-${ins.idx}`} className="pointer-events-none">
                      {/* Pulse effect for spikes */}
                      <circle
                        cx={toX(ins.idx)}
                        cy={toYNet(ins.value)}
                        r={isHoveredPoint ? 8 : 4}
                        fill={color}
                        fillOpacity={0.2}
                      >
                        <animate attributeName="r" from="4" to="12" dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="fill-opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                      <circle
                        cx={toX(ins.idx)}
                        cy={toYNet(ins.value)}
                        r={isHoveredPoint ? 4 : 3}
                        fill={color}
                        stroke="#0B1220"
                        strokeWidth={1}
                        className="transition-all duration-300"
                      />
                    </g>
                  )
                })
              })()}
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
