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
    <div className="mx-auto max-w-[460px] pb-24 pt-8 sm:pt-10 animate-[cs-fade-in_0.4s_ease-out]">
      <div className="mb-8 text-center">
        <div 
          className="mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em]"
          style={{ 
            borderColor: 'rgba(var(--brand-primary-rgb), 0.25)', 
            backgroundColor: 'rgba(var(--brand-primary-rgb), 0.08)',
            color: 'var(--brand-primary)'
          }}
        >
          <Zap className="h-3 w-3" style={{ fill: 'var(--brand-primary)' }} />
          Lightning Fast Setup
        </div>
        <h1 className="mb-2.5 text-[32px] font-black tracking-tight text-white leading-none">
          Add New Monitor
        </h1>
        <p className="px-4 text-[14px] leading-relaxed text-zinc-400">
          Paste your URL and in less than <span className="font-bold text-zinc-100">10 seconds</span> see latency by region, cache status (HIT/MISS), and actionable insights.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="cs-card cs-card-focus relative p-8 shadow-2xl sm:p-10">
        <div className="pointer-events-none absolute inset-x-0 -top-12 -z-10 h-24 opacity-20 blur-[100px]" style={{ backgroundColor: 'var(--brand-primary)' }} />
        <div className="cs-card-wash opacity-60" />

        <div className="relative z-10 space-y-7">
          <div className="space-y-3">
            <label htmlFor="url" className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
              Monitor URL <span style={{ color: 'var(--brand-primary)' }}>*</span>
            </label>
            <div className="group relative">
              <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-[var(--brand-primary)]">
                <Globe className="h-4 w-4" />
              </div>
              <input
                id="url"
                name="url"
                type="url"
                placeholder="https://api.yourbase.com/v1/health"
                required
                className={`cs-input h-11 w-full !pl-[44px] pr-4 text-[13px] font-semibold tracking-tight ${
                  errors.url ? 'cs-input-error' : ''
                }`}
              />
            </div>
            <p className="px-1 text-[11px] font-medium leading-relaxed text-zinc-500">
              CacheSnap will probe this URL from multiple global regions. Bypass checks are automatic.
            </p>
            {errors.url ? <p className="cs-error-msg mt-1.5">{errors.url}</p> : null}
          </div>

          <div className="space-y-3">
            <label htmlFor="name" className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
              Friendly Name <span className="ml-1 opacity-40 font-bold">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. Production Frontend • API Health"
              className="cs-input h-11 w-full text-[13px] font-semibold"
            />
            <p className="px-1 text-[11px] font-medium text-zinc-500">
              Helpful name to identify this monitor in your list.
            </p>
          </div>

          <div className="flex flex-col gap-3.5 pt-4 sm:flex-row">
            <button
              type="submit"
              disabled={isPending}
              className="cs-btn-primary h-11 flex-[2.5] px-0 text-[13px] font-black uppercase tracking-wider"
            >
              <div className="relative z-10 flex items-center justify-center gap-1.5">
                {isPending ? (
                  <span className="animate-pulse">Creating...</span>
                ) : (
                  <>
                    <span>Create Monitor</span>
                    <ChevronRight className="h-4 w-4" strokeWidth={3} />
                  </>
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="cs-btn-outline h-11 flex-1 !rounded-lg border-white/10 bg-white/[0.03] px-0 text-[13px] font-bold text-zinc-400"
            >
              Cancel
            </button>
          </div>

          <p className="px-6 text-center text-[11px] font-medium italic leading-relaxed text-zinc-500 opacity-60">
            After creation you will instantly get a global performance map, cache breakdown, and smart recommendations.
          </p>
        </div>
      </form>
    </div>
  )
}
