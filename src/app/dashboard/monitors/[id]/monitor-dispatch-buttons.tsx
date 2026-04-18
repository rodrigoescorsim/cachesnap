'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/** 
 * Renders the primary action triggers for manual probes. 
 * Refined 'Run Probe Now' version with Title Case and premium SaaS aesthetics.
 */
export function MonitorDispatchButtons({ monitorId, variant = 'default' }: { monitorId: string, variant?: 'default' | 'compact' | 'audit' }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const isCompact = variant === 'compact'
  const isAudit = variant === 'audit'
  const cooldownPeriod = isAudit ? 60 : 30

  useEffect(() => {
    const lastClick = localStorage.getItem(`last_dispatch_${variant}_${monitorId}`)
    if (lastClick) {
      const diff = Math.floor((Date.now() - Number(lastClick)) / 1000)
      if (diff < cooldownPeriod) setCooldown(cooldownPeriod - diff)
    }
  }, [monitorId, variant, cooldownPeriod])

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

  function handleDispatch(bypass: boolean | 'both') {
    if (cooldown > 0) return
    setError(null)
    startTransition(async () => {
      try {
        const dispatch = async (b: boolean) => {
          return fetch(`/api/monitors/${monitorId}/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bypass: b }),
          })
        }

        let results: Response[] = []
        if (bypass === 'both') {
          results = await Promise.all([dispatch(false), dispatch(true)])
        } else {
          results = [await dispatch(bypass)]
        }

        const allOk = results.every(r => r.ok)
        if (allOk) {
          localStorage.setItem(`last_dispatch_${variant}_${monitorId}`, String(Date.now()))
          setCooldown(cooldownPeriod)
          router.refresh()
        } else {
          setError('Failed to launch full audit')
        }
      } catch {
        setError('Connection failure')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => handleDispatch(isAudit ? 'both' : false)}
        disabled={cooldown > 0 || isPending}
        className={`relative inline-flex h-9 items-center justify-center gap-2.5 rounded-xl border transition-all duration-300 shadow-sm active:scale-95 disabled:opacity-80 disabled:active:scale-100 ${
          cooldown > 0
            ? 'px-6 border-white/10 bg-white/5 text-zinc-500 cursor-not-allowed'
            : (isCompact || isAudit)
              ? 'px-6 border-emerald-500/30 bg-emerald-500/5 text-emerald-400 font-bold text-xs hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]'
              : 'px-3 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/20'
        }`}
      >
        <svg
          viewBox="0 0 16 16"
          className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={cooldown > 0 ? "M12 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M8 4v4l2 2" : "M1 1v4h4M15 15v-4h-4M13.6 4.5A7 7 0 1 0 14.5 9"} />
        </svg>
        <span className="tracking-tight whitespace-nowrap">
          {cooldown > 0 
           ? `Cooldown ${cooldown}s` 
           : isPending 
             ? 'Auditing Now...' 
             : isAudit 
               ? 'Audit Now' 
               : isCompact 
                 ? 'Refresh Now' 
                 : 'Refresh'
          }
        </span>
      </button>

      {!isCompact && !isAudit && (
        <button
          type="button"
          onClick={() => handleDispatch(true)}
          disabled={cooldown > 0 || isPending}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-1 text-xs font-bold text-white transition-all shadow-sm active:scale-95 hover:border-zinc-700 hover:bg-surface/80 disabled:opacity-50"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1v4h4M15 15v-4h-4M13.6 4.5A7 7 0 1 0 14.5 9" />
          </svg>
          Bypass
        </button>
      )}
      </div>
      {error && <p className="text-[10px] font-bold text-red-400 px-1 animate-pulse">{error}</p>}
    </div>
  )
}
