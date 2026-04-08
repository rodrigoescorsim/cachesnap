'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export default function NewMonitorPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    const formData = new FormData(e.currentTarget)
    const url = formData.get('url') as string
    const name = formData.get('name') as string
    const alert_threshold_ms = Number(formData.get('alert_threshold_ms'))

    if (!url) {
      setErrors({ url: 'URL is required' })
      return
    }

    try { new URL(url) } catch {
      setErrors({ url: 'Must be a valid URL (include https://)' })
      return
    }

    startTransition(async () => {
      const res = await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          name: name || undefined,
          alert_threshold_ms: alert_threshold_ms || 1000,
        }),
      })

      if (res.ok) {
        router.push('/dashboard')
      } else {
        const json = await res.json()
        setErrors({ url: json.error ?? 'Failed to create monitor' })
      }
    })
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Add monitor</h1>
        <p className="mt-1 text-sm text-zinc-500">
          HopLens will probe your URL from 5 global regions every 5 minutes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            URL <span className="text-red-500">*</span>
          </label>
          <input
            id="url"
            name="url"
            type="url"
            placeholder="https://example.com"
            required
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
          <p className="mt-1 text-xs text-zinc-400">
            Bypass checks are automatic. Use the normal URL only.
          </p>
          {errors.url && <p className="mt-1 text-xs text-red-500">{errors.url}</p>}
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Name <span className="text-zinc-400">(optional)</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="My API"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
        </div>

        <div>
          <label htmlFor="alert_threshold_ms" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Alert threshold (ms)
          </label>
          <input
            id="alert_threshold_ms"
            name="alert_threshold_ms"
            type="number"
            defaultValue={1000}
            min={100}
            max={30000}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
          <p className="mt-1 text-xs text-zinc-400">Alert when TTFB exceeds this value</p>
          {errors.alert_threshold_ms && (
            <p className="mt-1 text-xs text-red-500">{errors.alert_threshold_ms}</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Creating…' : 'Create monitor'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
