'use client'

import Link from 'next/link'

export interface ChartPoint {
  bucket: string  // ISO string — serializado pelo Server Component antes de passar ao client
  region: string
  ttfb_avg: number
}

const REGION_COLORS: Record<string, string> = {
  'sa-east': '#f59e0b',
  'eu-west': '#3b82f6',
  'us-east': '#10b981',
  'ap-east': '#8b5cf6',
  'oc':      '#f43f5e',
}

const REGION_LABELS: Record<string, string> = {
  'sa-east': 'South America',
  'eu-west': 'Europe',
  'us-east': 'US East',
  'ap-east': 'Asia Pacific',
  'oc':      'Oceania',
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

  // Lookup: region → Map<bucket, ttfb_avg>
  const byRegion: Record<string, Map<string, number>> = {}
  for (const d of data) {
    if (!byRegion[d.region]) byRegion[d.region] = new Map()
    byRegion[d.region].set(d.bucket, d.ttfb_avg)
  }

  // Dimensões úteis
  const maxY = Math.max(...data.map(d => d.ttfb_avg), 1)
  const niceMax = Math.max(Math.ceil(maxY / 100) * 100, 100)

  const toX = (i: number) => PAD.left + (i / (allBuckets.length - 1)) * CW
  const toY = (ms: number) => PAD.top + (1 - ms / niceMax) * CH

  const yLabels = [0, Math.round(niceMax / 2), niceMax]
  const n = allBuckets.length - 1
  const xIdxs = [...new Set([0, Math.round(n / 3), Math.round(2 * n / 3), n])]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          TTFB over time
        </h2>
        <div className="flex gap-1">
          {['24h', '7d'].map(r => (
            <Link
              key={r}
              href={`?range=${r}`}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                range === r
                  ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {r.toUpperCase()}
            </Link>
          ))}
        </div>
      </div>

      {allBuckets.length < 2 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center">
          <p className="text-sm text-zinc-400">Not enough data for the selected range.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            {/* Grid horizontal + labels eixo Y */}
            {yLabels.map(v => (
              <g key={v}>
                <line
                  x1={PAD.left} x2={W - PAD.right}
                  y1={toY(v)}   y2={toY(v)}
                  stroke="currentColor" strokeOpacity={0.07} strokeWidth={1}
                />
                <text
                  x={PAD.left - 6} y={toY(v) + 4}
                  textAnchor="end" fontSize={9}
                  fill="currentColor" fillOpacity={0.4}
                >
                  {v}ms
                </text>
              </g>
            ))}

            {/* Labels eixo X */}
            {xIdxs.map((idx, i) => (
              <text
                key={idx}
                x={toX(idx)}
                y={H - 8}
                textAnchor={i === 0 ? 'start' : i === xIdxs.length - 1 ? 'end' : 'middle'}
                fontSize={8}
                fill="currentColor" fillOpacity={0.35}
              >
                {formatLabel(allBuckets[idx], range)}
              </text>
            ))}

            {/* Polylines por região */}
            {regions.map(region => {
              const regionMap = byRegion[region]
              if (!regionMap || regionMap.size < 2) return null

              const points = allBuckets
                .map((b, i) => {
                  const v = regionMap.get(b)
                  return v != null ? `${toX(i)},${toY(v)}` : null
                })
                .filter((p): p is string => p !== null)
                .join(' ')

              return (
                <polyline
                  key={region}
                  points={points}
                  fill="none"
                  stroke={REGION_COLORS[region] ?? '#71717a'}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )
            })}
          </svg>

          {/* Legenda */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-1 px-1">
            {regions.map(region => (
              <div key={region} className="flex items-center gap-1.5">
                <div
                  className="w-5 h-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: REGION_COLORS[region] ?? '#71717a' }}
                />
                <span className="text-xs text-zinc-500">
                  {REGION_LABELS[region] ?? region}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
