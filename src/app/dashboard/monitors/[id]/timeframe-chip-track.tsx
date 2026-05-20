import Link from 'next/link'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { buildViewHref, TIMEFRAME_TOOLTIPS, type PerformanceView } from './monitor-href'

const RANGES = ['1h', '4h', '24h', '7d', '30d', '90d'] as const

export function TimeframeChipTrack({
  view,
  range,
  monitorId,
}: {
  view: PerformanceView
  range: string
  monitorId: string
}) {
  return (
    <div className="cs-chip-track">
      {RANGES.map((r) => (
        <PremiumTooltip key={r} content={TIMEFRAME_TOOLTIPS[r]}>
          <Link
            href={buildViewHref(view, r, monitorId)}
            className={`cs-chip-link ${range === r
              ? 'cs-chip-active'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
              }`}
          >
            {r}
          </Link>
        </PremiumTooltip>
      ))}
    </div>
  )
}
