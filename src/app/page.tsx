import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { HeroUrlForm } from './hero-url-form'

export default async function RootPage() {
  const user = await getSession()
  if (user) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <header className="border-b border-zinc-100">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between h-14">
          <span className="text-sm font-semibold text-zinc-900">HopLens</span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-20 pb-16">
          <div className="flex flex-col items-center text-center gap-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              5 global regions · Real-time probes every 5 min
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 max-w-2xl leading-tight">
              Know exactly where your site is slow
            </h1>

            <p className="text-lg text-zinc-500 max-w-xl leading-relaxed">
              HopLens monitors TTFB, cache behavior, and edge performance from São Paulo, Frankfurt,
              New York, Tokyo, and Sydney. No SDK. No config. Just paste your URL.
            </p>

            <HeroUrlForm />

            <p className="text-xs text-zinc-400">
              Free · No credit card required · Results in under 60 seconds
            </p>
          </div>
        </section>

        {/* Product screenshot */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-24">
          {/* Browser chrome frame */}
          <div className="rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
            {/* Browser bar */}
            <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
              <div className="ml-3 flex-1 max-w-md rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-400 text-center">
                app.hoplens.io/dashboard/monitors/…
              </div>
            </div>

            {/* Monitor detail mock */}
            <div className="bg-zinc-50 p-4 sm:p-6 space-y-4">
              {/* Header */}
              <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-base font-semibold text-zinc-900">stripe.com</span>
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      Healthy
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                      Cloudflare
                    </span>
                    <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500">
                      HTTP/2
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">https://stripe.com · Updated: just now</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-xl font-bold text-zinc-900">44ms</p>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-400">Avg TTFB</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-green-600">94%</p>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-400">Cache hit</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-zinc-900">100%</p>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-400">Uptime</p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1">
                {['Performance', 'Cache', 'Security', 'Alerts'].map((tab, i) => (
                  <span
                    key={tab}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-default ${
                      i === 0
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    {tab}
                  </span>
                ))}
              </div>

              {/* Regional table */}
              <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50">
                      <th className="text-left px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wide text-[10px]">Region</th>
                      <th className="text-right px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wide text-[10px]">TTFB avg</th>
                      <th className="text-right px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wide text-[10px]">P95</th>
                      <th className="text-right px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wide text-[10px]">Cache</th>
                      <th className="text-right px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wide text-[10px]">Uptime</th>
                      <th className="text-right px-4 py-2.5 font-medium text-zinc-500 uppercase tracking-wide text-[10px]">HTTP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {[
                      { region: 'São Paulo', flag: '🇧🇷', ttfb: '38ms', p95: '54ms', cache: 'HIT', uptime: '100%', http: 'H2', ttfbColor: 'text-green-600' },
                      { region: 'Frankfurt', flag: '🇩🇪', ttfb: '41ms', p95: '58ms', cache: 'HIT', uptime: '100%', http: 'H2', ttfbColor: 'text-green-600' },
                      { region: 'New York', flag: '🇺🇸', ttfb: '44ms', p95: '63ms', cache: 'HIT', uptime: '99.9%', http: 'H2', ttfbColor: 'text-green-600' },
                      { region: 'Tokyo', flag: '🇯🇵', ttfb: '68ms', p95: '91ms', cache: 'MISS', uptime: '100%', http: 'H2', ttfbColor: 'text-amber-600' },
                      { region: 'Sydney', flag: '🇦🇺', ttfb: '72ms', p95: '98ms', cache: 'HIT', uptime: '100%', http: 'H2', ttfbColor: 'text-amber-600' },
                    ].map(row => (
                      <tr key={row.region} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-4 py-3 text-zinc-700 font-medium">
                          <span className="mr-2">{row.flag}</span>{row.region}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.ttfbColor}`}>
                          {row.ttfb}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">{row.p95}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            row.cache === 'HIT'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {row.cache}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">{row.uptime}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            {row.http}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Week trend bar */}
              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-zinc-700">Week-over-week trend</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Comparing last 7 days vs previous 7 days</p>
                </div>
                <div className="flex items-center gap-1.5 text-green-600 font-semibold text-sm">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span>8% faster</span>
                  <span className="text-xs font-normal text-zinc-400">this week</span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-zinc-400">
            Live data · Probed from 5 regions · Updated every 5 minutes
          </p>
        </section>
      </main>

      <footer className="border-t border-zinc-100 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between">
          <span className="text-xs text-zinc-400">HopLens — Edge Performance Monitoring</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">
              Sign up free
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
