'use client'

import { useEffect, useState } from 'react'
import { MonitorEditForm } from './monitor-edit-form'
import { MonitorDeleteConfirm } from './monitor-delete-confirm'

export function MonitorSettingsPanel(props: {
  id: string
  url: string
  name: string | null
  checkIntervalSeconds: number
  auditIntervalSeconds: number
  notifyEmail: string | null
  notifyEmailEnabled: boolean
  notifySlackWebhook: string | null
  notifySlackEnabled: boolean
}) {
  const [removeOpen, setRemoveOpen] = useState(false)

  useEffect(() => {
    function syncModalWithHash() {
      if (window.location.hash === '#remove-monitor') {
        setRemoveOpen(true)
      }
    }

    syncModalWithHash()
    window.addEventListener('hashchange', syncModalWithHash)
    return () => window.removeEventListener('hashchange', syncModalWithHash)
  }, [])

  return (
    <div className="space-y-12 max-w-5xl">
      <section aria-labelledby="settings-edit-heading">
        <MonitorEditForm {...props} idPrefix="settings" />
      </section>

      <section aria-labelledby="settings-danger-heading" className="cs-danger-card">
        <div className="cs-card-wash" />
        <div className="flex flex-col mb-6">
          <h2 id="settings-danger-heading" className="cs-danger-header">
            Danger zone
          </h2>
          <p className="text-xs text-red-500/50 max-w-sm ml-3.5">
            Removing a monitor deletes all associated data forever. This action is irreversible.
          </p>
        </div>

        <div className="ml-3.5">
          <button
            type="button"
            onClick={() => setRemoveOpen(true)}
            className="cs-btn-danger"
          >
            Remove monitor...
          </button>
        </div>
      </section>

      {removeOpen ? (
        <MonitorDeleteConfirm
          monitorId={props.id}
          onClose={() => setRemoveOpen(false)}
        />
      ) : null}
    </div>
  )
}
