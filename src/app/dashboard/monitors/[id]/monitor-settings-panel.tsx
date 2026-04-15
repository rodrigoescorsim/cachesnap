'use client'

import { useState } from 'react'
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

  return (
    <div className="space-y-6 max-w-5xl">
      <style>{`

      
        .cs-danger-card {
          background: #120d0a !important;
          border: 1px solid rgba(255, 120, 0, 0.15) !important;
          border-radius: 12px !important;
          padding: 24px !important;
          box-shadow: 
            0 4px 20px rgba(0, 0, 0, 0.2),
            inset 0 0 40px rgba(255, 120, 0, 0.01) !important;
          transition: all 0.2s ease !important;
          position: relative !important;
          overflow: hidden !important;
        }
        .cs-danger-card:hover {
          border-color: rgba(255, 120, 0, 0.25) !important;
          background: #18120d !important;
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
        .cs-btn-danger {
          background: rgba(255, 0, 0, 0.1) !important;
          border: 1px solid rgba(255, 0, 0, 0.25) !important;
          color: rgba(255, 100, 100, 0.9) !important;
          padding: 8px 14px !important;
          border-radius: 8px !important;
          font-size: 11px !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.1em !important;
          transition: all 0.2s ease !important;
        }
        .cs-btn-danger:hover {
          background: rgba(255, 0, 0, 0.15) !important;
          border-color: rgba(255, 0, 0, 0.4) !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 12px rgba(255, 0, 0, 0.1) !important;
        }
        .cs-btn-danger:active {
          transform: translateY(0) !important;
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
