'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function BillingAutoCheckout({ plan }: { plan: 'pro' | 'team' }) {
  const router = useRouter()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
      .then((res) => res.json())
      .then(({ url }) => {
        if (url) window.location.href = url
        else router.replace('/dashboard/billing')
      })
      .catch(() => router.replace('/dashboard/billing'))
  }, [plan, router])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm">
      <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ color: 'var(--brand-primary)' }} />
      </svg>
      <p className="text-sm font-semibold text-zinc-400">Redirecting to checkout…</p>
    </div>
  )
}
