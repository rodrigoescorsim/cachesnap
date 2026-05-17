import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { HeroUrlForm } from './hero-url-form'
import { Logo } from '@/components/logo'

// ─── Data ────────────────────────────────────────────────────────────────────

const MOCK_REGIONS = [
  { region: 'São Paulo',  flag: '🇧🇷', code: 'BR', ttfb: '38ms', p95: '54ms',  cache: 'HIT',  uptime: '100%',   http: 'H2', fast: true  },
  { region: 'Virginia',  flag: '🇺🇸', code: 'US', ttfb: '31ms', p95: '46ms',  cache: 'HIT',  uptime: '100%',   http: 'H2', fast: true  },
  { region: 'Oregon',    flag: '🇺🇸', code: 'US', ttfb: '35ms', p95: '51ms',  cache: 'HIT',  uptime: '100%',   http: 'H2', fast: true  },
  { region: 'Frankfurt', flag: '🇩🇪', code: 'DE', ttfb: '41ms', p95: '59ms',  cache: 'HIT',  uptime: '100%',   http: 'H2', fast: true  },
  { region: 'Tokyo',     flag: '🇯🇵', code: 'JP', ttfb: '68ms', p95: '91ms',  cache: 'HIT',  uptime: '100%',   http: 'H2', fast: false },
  { region: 'Mumbai',    flag: '🇮🇳', code: 'IN', ttfb: '82ms', p95: '114ms', cache: 'HIT',  uptime: '100%',   http: 'H2', fast: false },
  { region: 'Sydney',    flag: '🇦🇺', code: 'AU', ttfb: '72ms', p95: '98ms',  cache: 'HIT',  uptime: '99.9%',  http: 'H2', fast: false },
  { region: 'Cape Town', flag: '🇿🇦', code: 'ZA', ttfb: '94ms', p95: '131ms', cache: 'MISS', uptime: '100%',   http: 'H2', fast: false },
]

const FEATURES = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
    ),
    title: '8 Real Regions',
    description: 'AWS Lambda nodes in São Paulo, Virginia, Oregon, Frankfurt, Tokyo, Mumbai, Sydney, and Cape Town. True geographic isolation — no Anycast illusions.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Cache Intelligence',
    description: 'Hit rate trends, stale cache detection, CDN identification (Cloudflare, Fastly, Vercel). Compare edge vs origin timing with bypass probes.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Security Audit',
    description: 'HSTS, CSP, X-Frame-Options, Referrer-Policy scored per region. SSL certificate expiry alerts with 14-day early warning before your site goes dark.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    title: 'Smart Incidents',
    description: 'One open incident per issue type. FirstFire notification, then digest with exponential backoff — not an alert storm every 5 minutes. Snooze from the email link.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Statistical Baselines',
    description: '7-day rolling TTFB mean and standard deviation per monitor × region. "Slow" means slow for your site, not a fixed global threshold that cries wolf.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    title: 'Edge vs Origin',
    description: 'Bypass probes measure raw origin latency separately from CDN cache. Know the exact milliseconds your CDN saves — or costs — per region.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Paste your URL',
    description: 'No SDK. No DNS change. No code. Any public HTTPS URL works. Takes 10 seconds.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'We probe from 8 regions',
    description: 'AWS Lambda nodes measure TTFB, DNS, TLS, cache status, security headers, and SSL — every 5 minutes, from real geographic locations.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'See and get alerted',
    description: 'Regional TTFB charts, cache hit rates, security scores, and smart incident alerts — all in one dashboard, refreshed in real time.',
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
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background text-foreground">

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

      {/* ═══════════════════════════════════════════════════════════ NAVBAR */}
      <header className="border-b border-zinc-800/50 backdrop-blur-md sticky top-0 z-50 w-full">
        <div className="cs-container-adaptive flex items-center justify-between h-14">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo className="h-11" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="cs-btn-primary rounded-lg px-4 py-1.5 text-sm">
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">

        {/* ═══════════════════════════════════════════════════════════ HERO */}
        <section className="cs-container-adaptive pt-24 pb-16">
          <div className="flex flex-col items-center text-center gap-8">

            {/* Pill */}
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
              style={{ borderColor: 'rgba(34,255,136,0.25)', background: 'rgba(34,255,136,0.08)', color: 'var(--brand-primary)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: 'var(--brand-primary)' }} />
              Understands Vercel · Cloudflare · Next.js · AWS
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.1] drop-shadow-sm">
              The first monitoring platform that truly{' '}
              <span
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-primary) 0%, #34d399 50%, #38bdf8 100%)' }}
              >
                understands your edge stack.
              </span>
            </h1>

            {/* Subtitle */}
            <div className="space-y-3 max-w-2xl text-center">
              <p className="text-lg text-zinc-400 leading-relaxed">
                Most tools have no idea what happens after your deploy.{' '}
                <span className="text-zinc-200 font-medium">CacheSnap does</span> — TTFB,
                cache behavior, CDN headers, and edge routing from 8 real AWS regions.
              </p>
              <p className="text-sm font-semibold text-zinc-500 tracking-wide">
                No SDK. No agent. Zero config.
              </p>
            </div>

            {/* Form */}
            <HeroUrlForm />

            <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest -mt-2">
              Free during early access · No credit card required
            </p>

            {/* Capability strip */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                'Cache HIT/MISS rate · per region',
                'Edge vs Origin timing',
                'Stale content & wrong headers',
                'CDN routing issues',
              ].map(item => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/50 px-3 py-1 text-xs font-medium text-zinc-300"
                >
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--brand-primary)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>

            {/* Region flags strip */}
            <div className="flex items-center gap-3 mt-2 flex-wrap justify-center">
              {MOCK_REGIONS.map(r => (
                <span key={r.region} title={r.region} className="text-xl" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
                  {r.flag}
                </span>
              ))}
              <span className="text-xs text-zinc-500 font-medium ml-1">8 regions</span>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════ PRODUCT MOCK */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-28">
          <div className="rounded-2xl border border-zinc-800 shadow-2xl shadow-black/60 overflow-hidden ring-1 ring-white/5">

            {/* Browser bar */}
            <div className="flex items-center gap-2 border-b border-border bg-zinc-900/90 backdrop-blur px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-amber-500/80" />
              <span className="h-3 w-3 rounded-full bg-green-500/80" />
              <div className="ml-3 flex-1 max-w-sm rounded-md border border-zinc-700/50 bg-zinc-800/80 px-3 py-1 text-xs text-zinc-400 text-center flex items-center justify-center gap-2">
                <svg className="w-3 h-3 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                app.cachesnap.com/monitors/…
              </div>
            </div>

            {/* Dashboard mock */}
            <div className="bg-zinc-950/80 p-4 sm:p-6 space-y-4">

              {/* Monitor header */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 backdrop-blur-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-inner">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-lg font-bold text-white">stripe.com</span>
                    <span className="cs-badge cs-badge-success rounded-full px-2.5 py-0.5 text-xs font-semibold">Healthy</span>
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">Cloudflare</span>
                    <span className="rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-xs font-medium text-zinc-400">HTTP/2</span>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">https://stripe.com · Updated: just now</p>
                </div>
                <div className="flex items-center gap-6 sm:gap-8">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white tabular-nums">57ms</p>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 mt-0.5">Avg TTFB</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>87%</p>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 mt-0.5">Cache Hit</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white tabular-nums">99.9%</p>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 mt-0.5">Uptime</p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1.5 flex-wrap">
                {['Performance', 'Cache', 'Security', 'Alerts', 'Incidents'].map((tab, i) => (
                  <span
                    key={tab}
                    className={`rounded-lg px-3.5 py-2 text-xs font-semibold cursor-default transition-all relative ${
                      i === 0
                        ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-white/10'
                        : 'text-zinc-500'
                    }`}
                  >
                    {tab}
                    {tab === 'Incidents' && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-zinc-950" />
                    )}
                  </span>
                ))}
              </div>

              {/* Regional table */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden backdrop-blur-md shadow-inner">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80">
                      <th className="text-left px-3 sm:px-4 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">Region</th>
                      <th className="text-right px-3 sm:px-4 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">TTFB</th>
                      <th className="text-right px-3 sm:px-4 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px] hidden sm:table-cell">P95</th>
                      <th className="text-right px-3 sm:px-4 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">Cache</th>
                      <th className="text-right px-3 sm:px-4 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px] hidden md:table-cell">Uptime</th>
                      <th className="text-right px-3 sm:px-4 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px] hidden sm:table-cell">HTTP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {MOCK_REGIONS.map(row => (
                      <tr key={row.region} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="px-3 sm:px-4 py-3 text-zinc-100 font-medium">
                          <span className="flex items-center gap-2">
                            <span className="text-sm">{row.flag}</span>
                            <span className="truncate max-w-[80px] sm:max-w-none">{row.region}</span>
                          </span>
                        </td>
                        <td className={`px-3 sm:px-4 py-3 text-right font-bold tabular-nums ${row.fast ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {row.ttfb}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right text-zinc-500 tabular-nums font-medium hidden sm:table-cell">{row.p95}</td>
                        <td className="px-3 sm:px-4 py-3 text-right">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                            row.cache === 'HIT'
                              ? 'cs-badge-cache-hit'
                              : 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                          }`}>
                            {row.cache}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right text-zinc-500 tabular-nums font-medium hidden md:table-cell">{row.uptime}</td>
                        <td className="px-3 sm:px-4 py-3 text-right hidden sm:table-cell">
                          <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-400">
                            {row.http}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Trend + incident row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-zinc-300">Week-over-week trend</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Last 7 days vs previous 7 days</p>
                  </div>
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-emerald-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    <span>8% faster</span>
                    <span className="text-xs font-medium text-zinc-500">this week</span>
                  </div>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-amber-300">1 open incident</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Cape Town cache MISS · 2h ago</p>
                  </div>
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/25 px-2.5 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wide">
                    Medium
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Live data · 8 regions · Updated every 5 min
          </p>
        </section>

        {/* ══════════════════════════════════════════════════ HOW IT WORKS */}
        <section className="cs-container-adaptive pb-28">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              From URL to insight in minutes
            </h2>
            <p className="mt-4 text-zinc-400 max-w-xl mx-auto">
              No installation, no agents, no infrastructure to manage. If your URL is public, we can monitor it.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />

            {STEPS.map((step) => (
              <div key={step.number} className="relative flex flex-col items-center text-center gap-5 p-8 rounded-2xl border border-zinc-800/60 bg-zinc-900/30 backdrop-blur-sm">
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 relative z-10 bg-zinc-900 border border-zinc-700/50"
                  style={{ boxShadow: '0 0 20px -4px rgba(34,255,136,0.15)' }}
                >
                  <span style={{ color: 'var(--brand-primary)' }}>{step.icon}</span>
                </div>
                <div>
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
              The edge intelligence generic monitors miss
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Built for your CDN stack.<br />Not adapted for it.
            </h2>
            <p className="mt-4 text-zinc-400 max-w-xl mx-auto">
              Most tools show you HTTP status codes and uptime percentages. CacheSnap was built from scratch to understand how modern edge architectures actually behave.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group p-6 rounded-2xl border border-zinc-800/60 bg-zinc-900/30 backdrop-blur-sm hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-200"
              >
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center mb-5 border border-zinc-700/50 bg-zinc-800/50 group-hover:border-brand/30 transition-colors"
                  style={{ '--border-brand': 'rgba(34,255,136,0.3)' } as React.CSSProperties}
                >
                  <span style={{ color: 'var(--brand-primary)' }}>{f.icon}</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════ ALERTS SPOTLIGHT */}
        <section className="cs-container-adaptive pb-28">
          <div
            className="rounded-3xl border border-zinc-800/60 overflow-hidden relative"
            style={{ background: 'linear-gradient(135deg, rgba(34,255,136,0.04) 0%, rgba(99,102,241,0.04) 100%)' }}
          >
            {/* Glow */}
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(34,255,136,0.12) 0%, transparent 70%)' }}
            />

            <div className="relative p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              {/* Copy */}
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
                  Alerts that don&apos;t cry wolf
                </p>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  One incident per problem.<br />Not one per probe.
                </h2>
                <p className="text-zinc-400 leading-relaxed">
                  Most monitors send an email every time a check fails. If your check runs every 5 minutes and the issue lasts 2 hours, that&apos;s 24 emails.
                </p>
                <p className="text-zinc-300 leading-relaxed font-medium">
                  CacheSnap opens one incident, sends a <span className="text-white">FirstFire</span> notification, then digests with exponential backoff. You hear about the problem once — and again only if it&apos;s been a while.
                </p>
                <ul className="space-y-2.5 text-sm text-zinc-400">
                  {[
                    'One open incident per (monitor, alert type)',
                    'Digest cadence doubles after each notification',
                    'Snooze for 24h with a single click from the email',
                    'Recovery notification when the issue resolves',
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
                <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3 opacity-70">
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
                <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-4 space-y-2">
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
              Free during early access
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight max-w-2xl mx-auto leading-tight">
              Your CDN might be serving stale content right now.
            </h2>
            <p className="text-zinc-400 max-w-lg mx-auto text-lg">
              Most teams find out when a user complains. Set up a monitor in 2 minutes and know before they do.
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

      {/* ═══════════════════════════════════════════════════════════ FOOTER */}
      <footer className="border-t border-border relative z-10 bg-zinc-950/50 backdrop-blur-sm">
        <div className="cs-container-adaptive py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <Logo className="h-8 opacity-70" />
              <span className="hidden sm:inline text-zinc-700">·</span>
              <span className="text-xs text-zinc-500">Edge Performance Monitoring</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-zinc-500">
              <Link href="/login" className="hover:text-zinc-300 transition-colors">Sign in</Link>
              <Link href="/signup" className="hover:text-zinc-300 transition-colors">Sign up free</Link>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-600">© 2026 CacheSnap</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
