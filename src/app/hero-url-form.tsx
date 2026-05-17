'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function HeroUrlForm() {
  const router = useRouter()
  const [url, setUrl] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    const encoded = encodeURIComponent(trimmed)
    router.push(`/signup?url=${encoded}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl gap-2">
      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://yoursite.com"
        required
        className="cs-input flex-1 min-w-0 h-12 rounded-xl px-4 py-3 text-sm font-medium"
      />
      <button type="submit" className="cs-btn-primary h-12 rounded-xl px-6 text-sm font-semibold whitespace-nowrap">
        Start monitoring →
      </button>
    </form>
  )
}
