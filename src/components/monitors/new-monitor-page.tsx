'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ChevronRight, Globe, Zap } from 'lucide-react'

export function NewMonitorPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    const formData = new FormData(e.currentTarget)
    const url = formData.get('url') as string
    const name = formData.get('name') as string

    if (!url) {
      setErrors({ url: 'URL is required' })
      return
    }

    try {
      new URL(url)
    } catch {
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
          check_interval_seconds: 180,
          audit_interval_seconds: 1800,
        }),
      })

      if (res.ok) {
        router.refresh()
        router.push('/monitors')
      } else {
        const json = await res.json()
        setErrors({ url: json.error ?? 'Failed to create monitor' })
      }
    })
  }

  return (
    <div className="mx-auto max-w-[460px] pb-24 pt-0">
      <div className="mb-6 text-center">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-cyan-400">
          <Zap className="h-3 w-3 fill-cyan-400" />
          Lightning Fast Setup
        </div>
        <h1 className="mb-2 text-2xl font-black tracking-tight text-white">
          Add New Monitor
        </h1>
        <p className="px-4 text-[13px] leading-relaxed text-zinc-400 opacity-70">
          Paste your URL and in less than <span className="font-semibold text-white">60 seconds</span> see latency by region, cache status (HIT/MISS), and actionable insights.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="cs-card cs-card-focus relative p-7 shadow-2xl sm:p-9">
        <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-20 bg-cyan-500/5 opacity-20 blur-[80px]" />
        <div className="cs-card-wash opacity-40" />

        <div className="relative z-10 space-y-6">
          <div className="space-y-2.5">
            <label htmlFor="url" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Monitor URL <span className="text-cyan-500">*</span>
            </label>
            <div className="group relative">
              <div className="absolute left-3 top-1/2 z-20 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-cyan-400">
                <Globe className="h-4 w-4" />
              </div>
              <input
                id="url"
                name="url"
                type="url"
                placeholder="https://api.yourbase.com/v1/health"
                required
                className={`cs-input h-10 w-full !pl-[40px] pr-4 text-sm font-medium tracking-tight ${
                  errors.url ? 'bg-red-500/5 border-red-500/40' : ''
                }`}
              />
            </div>
            <p className="px-1 text-[10px] font-medium leading-normal text-zinc-500 opacity-70">
              CacheSnap will probe this URL from multiple global regions. Bypass checks are automatic.
            </p>
            {errors.url ? <p className="cs-error-msg mt-1.5">{errors.url}</p> : null}
          </div>

          <div className="space-y-2.5">
            <label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Friendly Name <span className="ml-1 opacity-40">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. Production Frontend • API Health"
              className="cs-input h-10 w-full text-sm"
            />
            <p className="px-1 text-[10px] font-medium text-zinc-500 opacity-70">
              Helpful name to identify this monitor in your list.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-3 sm:flex-row">
            <button
              type="submit"
              disabled={isPending}
              className="cs-btn-action h-10 flex-[2.5] px-0 text-xs font-bold leading-none"
            >
              <div className="cs-card-wash opacity-20" />
              <div className="relative z-10 flex items-center justify-center gap-1.5">
                {isPending ? (
                  <span className="animate-pulse">Creating...</span>
                ) : (
                  <>
                    <span>Create Monitor</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="cs-btn-outline h-10 flex-1 border-white/5 bg-white/[0.02] px-0 text-xs font-bold leading-none text-zinc-400"
            >
              Cancel
            </button>
          </div>

          <p className="px-4 text-center text-[10px] font-medium italic leading-normal text-zinc-500 opacity-60">
            After creation you will instantly get a global performance map, cache breakdown, and smart recommendations.
          </p>
        </div>
      </form>
    </div>
  )
}
