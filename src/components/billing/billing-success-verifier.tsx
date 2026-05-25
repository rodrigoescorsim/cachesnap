'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function BillingSuccessVerifier({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter()
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/billing/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription_id: subscriptionId }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('verify failed')
        router.replace('/dashboard/billing?activated=1')
      })
      .catch(() => setError(true))
  }, [subscriptionId, router])

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-4">
        <span className="mt-0.5 text-sm text-amber-400">⚠</span>
        <div>
          <p className="text-sm font-bold text-amber-400">Could not verify your subscription automatically.</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            Your payment may have been processed. Please refresh in a few seconds or{' '}
            <a href="mailto:hello@cachesnap.com" className="underline hover:text-zinc-300">contact support</a>{' '}
            if your plan doesn&apos;t update.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <svg className="h-4 w-4 shrink-0 animate-spin text-[var(--brand-primary)]" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm text-zinc-400">Verifying your subscription…</p>
    </div>
  )
}
