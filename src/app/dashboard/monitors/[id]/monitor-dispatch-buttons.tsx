'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/** Refresh (edge) + Bypass (origin) dispatch — shared by Instant Test view. */
export function MonitorDispatchButtons({ monitorId }: { monitorId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const lastClick = localStorage.getItem(`last_dispatch_${monitorId}`)
    if (lastClick) {
      const diff = Math.floor((Date.now() - Number(lastClick)) / 1000)
      if (diff < 30) setCooldown(30 - diff)
    }
  }, [monitorId])

  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setTimeout(() => setCooldown(c => c - 1), 1000)
    } else if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [cooldown])

  function handleDispatch(bypass: boolean) {
    if (cooldown > 0) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${monitorId}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bypass }),
        })
        if (res.ok) {
          localStorage.setItem(`last_dispatch_${monitorId}`, String(Date.now()))
          setCooldown(30)
          router.refresh()
        } else {
          const json = await res.json().catch(() => ({}))
          setError((json as { error?: string }).error ?? 'Dispatch failed')
        }
      } catch {
        setError('Dispatch failed')
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => handleDispatch(false)}
        disabled={cooldown > 0 || isPending}
        title="Refresh measuring Edge Cache"
        className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 py-1 text-xs font-bold transition-all shadow-sm disabled:opacity-50 ${
          cooldown > 0
            ? 'border-border/50 bg-surface/20 text-zinc-500'
            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/20'
        }`}
      >
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1v4h4M15 15v-4h-4M13.6 4.5A7 7 0 1 0 14.5 9" />
        </svg>
        {cooldown > 0 ? `Wait ${cooldown}s` : 'Refresh'}
      </button>

      <button
        type="button"
        onClick={() => handleDispatch(true)}
        disabled={cooldown > 0 || isPending}
        title="Refresh bypassing Edge Cache (Hit Origin)"
        className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 py-1 text-xs font-bold transition-all shadow-sm disabled:opacity-50 ${
          cooldown > 0
            ? 'border-border/50 bg-surface/20 text-zinc-500'
            : 'border-border bg-surface text-white hover:border-zinc-700 hover:bg-surface/80'
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1v6M8 9v6M13 3l-2 2M5 11l-2 2M15 8h-6M7 8H1M13 13l-2-2M5 5l-2-2" />
        </svg>
        {cooldown > 0 ? `${cooldown}s` : 'Bypass'}
      </button>
      </div>
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  )
}
