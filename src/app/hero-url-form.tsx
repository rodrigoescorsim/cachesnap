'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'
import { Globe, Check, X } from 'lucide-react'

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

export function HeroUrlForm() {
  const router = useRouter()
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = urlValue.trim()
    if (!trimmed || urlStatus !== 'valid') return
    router.push(`/signup?url=${encodeURIComponent(trimmed)}`)
  }

  const borderClass =
    urlStatus === 'valid'
      ? 'border-[rgba(34,255,136,0.45)] shadow-[0_0_0_1px_rgba(34,255,136,0.15)]'
      : urlStatus === 'invalid'
        ? 'border-rose-500/50 shadow-[0_0_0_1px_rgba(244,63,94,0.15)]'
        : ''

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
      <div className={`cs-input flex-1 min-w-0 h-12 rounded-xl flex items-center gap-2.5 px-3 transition-all duration-200 ${borderClass}`}>
        {/* Favicon / Globe */}
        <div className="h-5 w-5 shrink-0 flex items-center justify-center">
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt=""
              className="h-4 w-4 rounded-sm"
              onError={() => setFaviconUrl(null)}
            />
          ) : (
            <Globe className="h-4 w-4 text-zinc-600" />
          )}
        </div>

        <input
          type="text"
          value={urlValue}
          onChange={e => handleUrlChange(e.target.value)}
          placeholder="https://yoursite.com"
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-white placeholder:text-zinc-600 outline-none"
        />

        {/* Status indicator */}
        <div className="h-5 w-5 shrink-0 flex items-center justify-center">
          {urlStatus === 'validating' && (
            <svg className="h-4 w-4 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {urlStatus === 'valid' && <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />}
          {urlStatus === 'invalid' && <X className="h-4 w-4 text-rose-400" strokeWidth={2.5} />}
        </div>
      </div>

      <button
        type="submit"
        disabled={urlStatus !== 'valid'}
        className="cs-btn-primary h-12 rounded-xl px-6 text-sm font-semibold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        Monitor this →
      </button>
    </form>
  )
}
