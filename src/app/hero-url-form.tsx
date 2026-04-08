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
        className="flex-1 min-w-0 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
      <button
        type="submit"
        className="rounded-xl bg-green-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-600 transition-colors whitespace-nowrap"
      >
        Test now
      </button>
    </form>
  )
}
