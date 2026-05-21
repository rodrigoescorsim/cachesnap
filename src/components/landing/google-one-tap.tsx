'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Script from 'next/script'

type GoogleOneTapProps = {
  clientId: string
}

export function GoogleOneTap({ clientId }: GoogleOneTapProps) {
  const [gsiReady, setGsiReady] = useState(false)
  const initializedRef = useRef(false)

  const handleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    try {
      const res = await fetch('/api/auth/google/one-tap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      })

      if (res.ok) {
        window.location.href = '/monitors'
        return
      }
    } catch {
      // fall through to signup
    }
    window.location.href = '/signup'
  }, [])

  useEffect(() => {
    if (!gsiReady || initializedRef.current || !window.google?.accounts?.id) {
      return
    }

    initializedRef.current = true

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredential,
      auto_select: true,
      cancel_on_tap_outside: true,
      context: 'signup',
      itp_support: true,
    })

    window.google.accounts.id.prompt()

    return () => {
      window.google?.accounts?.id?.cancel()
      initializedRef.current = false
    }
  }, [gsiReady, clientId, handleCredential])

  return (
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onLoad={() => setGsiReady(true)}
    />
  )
}
