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
const SHOWCASE_CANVAS = '#0B1220'

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

function ShowcaseAmbientLayer({ active }: { active: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      <div className="absolute inset-0" style={{ background: SHOWCASE_CANVAS }} />
      {SLIDES.map((slide, i) => (
        <div
          key={slide.id}
          className="absolute inset-0 transition-opacity duration-[1.2s] ease-in-out"
          style={{
            background: slide.ambient,
            opacity: i === active ? 0.55 : 0,
          }}
        />
      ))}
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

  const tabWidth = isMobile ? 80 : 130

  return (
    <section
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 overflow-hidden"
      style={{ background: SHOWCASE_CANVAS }}
      aria-label="Product previews"
    >
      {/* Dynamic ambient glow layer */}
      <div className="absolute inset-0 z-0">
        <ShowcaseAmbientLayer active={active} />
      </div>

      <div className="relative z-10 py-16 sm:py-24">
        <div className="cs-container-adaptive text-center mb-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
            Platform
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            This is what you get, immediately.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-zinc-400">
            Live latency, cache diagnostics, and security checks across every region — no setup required.
          </p>
        </div>

        {/* Premium Sliding Pill Tabs Selector */}
        <div className="relative flex flex-col items-center gap-6 mb-10 z-20">
          <div className="inline-flex rounded-xl bg-white/[0.02] border border-white/[0.08] p-1 backdrop-blur-md relative">
            {/* Sliding Pill Indicator */}
            <div
              className="absolute top-1 bottom-1 rounded-lg bg-white/[0.07] border border-white/5 transition-all duration-300 ease-out pointer-events-none"
              style={{
                left: `${active * tabWidth + 4}px`,
                width: `${tabWidth}px`,
              }}
            />
            {SLIDES.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => handleTabChange(i)}
                className={`relative z-10 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors duration-300 cursor-pointer select-none text-center ${
                  active === i
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                style={{ width: `${tabWidth}px` }}
              >
                {slide.tabLabel}
              </button>
            ))}
          </div>

          {/* Active Tab Concise Description */}
          <div
            className={`transition-all duration-200 ease-out transform ${
              isTransitioning ? 'opacity-0 scale-95 translate-y-0.5' : 'opacity-100 scale-100 translate-y-0'
            }`}
          >
            <p className="mx-auto max-w-xl text-center text-sm text-zinc-400 min-h-[40px] px-6 leading-relaxed">
              {SLIDES[active].description}
            </p>
          </div>
        </div>

        {/* Main Canvas Frame with Premium Transitions */}
        <div className="cs-container-adaptive relative z-10 px-4 sm:px-8">
          <div
            className={`transition-all duration-300 ease-out transform ${
              isTransitioning
                ? 'opacity-0 scale-[0.99] translate-y-1.5 filter blur-[2px]'
                : 'opacity-100 scale-100 translate-y-0 filter blur-0'
            }`}
          >
            <ShowcasePreview slide={SLIDES[active]} visible={true} isMobile={isMobile} />
          </div>
        </div>
      </div>
    </section>
  )
}
