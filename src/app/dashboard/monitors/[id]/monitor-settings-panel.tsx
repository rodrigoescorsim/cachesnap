'use client'

import { useState } from 'react'
import { MonitorEditForm } from './monitor-edit-form'
import { MonitorDeleteConfirm } from './monitor-delete-confirm'

export function MonitorSettingsPanel(props: {
  id: string
  name: string | null
  checkIntervalSeconds: number
  auditIntervalSeconds: number
  notifyEmail: string | null
  notifyEmailEnabled: boolean
  notifySlackWebhook: string | null
  notifySlackEnabled: boolean
}) {
  const [removeOpen, setRemoveOpen] = useState(false)

  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-edit-heading">
        <MonitorEditForm {...props} idPrefix="settings" />
      </section>

      <section aria-labelledby="settings-danger-heading" className="space-y-3">
        <h2 id="settings-danger-heading" className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Danger zone
        </h2>
        <p className="text-xs text-zinc-500 max-w-md">
          Removing a monitor deletes all associated probes, alerts, and history. This cannot be undone.
        </p>
        {!removeOpen ? (
          <button
            type="button"
            onClick={() => setRemoveOpen(true)}
            className="inline-flex items-center rounded-lg border border-[rgba(255,0,0,0.15)] bg-[rgba(255,0,0,0.04)] px-4 py-2 text-xs font-semibold text-[#ff5a5a] transition-colors hover:bg-[rgba(255,0,0,0.08)]"
          >
            Remove monitor…
          </button>
        ) : (
          <MonitorDeleteConfirm monitorId={props.id} onCancel={() => setRemoveOpen(false)} className="max-w-md" />
        )}
      </section>
    </div>
  )
}
