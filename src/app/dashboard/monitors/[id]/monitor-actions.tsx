'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  id: string
  name: string | null
  alertThresholdMs: number
  isActive: boolean
  notifyEmail: string | null
  notifyEmailEnabled: boolean
  notifySlackWebhook: string | null
  notifySlackEnabled: boolean
}

export function MonitorActions({
  id, name, alertThresholdMs, isActive,
  notifyEmail, notifyEmailEnabled, notifySlackWebhook, notifySlackEnabled,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'edit' | 'delete-confirm'>('idle')
  const [error, setError] = useState<string | null>(null)

  function handleToggleActive() {
    setError(null)
    startTransition(async () => {
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
    })
  }

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const newName = (formData.get('name') as string).trim()
    const newThreshold = Number(formData.get('alert_threshold_ms'))
    const emailVal = (formData.get('notify_email') as string).trim()
    const slackVal = (formData.get('notify_slack_webhook') as string).trim()

    startTransition(async () => {
      const res = await fetch(`/api/monitors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName || undefined,
          alert_threshold_ms: newThreshold,
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
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/monitors/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/dashboard')
      } else {
        setError('Failed to delete monitor')
        setMode('idle')
      }
    })
  }

  return (
    <>
      {/* Action buttons — sit alongside the status badge */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={handleToggleActive}
          disabled={isPending}
          title={isActive ? 'Click to pause' : 'Click to activate'}
          className={`text-sm font-medium disabled:opacity-50 transition-colors ${
            isActive
              ? 'text-emerald-500 hover:text-emerald-600'
              : 'text-zinc-400 hover:text-zinc-500'
          }`}
        >
          {isActive ? 'Active' : 'Paused'}
        </button>

        <button
          onClick={() => { setMode(mode === 'edit' ? 'idle' : 'edit'); setError(null) }}
          disabled={isPending}
          className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-50 transition-colors"
        >
          Settings
        </button>

        <button
          onClick={() => { setMode(mode === 'delete-confirm' ? 'idle' : 'delete-confirm'); setError(null) }}
          disabled={isPending}
          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Inline edit panel */}
      {mode === 'edit' && (
        <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Monitor settings</h3>
          <form onSubmit={handleEdit} className="space-y-4 max-w-sm">
            <div>
              <label htmlFor="edit-name" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Name <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                id="edit-name"
                name="name"
                type="text"
                defaultValue={name ?? ''}
                placeholder="My site"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>

            <div>
              <label htmlFor="edit-threshold" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Alert threshold (ms)
              </label>
              <input
                id="edit-threshold"
                name="alert_threshold_ms"
                type="number"
                defaultValue={alertThresholdMs}
                min={100}
                max={30000}
                required
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
              <p className="mt-1 text-xs text-zinc-400">Alert when TTFB exceeds this value</p>
            </div>

            {/* Notifications */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Notifications</p>

              {/* Email */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="notify-email-toggle"
                    name="notify_email_enabled"
                    type="checkbox"
                    defaultChecked={notifyEmailEnabled}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-zinc-100"
                  />
                  <label htmlFor="notify-email-toggle" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Email alerts
                  </label>
                </div>
                <input
                  name="notify_email"
                  type="email"
                  defaultValue={notifyEmail ?? ''}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                />
              </div>

              {/* Slack / Discord */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="notify-slack-toggle"
                    name="notify_slack_enabled"
                    type="checkbox"
                    defaultChecked={notifySlackEnabled}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-zinc-100"
                  />
                  <label htmlFor="notify-slack-toggle" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Slack / Discord webhook
                  </label>
                </div>
                <input
                  name="notify_slack_webhook"
                  type="url"
                  defaultValue={notifySlackWebhook ?? ''}
                  placeholder="https://hooks.slack.com/services/…"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setMode('idle')}
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {mode === 'delete-confirm' && (
        <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-400 mb-3">
            Delete this monitor? All probe data and alerts will be permanently removed.
          </p>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setMode('idle')}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
