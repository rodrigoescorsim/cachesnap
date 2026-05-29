'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe, Check, X, Clock } from 'lucide-react'
import { CheckerResultsTable } from './checker-results-table'

const COOLDOWN_LS_KEY = 'cs_pub_cooldown_ts'
const HISTORY_LS_KEY = 'cs_pub_url_history'
const MAX_HISTORY = 8

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToHistory(url: string) {
  const next = [url, ...loadHistory().filter(u => u !== url)].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(next))
}

function removeFromHistory(url: string) {
  localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(loadHistory().filter(u => u !== url)))
}

type UrlStatus = 'idle' | 'validating' | 'valid' | 'invalid'

interface StartError {
  type: 'cooldown' | 'hourly' | 'url_dedup' | 'invalid' | 'overloaded' | 'unknown'
  message: string
  retryAfterSeconds?: number
}

// Client-side structural check only — server validates private IPs and full rules
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

export function CheckerForm() {
  const [urlValue, setUrlValue] = useState('')
  const [urlStatus, setUrlStatus] = useState<UrlStatus>('idle')
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<StartError | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setHistory(loadHistory()) }, [])

  // On mount: ask the server for the real remaining cooldown (IP-based, works
  // across all browsers). localStorage is only used as an instant fallback
  // while the request is in-flight so there's no flash of enabled state.
  useEffect(() => {
    // Instant fallback from localStorage to avoid UI flash
    const stored = localStorage.getItem(COOLDOWN_LS_KEY)
    if (stored) {
      const expiry = parseInt(stored, 10)
      const localRemaining = Math.ceil((expiry - Date.now()) / 1000)
      if (localRemaining > 0) startCooldownTimer(localRemaining)
    }

    // Authoritative check from server — overwrites localStorage if different
    fetch('/api/public/check')
      .then(r => r.json())
      .then((data: { cooldownRemainingSeconds: number; cooldownExpiresAt: string | null }) => {
        if (data.cooldownRemainingSeconds > 0 && data.cooldownExpiresAt) {
          const expiry = new Date(data.cooldownExpiresAt).getTime()
          localStorage.setItem(COOLDOWN_LS_KEY, String(expiry))
          startCooldownTimer(data.cooldownRemainingSeconds)
        } else {
          // Server says no cooldown — clear stale localStorage if present
          localStorage.removeItem(COOLDOWN_LS_KEY)
          setCooldownRemaining(0)
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
        }
      })
      .catch(() => { /* keep localStorage fallback */ })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  function startCooldownTimer(seconds: number) {
    setCooldownRemaining(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCooldownRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function handleUrlChange(val: string) {
    setUrlValue(val)
    setError(null)

    if (!val.trim()) {
      setUrlStatus('idle')
      setFaviconUrl(null)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }

    setUrlStatus('validating')
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      let normalized = val.trim()

      // Auto-prepend https:// when user types without protocol
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || cooldownRemaining > 0) return

    setSubmitting(true)
    setError(null)
    setJobId(null)

    try {
      const res = await fetch('/api/public/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlValue.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        const type: StartError['type'] =
          data.type === 'cooldown' ? 'cooldown'
          : data.type === 'hourly' ? 'hourly'
          : data.type === 'url_dedup' ? 'url_dedup'
          : data.code === 'OVERLOADED' ? 'overloaded'
          : data.code === 'PRIVATE_IP' || data.code === 'INVALID_URL' ? 'invalid'
          : 'unknown'

        setError({ type, message: data.error, retryAfterSeconds: data.retryAfterSeconds })

        // Mark URL as invalid when server rejects it
        if (type === 'invalid') setUrlStatus('invalid')

        if (data.retryAfterSeconds && type === 'cooldown') {
          const expiry = Date.now() + data.retryAfterSeconds * 1000
          localStorage.setItem(COOLDOWN_LS_KEY, String(expiry))
          startCooldownTimer(data.retryAfterSeconds)
        }
        return
      }

      setJobId(data.jobId)
      saveToHistory(urlValue.trim())
      setHistory(loadHistory())
      const expiry = new Date(data.cooldownExpiresAt).getTime()
      localStorage.setItem(COOLDOWN_LS_KEY, String(expiry))
      const remainingSeconds = Math.ceil((expiry - Date.now()) / 1000)
      if (remainingSeconds > 0) startCooldownTimer(remainingSeconds)
    } catch {
      setError({ type: 'unknown', message: 'Network error. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const isDisabled = submitting || cooldownRemaining > 0

  function formatCooldown(s: number): string {
    if (s >= 60) return `Retry in ${Math.ceil(s / 60)}m`
    return `Retry in ${s}s`
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* URL input */}
        <div className="group relative flex-1">
          {/* Left icon: favicon or Globe */}
          <div className="pointer-events-none absolute left-3.5 top-1/2 z-20 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-[var(--brand-primary)]">
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
            ref={inputRef}
            type="url"
            value={urlValue}
            onChange={e => handleUrlChange(e.target.value)}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 150)}
            placeholder="https://your-site.com/path"
            required
            disabled={isDisabled}
            autoComplete="off"
            className={[
              'cs-input h-11 w-full !pl-[44px] !pr-[40px] text-sm font-semibold tracking-tight transition-all duration-200',
              urlStatus === 'valid' && !error
                ? 'border-[rgba(34,255,136,0.45)] shadow-[0_0_0_1px_rgba(34,255,136,0.15)]'
                : urlStatus === 'invalid'
                  ? 'border-rose-500/50 shadow-[0_0_0_1px_rgba(244,63,94,0.15)]'
                  : '',
            ].join(' ')}
          />

          {/* URL history dropdown */}
          {showHistory && history.length > 0 && (() => {
            const filtered = urlValue.trim()
              ? history.filter(u => u.toLowerCase().includes(urlValue.toLowerCase()))
              : history
            if (filtered.length === 0) return null
            return (
              <div className="absolute top-full left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
                {filtered.map(url => (
                  <div
                    key={url}
                    className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.05] cursor-pointer group/item transition-colors"
                    onMouseDown={e => {
                      e.preventDefault()
                      handleUrlChange(url)
                      setShowHistory(false)
                    }}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                    <span className="flex-1 truncate text-sm text-zinc-300">{url}</span>
                    <button
                      type="button"
                      className="shrink-0 text-zinc-700 opacity-0 transition-opacity group-hover/item:opacity-100 hover:!text-zinc-400"
                      onMouseDown={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        removeFromHistory(url)
                        setHistory(loadHistory())
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )
          })()}

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
            {urlStatus === 'valid' && !error && (
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

        {/* Submit button */}
        <button
          type="submit"
          disabled={isDisabled}
          className="cs-btn-primary h-11 min-w-[140px] shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? 'Starting…'
            : cooldownRemaining > 0
            ? formatCooldown(cooldownRemaining)
            : 'Run Check'}
        </button>
      </form>

      {error && !jobId && <ErrorBanner error={error} />}

      {jobId && <CheckerResultsTable jobId={jobId} />}
    </div>
  )
}

function ErrorBanner({ error }: { error: StartError }) {
  const colorClass =
    error.type === 'cooldown' || error.type === 'hourly' || error.type === 'url_dedup'
      ? 'border-amber-500/20 bg-amber-500/5 text-amber-400'
      : 'border-rose-500/20 bg-rose-500/5 text-rose-400'

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${colorClass}`}>
      <span className="mt-0.5 shrink-0">⚠</span>
      <span>{error.message}</span>
    </div>
  )
}
