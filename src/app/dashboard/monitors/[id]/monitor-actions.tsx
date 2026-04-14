'use client'

import { useState, useTransition } from 'react'
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
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            handleToggleActive()
          }}
          disabled={pendingAction != null}
          title={isActive ? 'Pause monitoring' : 'Resume monitoring'}
          className={`inline-flex h-8 items-center rounded-lg border px-3 py-1 text-xs font-bold transition-all shadow-sm disabled:opacity-50 ${
            isActive
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
          }`}
        >
          {isPending && pendingAction === 'toggle'
            ? (isActive ? 'Pausing…' : 'Resuming…')
            : (isActive ? 'Pause' : 'Resume')}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(m => (m === 'edit' ? 'idle' : 'edit'))
            setError(null)
          }}
          disabled={pendingAction != null}
          title="Edit monitor name, intervals, notifications"
          className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 py-1 text-xs font-bold text-zinc-400 shadow-sm transition-all hover:bg-surface/80 hover:text-white disabled:opacity-50"
        >
          Edit
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(m => (m === 'delete-confirm' ? 'idle' : 'delete-confirm'))
            setError(null)
          }}
          disabled={pendingAction != null}
          title="Remove this monitor"
          className="inline-flex h-8 items-center rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-1 text-xs font-bold text-red-500 shadow-sm transition-all hover:bg-red-500/15 disabled:opacity-50"
        >
          Remove
        </button>
      </div>

      {error && <p className="w-full text-right text-xs font-medium text-red-500">{error}</p>}

      {mode === 'edit' && (
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl sm:max-w-lg">
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
        <div className="w-full max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 shadow-xl sm:max-w-lg">
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
    </div>
  )
}
