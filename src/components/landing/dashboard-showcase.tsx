'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LandingEdgeVsOriginDemo } from './landing-edge-vs-origin-demo'
import { LandingPeriodPerformanceDemo } from './landing-period-performance-demo'
import { LandingMonitorsDemo } from './landing-monitors-demo'

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

type Slide =
  | {
      id: string
      kind: 'live'
      live: 'edge-vs-origin' | 'period-performance' | 'monitors'
      maxWidth: number
      title: string
      description: string
      ambient: string
      accent: string
      glow: string
    }
  | {
      id: string
      kind: 'image'
      src: string
      alt: string
      width: number
      height: number
      title: string
      description: string
      ambient: string
      accent: string
      glow: string
    }

const SLIDES: Slide[] = [
  {
    id: 'edge',
    kind: 'live',
    live: 'edge-vs-origin',
    maxWidth: 1042,
    title: 'Edge vs Origin',
    description: 'See exactly how much your CDN saves per region — edge HIT vs origin MISS, side by side.',
    ambient: softAmbient('rgba(34,255,136,0.06)', 'rgba(16,185,129,0.04)'),
    accent: 'rgba(34,255,136,0.55)',
    glow: 'rgba(34,255,136,0.2)',
  },
  {
    id: 'monitors',
    kind: 'live',
    live: 'monitors',
    maxWidth: 1224,
    title: 'Monitors',
    description: 'Every URL in one view — global averages, per-site metrics, regional health, and open incidents.',
    ambient: softAmbient('rgba(99,102,241,0.07)', 'rgba(56,189,248,0.04)'),
    accent: 'rgba(129,140,248,0.5)',
    glow: 'rgba(129,140,248,0.18)',
  },
  {
    id: 'performance',
    kind: 'live',
    live: 'period-performance',
    maxWidth: 1010,
    title: 'Period performance',
    description: 'Edge cache TTFB vs origin TTFB per region for any time window.',
    ambient: softAmbient('rgba(34,211,238,0.06)', 'rgba(20,184,166,0.04)'),
    accent: 'rgba(34,211,238,0.5)',
    glow: 'rgba(34,211,238,0.18)',
  },
  {
    id: 'trends',
    kind: 'image',
    src: '/screenshots/trends.png',
    width: 1040,
    height: 1092,
    alt: 'CacheSnap trends — TTFB and cache hit rate over time',
    title: 'Historical trends',
    description: 'TTFB and cache hit rate over time, per region. Spot regressions before users do.',
    ambient: softAmbient('rgba(244,114,182,0.05)', 'rgba(251,191,36,0.04)'),
    accent: 'rgba(251,191,36,0.45)',
    glow: 'rgba(251,191,36,0.16)',
  },
]

function ShowcasePreview({
  slide,
  visible,
}: {
  slide: Slide
  visible: boolean
}) {
  const maxWidth = slide.kind === 'live' ? slide.maxWidth : slide.width

  return (
    <div
      className={`landing-showcase-reveal relative mx-auto w-full ${visible ? 'is-visible' : ''}`}
      style={{ maxWidth }}
    >
      {slide.kind === 'live' ? (
        slide.live === 'edge-vs-origin' ? (
          <LandingEdgeVsOriginDemo />
        ) : slide.live === 'period-performance' ? (
          <LandingPeriodPerformanceDemo />
        ) : (
          <LandingMonitorsDemo />
        )
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={slide.src}
          alt={slide.alt}
          width={slide.width}
          height={slide.height}
          className="block h-auto w-full select-none"
          style={{ maxWidth: slide.width }}
          decoding="async"
          draggable={false}
        />
      )}
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
      <div className="cs-container-adaptive relative z-10 flex w-full flex-col items-center px-4 sm:px-8">
        <div
          className={`landing-showcase-reveal-delay mx-auto mb-8 max-w-2xl text-center sm:mb-10 ${revealed ? 'is-visible' : ''}`}
        >
          <p className="text-xs font-black uppercase tracking-[0.14em] text-white">{slide.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{slide.description}</p>
        </div>

        <ShowcasePreview slide={slide} visible={revealed} />
      </div>
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
          className="absolute inset-0 transition-opacity duration-[2.4s] ease-in-out"
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

  return (
    <section
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2"
      style={{ background: SHOWCASE_CANVAS }}
      aria-label="Product screenshots"
    >
      <div className="relative z-10 py-20 sm:py-28">
        <div className="cs-container-adaptive text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
            Platform
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            This is what you get, immediately.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-zinc-400">
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
                <div key={s.id} className="flex items-center sm:max-w-[140px] sm:flex-1">
                  <div className="flex flex-col items-center gap-2 px-3">
                    <span
                      className="flex h-2.5 w-2.5 rounded-full transition-all duration-700 ease-out"
                      style={{
                        background: isActive ? s.accent : isPast ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)',
                        boxShadow: isActive ? `0 0 14px 1px ${s.glow}` : 'none',
                        transform: isActive ? 'scale(1.3)' : 'scale(1)',
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
                      className="mx-1 hidden h-px flex-1 transition-colors duration-700 sm:block"
                      style={{
                        background: isPast
                          ? 'linear-gradient(90deg, rgba(255,255,255,0.2), rgba(255,255,255,0.06))'
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

      <div className="relative">
        <ShowcaseAmbientLayer active={active} />

        {SLIDES.map((slide, i) => (
          <ShowcaseSlidePanel key={slide.id} slide={slide} index={i} setStepRef={setStepRef} />
        ))}
      </div>
    </section>
  )
}
