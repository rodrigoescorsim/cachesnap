const MOCK_REGIONS = [
  {
    region: 'Cape Town',
    pop: 'JNB',
    cdn: 'Cloudflare',
    cache: 'MISS' as const,
    ttfb: 612,
    ttfbClass: 'text-metric-ttfb-med',
    vsPct: '+312%',
    vsClass: 'text-rose-400',
    sync: '14:23:00',
  },
  {
    region: 'Sydney',
    pop: 'SYD',
    cdn: 'Cloudflare',
    cache: 'HIT' as const,
    ttfb: 48,
    ttfbClass: 'text-metric-elite',
    vsPct: '-74%',
    vsClass: 'text-emerald-400',
    sync: '14:23:01',
  },
  {
    region: 'Tokyo',
    pop: 'NRT',
    cdn: 'Cloudflare',
    cache: 'HIT' as const,
    ttfb: 38,
    ttfbClass: 'text-metric-elite',
    vsPct: '-79%',
    vsClass: 'text-emerald-400',
    sync: '14:23:01',
  },
  {
    region: 'Virginia',
    pop: 'IAD',
    cdn: 'Cloudflare',
    cache: 'HIT' as const,
    ttfb: 22,
    ttfbClass: 'text-metric-elite',
    vsPct: '-88%',
    vsClass: 'text-emerald-400',
    sync: '14:23:02',
  },
  {
    region: 'Frankfurt',
    pop: 'FRA',
    cdn: 'Cloudflare',
    cache: 'HIT' as const,
    ttfb: 31,
    ttfbClass: 'text-metric-elite',
    vsPct: '-83%',
    vsClass: 'text-emerald-400',
    sync: '14:23:01',
  },
  {
    region: 'São Paulo',
    pop: 'GRU',
    cdn: 'Cloudflare',
    cache: 'HIT' as const,
    ttfb: 43,
    ttfbClass: 'text-metric-elite',
    vsPct: '-77%',
    vsClass: 'text-emerald-400',
    sync: '14:23:00',
  },
]

export function DashboardPreview() {
  return (
    <section className="cs-container-adaptive pb-20">

      {/* Section header */}
      <div className="text-center mb-12">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
          Platform
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          This is what you get, immediately.
        </h2>
        <p className="mt-4 text-zinc-400 max-w-lg mx-auto">
          Live latency, cache hit rate, and security diagnostics across every region — no setup required.
        </p>
      </div>

      {/* Browser chrome wrapper */}
      <div
        className="relative mx-auto rounded-2xl overflow-hidden"
        style={{
          maxWidth: '900px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 0 80px -20px rgba(34,255,136,0.12), 0 40px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Browser top bar */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ background: '#0d1829', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="h-3 w-3 rounded-full bg-zinc-700" />
            <span className="h-3 w-3 rounded-full bg-zinc-700" />
            <span className="h-3 w-3 rounded-full bg-zinc-700" />
          </div>
          <div className="flex-1 flex justify-center">
            <div
              className="flex items-center gap-2 rounded-md px-3 py-1"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', maxWidth: '280px', width: '100%' }}
            >
              <svg className="h-3 w-3 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-[11px] text-zinc-500 truncate">app.cachesnap.com/monitors/stripe-com</span>
            </div>
          </div>
          <div className="shrink-0 w-[52px]" />
        </div>

        {/* Dashboard content */}
        <div
          className="px-4 py-4 space-y-3 pointer-events-none select-none"
          style={{ background: 'var(--background)' }}
        >

          {/* Monitor header card */}
          <div className="cs-card cs-card-glass px-4 py-2.5 relative min-w-0">
            <div className="cs-card-wash" aria-hidden />
            <div className="relative z-10 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-[18px] font-semibold leading-tight tracking-tight text-white truncate">stripe.com</h1>
                <p className="text-[11px] text-zinc-500 mt-0.5 truncate">https://stripe.com</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Active */}
                <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-white/5 px-2.5 text-[9px] font-bold uppercase tracking-widest text-zinc-300">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: 'var(--brand-primary)', boxShadow: '0 0 8px rgba(34,255,136,0.5)' }}
                  />
                  Active
                </div>
                {/* Live Sync */}
                <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-white/5 px-2.5 text-[9px] font-bold uppercase tracking-widest">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full animate-pulse"
                    style={{ background: 'var(--brand-primary)' }}
                  />
                  <span style={{ color: 'var(--brand-primary)' }}>Live Sync</span>
                </div>
                {/* Incidents: none */}
                <div className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-white/5 px-2.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                  <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  —
                </div>
              </div>
            </div>
          </div>

          {/* Global metric stat cards */}
          <div className="cs-card cs-card-glass overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="cs-card-wash opacity-40" aria-hidden />
            <div className="relative z-10 grid grid-cols-2 divide-x divide-white/5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

              {/* Global TTFB */}
              <div className="px-5 py-4" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between">
                  <p className="cs-metric-card-label !text-[11px]">Global TTFB</p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[26px] font-black tracking-tight leading-none text-metric-elite">43</span>
                      <span className="text-[13px] font-black uppercase tracking-wider opacity-90 text-metric-elite">ms</span>
                    </div>
                    <svg className="h-5 w-5 text-metric-elite" style={{ strokeWidth: 2.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Global Cache Hit Rate */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <p className="cs-metric-card-label !text-[11px]">Global Cache Hit Rate</p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[26px] font-black tracking-tight leading-none text-metric-elite">94</span>
                      <span className="text-[13px] font-black uppercase tracking-wider opacity-90 text-metric-elite">%</span>
                    </div>
                    <svg className="h-5 w-5 fill-current text-metric-elite" viewBox="0 0 24 24">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Live table */}
          <div className="cs-card cs-card-glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {['Region', 'Served from', 'Served by', 'Cache', 'TTFB', 'vs Global', 'Status', 'Sync'].map((h, i) => (
                      <th
                        key={h}
                        className="cs-table-compact-th"
                        style={{
                          textAlign: i === 0 ? 'left' : 'center',
                          ...(h === 'TTFB' ? { color: 'rgba(34,255,136,0.6)' } : {}),
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ borderColor: 'rgba(255,255,255,0.02)' }} className="divide-y divide-white/[0.02]">
                  {MOCK_REGIONS.map((row) => (
                    <tr key={row.region} className="hover:bg-white/[0.015] transition-colors">
                      <td className="cs-table-compact-td font-bold text-zinc-200">{row.region}</td>
                      <td className="cs-table-compact-td text-center">
                        <span className="cs-pop-tag uppercase">{row.pop}</span>
                      </td>
                      <td className="cs-table-compact-td text-center">
                        <span className="cs-pop-tag truncate">{row.cdn}</span>
                      </td>
                      <td className="cs-table-compact-td text-center">
                        {row.cache === 'HIT' ? (
                          <span className="cs-badge-cache-hit">
                            <svg className="h-[10px] w-[10px] fill-current shrink-0" viewBox="0 0 24 24">
                              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            HIT
                          </span>
                        ) : (
                          <span className="cs-badge-cache-miss">MISS</span>
                        )}
                      </td>
                      <td className={`cs-table-compact-td text-center text-[13px] font-black tabular-nums ${row.ttfbClass}`}>
                        {row.ttfb}ms
                      </td>
                      <td className={`cs-table-compact-td text-center text-[12px] font-black tabular-nums ${row.vsClass}`}>
                        {row.vsPct}
                      </td>
                      <td className="cs-table-compact-td text-center">
                        <span className="cs-badge-flat cs-badge-flat-success">200</span>
                      </td>
                      <td className="cs-table-compact-td text-center text-[10px] tabular-nums text-zinc-500 font-mono">
                        {row.sync}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--background))' }}
          aria-hidden
        />
      </div>
    </section>
  )
}
