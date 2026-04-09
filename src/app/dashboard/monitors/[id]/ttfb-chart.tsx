'use client'

import Link from 'next/link'

export interface ChartPoint {
  bucket: string  // ISO string — serializado pelo Server Component antes de passar ao client
  region: string
  ttfb_avg: number
  dns_avg: number | null
  tls_avg: number | null
}

const REGION_COLORS: Record<string, string> = {
  'sa-east': '#f59e0b',
  'eu-west': '#3b82f6',
  'us-east': '#10b981',
  'us-west': '#06b6d4',
  'ap-east': '#8b5cf6',
  'ap-south': '#ec4899',
  'oc':      '#f43f5e',
  'af-south': '#a855f7',
}

const REGION_LABELS: Record<string, string> = {
  'sa-east': 'South America',
  'eu-west': 'Europe',
  'us-east': 'US East',
  'us-west': 'US West',
  'ap-east': 'Asia Pacific',
  'ap-south': 'India',
  'oc':      'Oceania',
  'af-south': 'Africa',
}

// Dimensões do viewBox SVG
const W = 700, H = 180
const PAD = { top: 12, right: 16, bottom: 32, left: 48 }
const CW = W - PAD.left - PAD.right   // largura da área do gráfico
const CH = H - PAD.top  - PAD.bottom  // altura da área do gráfico

function formatLabel(iso: string, range: string): string {
  const d = new Date(iso)
  if (range === '7d') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function TtfbChart({ data, range }: { data: ChartPoint[]; range: string }) {
  const regions = [...new Set(data.map(d => d.region))].sort()
  const allBuckets = [...new Set(data.map(d => d.bucket))].sort()

  const byRegion: Record<string, Map<string, ChartPoint>> = {}
  for (const d of data) {
    if (!byRegion[d.region]) byRegion[d.region] = new Map()
    byRegion[d.region].set(d.bucket, d)
  }

  // Calculate global averages per bucket
  const globalAverages = allBuckets.map(b => {
    const points = data.filter(d => d.bucket === b)
    const dns = points.reduce((acc, p) => acc + (p.dns_avg ?? 0), 0) / points.length
    const tls = points.reduce((acc, p) => acc + (p.tls_avg ?? 0), 0) / points.length
    return { bucket: b, dns, tls }
  })

  // TTFB max
  const maxTtfb = Math.max(...data.map(d => d.ttfb_avg), 1)
  const niceMaxTtfb = Math.max(Math.ceil(maxTtfb / 100) * 100, 100)

  // Network max
  const maxNet = Math.max(...data.map(d => (d.dns_avg ?? 0) + (d.tls_avg ?? 0)), 1)
  const niceMaxNet = Math.max(Math.ceil(maxNet / 50) * 50, 50)

  const toX = (i: number) => PAD.left + (i / (allBuckets.length - 1)) * CW
  const toYTtfb = (ms: number) => PAD.top + (1 - ms / niceMaxTtfb) * CH
  const toYNet = (ms: number) => PAD.top + (1 - ms / niceMaxNet) * CH

  const ttfbYLabels = [0, Math.round(niceMaxTtfb / 2), niceMaxTtfb]
  const netYLabels = [0, Math.round(niceMaxNet / 2), niceMaxNet]
  
  const n = allBuckets.length - 1
  const xIdxs = [...new Set([0, Math.round(n / 3), Math.round(2 * n / 3), n])]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
          Performance trends
        </h2>
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg gap-1">
          {['24h', '7d'].map(r => (
            <Link
              key={r}
              href={`?range=${r}`}
              className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all duration-200 uppercase tracking-wider ${
                range === r
                  ? 'bg-white dark:bg-zinc-700 text-zinc-950 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {r}
            </Link>
          ))}
        </div>
      </div>

      {allBuckets.length < 2 ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/30 p-12 text-center">
          <p className="text-sm text-zinc-400">Analyzing historical patterns...</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── CHART 1: TTFB ── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 shadow-sm relative overflow-hidden group">
            <div className="absolute top-4 right-4 text-[10px] font-bold text-zinc-400 uppercase tracking-tight">Main Speed (TTFB)</div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              {ttfbYLabels.map(v => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={toYTtfb(v)} y2={toYTtfb(v)} stroke="currentColor" strokeOpacity={0.07} strokeWidth={1} />
                  <text x={PAD.left - 6} y={toYTtfb(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                </g>
              ))}

              {xIdxs.map((idx, i) => (
                <text key={idx} x={toX(idx)} y={H - 8} textAnchor={i === 0 ? 'start' : i === xIdxs.length - 1 ? 'end' : 'middle'} fontSize={8} fill="currentColor" fillOpacity={0.35}>
                  {formatLabel(allBuckets[idx], range)}
                </text>
              ))}

              {regions.map(region => {
                const regionMap = byRegion[region]
                if (!regionMap || regionMap.size < 2) return null
                const points = allBuckets.map((b, i) => {
                  const p = regionMap.get(b)
                  return p ? `${toX(i)},${toYTtfb(p.ttfb_avg)}` : null
                }).filter((p): p is string => p !== null).join(' ')
                return <polyline key={region} points={points} fill="none" stroke={REGION_COLORS[region] ?? '#71717a'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              })}
            </svg>
          </div>

          {/* ── CHART 2: NETWORK LAYER ── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 shadow-sm relative overflow-hidden group">
            <div className="absolute top-4 right-4 text-[10px] font-bold text-zinc-400 uppercase tracking-tight">Network Phase (DNS/TLS)</div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              {netYLabels.map(v => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={toYNet(v)} y2={toYNet(v)} stroke="currentColor" strokeOpacity={0.07} strokeWidth={1} />
                  <text x={PAD.left - 6} y={toYNet(v) + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.4}>{v}ms</text>
                </g>
              ))}

              {xIdxs.map((idx, i) => (
                <text key={idx} x={toX(idx)} y={H - 8} textAnchor={i === 0 ? 'start' : i === xIdxs.length - 1 ? 'end' : 'middle'} fontSize={8} fill="currentColor" fillOpacity={0.35}>
                  {formatLabel(allBuckets[idx], range)}
                </text>
              ))}

              {/* Global DNS Line (Purple) */}
              <polyline
                points={globalAverages.map((g, i) => `${toX(i)},${toYNet(g.dns)}`).join(' ')}
                fill="none" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 2" strokeOpacity={0.6}
              />
              {/* Global TLS Line (Fuchsia) */}
              <polyline
                points={globalAverages.map((g, i) => `${toX(i)},${toYNet(g.tls)}`).join(' ')}
                fill="none" stroke="#d946ef" strokeWidth={2} strokeDasharray="4 2" strokeOpacity={0.6}
              />

              {regions.map(region => {
                const regionMap = byRegion[region]
                if (!regionMap || regionMap.size < 2) return null
                const points = allBuckets.map((b, i) => {
                  const p = regionMap.get(b)
                  return p ? `${toX(i)},${toYNet((p.dns_avg ?? 0) + (p.tls_avg ?? 0))}` : null
                }).filter((p): p is string => p !== null).join(' ')
                return <polyline key={region} points={points} fill="none" stroke={REGION_COLORS[region] ?? '#71717a'} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.4} />
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Legenda consolidada */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 justify-between items-center">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {regions.map(region => (
            <div key={region} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: REGION_COLORS[region] ?? '#71717a' }}
              />
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">
                {REGION_LABELS[region] ?? region}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-l border-zinc-200 dark:border-zinc-800 pl-4">
           <div className="flex items-center gap-1.5">
             <div className="w-4 h-0.5 border-t-2 border-dashed border-purple-500 opacity-60" />
             <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-tight">Global DNS</span>
           </div>
           <div className="flex items-center gap-1.5">
             <div className="w-4 h-0.5 border-t-2 border-dashed border-fuchsia-500 opacity-60" />
             <span className="text-[10px] font-bold text-fuchsia-600 dark:text-fuchsia-400 uppercase tracking-tight">Global TLS</span>
           </div>
        </div>
      </div>
    </div>
  )
}
