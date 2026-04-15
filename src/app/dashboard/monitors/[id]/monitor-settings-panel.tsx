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
    <div className="space-y-6">
      <style>{`
        .cs-danger-card {
          background: #1a1010 !important;
          border: 1px solid rgba(255, 0, 0, 0.08) !important;
          border-radius: 12px !important;
          padding: 24px !important;
          box-shadow: 0 4px 24px rgba(255, 0, 0, 0.05) !important;
        }
        .cs-danger-header {
          font-size: 11px !important;
          font-weight: 900 !important;
          color: rgba(255, 100, 100, 0.6) !important;
          text-transform: uppercase !important;
          letter-spacing: 0.1em !important;
          border-left: 3px solid rgba(255, 50, 50, 0.4) !important;
          padding-left: 10px !important;
          line-height: 1 !important;
          margin-bottom: 12px !important;
        }
      `}</style>

      <section aria-labelledby="settings-edit-heading">
        <MonitorEditForm {...props} idPrefix="settings" />
      </section>

      <section aria-labelledby="settings-danger-heading" className="cs-danger-card">
        <div className="flex flex-col mb-6">
          <h2 id="settings-danger-heading" className="cs-danger-header">
            Danger zone
          </h2>
          <p className="text-xs text-red-500/50 max-w-sm ml-3.5">
            Removing a monitor deletes all associated data forever. This action is irreversible.
          </p>
        </div>

        <div className="ml-3.5">
          {!removeOpen ? (
            <button
              type="button"
              onClick={() => setRemoveOpen(true)}
              className="inline-flex items-center rounded-lg border border-red-500/20 bg-red-500/10 px-6 h-10 text-xs font-black text-red-400 uppercase tracking-widest transition-all hover:bg-red-500/20 active:scale-[0.98]"
            >
              Remove monitor…
            </button>
          ) : (
            <MonitorDeleteConfirm monitorId={props.id} onCancel={() => setRemoveOpen(false)} className="max-w-md" />
          )}
        </div>
      </section>
    </div>
  )
}
