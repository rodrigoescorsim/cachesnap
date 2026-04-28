'use client'

import React from 'react'
import { PremiumTooltip } from '@/components/premium-tooltip'

export function TtfbLegendHelp() {
  return (
    <PremiumTooltip
      panelSizing="hug"
      interactive={true}
      className="ml-1"
      content={
        <div className="text-[10px] leading-snug">
          <span className="font-bold text-zinc-200">TTFB (unattributed):</span>
          <p className="mt-1 text-zinc-400">
            Part of Time to First Byte not explained by DNS, TCP, TLS, or edge/origin slices from{' '}
            <code className="rounded bg-white/5 px-1 font-mono text-[9px] text-zinc-300">Server-Timing</code>.
          </p>
          <p className="mt-1 text-zinc-400">
            Large values often mean waiting on the edge or app after headers are parsed.
          </p>
          <div className="mt-2 border-t border-white/5 pt-2">
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:underline"
            >
              MDN: Server-Timing Reference
            </a>
          </div>
        </div>
      }
    >
      <button
        type="button"
        className="inline-grid size-4 place-items-center rounded-full bg-white/5 text-[9px] font-bold text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-300"
        aria-label="About TTFB (unattributed)"
      >
        ?
      </button>
    </PremiumTooltip>
  )
}
