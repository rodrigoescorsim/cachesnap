'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Globe, Zap, ChevronRight } from 'lucide-react'

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
          check_interval_seconds: 180,
          audit_interval_seconds: 1800,
        }),
      })
  
      if (res.ok) {
        router.refresh()
        router.push('/dashboard')
      } else {
        const json = await res.json()
        setErrors({ url: json.error ?? 'Failed to create monitor' })
      }
    })
  }

  return (
    <div className="max-w-[460px] mx-auto pt-0 pb-24">
      {/* HEADER SECTION - Sharp & Sophisticated */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-4">
          <Zap className="h-3 w-3 fill-cyan-400" />
          Lightning Fast Setup
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight mb-2">
          Add New Monitor
        </h1>
        <p className="text-[13px] text-zinc-400 leading-relaxed px-4 opacity-70">
          Paste your URL and in less than <span className="text-white font-semibold">60 seconds</span> see latency by region, cache status (HIT/MISS), and actionable insights.
        </p>
      </div>

      {/* REFINED CARD - Boutique SaaS Proportions */}
      <form onSubmit={handleSubmit} className="cs-card cs-card-focus relative p-7 sm:p-9 shadow-2xl border-white/[0.08]">
        {/* Discreet Teal Ambience */}
        <div className="absolute inset-x-0 -top-10 h-20 bg-cyan-500/5 blur-[80px] opacity-20 -z-10 pointer-events-none" />
        <div className="cs-card-wash opacity-40 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent" />
        
        <div className="relative z-10 space-y-6">
          {/* MONITOR URL */}
          <div className="space-y-2.5">
            <label htmlFor="url" className="text-[10px] font-black tracking-widest text-zinc-500 uppercase">
              Monitor URL <span className="text-cyan-500">*</span>
            </label>
            <div className="group relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-cyan-400 transition-colors z-20">
                <Globe className="h-4 w-4" />
              </div>
              <input
                id="url"
                name="url"
                type="url"
                placeholder="https://api.yourbase.com/v1/health"
                required
                className={`w-full h-10 !pl-[40px] pr-4 cs-input text-sm font-medium tracking-tight border-white/[0.08] focus:border-cyan-500/40 focus:ring-4 focus:ring-cyan-500/10 ${errors.url ? 'border-red-500/40 bg-red-500/5' : ''}`}
              />
            </div>
            <p className="text-[10px] text-zinc-500 px-1 font-medium leading-normal opacity-70">
              CacheSnap will probe this URL from multiple global regions. Bypass checks are automatic.
            </p>
            {errors.url && <p className="mt-1.5 cs-error-msg">{errors.url}</p>}
          </div>

          {/* FRIENDLY NAME */}
          <div className="space-y-2.5">
            <label htmlFor="name" className="text-[10px] font-black tracking-widest text-zinc-500 uppercase">
              Friendly Name <span className="opacity-40 ml-1">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. Production Frontend • API Health"
              className="w-full h-10 cs-input text-sm border-white/[0.08] focus:border-cyan-500/40"
            />
            <p className="text-[10px] text-zinc-500 px-1 font-medium opacity-70">
              Helpful name to identify this monitor in your list.
            </p>
          </div>

          {/* ACTIONS - Refined Casing and Height */}
          <div className="flex flex-col sm:flex-row gap-3 pt-3">
            <button
              type="submit"
              disabled={isPending}
              className="cs-btn-action flex-[2.5] h-10"
            >
              <div className="cs-card-wash opacity-20" />
              <div className="relative z-10 flex items-center justify-center gap-1.5">
                {isPending ? (
                  <span className="animate-pulse text-xs font-bold">Creating...</span>
                ) : (
                  <>
                    <span className="text-xs font-bold">Create Monitor</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="cs-btn-outline flex-1 h-10 border-white/5 bg-white/[0.02] text-zinc-400 text-xs font-bold"
            >
              Cancel
            </button>
          </div>

          <p className="text-center text-[10px] text-zinc-500 font-medium px-4 leading-relaxed italic opacity-80">
            After creation you’ll instantly get a global performance map, cache breakdown, and smart recommendations.
          </p>
        </div>
      </form>
    </div>
  )
}
