import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { HeroUrlForm } from './hero-url-form'

export default async function RootPage() {
  const user = await getSession()
  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-zinc-900 text-zinc-100">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -ml-[40rem] w-[80rem] h-[40rem] opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at top, #10b981 0%, transparent 70%)' }}></div>
      <div className="absolute top-0 right-0 w-[40rem] h-[40rem] opacity-20 pointer-events-none" style={{ background: 'radial-gradient(ellipse at top right, #3b82f6 0%, transparent 70%)' }}></div>
      
      {/* Nav */}
      <header className="border-b border-zinc-800/50 backdrop-blur-md relative z-10 w-full">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between h-14">
          <span className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            HopLens
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-bold text-zinc-900 hover:bg-zinc-200 transition-all shadow-sm shadow-white/10"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-24 pb-20">
          <div className="flex flex-col items-center text-center gap-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              5 global regions · Real-time probes every 5 min
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.1] drop-shadow-sm">
              Know exactly where your site is <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">slow</span>
            </h1>

            <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed">
              HopLens monitors TTFB, cache behavior, and edge performance from São Paulo, Frankfurt,
              New York, Tokyo, and Sydney. No SDK. No config. Just paste your URL.
            </p>

            <HeroUrlForm />

            <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest mt-2">
              Free · No credit card required
            </p>
          </div>
        </section>

        {/* Product screenshot */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-24">
          {/* Browser chrome frame */}
          <div className="rounded-2xl border border-zinc-800 shadow-2xl shadow-black/50 overflow-hidden ring-1 ring-white/10">
            {/* Browser bar */}
            <div className="flex items-center gap-2 border-b border-zinc-800/80 bg-zinc-900/80 backdrop-blur px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-amber-500/80" />
              <span className="h-3 w-3 rounded-full bg-green-500/80" />
              <div className="ml-3 flex-1 max-w-md rounded-md border border-zinc-700/50 bg-zinc-800/80 px-3 py-1 text-xs text-zinc-400 text-center flex items-center justify-center gap-2">
                <svg className="w-3 h-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                app.hoplens.io/dashboard/monitors/…
              </div>
            </div>

            {/* Monitor detail mock */}
            <div className="bg-zinc-900/50 p-4 sm:p-6 space-y-4">
              {/* Header */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 backdrop-blur-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-inner py-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-bold text-white">stripe.com</span>
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                      Healthy
                    </span>
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                      Cloudflare
                    </span>
                    <span className="rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-xs font-medium text-zinc-400">
                      HTTP/2
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">https://stripe.com · Updated: just now</p>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">44ms</p>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 mt-0.5">Avg TTFB</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-400">94%</p>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 mt-0.5">Cache hit</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">100%</p>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500 mt-0.5">Uptime</p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                {['Performance', 'Cache', 'Security', 'Alerts'].map((tab, i) => (
                  <span
                    key={tab}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold cursor-default transition-all ${
                      i === 0
                        ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-white/10'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                    }`}
                  >
                    {tab}
                  </span>
                ))}
              </div>

              {/* Regional table */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden backdrop-blur-md shadow-inner">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80">
                      <th className="text-left px-5 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">Region</th>
                      <th className="text-right px-5 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">TTFB avg</th>
                      <th className="text-right px-5 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">P95</th>
                      <th className="text-right px-5 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">Cache</th>
                      <th className="text-right px-5 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">Uptime</th>
                      <th className="text-right px-5 py-3 font-semibold text-zinc-400 uppercase tracking-widest text-[10px]">HTTP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {[
                      { region: 'São Paulo', flag: '🇧🇷', ttfb: '38ms', p95: '54ms', cache: 'HIT', uptime: '100%', http: 'H2', ttfbColor: 'text-emerald-400' },
                      { region: 'Frankfurt', flag: '🇩🇪', ttfb: '41ms', p95: '58ms', cache: 'HIT', uptime: '100%', http: 'H2', ttfbColor: 'text-emerald-400' },
                      { region: 'New York', flag: '🇺🇸', ttfb: '44ms', p95: '63ms', cache: 'HIT', uptime: '99.9%', http: 'H2', ttfbColor: 'text-emerald-400' },
                      { region: 'Tokyo', flag: '🇯🇵', ttfb: '68ms', p95: '91ms', cache: 'MISS', uptime: '100%', http: 'H2', ttfbColor: 'text-orange-400' },
                      { region: 'Sydney', flag: '🇦🇺', ttfb: '72ms', p95: '98ms', cache: 'HIT', uptime: '100%', http: 'H2', ttfbColor: 'text-orange-400' },
                    ].map(row => (
                      <tr key={row.region} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="px-5 py-3.5 text-zinc-100 font-medium flex items-center gap-2">
                          <span className="text-sm">{row.flag}</span>{row.region}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-bold tabular-nums ${row.ttfbColor}`}>
                          {row.ttfb}
                        </td>
                        <td className="px-5 py-3.5 text-right text-zinc-500 tabular-nums font-medium">{row.p95}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                            row.cache === 'HIT'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                          }`}>
                            {row.cache}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-zinc-500 tabular-nums font-medium">{row.uptime}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-400">
                            {row.http}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Week trend bar */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-zinc-300">Week-over-week trend</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Comparing last 7 days vs previous 7 days</p>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-sm">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span>8% faster</span>
                  <span className="text-xs font-medium text-zinc-500">this week</span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Live data · 5 regions · Updated 5 min
          </p>
        </section>
      </main>

      <footer className="border-t border-zinc-800/50 py-8 relative z-10 bg-zinc-900/50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between">
          <span className="text-xs text-zinc-500 font-medium">HopLens — Edge Performance Monitoring</span>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">
              Sign up free
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
