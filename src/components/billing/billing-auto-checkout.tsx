'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function BillingAutoCheckout({ plan }: { plan: 'pro' | 'team' }) {
  const router = useRouter()
  const fired = useRef(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (res.ok && data.url) window.location.href = data.url
        else setError(true)
      })
      .catch(() => setError(true))
  }, [plan, router])

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-amber-500/20 bg-zinc-900 px-6 py-6 text-center">
          <p className="text-sm font-bold text-amber-400">Could not start checkout</p>
          <p className="text-xs text-zinc-400">Something went wrong redirecting to checkout. Please try again from the billing page.</p>
          <button
            onClick={() => router.replace('/dashboard/billing')}
            className="cs-btn-secondary-md mt-1"
          >
            Go to billing
          </button>
        </div>
      </div>
    )
  }

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
