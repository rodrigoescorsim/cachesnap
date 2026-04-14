'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  id: string
  name: string | null
  checkIntervalSeconds: number
  auditIntervalSeconds: number
  isActive: boolean
  notifyEmail: string | null
  notifyEmailEnabled: boolean
  notifySlackWebhook: string | null
  notifySlackEnabled: boolean
}

export function MonitorActions({
  id, name, checkIntervalSeconds, auditIntervalSeconds, isActive,
  notifyEmail, notifyEmailEnabled, notifySlackWebhook, notifySlackEnabled,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'edit' | 'delete-confirm'>('idle')
  const [pendingAction, setPendingAction] = useState<null | 'toggle' | 'edit' | 'delete'>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Cooldown logic for Refresh
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Load last click from localStorage to persist cooldown across refreshes
    const lastClick = localStorage.getItem(`last_dispatch_${id}`)
    if (lastClick) {
      const diff = Math.floor((Date.now() - Number(lastClick)) / 1000)
      if (diff < 30) setCooldown(30 - diff)
    }
  }, [id])

  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setTimeout(() => setCooldown(c => c - 1), 1000)
    } else {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [cooldown])

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target)) setMenuOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  function handleToggleActive() {
    setError(null)
    setPendingAction('toggle')
    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !isActive }),
        })
        if (res.ok) {
          router.refresh()
        } else {
          setError('Failed to update status')
        }
      } finally {
        setPendingAction(null)
      }
    })
  }

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPendingAction('edit')
    const formData = new FormData(e.currentTarget)
    const newName = (formData.get('name') as string).trim()
    const check_interval_seconds = Number(formData.get('check_interval_seconds'))
    const audit_interval_seconds = Number(formData.get('audit_interval_seconds'))
    const emailVal = (formData.get('notify_email') as string).trim()
    const slackVal = (formData.get('notify_slack_webhook') as string).trim()

    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName || undefined,
            check_interval_seconds,
            audit_interval_seconds,
            notify_email: emailVal || null,
            notify_email_enabled: formData.get('notify_email_enabled') === 'on',
            notify_slack_webhook: slackVal || null,
            notify_slack_enabled: formData.get('notify_slack_enabled') === 'on',
          }),
        })
        if (res.ok) {
          setMode('idle')
          router.refresh()
        } else {
          const json = await res.json().catch(() => ({}))
          setError(json.error ?? 'Failed to update monitor')
        }
      } finally {
        setPendingAction(null)
      }
    })
  }

  function handleDelete() {
    setError(null)
    setPendingAction('delete')
    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${id}`, { method: 'DELETE' })
        if (res.ok) {
          router.push('/dashboard')
        } else {
          setError('Failed to delete monitor')
          setMode('idle')
        }
      } finally {
        setPendingAction(null)
      }
    })
  }

  async function handleDispatch(bypass: boolean) {
    if (cooldown > 0) return
    setError(null)
    setPendingAction('toggle')
    startTransition(async () => {
      try {
        const res = await fetch(`/api/monitors/${id}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bypass }),
        })
        if (res.ok) {
          const now = Date.now()
          localStorage.setItem(`last_dispatch_${id}`, String(now))
          setCooldown(30)
          router.refresh()
        } else {
          const json = await res.json().catch(() => ({}))
          setError(json.error || 'Dispatch failed')
        }
      } finally {
        setPendingAction(null)
      }
    })
  }

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => handleDispatch(false)}
          disabled={cooldown > 0 || pendingAction != null}
          title="Refresh measuring Edge Cache"
          className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 py-1 text-xs font-bold transition-all shadow-sm disabled:opacity-50 ${
            cooldown > 0 
              ? 'bg-surface/20 text-zinc-500 border-border/50' 
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40'
          }`}
        >
          <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${isPending && pendingAction === 'toggle' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1v4h4M15 15v-4h-4M13.6 4.5A7 7 0 1 0 14.5 9" />
          </svg>
          {cooldown > 0 ? `Wait ${cooldown}s` : 'Refresh'}
        </button>

        <button
          type="button"
          onClick={() => handleDispatch(true)}
          disabled={cooldown > 0 || pendingAction != null}
          title="Refresh bypassing Edge Cache (Hit Origin)"
          className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 py-1 text-xs font-bold transition-all shadow-sm disabled:opacity-50 ${
            cooldown > 0 
              ? 'bg-surface/20 text-zinc-500 border-border/50' 
              : 'bg-surface text-white border-border hover:bg-surface/80 hover:border-zinc-700'
          }`}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1v6M8 9v6M13 3l-2 2M5 11l-2 2M15 8h-6M7 8H1M13 13l-2-2M5 5l-2-2" />
          </svg>
          {cooldown > 0 ? `${cooldown}s` : 'Bypass'}
        </button>


        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            disabled={pendingAction != null}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Monitor settings"
            aria-label="Monitor settings"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1 text-xs font-bold text-zinc-400 hover:text-white hover:bg-surface/80 transition-all shadow-sm disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4h2.5M12.5 4H15M1 12h8.5M12.5 12H15" />
              <circle cx="5.5" cy="4" r="2" />
              <circle cx="10.5" cy="12" r="2" />
            </svg>
            Settings
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[148px] rounded-lg border border-border bg-surface shadow-2xl p-1 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => {
                  handleToggleActive()
                  setMenuOpen(false)
                }}
                disabled={pendingAction != null}
                className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition-colors disabled:opacity-50 ${
                  isActive
                    ? 'text-amber-500 hover:bg-amber-500/10'
                    : 'text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                {isPending && pendingAction === 'toggle'
                  ? (isActive ? 'Pausing...' : 'Resuming...')
                  : (isActive ? 'Pause' : 'Resume')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'edit' ? 'idle' : 'edit')
                  setError(null)
                  setMenuOpen(false)
                }}
                disabled={pendingAction != null}
                className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'delete-confirm' ? 'idle' : 'delete-confirm')
                  setError(null)
                  setMenuOpen(false)
                }}
                disabled={pendingAction != null}
                className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-500 font-medium">{error}</p>}

      {mode === 'edit' && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-5 shadow-2xl">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest text-[10px] opacity-60">Monitor configuration</h3>
          <form onSubmit={handleEdit} className="space-y-4 max-w-sm">
            <div>
              <label htmlFor="edit-name" className="block text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">
                Name <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                id="edit-name"
                name="name"
                type="text"
                defaultValue={name ?? ''}
                placeholder="My site"
                className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-check" className="block text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">
                  Monitoring
                </label>
                <select
                  id="edit-check"
                  name="check_interval_seconds"
                  defaultValue={checkIntervalSeconds}
                  className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value={60}>1 minute</option>
                  <option value={180}>3 minutes</option>
                  <option value={300}>5 minutes</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-audit" className="block text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">
                  Bypass Audit
                </label>
                <select
                  id="edit-audit"
                  name="audit_interval_seconds"
                  defaultValue={auditIntervalSeconds}
                  className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value={900}>15 minutes</option>
                  <option value={1800}>30 minutes</option>
                  <option value={3600}>60 minutes</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-border space-y-4">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Notifications</p>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="notify-email-toggle"
                    name="notify_email_enabled"
                    type="checkbox"
                    defaultChecked={notifyEmailEnabled}
                    className="h-4 w-4 rounded border-border bg-background accent-blue-500"
                  />
                  <label htmlFor="notify-email-toggle" className="text-xs font-bold text-zinc-400">
                    Email alerts
                  </label>
                </div>
                <input
                  name="notify_email"
                  type="email"
                  defaultValue={notifyEmail ?? ''}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="notify-slack-toggle"
                    name="notify_slack_enabled"
                    type="checkbox"
                    defaultChecked={notifySlackEnabled}
                    className="h-4 w-4 rounded border-border bg-background accent-blue-500"
                  />
                  <label htmlFor="notify-slack-toggle" className="text-xs font-bold text-zinc-400">
                    Slack / Discord webhook
                  </label>
                </div>
                <input
                  name="notify_slack_webhook"
                  type="url"
                  defaultValue={notifySlackWebhook ?? ''}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-white px-5 py-2 text-sm font-bold text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {isPending && pendingAction === 'edit' ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setMode('idle')}
                className="rounded-lg border border-border bg-transparent px-5 py-2 text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {mode === 'delete-confirm' && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 shadow-xl">
          <p className="text-sm font-bold text-red-400 mb-4 flex items-center gap-2">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M8 5v3M8 11h.01M1 14l7-12 7 12H1z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Permanent Deletion
          </p>
          <p className="text-xs text-red-500/60 leading-relaxed mb-5 max-w-sm">
            This action cannot be undone. All probe history, diagnostic logs, and regional alerts for this monitor will be erased forever.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-lg bg-red-500 px-5 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {isPending && pendingAction === 'delete' ? 'Deleting...' : 'Confirm Delete'}
            </button>
            <button
              onClick={() => setMode('idle')}
              className="rounded-lg border border-border bg-transparent px-5 py-2 text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
