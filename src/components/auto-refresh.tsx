'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AutoRefreshProps {
  intervalMs?: number
  pauseStorageKey?: string
}

export function AutoRefresh({ intervalMs = 60_000, pauseStorageKey }: AutoRefreshProps) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      const isFrozen = Boolean(
        pauseStorageKey &&
          typeof window !== 'undefined' &&
          window.localStorage.getItem(pauseStorageKey) === '1'
      )
      if (!isFrozen && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
        router.refresh()
      }
    }, intervalMs)

    return () => clearInterval(id)
  }, [intervalMs, pauseStorageKey, router])

  return null
}
