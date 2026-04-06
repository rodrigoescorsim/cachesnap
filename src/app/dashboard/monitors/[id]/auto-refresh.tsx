'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh({ hasData }: { hasData: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (hasData) return
    const id = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(id)
  }, [hasData, router])

  return null
}
