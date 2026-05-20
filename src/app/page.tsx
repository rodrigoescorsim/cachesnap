import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { HeroUrlForm } from './hero-url-form'
import { MarketingFooter, MarketingHeader } from '@/components/marketing/marketing-chrome'
import { DashboardPreview } from '@/components/landing/dashboard-preview'

// ─── Data ────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
    ),
    title: 'Global Edge Nodes',
    description: 'Real geographic probes spanning São Paulo to Tokyo. Measure raw latency where your users actually are, independent of Anycast routing.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Edge Cache Auditing',
    description: 'Instant hit-rate analysis, stale content detection, and CDN header insights. Real behavior data directly from your edge.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Automated Security Scoring',
    description: 'Continuous validation of SSL lifecycle, HSTS, and security headers per region. Instant diagnostics before they affect production.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    title: 'Intelligent Alerts',
    description: 'Consolidated regional incident tracking with smart backoffs. Real alert grouping designed to eliminate warning fatigue.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Smart Thresholds',
    description: 'Dynamic baselines calculated automatically from historical regional latency. Adaptive thresholds that prevent false alerts.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    title: 'CDN Performance Audit',
    description: 'Real-time comparison of edge speed against raw origin latency. Precise millisecond visibility of CDN caching impact.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Enter your URL',
    description: 'No code changes, no DNS updates. Live in seconds.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Continuous Probes',
    description: 'Multi-region checks every few minutes. We track latency, cache hit-rate, and headers.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Instant Dashboards',
    description: 'Real-time performance metrics and instant alerts. Complete visibility over your edge.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function RootPage() {
  const user = await getSession()
  if (user) redirect('/monitors')

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden bg-background text-foreground">

      {/* ── Background glows ── */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[90rem] h-[48rem] opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at top, var(--brand-primary) 0%, transparent 65%)' }}
      />
      <div
        className="absolute top-[60rem] left-1/4 w-[40rem] h-[40rem] opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, #6366f1 0%, transparent 70%)' }}
      />
      <div
        className="absolute top-[120rem] right-1/4 w-[40rem] h-[40rem] opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, var(--brand-primary) 0%, transparent 70%)' }}
      />

      <MarketingHeader />

      <main className="flex-1 relative z-10">

        {/* ═══════════════════════════════════════════════════════════ HERO */}
        <section className="cs-container-adaptive pt-24 pb-16">
          <div className="flex flex-col items-center text-center gap-8">


            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.1] drop-shadow-sm">
              Edge performance,{' '}
              <span
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-primary) 0%, #34d399 50%, #38bdf8 100%)' }}
              >
                finally transparent.
              </span>
            </h1>

            {/* Subtitle */}
            <div className="space-y-3 max-w-2xl text-center">
              <p className="text-lg text-zinc-400 leading-relaxed">
                Cache hit rate, edge vs origin TTFB, latency trends and patterns — across all continents.
              </p>
              <p className="text-sm font-semibold text-zinc-500 tracking-wide">
                Zero integration. Zero configuration.
              </p>
            </div>

            {/* Form */}
            <HeroUrlForm />

            <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest -mt-2">
              Start testing for free · No credit card required
            </p>



          </div>
        </section>



        {/* ═══════════════════════════════════════════ DASHBOARD PREVIEW */}
        <DashboardPreview />

        {/* ══════════════════════════════════════════════════ HOW IT WORKS */}
        <section className="cs-container-adaptive pb-28">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              From URL to insight in seconds
            </h2>
            <p className="mt-4 text-zinc-400 max-w-xl mx-auto">
              No agents. No SDKs. If your URL is public, we can monitor it.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />

            {STEPS.map((step) => (
              <div key={step.number} className="cs-card cs-card-glass relative flex flex-col items-center gap-5 overflow-hidden p-8 text-center">
                <div className="cs-card-wash" aria-hidden />
                <div className="cs-icon-well-lg">
                  {step.icon}
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">{step.number}</p>
                  <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ FEATURES GRID */}
        <section className="cs-container-adaptive pb-28">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
              Edge Intelligence
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Observability built for modern edge stacks.
            </h2>
            <p className="mt-4 text-zinc-400 max-w-xl mx-auto">
              Analyze cache hit-rates, CDN header states, and regional latency in real time. Absolute visibility into your edge performance.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="cs-card cs-card-glass group relative overflow-hidden p-6 transition-all duration-200"
              >
                <div className="cs-card-wash" aria-hidden />
                <div className="cs-icon-well-md">
                  {f.icon}
                </div>
                <h3 className="relative z-10 mb-2 text-sm font-bold text-white">{f.title}</h3>
                <p className="relative z-10 text-sm leading-relaxed text-zinc-400">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════ ALERTS SPOTLIGHT */}
        <section className="cs-container-adaptive pb-28">
          <div className="cs-card cs-card-glass relative overflow-hidden">
            <div className="cs-card-wash" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(34,255,136,0.12) 0%, transparent 70%)' }}
              aria-hidden
            />

            <div className="relative z-10 grid grid-cols-1 items-center gap-10 p-8 sm:p-12 lg:grid-cols-2">
              {/* Copy */}
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
                  Intelligent Routing
                </p>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  Aggregated alerts.<br />Zero noise.
                </h2>
                <p className="text-zinc-400 leading-relaxed">
                  CacheSnap automatically consolidates multi-region errors into a single structured incident. Get total context on a single thread instead of hundreds of duplicate emails.
                </p>
                <p className="text-zinc-300 leading-relaxed font-medium">
                  Immediate notification triggers on the first edge failure, followed by smart regional updates. One issue, one clean thread.
                </p>
                <ul className="space-y-2.5 text-sm text-zinc-400">
                  {[
                    'One consolidated incident per active regional event',
                    'Smart progressive quiet intervals to prevent flood',
                    'One-click email snooze for 24 hours',
                    'Instant recovery notifications upon resolution',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2.5">
                      <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--brand-primary)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Before / After + incident cards */}
              <div className="space-y-3">

                {/* Before / After comparison */}
                <div className="grid grid-cols-2 gap-2 mb-1">
                  {/* Before */}
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2">Without CacheSnap</p>
                    {['00:05', '00:10', '00:15'].map(t => (
                      <div key={t} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                        <span className="text-[10px] text-red-300 font-mono">cache_hit_low · {t}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 opacity-50">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                      <span className="text-[10px] text-red-300 font-mono">+21 more emails…</span>
                    </div>
                  </div>
                  {/* After */}
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-2">With CacheSnap</p>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-[10px] text-zinc-300 font-mono">1 incident opened</span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-60">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" />
                      <span className="text-[10px] text-zinc-500 font-mono">digest in 4h</span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-40">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" />
                      <span className="text-[10px] text-zinc-500 font-mono">digest in 8h</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-[10px] text-emerald-400 font-mono">resolved ✓</span>
                    </div>
                  </div>
                </div>

                {/* Open incident */}
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-sm font-semibold text-white">cache_hit_low</span>
                      <span className="rounded-full bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-wide">Medium</span>
                    </div>
                    <span className="text-[11px] text-zinc-500">2h ago</span>
                  </div>
                  <p className="text-xs text-zinc-400">Cache hit rate dropped to <span className="text-amber-300 font-semibold">61%</span> in Cape Town — threshold is 80%.</p>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">1 notification sent · next digest in 4h</span>
                    <span className="text-zinc-500 underline cursor-default">Snooze 24h</span>
                  </div>
                </div>

                {/* Resolved incident */}
                <div className="cs-card cs-card-glass space-y-3 p-4 opacity-70">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-sm font-semibold text-zinc-300">ssl_expiry</span>
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Resolved</span>
                    </div>
                    <span className="text-[11px] text-zinc-500">3d ago</span>
                  </div>
                  <p className="text-xs text-zinc-500">SSL Certificate renewed · was expiring in 12 days. Open for 6 hours.</p>
                </div>

                {/* Notification preview */}
                <div className="cs-card cs-card-glass space-y-2 p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <span className="font-medium text-zinc-300">Email notification</span>
                    <span className="text-zinc-600">· alerts@cachesnap.com</span>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono leading-relaxed">
                    <span className="text-zinc-300">[CacheSnap] Cache hit rate low — stripe.com</span><br />
                    Cape Town: 61% hit rate (threshold 80%)<br />
                    <span style={{ color: 'var(--brand-primary)' }} className="underline cursor-default">→ Snooze for 24h</span>  ·  View dashboard
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════ FINAL CTA */}
        <section className="cs-container-adaptive pb-28">
          <div className="text-center space-y-8">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
              style={{ borderColor: 'rgba(34,255,136,0.25)', background: 'rgba(34,255,136,0.08)', color: 'var(--brand-primary)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: 'var(--brand-primary)' }} />
              Free tier included
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight max-w-2xl mx-auto leading-tight">
              Your CDN might be serving stale content right now.
            </h2>
            <p className="text-zinc-400 max-w-lg mx-auto text-lg">
              Most teams find out when a user complains. Set up a monitor in minutes and know before they do.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="cs-btn-primary rounded-xl px-8 py-3.5 text-base font-bold"
              >
                Start monitoring free →
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Already have an account? Sign in
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500 font-medium">
              {['No credit card', 'No SDK or agent', 'No DNS changes', 'Cancel anytime'].map(item => (
                <span key={item} className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--brand-primary)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 7l3 3L11.5 4" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

      </main>

      <MarketingFooter />

    </div>
  )
}
