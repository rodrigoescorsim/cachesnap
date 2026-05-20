'use client'

import { useMemo, useState } from 'react'
import { TtfbChart, type ChartPoint } from '@/app/dashboard/monitors/[id]/ttfb-chart'
import { MONITOR_CACHE } from '@/lib/thresholds'
import type { LandingTimeframe } from './landing-timeframe-chips'

/** Pré-habilitadas nos gráficos (pills SPO · TYO · CPT) */
export const LANDING_TRENDS_ENABLED_REGIONS = ['sao-paulo', 'tokyo', 'cape-town'] as const

const DEMO_REGIONS = [
  'cape-town',
  'tokyo',
  'mumbai',
  'frankfurt',
  'sydney',
  'sao-paulo',
  'ohio',
  'oregon',
] as const

type DemoRegion = (typeof DEMO_REGIONS)[number]

const DEMO_REGION_META: Record<string, { label: string; color: string }> = {
  'cape-town': { label: 'Cape Town', color: '#a855f7' },
  tokyo: { label: 'Tokyo', color: '#818cf8' },
  mumbai: { label: 'Mumbai', color: '#ec4899' },
  frankfurt: { label: 'Frankfurt', color: '#3b82f6' },
  sydney: { label: 'Sydney', color: '#ef4444' },
  'sao-paulo': { label: 'São Paulo', color: '#f97316' },
  ohio: { label: 'Ohio', color: '#22c55e' },
  oregon: { label: 'Oregon', color: '#a16207' },
}

/** TTFB médio “normal” por região (ms) — maior spread entre regiões */
const TTFB_BASE: Record<DemoRegion, number> = {
  'cape-town': 185,
  tokyo: 340,
  mumbai: 248,
  frankfurt: 155,
  sydney: 420,
  'sao-paulo': 225,
  ohio: 178,
  oregon: 195,
}

const CACHE_BASE: Record<DemoRegion, number> = {
  'cape-town': 86,
  tokyo: 81,
  mumbai: 84,
  frankfurt: 94,
  sydney: 72,
  'sao-paulo': 88,
  ohio: 96,
  oregon: 91,
}

const NET_BASE: Record<DemoRegion, { dns: number; tcp: number; tls: number }> = {
  'cape-town': { dns: 22, tcp: 14, tls: 21 },
  tokyo: { dns: 19, tcp: 11, tls: 24 },
  mumbai: { dns: 26, tcp: 16, tls: 22 },
  frankfurt: { dns: 16, tcp: 9, tls: 18 },
  sydney: { dns: 24, tcp: 15, tls: 23 },
  'sao-paulo': { dns: 21, tcp: 13, tls: 20 },
  ohio: { dns: 15, tcp: 8, tls: 17 },
  oregon: { dns: 17, tcp: 10, tls: 19 },
}

const RANGE_CONFIG: Record<string, { buckets: number; stepMs: number }> = {
  '1h': { buckets: 12, stepMs: 5 * 60_000 },
  '4h': { buckets: 16, stepMs: 15 * 60_000 },
  '24h': { buckets: 24, stepMs: 60 * 60_000 },
  '7d': { buckets: 28, stepMs: 6 * 60 * 60_000 },
  '30d': { buckets: 30, stepMs: 24 * 60 * 60_000 },
  '90d': { buckets: 30, stepMs: 3 * 24 * 60 * 60_000 },
}

/** Pico ou vale localizado na timeline (phase 0–1) — só TTFB; cache deriva inversamente */
type TimelineEvent = {
  at: number
  width: number
  ttfbAdd: number
  dnsAdd?: number
  tcpAdd?: number
}

const REGION_EVENTS: Record<DemoRegion, TimelineEvent[]> = {
  sydney: [
    { at: 0.52, width: 0.11, ttfbAdd: 680, dnsAdd: 14, tcpAdd: 10 },
    { at: 0.36, width: 0.07, ttfbAdd: 220 },
    { at: 0.7, width: 0.08, ttfbAdd: 310, dnsAdd: 6 },
    { at: 0.15, width: 0.06, ttfbAdd: -95 },
  ],
  frankfurt: [
    { at: 0.16, width: 0.09, ttfbAdd: -72 },
    { at: 0.58, width: 0.06, ttfbAdd: 145 },
    { at: 0.82, width: 0.05, ttfbAdd: 88 },
  ],
  tokyo: [
    { at: 0.26, width: 0.07, ttfbAdd: 260, dnsAdd: 9 },
    { at: 0.46, width: 0.06, ttfbAdd: -58 },
    { at: 0.64, width: 0.05, ttfbAdd: 190 },
    { at: 0.84, width: 0.08, ttfbAdd: 340, tcpAdd: 14 },
  ],
  mumbai: [
    { at: 0.1, width: 0.09, ttfbAdd: 95 },
    { at: 0.44, width: 0.11, ttfbAdd: 240 },
    { at: 0.76, width: 0.13, ttfbAdd: 380, dnsAdd: 18 },
    { at: 0.58, width: 0.05, ttfbAdd: -45 },
  ],
  'sao-paulo': [
    { at: 0.56, width: 0.1, ttfbAdd: 195 },
    { at: 0.3, width: 0.07, ttfbAdd: -52 },
    { at: 0.72, width: 0.06, ttfbAdd: 120 },
  ],
  'cape-town': [
    { at: 0.4, width: 0.08, ttfbAdd: 265, dnsAdd: 12 },
    { at: 0.64, width: 0.07, ttfbAdd: 145 },
    { at: 0.22, width: 0.05, ttfbAdd: -40 },
  ],
  ohio: [
    { at: 0.48, width: 0.06, ttfbAdd: 115 },
    { at: 0.22, width: 0.07, ttfbAdd: -48 },
    { at: 0.68, width: 0.05, ttfbAdd: 78 },
  ],
  oregon: [
    { at: 0.34, width: 0.07, ttfbAdd: 98 },
    { at: 0.68, width: 0.06, ttfbAdd: -62 },
    { at: 0.52, width: 0.05, ttfbAdd: 65 },
  ],
}

function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function eventContribution(phase: number, events: TimelineEvent[]) {
  let ttfbAdd = 0
  let dnsAdd = 0
  let tcpAdd = 0

  for (const e of events) {
    const dist = Math.abs(phase - e.at)
    if (dist >= e.width) continue
    const t = 1 - dist / e.width
    const curve = t * t * (3 - 2 * t)
    ttfbAdd += e.ttfbAdd * curve
    dnsAdd += (e.dnsAdd ?? 0) * curve
    tcpAdd += (e.tcpAdd ?? 0) * curve
  }

  return { ttfbAdd, dnsAdd, tcpAdd }
}

/** Deriva lenta + ruído de probe — diferente por região */
function baselineVariation(region: DemoRegion, phase: number, bucketIdx: number): number {
  const r = DEMO_REGIONS.indexOf(region)
  const noise = (hash01(bucketIdx * 19 + r * 41) - 0.5) * 48

  switch (region) {
    case 'mumbai':
      return phase * 85 + Math.sin(phase * 5.2) * 42 + Math.cos(phase * 13) * 18 + noise
    case 'tokyo':
      return Math.sin(phase * 6.8 + 0.4) * 62 + Math.cos(phase * 11) * 28 + noise * 1.1
    case 'sydney':
      return Math.sin(phase * 4.1) * 72 + Math.sin(phase * 9.3) * 24 + noise * 1.35
    case 'frankfurt':
      return -phase * 28 + Math.sin(phase * 8) * 34 + noise * 0.85
    case 'oregon':
      return -phase * 38 + Math.sin(phase * 6) * 22 + noise * 0.75
    case 'ohio':
      return Math.sin(phase * 7) * 28 + Math.cos(phase * 14) * 12 + noise * 0.7
    case 'sao-paulo':
      return phase * 48 + Math.sin(phase * 3.5 + 1) * 44 + noise
    case 'cape-town':
      return Math.sin(phase * 5.5 + 2) * 55 + Math.cos(phase * 10) * 20 + noise
    default:
      return noise
  }
}

/**
 * Hit rate move inversely to TTFB: latency up → more origin traffic → cache down.
 */
function cacheFromTtfb(region: DemoRegion, ttfb: number, bucketIdx: number): number {
  const base = CACHE_BASE[region]
  const normal = TTFB_BASE[region]
  const ratio = ttfb / normal

  const delta =
    ratio >= 1
      ? -Math.pow(ratio - 1, 0.82) * 42
      : (1 - ratio) * 20

  const r = DEMO_REGIONS.indexOf(region)
  const probeNoise = (hash01(bucketIdx * 23 + r * 37) - 0.5) * 3

  return clamp(base + delta + probeNoise, 48, 100)
}

function buildDemoChartData(range: string): ChartPoint[] {
  const { buckets, stepMs } = RANGE_CONFIG[range] ?? RANGE_CONFIG['24h']
  const now = Date.now()
  const points: ChartPoint[] = []

  for (let i = 0; i < buckets; i++) {
    const bucket = new Date(now - (buckets - 1 - i) * stepMs).toISOString()
    const phase = i / Math.max(buckets - 1, 1)

    for (const region of DEMO_REGIONS) {
      const events = eventContribution(phase, REGION_EVENTS[region])
      const drift = baselineVariation(region, phase, i)
      const ttfb = Math.round(
        clamp(TTFB_BASE[region] + drift + events.ttfbAdd, 38, 1450),
      )
      const cache = cacheFromTtfb(region, ttfb, i)

      const net = NET_BASE[region]
      const dns = Math.round(clamp(net.dns + events.dnsAdd + (hash01(i + region.length) - 0.5) * 11, 6, 58))
      const tcp = Math.round(clamp(net.tcp + events.tcpAdd + (hash01(i * 3 + region.length) - 0.5) * 9, 4, 38))
      const tls = Math.round(clamp(net.tls + (hash01(i * 5 + region.length) - 0.5) * 12, 8, 52))
      const p95Spread =
        1.14 +
        Math.max(0, ttfb / TTFB_BASE[region] - 1) * 0.32 +
        hash01(i * 11 + region.length) * 0.14

      points.push({
        bucket,
        region,
        ttfb_avg: ttfb,
        ttfb_p95: Math.round(ttfb * p95Spread),
        dns_avg: dns,
        tcp_avg: tcp,
        tls_avg: tls,
        cache_hit_pct: Math.round(clamp(cache, 52, 100) * 10) / 10,
      })
    }
  }

  return points
}

export function LandingHistoricalTrendsDemo() {
  const [range, setRange] = useState<LandingTimeframe>('24h')
  const chartData = useMemo(() => buildDemoChartData(range), [range])

  return (
    <div className="landing-showcase-live w-full max-w-[1040px]">
      <TtfbChart
        data={chartData}
        range={range}
        regionMeta={DEMO_REGION_META}
        cacheHitThresholdPct={MONITOR_CACHE.GOOD}
        isDown={false}
        monitorId="landing-demo"
        previewMode
        onRangeChange={(r) => setRange(r as LandingTimeframe)}
        initialEnabledRegions={[...LANDING_TRENDS_ENABLED_REGIONS]}
        initialActiveRegion="tokyo"
      />
    </div>
  )
}
