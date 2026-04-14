'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface MonitorEditFormProps {
  id: string
  name: string | null
  checkIntervalSeconds: number
  auditIntervalSeconds: number
  notifyEmail: string | null
  notifyEmailEnabled: boolean
  notifySlackWebhook: string | null
  notifySlackEnabled: boolean
  /** Prefix for input ids when multiple forms could exist */
  idPrefix?: string
}

export function MonitorEditForm({
  id,
  name,
  checkIntervalSeconds,
  auditIntervalSeconds,
  notifyEmail,
  notifyEmailEnabled,
  notifySlackWebhook,
  notifySlackEnabled,
  idPrefix = 'settings',
}: MonitorEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
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
          router.refresh()
        } else {
          const json = await res.json().catch(() => ({}))
          setError((json as { error?: string }).error ?? 'Failed to update monitor')
        }
      } catch {
        setError('Failed to update monitor')
      }
    })
  }

  const p = idPrefix

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-5 shadow-sm">
      <h2 id={`${p}-edit-heading`} className="text-sm font-semibold text-zinc-200 mb-1">
        Monitor configuration
      </h2>
      <p className="text-xs text-zinc-500 mb-5">Name, intervals, and notification channels.</p>

      <form onSubmit={handleEdit} className="space-y-4 max-w-sm">
        {error && <p className="text-xs font-medium text-red-500">{error}</p>}

        <div>
          <label htmlFor={`${p}-edit-name`} className="block text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">
            Name <span className="text-zinc-600">(optional)</span>
          </label>
          <input
            id={`${p}-edit-name`}
            name="name"
            type="text"
            defaultValue={name ?? ''}
            placeholder="My site"
            className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${p}-edit-check`} className="block text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">
              Monitoring
            </label>
            <select
              id={`${p}-edit-check`}
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
            <label htmlFor={`${p}-edit-audit`} className="block text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">
              Bypass Audit
            </label>
            <select
              id={`${p}-edit-audit`}
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
                id={`${p}-notify-email-toggle`}
                name="notify_email_enabled"
                type="checkbox"
                defaultChecked={notifyEmailEnabled}
                className="h-4 w-4 rounded border-border bg-background accent-blue-500"
              />
              <label htmlFor={`${p}-notify-email-toggle`} className="text-xs font-bold text-zinc-400">
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
                id={`${p}-notify-slack-toggle`}
                name="notify_slack_enabled"
                type="checkbox"
                defaultChecked={notifySlackEnabled}
                className="h-4 w-4 rounded border-border bg-background accent-blue-500"
              />
              <label htmlFor={`${p}-notify-slack-toggle`} className="text-xs font-bold text-zinc-400">
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

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-white px-5 py-2 text-sm font-bold text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
