'use client'

import { useEffect, useRef, useState } from 'react'

type Slide = {
  id: string
  src: string
  alt: string
  /** Intrinsic PNG width — never render larger than this (avoids upscale blur) */
  width: number
  height: number
  title: string
  description: string
  metric?: string
  metricDetail?: string
  ambient: string
  accent: string
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
      'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,255,136,0.14) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(16,185,129,0.08) 0%, transparent 50%), #060b14',
    accent: 'rgba(34,255,136,0.55)',
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
      'radial-gradient(ellipse 75% 55% at 30% 0%, rgba(99,102,241,0.16) 0%, transparent 55%), radial-gradient(ellipse 50% 45% at 90% 80%, rgba(56,189,248,0.08) 0%, transparent 50%), #070b16',
    accent: 'rgba(129,140,248,0.5)',
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
      'radial-gradient(ellipse 70% 50% at 70% 0%, rgba(34,211,238,0.14) 0%, transparent 55%), radial-gradient(ellipse 55% 40% at 10% 100%, rgba(20,184,166,0.09) 0%, transparent 50%), #061018',
    accent: 'rgba(34,211,238,0.5)',
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
      'radial-gradient(ellipse 75% 55% at 50% 0%, rgba(244,114,182,0.1) 0%, transparent 55%), radial-gradient(ellipse 50% 45% at 20% 100%, rgba(251,191,36,0.07) 0%, transparent 50%), #0a0812',
    accent: 'rgba(251,191,36,0.45)',
  },
]

function SlideFrame({
  src,
  alt,
  accent,
  width,
  height,
}: {
  src: string
  alt: string
  accent: string
  width: number
  height: number
}) {
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-2xl ring-1 ring-inset ring-white/[0.09] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.75)]"
      style={{ maxWidth: width }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        aria-hidden
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="block h-auto w-full"
        style={{ maxWidth: width }}
        decoding="async"
      />
    </div>
  )
}

function accentGlow(accent: string) {
  return `radial-gradient(ellipse 50% 35% at 50% 45%, ${accent.replace(/[\d.]+\)$/, '0.12)')}, transparent 70%)`
}

export function DashboardShowcase() {
  const [active, setActive] = useState(0)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const steps = stepRefs.current.filter(Boolean) as HTMLDivElement[]
    if (steps.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIndex = -1
        let bestRatio = 0
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = Number((entry.target as HTMLElement).dataset.stepIndex)
          if (Number.isNaN(index)) continue
          if (entry.intersectionRatio >= bestRatio) {
            bestRatio = entry.intersectionRatio
            bestIndex = index
          }
        }
        if (bestIndex >= 0) setActive(bestIndex)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )

    steps.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const activeAccent = SLIDES[active]?.accent ?? SLIDES[0].accent

  return (
    <section
      className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2"
      aria-label="Product screenshots"
    >
      {/* Intro — scrolls away normally */}
      <div className="relative bg-[#060b14] py-20 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: accentGlow(activeAccent) }}
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

          <div className="mt-10 flex items-center justify-center gap-2" aria-hidden>
            {SLIDES.map((s, i) => (
              <span
                key={s.id}
                className="h-1 rounded-full transition-all duration-500"
                style={{
                  width: i === active ? 28 : 6,
                  background: i === active ? activeAccent : 'rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* One full-viewport step per screenshot — natural scroll transition */}
      {SLIDES.map((slide, i) => (
        <div
          key={slide.id}
          ref={(el) => { stepRefs.current[i] = el }}
          data-step-index={i}
          className="relative flex min-h-[100svh] flex-col justify-center py-14 sm:py-20"
        >
          <div
            className="pointer-events-none absolute inset-0 transition-[background] duration-[1s] ease-out"
            style={{ background: slide.ambient }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{ background: accentGlow(slide.accent) }}
            aria-hidden
          />

          <div className="cs-container-adaptive relative z-10 flex w-full flex-col items-center px-4 sm:px-8">
            <div className="w-full transition-opacity duration-700 ease-out flex justify-center">
              <SlideFrame
                src={slide.src}
                alt={slide.alt}
                accent={slide.accent}
                width={slide.width}
                height={slide.height}
              />
            </div>

            <div className="mx-auto mt-6 max-w-2xl text-center sm:mt-8">
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
      ))}
    </section>
  )
}
