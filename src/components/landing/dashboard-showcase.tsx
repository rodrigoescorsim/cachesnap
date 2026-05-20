'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Slide = {
  id: string
  src: string
  alt: string
  width: number
  height: number
  title: string
  description: string
  metric?: string
  metricDetail?: string
  ambient: string
  accent: string
  glow: string
}

const SLIDES: Slide[] = [
  {
    id: 'edge',
    src: '/screenshots/edge-vs-origin.png',
    width: 1042,
    height: 821,
    alt: 'CacheSnap Edge vs Origin — edge cache latency compared to origin',
    metric: '95% faster · 2059ms saved per request on average',
    metricDetail: 'Edge vs Origin · 24h window · 8 regions',
    title: 'Edge vs Origin',
    description: 'See exactly how much your CDN saves per region — edge HIT vs origin MISS, side by side.',
    ambient:
      'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,255,136,0.16) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(16,185,129,0.1) 0%, transparent 50%), #060b14',
    accent: 'rgba(34,255,136,0.55)',
    glow: 'rgba(34,255,136,0.35)',
  },
  {
    id: 'monitors',
    src: '/screenshots/monitors.png',
    width: 1224,
    height: 1078,
    alt: 'CacheSnap monitors — global TTFB, cache hit rate, uptime and incidents per URL',
    title: 'Monitors',
    description: 'Every URL in one view — global averages, per-site metrics, regional health, and open incidents.',
    ambient:
      'radial-gradient(ellipse 75% 55% at 30% 0%, rgba(99,102,241,0.18) 0%, transparent 55%), radial-gradient(ellipse 50% 45% at 90% 80%, rgba(56,189,248,0.1) 0%, transparent 50%), #070b16',
    accent: 'rgba(129,140,248,0.5)',
    glow: 'rgba(129,140,248,0.32)',
  },
  {
    id: 'performance',
    src: '/screenshots/performance.png',
    width: 1010,
    height: 639,
    alt: 'CacheSnap period performance — edge vs origin TTFB per region',
    title: 'Period performance',
    description: 'Edge cache TTFB vs origin TTFB per region for any time window.',
    ambient:
      'radial-gradient(ellipse 70% 50% at 70% 0%, rgba(34,211,238,0.16) 0%, transparent 55%), radial-gradient(ellipse 55% 40% at 10% 100%, rgba(20,184,166,0.1) 0%, transparent 50%), #061018',
    accent: 'rgba(34,211,238,0.5)',
    glow: 'rgba(34,211,238,0.3)',
  },
  {
    id: 'trends',
    src: '/screenshots/trends.png',
    width: 1040,
    height: 1092,
    alt: 'CacheSnap trends — TTFB and cache hit rate over time',
    title: 'Historical trends',
    description: 'TTFB and cache hit rate over time, per region. Spot regressions before users do.',
    ambient:
      'radial-gradient(ellipse 75% 55% at 50% 0%, rgba(244,114,182,0.12) 0%, transparent 55%), radial-gradient(ellipse 50% 45% at 20% 100%, rgba(251,191,36,0.08) 0%, transparent 50%), #0a0812',
    accent: 'rgba(251,191,36,0.45)',
    glow: 'rgba(251,191,36,0.28)',
  },
]

function ProductStage({
  src,
  alt,
  accent,
  glow,
  width,
  height,
  visible,
}: {
  src: string
  alt: string
  accent: string
  glow: string
  width: number
  height: number
  visible: boolean
}) {
  return (
    <div
      className={`landing-showcase-reveal relative mx-auto w-full flex justify-center ${visible ? 'is-visible' : ''}`}
      style={{ maxWidth: width }}
    >
      <div
        className="landing-showcase-glow-pulse pointer-events-none absolute left-1/2 top-[42%] h-[55%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[48px] blur-[72px]"
        style={{
          background: `radial-gradient(ellipse at center, ${glow} 0%, transparent 72%)`,
          animation: visible ? 'landing-showcase-glow-pulse 6s ease-in-out infinite' : undefined,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[48%] h-[40%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] opacity-40"
        style={{ background: glow }}
        aria-hidden
      />

      <div
        className="relative w-full overflow-hidden rounded-2xl border border-white/[0.14] bg-[#0c1422]/80 backdrop-blur-[2px]"
        style={{
          maxWidth: width,
          boxShadow: [
            '0 0 0 1px rgba(255,255,255,0.04) inset',
            '0 1px 0 0 rgba(255,255,255,0.08) inset',
            `0 0 0 1px color-mix(in srgb, ${accent} 25%, transparent)`,
            '0 32px 64px -28px rgba(0,0,0,0.85)',
            `0 0 100px -24px ${glow}`,
          ].join(', '),
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px"
          style={{ background: `linear-gradient(90deg, transparent 5%, ${accent} 50%, transparent 95%)` }}
          aria-hidden
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="relative z-[1] block h-auto w-full"
          style={{ maxWidth: width }}
          decoding="async"
        />
      </div>
    </div>
  )
}

function ShowcaseSlidePanel({
  slide,
  index,
  setStepRef,
}: {
  slide: Slide
  index: number
  setStepRef: (index: number, el: HTMLDivElement | null) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = panelRef.current
    setStepRef(index, el)
    if (!el) return

    const revealObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setRevealed(true)
      },
      { threshold: 0.32, rootMargin: '-10% 0px -10% 0px' },
    )

    revealObserver.observe(el)
    return () => {
      setStepRef(index, null)
      revealObserver.disconnect()
    }
  }, [index, setStepRef])

  return (
    <div
      ref={panelRef}
      data-step-index={index}
      className="relative flex min-h-[88svh] flex-col justify-center py-16 sm:py-24"
    >
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-[1.4s] ease-out"
        style={{ background: slide.ambient }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[var(--background)]/50 to-transparent sm:w-32"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[var(--background)]/50 to-transparent sm:w-32"
        aria-hidden
      />

      <div className="cs-container-adaptive relative z-10 flex w-full flex-col items-center px-4 sm:px-8">
        <ProductStage
          src={slide.src}
          alt={slide.alt}
          accent={slide.accent}
          glow={slide.glow}
          width={slide.width}
          height={slide.height}
          visible={revealed}
        />

        <div
          className={`landing-showcase-reveal-delay mx-auto mt-8 max-w-2xl text-center sm:mt-10 ${revealed ? 'is-visible' : ''}`}
        >
          {slide.metric ? (
            <p className="text-base sm:text-lg font-bold tracking-tight" style={{ color: 'var(--brand-primary)' }}>
              {slide.metric}
            </p>
          ) : null}
          {slide.metricDetail ? (
            <p className="mt-1 text-[11px] text-zinc-500">{slide.metricDetail}</p>
          ) : null}
          <p
            className={`font-black uppercase tracking-[0.14em] text-white ${slide.metric || slide.metricDetail ? 'mt-3' : 'mt-0'} text-xs`}
          >
            {slide.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{slide.description}</p>
        </div>
      </div>
    </div>
  )
}

export function DashboardShowcase() {
  const [active, setActive] = useState(0)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  const setStepRef = useCallback((index: number, el: HTMLDivElement | null) => {
    stepRefs.current[index] = el
  }, [])

  useEffect(() => {
    const syncActive = () => {
      const steps = stepRefs.current.filter(Boolean) as HTMLDivElement[]
      if (steps.length === 0) return

      const viewportMid = window.innerHeight * 0.5
      let bestIndex = 0
      let bestDistance = Infinity

      steps.forEach((el, i) => {
        const rect = el.getBoundingClientRect()
        const mid = rect.top + rect.height * 0.38
        const distance = Math.abs(mid - viewportMid)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = i
        }
      })

      setActive(bestIndex)
    }

    syncActive()
    window.addEventListener('scroll', syncActive, { passive: true })
    window.addEventListener('resize', syncActive)
    return () => {
      window.removeEventListener('scroll', syncActive)
      window.removeEventListener('resize', syncActive)
    }
  }, [])

  const activeSlide = SLIDES[active] ?? SLIDES[0]

  return (
    <section
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2"
      aria-label="Product screenshots"
    >
      <div className="relative overflow-hidden bg-[#060b14] py-20 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-60 transition-opacity duration-[1.2s]"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${activeSlide.glow} 0%, transparent 65%)`,
          }}
          aria-hidden
        />
        <div className="cs-container-adaptive relative z-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
            Platform
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            This is what you get, immediately.
          </h2>
          <p className="mt-4 text-zinc-400 max-w-lg mx-auto text-base leading-relaxed">
            Live latency, cache diagnostics, and security checks across every region — no setup required.
          </p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-600">
            Scroll to explore each view
          </p>

          <nav className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-0" aria-label="Views progress">
            {SLIDES.map((s, i) => {
              const isActive = i === active
              const isPast = i < active
              return (
                <div key={s.id} className="flex items-center sm:flex-1 sm:max-w-[140px]">
                  <div className="flex flex-col items-center gap-2 px-3">
                    <span
                      className="flex h-2.5 w-2.5 rounded-full transition-all duration-700 ease-out"
                      style={{
                        background: isActive ? s.accent : isPast ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)',
                        boxShadow: isActive ? `0 0 16px 2px ${s.glow}` : 'none',
                        transform: isActive ? 'scale(1.35)' : 'scale(1)',
                      }}
                    />
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.14em] transition-colors duration-500 ${isActive ? 'text-white' : 'text-zinc-600'}`}
                    >
                      {s.title}
                    </span>
                  </div>
                  {i < SLIDES.length - 1 ? (
                    <div
                      className="hidden h-px flex-1 sm:block mx-1 transition-colors duration-700"
                      style={{
                        background: isPast
                          ? 'linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.08))'
                          : 'rgba(255,255,255,0.06)',
                      }}
                      aria-hidden
                    />
                  ) : null}
                </div>
              )
            })}
          </nav>
        </div>
      </div>

      {SLIDES.map((slide, i) => (
        <ShowcaseSlidePanel key={slide.id} slide={slide} index={i} setStepRef={setStepRef} />
      ))}
    </section>
  )
}
