'use client'

import { useEffect, useState } from 'react'
import { Pause } from 'lucide-react'
import { LiveDot } from '@/components/dashboard/dashboard-ui'
import { MonitorDispatchButtons } from './monitor-dispatch-buttons'

interface LiveActivityHeaderProps {
  monitorId: string
  freezeStorageKey: string
  latestDataAt: number | null
}

/** Hora exata do freeze — HH:mm:ss para leitura rápida e consistência com o pedido. */
function formatFrozenAtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function LiveActivityHeader({ monitorId, freezeStorageKey, latestDataAt }: LiveActivityHeaderProps) {
  const [isFrozen, setIsFrozen] = useState(false)
  const [freezeStartedAtMs, setFreezeStartedAtMs] = useState<number | null>(null)

  useEffect(() => {
    if (isFrozen && latestDataAt && freezeStartedAtMs) {
      // If the data we're showing is significantly newer than when we "froze",
      // it means the user navigated away and back, getting fresh server data.
      // We must auto-thaw to prevent showing an inconsistent "Frozen" label.
      if (latestDataAt > freezeStartedAtMs + 5000) {
        window.localStorage.setItem(freezeStorageKey, '0')
        window.localStorage.removeItem(`${freezeStorageKey}_at`)
      }
    }
  }, [isFrozen, latestDataAt, freezeStartedAtMs, freezeStorageKey])

  useEffect(() => {
    const updateFromStorage = () => {
      const frozen = window.localStorage.getItem(freezeStorageKey) === '1'
      const freezeAtRaw = window.localStorage.getItem(`${freezeStorageKey}_at`)
      const freezeAt = freezeAtRaw ? Number(freezeAtRaw) : NaN

      setIsFrozen(frozen)
      setFreezeStartedAtMs(Number.isFinite(freezeAt) ? freezeAt : null)
    }

    updateFromStorage()
    const id = window.setInterval(updateFromStorage, 1000)
    return () => window.clearInterval(id)
  }, [freezeStorageKey])

  const handleToggleFreeze = () => {
    const nextFrozen = !isFrozen
    setIsFrozen(nextFrozen)
    window.localStorage.setItem(freezeStorageKey, nextFrozen ? '1' : '0')
    if (nextFrozen) {
      window.localStorage.setItem(`${freezeStorageKey}_at`, String(Date.now()))
      setFreezeStartedAtMs(Date.now())
    } else {
      window.localStorage.removeItem(`${freezeStorageKey}_at`)
      setFreezeStartedAtMs(null)
    }
  }

  return (
    <div className="mb-5 px-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="cs-view-section-title">
          <LiveDot />
          Live Performance
        </h2>

        <div className="relative flex shrink-0 flex-col items-end justify-center">
          <MonitorDispatchButtons
            monitorId={monitorId}
            variant="compact"
            freezeStorageKey={freezeStorageKey}
            isFrozen={isFrozen}
            onToggleFreeze={handleToggleFreeze}
          />

          {isFrozen && freezeStartedAtMs != null ? (
            <div
              className="absolute top-[calc(100%-2px)] right-0 flex items-center justify-end gap-1 transition-opacity duration-300 ease-out whitespace-nowrap"
              aria-live="polite"
            >
              <Pause className="h-3 w-3 shrink-0 text-indigo-400/80" aria-hidden />
              <span className="text-[11px] font-normal tabular-nums tracking-tight text-indigo-300/85">
                Frozen at {formatFrozenAtClock(freezeStartedAtMs)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
