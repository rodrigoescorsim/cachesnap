'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

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

/** Mesmo canvas do dashboard / screenshots */
const SHOWCASE_CANVAS = '#0D1625'

function softAmbient(primary: string, secondary?: string): string {
  const layers = [
    `radial-gradient(ellipse 140% 90% at 50% 48%, ${primary} 0%, transparent 78%)`,
    secondary
      ? `radial-gradient(ellipse 100% 75% at 68% 82%, ${secondary} 0%, transparent 72%)`
      : null,
  ].filter(Boolean)
  return layers.join(', ')
}

type Slide = {
  id: string
  kind: 'live'
  live: 'edge-vs-origin' | 'period-performance' | 'monitors' | 'historical-trends'
  maxWidth: number
  title: string
  tabLabel: string
  description: string
  ambient: string
  mobileImage: string
}

const PLATFORM_FEATURES = [
  'Live TTFB and real cache hit/miss rates across global regions',
  'Edge vs Origin performance deltas and comparison',
  'Latency trends, patterns and intelligent anomaly detection',
  'Security header validation, HSTS, CSP and SSL insights',
  'Intelligent Advisor with actionable recommendations',
  'Hourly patterns, weekly heatmaps and historical insight',
] as const

const SLIDES: Slide[] = [
  {
    id: 'edge',
    kind: 'live',
    live: 'edge-vs-origin',
    maxWidth: 1042,
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
        <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#0B1220] relative flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.mobileImage}
            alt={slide.title}
            width={slide.maxWidth}
            className="block h-auto w-full select-none"
            decoding="async"
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

function ShowcaseAmbientLayer() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{ background: SHOWCASE_CANVAS }}
      aria-hidden
    />
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
    <section
      id="dashboard"
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 scroll-mt-24 overflow-hidden border-y border-white/[0.04] shadow-[inset_0_24px_48px_-12px_rgba(0,0,0,0.65),inset_0_-24px_48px_-12px_rgba(0,0,0,0.65)]"
      style={{ background: SHOWCASE_CANVAS }}
      aria-label="Product previews"
    >
      {/* Dynamic ambient glow layer */}
      <div className="absolute inset-0 z-0">
        <ShowcaseAmbientLayer />
      </div>

      <div className="relative z-10 py-12 sm:py-16">
        {/* Dashboard preview shell — tabs + active view + canvas */}
        <div className="cs-container-adaptive relative z-10">
          <div className="relative mx-auto overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A111C]">
            <div className="relative z-10 border-b border-white/[0.06] px-4 py-5 sm:px-6 sm:py-6">
              <p
                className="text-center text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--brand-primary)' }}
              >
                Dashboard
              </p>

              <div
                className="mx-auto mt-4 grid w-full max-w-2xl grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 sm:grid-cols-4"
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
                    className={`rounded-lg px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider transition-colors duration-200 sm:text-[11px] ${
                      active === i
                        ? 'bg-[var(--brand-primary)] text-zinc-900 shadow-[0_0_12px_-3px_rgba(var(--brand-primary-rgb),0.45)]'
                        : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                    }`}
                  >
                    {slide.tabLabel}
                  </button>
                ))}
              </div>

              <div
                className={`mt-4 text-center transition-all duration-200 ease-out ${
                  isTransitioning ? 'opacity-0 translate-y-0.5' : 'opacity-100 translate-y-0'
                }`}
                role="tabpanel"
              >
                <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                  {SLIDES[active].title}
                </h3>
                <p className="mx-auto mt-1.5 max-w-lg text-sm leading-snug text-zinc-500">
                  {SLIDES[active].description}
                </p>
              </div>
            </div>

            <div className="relative z-10 bg-[#0A111C] px-3 py-4 sm:px-5 sm:py-6">
              <div className="bg-[#0B1220]">
                <div
                  className={`transition-opacity duration-200 ease-out ${
                    isTransitioning ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  <ShowcasePreview slide={SLIDES[active]} visible={true} isMobile={isMobile} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="cs-container-adaptive mt-8 sm:mt-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
              Platform
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl sm:leading-tight">
              Everything you need to understand and optimize your edge — instantly.
            </h2>
          </div>

          <div className="cs-card cs-card-glass relative mx-auto mt-5 max-w-3xl overflow-hidden p-4 sm:mt-6 sm:p-6">
            <div className="cs-card-wash" aria-hidden />

            <ul className="relative z-10 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
              {PLATFORM_FEATURES.map((item, i) => (
                <li
                  key={item || `platform-feature-${i}`}
                  className="flex min-h-[4.25rem] items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-sm leading-snug text-zinc-400"
                >
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    style={{ color: 'var(--brand-primary)' }}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="relative z-10 mt-5 border-t border-white/[0.06] pt-5 text-center">
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
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                Just paste your URL and get insights in seconds.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
