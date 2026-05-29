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

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <SummaryCard label="CDN Detected" value={topCdn ?? '—'} valueClass="text-zinc-100" />
      <SummaryCard
        label="Cache Hit Rate"
        value={hitRate !== null ? `${hitRate}%` : '—'}
        valueClass={hitRate === null ? 'text-zinc-500' : getCacheColor(hitRate, 'global')}
      />
      <SummaryCard
        label="Avg TTFB"
        value={avgTtfb !== null ? `${avgTtfb}ms` : '—'}
        valueClass={avgTtfb === null ? 'text-zinc-500' : getTtfbColorClass(avgTtfb, 'global')}
      />
      <SummaryCard
        label="Regions"
        value={`${completed.length} / ${regionsTotal}`}
        valueClass="text-zinc-300"
      />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass: string
}) {
  return (
    <div className="cs-card px-4 py-3.5 sm:px-5">
      <div className="cs-card-wash" />
      <p className="relative z-10 mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className={`relative z-10 text-[18px] font-black leading-none tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  )
}
