'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PauseCircle, Snowflake } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'

/** 
 * Renders the primary action triggers for manual probes. 
 * Refined 'Run Probe Now' version with Title Case and premium SaaS aesthetics.
 */
export function MonitorDispatchButtons({
  monitorId,
  variant = 'default',
  freezeStorageKey,
}: {
  monitorId: string
  variant?: 'default' | 'compact' | 'audit'
  freezeStorageKey?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isFrozen, setIsFrozen] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const isCompact = variant === 'compact'
  const isAudit = variant === 'audit'
  const cooldownPeriod = isAudit ? 60 : 30
  const liveFreezeStorageKey = freezeStorageKey ?? `live_updates_frozen_${monitorId}`

  useEffect(() => {
    const lastClick = localStorage.getItem(`last_dispatch_${variant}_${monitorId}`)
    if (lastClick) {
      const diff = Math.floor((Date.now() - Number(lastClick)) / 1000)
      if (diff < cooldownPeriod) setCooldown(cooldownPeriod - diff)
    }
  }, [monitorId, variant, cooldownPeriod])

  useEffect(() => {
    if (!isCompact) return
    setIsFrozen(window.localStorage.getItem(liveFreezeStorageKey) === '1')
  }, [liveFreezeStorageKey, isCompact])

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

  function toggleFreeze() {
    const nextFrozen = !isFrozen
    setIsFrozen(nextFrozen)
    window.localStorage.setItem(liveFreezeStorageKey, nextFrozen ? '1' : '0')
    // Persist the exact freeze moment so the header can display "View frozen at HH:mm".
    if (nextFrozen) {
      window.localStorage.setItem(`${liveFreezeStorageKey}_at`, String(Date.now()))
    } else {
      window.localStorage.removeItem(`${liveFreezeStorageKey}_at`)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <PremiumTooltip
          content={isCompact ? 'Run a fresh probe across all regions right now. Cooldown: 30 seconds.' : 'Dispatch a manual refresh now.'}
          position="top-center"
          direction="top"
        >
          <button
            type="button"
            onClick={() => handleDispatch(isAudit ? 'both' : false)}
            disabled={cooldown > 0 || isPending}
            className={`relative inline-flex h-9 items-center justify-center gap-2.5 rounded-xl border transition-all duration-300 shadow-sm active:scale-95 disabled:opacity-80 disabled:active:scale-100 ${
              cooldown > 0
                ? 'px-6 border-white/10 bg-white/5 text-zinc-500 cursor-not-allowed'
                : (isCompact || isAudit)
                  ? 'px-6 border-[rgba(34,255,136,0.3)] bg-[rgba(34,255,136,0.05)] text-metric-ttfb-fast font-bold text-xs hover:bg-[rgba(34,255,136,0.1)] hover:border-[rgba(34,255,136,0.5)] hover:shadow-[0_0_20px_rgba(34,255,136,0.1)]'
                  : 'px-3 border-[rgba(34,255,136,0.2)] bg-[rgba(34,255,136,0.1)] text-metric-ttfb-fast hover:border-[rgba(34,255,136,0.4)] hover:bg-[rgba(34,255,136,0.2)]'
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
        </PremiumTooltip>

        {isCompact && (
          <PremiumTooltip
            content={
              isFrozen
                ? 'Live updates paused. Click to resume real-time monitoring.'
                : 'Pause live updates to analyze this snapshot without changes.'
            }
            position="top-center"
            direction="top"
          >
            <button
              type="button"
              onClick={toggleFreeze}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold tracking-tight shadow-sm transition-all duration-300 ease-out active:scale-[0.98] ${
                isFrozen
                  ? 'border border-indigo-400/65 bg-indigo-900/40 text-white hover:border-indigo-300 hover:bg-indigo-800/50 hover:shadow-[0_0_18px_rgba(99,102,241,0.28)]'
                  : 'border border-teal-300/25 bg-zinc-900/55 text-zinc-300 hover:border-teal-300/45 hover:bg-zinc-800/70 hover:text-zinc-100'
              }`}
            >
              {/* Frozen state gets the pause icon to signal "resume updates" action. */}
              {isFrozen ? <PauseCircle className="h-3.5 w-3.5" /> : <Snowflake className="h-3.5 w-3.5" />}
              <span className="whitespace-nowrap">
                {/* Visual hierarchy: secondary when idle, more prominent when frozen. */}
                {isFrozen ? 'Frozen' : 'Freeze View'}
              </span>
            </button>
          </PremiumTooltip>
        )}

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
