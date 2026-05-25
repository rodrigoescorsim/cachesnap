'use client'

import { useState } from 'react'

export function UpgradeButton({ plan, label }: { plan: 'pro' | 'team'; label: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Connection error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm">
          <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ color: 'var(--brand-primary)' }} />
          </svg>
          <p className="text-sm font-semibold text-zinc-400">Upgrading your plan…</p>
        </div>
      )}
      <div className="space-y-1.5">
        <button onClick={handleClick} disabled={loading} className="cs-btn-secondary-md w-full">
          {loading ? 'Processing…' : label}
        </button>
        {error && <p className="text-center text-[11px] text-red-400">{error}</p>}
      </div>
    </>
  )
}

export function ManageButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function handleClick() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <button onClick={handleClick} disabled={loading} className="cs-btn-secondary-md w-full">
        {loading ? 'Opening…' : 'Manage subscription'}
      </button>
      {error && <p className="text-center text-[11px] text-red-400">Could not open portal. Try again.</p>}
    </div>
  )
}
