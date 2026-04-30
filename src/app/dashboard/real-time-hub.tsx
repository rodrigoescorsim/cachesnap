'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { shouldRefresh } from './real-time-hub.helpers'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Props {
  /** The current logged-in user ID, used for server-side SSE filtering. */
  userId?: string
  /**
   * When set, only SSE events for this monitor ID trigger a refresh.
   * Omit on the dashboard overview to react to any monitor update.
   */
  watchId?: string
  /** How long to wait after the last qualifying message before refreshing. Default: 2000 ms. */
  debounceMs?: number
  /** Optional storage key to pause refreshes if the value is '1'. */
  pauseStorageKey?: string
}

export function RealTimeHub({ userId, watchId, debounceMs = 1_000, pauseStorageKey }: Props) {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!userId) {
      console.warn('[RealTimeHub] Missing userId, real-time updates may not be isolated.')
      return
    }

    const es = new EventSource(`${API_URL}/api/events?user_id=${userId}`)

    es.onmessage = (event) => {
      const incomingId = event.data.trim()
      if (!shouldRefresh(incomingId, watchId)) return

      const isFrozen = Boolean(
        pauseStorageKey &&
          typeof window !== 'undefined' &&
          window.localStorage.getItem(pauseStorageKey) === '1'
      )
      if (isFrozen) return

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => router.refresh(), debounceMs)
    }

    es.onerror = () => {
      // The browser retries automatically; no manual intervention needed.
    }

    return () => {
      es.close()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [router, userId, watchId, debounceMs])

  return null
}
