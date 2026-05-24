'use client'

import { useMemo, useState } from 'react'
import { Gauge, Zap } from 'lucide-react'
import { ViewSectionHeader } from '@/components/dashboard/dashboard-ui'
import { PerformanceTable, type RegionStat } from '@/app/dashboard/monitors/[id]/performance-table'
import { ProbeWaterfall, type WaterfallProbe } from '@/app/dashboard/monitors/[id]/probe-waterfall'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { getCacheColor, getCacheTooltip, getTtfbColorClass, getTtfbTooltip, MONITOR_CACHE, MONITOR_TTFB } from '@/lib/thresholds'
import { LandingTimeframeChips, type LandingTimeframe } from './landing-timeframe-chips'

const REGION_LABELS: Record<string, string> = {
  tokyo: 'Tokyo',
  sydney: 'Sydney',
  'sao-paulo': 'São Paulo',
  mumbai: 'Mumbai',
  frankfurt: 'Frankfurt',
  ohio: 'Ohio',
  oregon: 'Oregon',
  'cape-town': 'Cape Town',
}

const GLOBAL_AVG_TTFB = 244
const GLOBAL_HIT_RATE = 79

function baseStat(overrides: Partial<RegionStat> & { region: string }): RegionStat {
  return {
    region: overrides.region,
    probe_count: 96,
    ttfb_avg_ms: overrides.ttfb_avg_ms ?? 244,
    edge_hit_avg_ms: overrides.edge_hit_avg_ms ?? 120,
    origin_miss_avg_ms: overrides.origin_miss_avg_ms ?? 820,
    bypass_ttfb_avg_ms: null,
    ttfb_p95_ms: null,
    ttfb_min_ms: overrides.ttfb_min_ms ?? 41,
    ttfb_max_ms: overrides.ttfb_max_ms ?? 1998,
    download_avg_ms: 250,
    total_avg_ms: 494,
    dns_avg_ms: 21,
    tcp_avg_ms: 14,
    tls_avg_ms: 20,
    edge_avg_ms: 48,
    origin_avg_ms: 210,
    redirect_avg: 0,
    common_served_by: overrides.common_served_by ?? 'cloudfront',
    common_cdn_provider: overrides.common_cdn_provider ?? 'AWS CloudFront',
    common_http_version: 'HTTP/2',
    common_cache_status: overrides.common_cache_status ?? 'HIT',
    error_count: 0,
    cache_cdn_samples: 88,
    cache_edge_hit_samples: 70,
    cache_hit_pct: overrides.cache_hit_pct ?? 85,
    uptime_pct: 100,
    max_age_s: 3600,
    last_probe_at: new Date(),
    common_status_code: 200,
  }
}

const DEMO_STATS: RegionStat[] = [
  baseStat({
    region: 'tokyo',
    ttfb_avg_ms: 364,
    edge_hit_avg_ms: 55,
    origin_miss_avg_ms: 890,
    cache_hit_pct: 58.1,
    ttfb_min_ms: 41,
    ttfb_max_ms: 1998,
    common_served_by: 'nrt52',
    common_cdn_provider: 'AWS CloudFront',
  }),
  baseStat({
    region: 'sydney',
    ttfb_avg_ms: 342,
    edge_hit_avg_ms: 930,
    origin_miss_avg_ms: 1200,
    cache_hit_pct: 62.4,
    common_served_by: 'syd1',
  }),
  baseStat({
    region: 'sao-paulo',
    ttfb_avg_ms: 298,
    edge_hit_avg_ms: 88,
    origin_miss_avg_ms: 710,
    cache_hit_pct: 91.2,
    common_served_by: 'gru3',
  }),
  baseStat({
    region: 'mumbai',
    ttfb_avg_ms: 276,
    edge_hit_avg_ms: 95,
    origin_miss_avg_ms: 680,
    cache_hit_pct: 88.5,
    common_served_by: 'bom1',
  }),
  baseStat({
    region: 'frankfurt',
    ttfb_avg_ms: 248,
    edge_hit_avg_ms: 62,
    origin_miss_avg_ms: 520,
    cache_hit_pct: 94.1,
    common_served_by: 'fra6',
  }),
  baseStat({
    region: 'ohio',
    ttfb_avg_ms: 231,
    edge_hit_avg_ms: 58,
    origin_miss_avg_ms: 490,
    cache_hit_pct: 96.3,
    common_served_by: 'cmh68',
  }),
  baseStat({
    region: 'oregon',
    ttfb_avg_ms: 218,
    edge_hit_avg_ms: 72,
    origin_miss_avg_ms: 460,
    cache_hit_pct: 97.8,
    common_served_by: 'pdx2',
  }),
  baseStat({
    region: 'cape-town',
    ttfb_avg_ms: 105,
    edge_hit_avg_ms: 98,
    origin_miss_avg_ms: 410,
    cache_hit_pct: 100,
    common_served_by: 'cpt1',
  }),
]

function buildGlobalWaterfallProbe(stats: RegionStat[]): WaterfallProbe {
  const n = stats.length
  const avg = (fn: (s: RegionStat) => number | null) =>
    Math.round(stats.reduce((acc, s) => acc + (fn(s) || 0), 0) / n)

  return {
    region: 'Global',
    dns_ms: avg((s) => s.dns_avg_ms),
    tls_ms: avg((s) => s.tls_avg_ms),
    ttfb_ms: GLOBAL_AVG_TTFB,
    download_ms: avg((s) => s.download_avg_ms),
    total_ms: avg((s) => s.total_avg_ms),
    edge_ms: avg((s) => s.edge_avg_ms),
    origin_ms: avg((s) => s.origin_avg_ms),
    redirect_count: 0,
    cache_status: `${GLOBAL_HIT_RATE}% HIT`,
    served_by: 'Multi-CDN',
    cdn_provider: 'Various',
    age_s: 3600,
    server_timing_breakdown: { tcp_ms: avg((s) => s.tcp_avg_ms) },
    probed_at: null,
  }
}

export function LandingPeriodPerformanceDemo() {
  const [range, setRange] = useState<LandingTimeframe>('24h')
  const waterfallProbe = useMemo(() => buildGlobalWaterfallProbe(DEMO_STATS), [])

  const rangeLabel = range.toUpperCase()

  return (
    <div className="landing-showcase-live w-full max-w-[1010px] space-y-6">
      <section className="space-y-4">
        <ViewSectionHeader
          title={
            <div className="flex items-baseline gap-2">
              <span>Period Performance</span>
              <span className="text-[11px] font-black uppercase tracking-[0.1em] text-zinc-400 opacity-70">
                · {rangeLabel}
              </span>
            </div>
          }
        >
          <LandingTimeframeChips value={range} onChange={setRange} />
        </ViewSectionHeader>

        <div className="cs-card cs-card-glass overflow-hidden border-white/10">
          <div className="cs-card-wash opacity-40" />
          <div className="relative z-10">
            <div className="grid grid-cols-1 border-b border-white/5 sm:grid-cols-2">
              <div className="block px-5 py-4 transition-colors hover:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <PremiumTooltip content={`Average Time to First Byte during the last ${rangeLabel} across all regions`}>
                    <p className="cs-metric-card-label !text-[11px]">Global TTFB</p>
                  </PremiumTooltip>
                  <PremiumTooltip content={getTtfbTooltip(GLOBAL_AVG_TTFB, 'global')}>
                    <div className="flex items-center gap-2">
                      <div className="flex items-baseline gap-0.5">
                        <span className={`text-[26px] font-black leading-none tracking-tight ${getTtfbColorClass(GLOBAL_AVG_TTFB, 'global')}`}>
                          {GLOBAL_AVG_TTFB}
                        </span>
                        <span className={`text-[13px] font-black uppercase tracking-wider opacity-90 ${getTtfbColorClass(GLOBAL_AVG_TTFB, 'global')}`}>
                          ms
                        </span>
                      </div>
                      <Gauge className={`h-5 w-5 stroke-[2.5] ${getTtfbColorClass(GLOBAL_AVG_TTFB, 'global')}`} />
                    </div>
                  </PremiumTooltip>
                </div>
              </div>

              <div className="block px-5 py-4 transition-colors hover:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <PremiumTooltip content={`Average cache hit rate from CDN edge cache during the last ${rangeLabel} across all regions`}>
                    <p className="cs-metric-card-label !text-[11px]">Global Cache Hit Rate</p>
                  </PremiumTooltip>
                  <PremiumTooltip content={getCacheTooltip(GLOBAL_HIT_RATE, 'global')}>
                    <div className="flex items-center gap-2">
                      <div className="flex items-baseline gap-0.5">
                        <span className={`text-[26px] font-black leading-none tracking-tight ${getCacheColor(GLOBAL_HIT_RATE, 'global')}`}>
                          {GLOBAL_HIT_RATE}
                        </span>
                        <span className={`text-[13px] font-black uppercase tracking-wider opacity-90 ${getCacheColor(GLOBAL_HIT_RATE, 'global')}`}>
                          %
                        </span>
                      </div>
                      <Zap className={`h-5 w-5 fill-current ${getCacheColor(GLOBAL_HIT_RATE, 'global')}`} />
                    </div>
                  </PremiumTooltip>
                </div>
              </div>
            </div>

            <div className="bg-black/10 p-5">
              <div className="mb-4 flex items-center gap-2">
                <p className="cs-view-section-title !text-[10px] !text-zinc-400">Global Performance Breakdown</p>
              </div>
              <ProbeWaterfall
                probes={[waterfallProbe]}
                regionLabels={{ Global: 'Global Aggregate' }}
                hideHeader
              />
            </div>
          </div>
        </div>

        <PerformanceTable
          stats={DEMO_STATS}
          regionLabels={REGION_LABELS}
          regionDescriptions={{}}
          globalAvgTtfb={GLOBAL_AVG_TTFB}
          thresholdMs={MONITOR_TTFB.SLOW}
          thresholdHitMs={MONITOR_TTFB.FAST}
          cacheWarnPct={MONITOR_CACHE.GOOD}
          cacheCriticalPct={MONITOR_CACHE.LOW}
        />
      </section>
    </div>
  )
}
