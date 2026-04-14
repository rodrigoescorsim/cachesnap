'use client'

import { useEffect, useRef, useState } from 'react'

export function TtfbLegendHelp() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <span ref={rootRef} className="relative -ml-0.5 inline-flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-describedby={open ? 'ttfb-unattributed-tooltip' : undefined}
        title="Click for an explanation"
        className="inline-grid size-4 place-items-center rounded-full p-0 text-[9px] font-semibold leading-none text-sky-500 hover:bg-sky-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        aria-label="About TTFB (unattributed)"
      >
        ?
      </button>
      {open && (
        <span
          id="ttfb-unattributed-tooltip"
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+4px)] z-50 w-[min(calc(100vw-2rem),18rem)] -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left text-[10px] leading-snug text-zinc-600 shadow-lg dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <span className="font-medium text-zinc-700 dark:text-zinc-200">TTFB (unattributed):</span>{' '}
          Part of Time to First Byte not explained by DNS, TCP, TLS, or edge/origin slices from{' '}
          <code className="rounded bg-zinc-100 px-0.5 font-mono text-[9px] dark:bg-zinc-800">Server-Timing</code>
          . Large values often mean waiting on the edge or app after headers are parsed.{' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
          >
            MDN: Server-Timing
          </a>
        </span>
      )}
    </span>
  )
}
