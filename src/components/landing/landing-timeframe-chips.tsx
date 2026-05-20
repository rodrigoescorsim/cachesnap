'use client'

import { useState } from 'react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { TIMEFRAME_TOOLTIPS } from '@/app/dashboard/monitors/[id]/monitor-href'

const RANGES = ['1h', '4h', '24h', '7d', '30d', '90d'] as const

export type LandingTimeframe = (typeof RANGES)[number]

export function LandingTimeframeChips({
  value,
  onChange,
  initial = '24h',
}: {
  value?: LandingTimeframe
  onChange?: (range: LandingTimeframe) => void
  initial?: LandingTimeframe
}) {
  const [internal, setInternal] = useState<LandingTimeframe>(initial)
  const range = value ?? internal
  const setRange = onChange ?? setInternal

  return (
    <div className="cs-chip-track">
      {RANGES.map((r) => (
        <PremiumTooltip key={r} content={TIMEFRAME_TOOLTIPS[r]}>
          <button
            type="button"
            onClick={() => setRange(r)}
            className={`cs-chip-link ${range === r
              ? 'cs-chip-active'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
              }`}
          >
            {r}
          </button>
        </PremiumTooltip>
      ))}
    </div>
  )
}
