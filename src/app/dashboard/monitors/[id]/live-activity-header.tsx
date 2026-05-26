'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { LiveDot } from '@/components/dashboard/dashboard-ui'
import { MonitorDispatchButtons } from './monitor-dispatch-buttons'

interface LiveActivityHeaderProps {
  monitorId: string
  freezeStorageKey: string
  latestDataAt: number | null
}

const NARROW_MAX_PX = 767 // Tailwind `md` starts at 768px

export function LiveActivityHeader({ monitorId, freezeStorageKey, latestDataAt }: LiveActivityHeaderProps) {
  const [isFrozen, setIsFrozen] = useState(false)
  const [freezeStartedAtMs, setFreezeStartedAtMs] = useState<number | null>(null)
  const [hideFreezeControl, setHideFreezeControl] = useState(false)

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

  useLayoutEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_MAX_PX}px)`)

    const syncFreezeFromViewport = () => {
      const narrow = mq.matches
      setHideFreezeControl(narrow)

      if (narrow) {
        window.localStorage.setItem(freezeStorageKey, '0')
        window.localStorage.removeItem(`${freezeStorageKey}_at`)
        setIsFrozen(false)
        setFreezeStartedAtMs(null)
        return
      }

      const frozen = window.localStorage.getItem(freezeStorageKey) === '1'
      const freezeAtRaw = window.localStorage.getItem(`${freezeStorageKey}_at`)
      const freezeAt = freezeAtRaw ? Number(freezeAtRaw) : NaN

      setIsFrozen(frozen)
      setFreezeStartedAtMs(Number.isFinite(freezeAt) ? freezeAt : null)
    }

    syncFreezeFromViewport()
    mq.addEventListener('change', syncFreezeFromViewport)
    return () => mq.removeEventListener('change', syncFreezeFromViewport)
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
    <div className="mb-5 overflow-x-clip px-1">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="cs-view-section-title min-w-0 max-md:w-full md:whitespace-nowrap">
          <LiveDot />
          Live Performance
        </h2>

        <div className="flex min-w-0 max-md:w-full items-center justify-start md:shrink-0 md:justify-end">
          <MonitorDispatchButtons
            monitorId={monitorId}
            variant="compact"
            freezeStorageKey={freezeStorageKey}
            isFrozen={isFrozen}
            freezeStartedAtMs={freezeStartedAtMs}
            onToggleFreeze={handleToggleFreeze}
            hideFreezeControl={hideFreezeControl}
          />
        </div>
      </div>
    </div>
  )
}
