'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useTransition, useRef } from 'react'
import { invalidateMonitorsSummary } from '@/hooks/use-monitors'
import { BarChart3, Check, ChevronRight, Globe, Lightbulb, Map, X, Zap } from 'lucide-react'
import { GlobalHeader } from '@/components/dashboard/global-header'

type UrlStatus = 'idle' | 'validating' | 'valid' | 'invalid'

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.')
  } catch {
    return false
  }
}

function getFaviconUrl(urlString: string): string | null {
  try {
    const { hostname } = new URL(urlString)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch {
    return null
  }
}

const BENEFITS = [
  { icon: Map, text: 'Global performance map across 8+ regions' },
  { icon: BarChart3, text: 'Cache breakdown & TTFB analytics' },
  { icon: Lightbulb, text: 'Smart recommendations & actionable insights' },
]

type NewMonitorPageProps = {
  userEmail: string
  logoutAction: () => Promise<void>
  plan: string
  monitorCount: number
  monitorLimit: number
}

export function NewMonitorPage({ userEmail, logoutAction, plan, monitorCount, monitorLimit }: NewMonitorPageProps) {
  const isAtLimit = monitorCount >= monitorLimit
  const isNearLimit = !isAtLimit && monitorCount === monitorLimit - 1
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [urlValue, setUrlValue] = useState('')
  const [urlStatus, setUrlStatus] = useState<UrlStatus>('idle')
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleUrlChange = (val: string) => {
    setUrlValue(val)
    if (!val.trim()) {
      setUrlStatus('idle')
      setFaviconUrl(null)
      return
    }
    setUrlStatus('validating')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      let normalized = val.trim()
      // Auto-normaliza para https:// quando o usuário digita sem protocolo (ex: "youtube.com")
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        const candidate = `https://${normalized}`
        if (isValidUrl(candidate)) {
          normalized = candidate
          setUrlValue(normalized)
        }
      }
      if (isValidUrl(normalized)) {
        setUrlStatus('valid')
        setFaviconUrl(getFaviconUrl(normalized))
      } else {
        setUrlStatus('invalid')
        setFaviconUrl(null)
      }
    }, 480)
  }

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
        }),
      })

      if (res.ok) {
        await invalidateMonitorsSummary(queryClient)
        router.refresh()
        router.push('/monitors')
      } else {
        const json = await res.json()
        setErrors({ url: json.error ?? 'Failed to create monitor' })
      }
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader userEmail={userEmail} logoutAction={logoutAction} />

      <div className="mx-auto max-w-[460px] pb-24 pt-8 sm:pt-10 animate-[cs-fade-in_0.4s_ease-out]">
        <div className="mb-8 text-center">
          <div
            className="mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em]"
            style={{
              borderColor: 'rgba(var(--brand-primary-rgb), 0.25)',
              backgroundColor: 'rgba(var(--brand-primary-rgb), 0.08)',
              color: 'var(--brand-primary)',
            }}
          >
            <Zap className="h-3 w-3" style={{ fill: 'var(--brand-primary)' }} />
            Lightning Fast Setup
          </div>
          <h1 className="mb-2.5 text-[32px] font-black tracking-tight text-white leading-none">
            Add New Monitor
          </h1>
          <p className="px-4 text-[14px] leading-relaxed text-zinc-300/80">
            Paste your URL and in less than{' '}
            <span className="font-bold text-zinc-100">15 seconds</span> see latency by region,
            cache status (HIT/MISS), and actionable insights.
          </p>
        </div>

        {isAtLimit ? (
          <div className="cs-card relative p-8 text-center shadow-2xl sm:p-10 space-y-5">
            <div
              className="pointer-events-none absolute inset-x-0 -top-12 -z-10 h-24 opacity-20 blur-[100px]"
              style={{ backgroundColor: '#f59e0b' }}
            />
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="text-base font-bold text-white">Monitor limit reached</p>
              <p className="text-sm text-zinc-400">
                Your <span className="capitalize font-semibold text-zinc-300">{plan}</span> plan includes up to{' '}
                <span className="font-semibold text-zinc-300">{monitorLimit} {monitorLimit === 1 ? 'monitor' : 'monitors'}</span>.
                Upgrade to add more.
              </p>
            </div>
            <Link href="/dashboard/billing" className="cs-btn-primary inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold">
              View plans →
            </Link>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => router.back()}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Go back
              </button>
            </div>
          </div>
        ) : (

        <form onSubmit={handleSubmit} className="cs-card cs-card-focus relative p-8 shadow-2xl sm:p-10">
          <div
            className="pointer-events-none absolute inset-x-0 -top-12 -z-10 h-24 opacity-20 blur-[100px]"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          />
          <div className="cs-card-wash opacity-60" />

          <div className="relative z-10 space-y-7">
            {/* URL INPUT */}
            <div className="space-y-3">
              <label htmlFor="url" className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
                Monitor URL <span style={{ color: 'var(--brand-primary)' }}>*</span>
              </label>
              <div className="group relative">
                {/* Left icon: favicon quando disponível, Globe como fallback */}
                <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-[var(--brand-primary)]">
                  {faviconUrl ? (
                    <img
                      src={faviconUrl}
                      alt=""
                      className="h-4 w-4 rounded-sm object-contain"
                      onError={() => setFaviconUrl(null)}
                    />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                </div>

                <input
                  id="url"
                  name="url"
                  type="url"
                  placeholder="https://api.yourbase.com/v1/health"
                  required
                  value={urlValue}
                  onChange={e => handleUrlChange(e.target.value)}
                  className={`cs-input h-11 w-full !pl-[44px] !pr-[40px] text-[13px] font-semibold tracking-tight transition-all duration-200 ${errors.url
                      ? 'cs-input-error'
                      : urlStatus === 'valid'
                        ? 'border-[rgba(34,255,136,0.45)] shadow-[0_0_0_1px_rgba(34,255,136,0.15)]'
                        : urlStatus === 'invalid'
                          ? 'border-rose-500/50 shadow-[0_0_0_1px_rgba(244,63,94,0.15)]'
                          : ''
                    }`}
                />

                {/* Right validation indicator */}
                <div className="pointer-events-none absolute right-3.5 top-1/2 z-20 -translate-y-1/2">
                  {urlStatus === 'validating' && (
                    <svg
                      className="h-4 w-4 animate-spin text-zinc-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  )}
                  {urlStatus === 'valid' && (
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ backgroundColor: 'rgba(34,255,136,0.12)' }}
                    >
                      <Check className="h-3 w-3" style={{ color: 'var(--brand-primary)', strokeWidth: 3 }} />
                    </span>
                  )}
                  {urlStatus === 'invalid' && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/10">
                      <X className="h-3 w-3 text-rose-400" strokeWidth={3} />
                    </span>
                  )}
                </div>
              </div>

              <p className="px-1 text-[11px] font-medium leading-relaxed text-zinc-400">
                CacheSnap will probe this URL from multiple global regions. Bypass checks are automatic.
              </p>
              {errors.url ? <p className="cs-error-msg mt-1.5">{errors.url}</p> : null}
            </div>

            {/* NAME INPUT */}
            <div className="space-y-3">
              <label htmlFor="name" className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
                Friendly Name <span className="ml-1 font-bold opacity-40">(optional)</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="e.g. Production Frontend • API Health"
                className="cs-input h-11 w-full text-[13px] font-semibold"
              />
              <p className="px-1 text-[11px] font-medium text-zinc-400">
                Helpful name to identify this monitor in your list.
              </p>
            </div>

            {/* NEAR LIMIT WARNING */}
            {isNearLimit && (
              <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <svg className="h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-xs text-amber-300">
                  Last monitor on your <span className="capitalize font-semibold">{plan}</span> plan.{' '}
                  <Link href="/dashboard/billing" className="underline underline-offset-2 hover:text-amber-200 transition-colors">
                    Upgrade
                  </Link>{' '}
                  to add more.
                </p>
              </div>
            )}

            {/* ACTIONS */}
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

            {/* SOCIAL PROOF */}
            <div className="border-t border-white/[0.04] pt-5">
              <p className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                After creation you instantly get
              </p>
              <ul className="space-y-2.5">
                {BENEFITS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: 'rgba(var(--brand-primary-rgb), 0.07)' }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: 'var(--brand-primary)', opacity: 0.7 }} />
                    </span>
                    <span className="text-[12px] font-medium text-zinc-400">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
