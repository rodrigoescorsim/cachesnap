import Link from 'next/link'
import { Lock } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { buildViewHref, TIMEFRAME_TOOLTIPS, type PerformanceView } from './monitor-href'
import { RANGE_DAYS } from '@/lib/plans'

const RANGES = ['1h', '4h', '24h', '7d', '30d', '90d'] as const
export const PATTERNS_RANGES = ['1d', '7d', '30d', '90d'] as const
export const HEATMAP_RANGES = ['7d', '30d', '90d'] as const

const PLAN_FOR_DAYS: Record<number, string> = { 30: 'Pro', 90: 'Team' }

export function TimeframeChipTrack({
  view,
  range,
  monitorId,
  ranges = RANGES,
  buildHref,
  planHistoryDays,
}: {
  view: PerformanceView
  range: string
  monitorId: string
  ranges?: readonly string[]
  buildHref?: (r: string) => string
  planHistoryDays?: number
}) {
  const getHref = (r: string) => buildHref ? buildHref(r) : buildViewHref(view, r, monitorId)

  return (
    <div className="cs-chip-track max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
      {ranges.map((r) => {
        const rangeDays = RANGE_DAYS[r] ?? 1
        const isLocked = planHistoryDays !== undefined && rangeDays > planHistoryDays
        const requiredPlan = isLocked ? (PLAN_FOR_DAYS[rangeDays] ?? 'Team') : null

        if (isLocked) {
          return (
            <PremiumTooltip key={r} content={`${requiredPlan} plan — upgrade to unlock ${r} history`}>
              <span className="cs-chip-link flex cursor-not-allowed items-center gap-1 text-zinc-600 opacity-50">
                {r}
                <Lock className="h-2.5 w-2.5" />
              </span>
            </PremiumTooltip>
          )
        }

        return (
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
        )
      })}
    </div>
  )
}
