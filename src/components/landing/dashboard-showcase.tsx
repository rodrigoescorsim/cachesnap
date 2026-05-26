'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { LandingSectionBlend } from './landing-section-blend'
import {
  LANDING_BG_DASHBOARD_SECTION,
  LANDING_BG_PLATFORM_SECTION,
} from './landing-section-bg'

const DEMO_SKELETON = <div className="min-h-[340px] w-full animate-pulse rounded-xl bg-white/[0.03]" />

const LandingEdgeVsOriginDemo = dynamic(
  () => import('./landing-edge-vs-origin-demo').then(m => ({ default: m.LandingEdgeVsOriginDemo })),
  { ssr: false, loading: () => DEMO_SKELETON },
)

const LandingMonitorsDemo = dynamic(
  () => import('./landing-monitors-demo').then(m => ({ default: m.LandingMonitorsDemo })),
  { ssr: false, loading: () => DEMO_SKELETON },
)

const LandingPeriodPerformanceDemo = dynamic(
  () => import('./landing-period-performance-demo').then(m => ({ default: m.LandingPeriodPerformanceDemo })),
  { ssr: false, loading: () => DEMO_SKELETON },
)

const LandingHistoricalTrendsDemo = dynamic(
  () => import('./landing-historical-trends-demo').then(m => ({ default: m.LandingHistoricalTrendsDemo })),
  { ssr: false, loading: () => DEMO_SKELETON },
)

/** Mesmo overlay do card Intelligent Routing — radiais nos cantos, não vertical */
const CARD_SPOTLIGHT_GRADIENT =
  'radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.12) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(34, 255, 136, 0.1) 0%, transparent 55%)'

function softAmbient(primary: string, secondary?: string): string {
  const mid = secondary ?? 'transparent'
  return `linear-gradient(180deg, ${primary} 0%, ${mid} 48%, transparent 100%)`
}

type Slide = {
  id: string
  kind: 'live'
  live: 'edge-vs-origin' | 'period-performance' | 'monitors' | 'historical-trends'
  maxWidth: number
  mobileImageHeight: number
  title: string
  tabLabel: string
  description: string
  ambient: string
  mobileImage: string
}

const PLATFORM_FEATURE_COLUMNS = [
  [
    'Real-time global probes from multiple continents',
    'Live TTFB + DNS, TCP, TLS connection breakdown',
    'Real cache hit/miss rates with Edge Cache Age analysis',
    'Edge vs Origin performance deltas and comparison',
    'Flexible time ranges: 1h, 4h, 24h, 7d, 30d, 90d',
  ],
  [
    'Recent performance spikes & TTFB anomaly detection',
    'Latency trends, patterns and intelligent anomaly detection',
    'Weekly heatmaps, hourly patterns and historical insights',
    'Performance baselines and historical comparisons',
    'Live sync and real-time regional monitoring',
  ],
  [
    'Global Resilience Score',
    'Active Incidents with smart grouping',
    'Configurable alerts by threshold and behavioral change',
    'Global Security Profile with automated scoring',
    'Intelligent Advisor with actionable recommendations',
  ],
] as const

function PlatformFeatureCard({ text }: { text: string }) {
  return (
    <li className="group relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-white/[0.1] bg-[#0e1826] px-4 py-3.5 text-sm leading-snug text-zinc-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_2px_10px_-3px_rgba(0,0,0,0.38)] transition-[border-color,background-color,box-shadow,color] duration-200 hover:border-white/[0.14] hover:bg-[#101c2a] hover:text-zinc-100 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09),0_4px_18px_-4px_rgba(0,0,0,0.45)]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-[rgba(var(--brand-primary-rgb),0.04)]"
        aria-hidden
      />
      <svg
        className="relative z-10 mt-0.5 h-4 w-4 shrink-0 transition-[filter] duration-200 group-hover:drop-shadow-[0_0_6px_rgba(var(--brand-primary-rgb),0.4)]"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        style={{ color: 'var(--brand-primary)' }}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
      </svg>
      <span className="relative z-10">{text}</span>
    </li>
  )
}

const SLIDES: Slide[] = [
  {
    id: 'edge',
    kind: 'live',
    live: 'edge-vs-origin',
    maxWidth: 1042,
    mobileImageHeight: 821,
    title: 'Edge vs Origin',
    tabLabel: 'Edge vs Origin',
    description: 'See exactly how much your CDN saves per region — edge HIT vs origin MISS, side by side.',
    ambient: softAmbient('rgba(34,255,136,0.06)', 'rgba(16,185,129,0.04)'),
    mobileImage: '/screenshots/edge-vs-origin.png',
  },
  {
    id: 'trends',
    kind: 'live',
    live: 'historical-trends',
    maxWidth: 1040,
    mobileImageHeight: 1092,
    title: 'Historical trends',
    tabLabel: 'Trends',
    description: 'Response times and cache hit rates over time, per region. Spot latency issues before users do.',
    ambient: softAmbient('rgba(244,114,182,0.05)', 'rgba(251,191,36,0.04)'),
    mobileImage: '/screenshots/trends.png',
  },
  {
    id: 'performance',
    kind: 'live',
    live: 'period-performance',
    maxWidth: 1010,
    mobileImageHeight: 639,
    title: 'Period performance',
    tabLabel: 'Performance',
    description: 'Edge vs origin response times per region for any time window.',
    ambient: softAmbient('rgba(34,211,238,0.06)', 'rgba(20,184,166,0.04)'),
    mobileImage: '/screenshots/performance.png',
  },
  {
    id: 'monitors',
    kind: 'live',
    live: 'monitors',
    maxWidth: 1224,
    mobileImageHeight: 1078,
    title: 'Monitors',
    tabLabel: 'Monitors',
    description: 'Every URL in one view — global averages, per-site metrics, regional health, and open incidents.',
    ambient: softAmbient('rgba(99,102,241,0.07)', 'rgba(56,189,248,0.04)'),
    mobileImage: '/screenshots/monitors.png',
  },
]

function ShowcasePreview({
  slide,
  visible,
  isMobile,
}: {
  slide: Slide
  visible: boolean
  isMobile: boolean
}) {
  const maxWidth = slide.maxWidth

  if (isMobile && slide.mobileImage) {
    return (
      <div
        className="relative mx-auto w-full"
        style={{ maxWidth }}
      >
        <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#0a101c] relative flex items-center justify-center">
          <Image
            src={slide.mobileImage}
            alt={slide.title}
            width={slide.maxWidth}
            height={slide.mobileImageHeight}
            className="block h-auto w-full select-none"
            style={{ height: 'auto' }}
            sizes="(max-width: 768px) 100vw, 80vw"
            draggable={false}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`landing-showcase-reveal relative mx-auto w-full overflow-x-auto ${visible ? 'is-visible' : ''}`}
      style={{ maxWidth }}
    >
      {slide.live === 'edge-vs-origin' ? (
        <LandingEdgeVsOriginDemo />
      ) : slide.live === 'period-performance' ? (
        <LandingPeriodPerformanceDemo />
      ) : slide.live === 'monitors' ? (
        <LandingMonitorsDemo />
      ) : (
        <LandingHistoricalTrendsDemo />
      )}
    </div>
  )
}

export function DashboardShowcase() {
  const [active, setActive] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)')
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const handleTabChange = (index: number) => {
    if (index === active) return
    setIsTransitioning(true)
    setTimeout(() => {
      setActive(index)
      setIsTransitioning(false)
    }, 180)
  }

  return (
    <>
      <section
        id="platform"
        className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 overflow-hidden"
        style={{ backgroundColor: LANDING_BG_PLATFORM_SECTION }}
        aria-label="Platform"
      >
        <div className="py-12 sm:py-16">
          <div className="cs-container-adaptive">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
              Platform
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl sm:leading-tight">
              Everything you need to understand and optimize your edge — instantly.
            </h2>
          </div>

          <div className="cs-card cs-card-glass relative w-full overflow-hidden transition-all duration-300 hover:scale-[1.005]">
            <div className="cs-card-wash" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0 opacity-100"
              style={{ backgroundImage: CARD_SPOTLIGHT_GRADIENT }}
              aria-hidden
            />

            <div className="relative z-10 p-8 sm:p-12">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                {PLATFORM_FEATURE_COLUMNS.map((column, columnIndex) => (
                  <ul key={columnIndex} className="flex flex-col gap-3 sm:gap-3.5">
                    {column.map((item) => (
                      <PlatformFeatureCard key={item} text={item} />
                    ))}
                  </ul>
                ))}
              </div>

              <div className="mt-6 border-t border-white/[0.06] pt-6 text-center sm:mt-8 sm:pt-8">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {['No agents', 'No SDKs', 'No configuration'].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                Just paste your URL and get insights in seconds.
              </p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </section>

      <LandingSectionBlend
        from={LANDING_BG_PLATFORM_SECTION}
        to={LANDING_BG_DASHBOARD_SECTION}
      />

      <section
        id="dashboard"
        className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 scroll-mt-24 overflow-hidden"
        style={{ backgroundColor: LANDING_BG_DASHBOARD_SECTION }}
        aria-label="Dashboard"
      >
        <div className="cs-container-adaptive py-12 sm:py-16">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
              Dashboard
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl sm:leading-tight">
              Real examples of the interfaces you&apos;ll work with.
            </h2>
          </div>

          <div className="relative mx-auto w-full">
            <div
              className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-white/[0.14] via-white/[0.05] to-[rgba(var(--brand-primary-rgb),0.14)] opacity-70"
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.12] shadow-[0_28px_56px_-16px_rgba(0,0,0,0.72),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
              <div className="relative z-10 border-b border-white/[0.08] bg-[#090f18] px-4 py-5 sm:px-6 sm:py-6">
                <div
                  className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] p-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] backdrop-blur-sm sm:grid-cols-4"
                  role="tablist"
                  aria-label="Dashboard views"
                >
                  {SLIDES.map((slide, i) => (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={active === i}
                      onClick={() => handleTabChange(i)}
                      className={`rounded-lg px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider transition-all duration-200 sm:text-[11px] ${
                        active === i
                          ? 'bg-[var(--brand-primary)] text-zinc-900 shadow-[0_0_16px_-4px_rgba(var(--brand-primary-rgb),0.55)]'
                          : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                      }`}
                    >
                      {slide.tabLabel}
                    </button>
                  ))}
                </div>

                <div
                  className={`mt-5 text-center transition-all duration-200 ease-out sm:mt-6 ${
                    isTransitioning ? 'opacity-0 translate-y-0.5' : 'opacity-100 translate-y-0'
                  }`}
                  role="tabpanel"
                >
                  <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                    {SLIDES[active].title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">
                    {SLIDES[active].description}
                  </p>
                </div>
              </div>

              <div className="relative z-10 bg-[#090f18] px-3 pt-4 pb-10 sm:px-5 sm:pt-6 sm:pb-12">
              <div className="bg-[#0a101c]">
                <div
                  className={`pb-3 transition-opacity duration-200 ease-out sm:pb-4 ${
                    isTransitioning ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  <ShowcasePreview slide={SLIDES[active]} visible={true} isMobile={isMobile} />
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
