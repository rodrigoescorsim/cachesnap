import Link from 'next/link'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { buildViewHref, TIMEFRAME_TOOLTIPS, type PerformanceView } from './monitor-href'

const RANGES = ['1h', '4h', '24h', '7d', '30d', '90d'] as const
export const PATTERNS_RANGES = ['1d', '7d', '30d', '90d'] as const
export const HEATMAP_RANGES = ['7d', '30d', '90d'] as const

export function TimeframeChipTrack({
  view,
  range,
  monitorId,
  ranges = RANGES,
  buildHref,
}: {
  view: PerformanceView
  range: string
  monitorId: string
  ranges?: readonly string[]
  buildHref?: (r: string) => string
}) {
  const getHref = (r: string) => buildHref ? buildHref(r) : buildViewHref(view, r, monitorId)
  return (
    <div className="cs-chip-track max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
      {ranges.map((r) => (
        <PremiumTooltip key={r} content={TIMEFRAME_TOOLTIPS[r]}>
          <Link
            href={getHref(r)}
            scroll={false}
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
