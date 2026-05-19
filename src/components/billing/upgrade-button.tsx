'use client'

import { useState } from 'react'

export function UpgradeButton({ plan, label }: { plan: 'pro' | 'team'; label: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      if (res.status === 409) {
        const portal = await fetch('/api/billing/portal', { method: 'POST' })
        const { url } = await portal.json()
        if (url) window.location.href = url
        return
      }
      const { url } = await res.json()
      if (url) window.location.href = url
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleClick} disabled={loading} className="cs-btn-secondary-md w-full">
      {loading ? 'Redirecting…' : label}
    </button>
  )
}

export function ManageButton() {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const { url } = await res.json()
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleClick} disabled={loading} className="cs-btn-secondary-md">
      {loading ? 'Opening…' : 'Manage subscription'}
    </button>
  )
}
