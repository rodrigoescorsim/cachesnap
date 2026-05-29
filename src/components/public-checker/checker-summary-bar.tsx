import { getCacheColor, getTtfbColorClass } from '@/lib/thresholds'
import type { CheckResult } from './types'

interface Props {
  results: CheckResult[]
  regionsTotal: number
}

export function CheckerSummaryBar({ results, regionsTotal }: Props) {
  const completed = results.filter((r) => !r.error || r.ttfb_ms !== null)

  const cdnCounts: Record<string, number> = {}
  for (const r of completed) {
    if (r.cdn_provider) cdnCounts[r.cdn_provider] = (cdnCounts[r.cdn_provider] ?? 0) + 1
  }
  const topCdn = Object.entries(cdnCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const hitCount = completed.filter((r) => r.cache_status?.toUpperCase() === 'HIT').length
  const hitRate = completed.length > 0 ? Math.round((hitCount / completed.length) * 100) : null

  const ttfbs = completed.map((r) => r.ttfb_ms).filter((v): v is number => v !== null)
  const avgTtfb =
    ttfbs.length > 0 ? Math.round(ttfbs.reduce((s, v) => s + v, 0) / ttfbs.length) : null

  const metrics = [
    {
      label: 'CDN Detected',
      value: topCdn ?? '—',
      valueClass: 'text-zinc-100',
    },
    {
      label: 'Cache Hit Rate',
      value: hitRate !== null ? `${hitRate}%` : '—',
      valueClass: hitRate === null ? 'text-zinc-500' : getCacheColor(hitRate, 'global'),
    },
    {
      label: 'Avg TTFB',
      value: avgTtfb !== null ? `${avgTtfb}ms` : '—',
      valueClass: avgTtfb === null ? 'text-zinc-500' : getTtfbColorClass(avgTtfb, 'global'),
    },
    {
      label: 'Regions',
      value: `${completed.length} / ${regionsTotal}`,
      valueClass: 'text-zinc-300',
    },
  ]

  return (
    <div className="cs-card overflow-hidden">
      <div className="cs-card-wash" />
      <div className="relative z-10 grid grid-cols-2 divide-x divide-y divide-border/40 sm:grid-cols-4 sm:divide-y-0">
        {metrics.map((m) => (
          <div key={m.label} className="px-5 py-4">
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              {m.label}
            </p>
            <p className={`text-[18px] font-black leading-none tabular-nums ${m.valueClass}`}>
              {m.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
