'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function RealTimeHub() {
  const router = useRouter()

  useEffect(() => {
    // URL da API Rust (default local: 3001)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const eventSource = new EventSource(`${apiUrl}/api/events`)

    eventSource.onmessage = (event) => {
      console.log('Real-time update received for monitor:', event.data)
      router.refresh()
    }

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err)
      // O navegador tenta reconectar automaticamente por padrão.
    }

    return () => {
      eventSource.close()
    }
  }, [router])

  return null
}
