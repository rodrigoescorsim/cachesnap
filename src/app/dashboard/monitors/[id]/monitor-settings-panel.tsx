'use client'

import { useEffect, useState } from 'react'
import { MonitorEditForm, type TrendComparator } from './monitor-edit-form'
import { MonitorDeleteConfirm } from './monitor-delete-confirm'
import { MonitorClearAlertsConfirm } from './monitor-clear-alerts-confirm'

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
  alertThresholdMs: number
  alertThresholdHitMs: number
  alertSensitivity: number
  alertDownEnabled: boolean
  alertTtfbEnabled: boolean
  alertTtfbAnomalyEnabled: boolean
  alertAnycastEnabled: boolean
  alertCacheAgeEnabled: boolean
  alertCacheAgeThresholdHours: number
  alertCacheHitEnabled: boolean
  alertCacheHitThresholdPct: number
  cacheHitCriticalPct: number
  alertCacheHitTrendEnabled: boolean
  alertCacheHitTrendThresholdPp: number
  alertCacheHitTrendComparators: TrendComparator[]
  alertTtfbTrendEnabled: boolean
  alertTtfbTrendThresholdPct: number
  alertTtfbTrendComparators: TrendComparator[]
  alertTtfbTrendDirection: 'worsening' | 'both'
  alertTrendRequireConsecutive: boolean
  alertTrendGlobalEnabled: boolean
  alertTrendGlobalThresholdFactor: number
  globalHitAvg?: number
  globalMissAvg?: number
}) {
  const [removeOpen, setRemoveOpen] = useState(false)
  const [clearAlertsOpen, setClearAlertsOpen] = useState(false)

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
    <div className="space-y-12">
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
            Removing a monitor or clearing its history are irreversible actions.
          </p>
        </div>

        <div className="ml-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all group">
            <div>
              <h3 className="text-sm font-bold text-zinc-200 group-hover:text-amber-500 transition-colors">Clear alert history</h3>
              <p className="text-xs text-zinc-500 mt-1">Permanently delete all alerts and anomalies.</p>
            </div>
            <button
              type="button"
              onClick={() => setClearAlertsOpen(true)}
              className="h-9 px-4 rounded-lg bg-white/5 border border-white/5 text-zinc-300 hover:bg-amber-500 hover:border-amber-500 hover:text-white transition-all text-xs font-bold uppercase tracking-wider"
            >
              Clear Alerts...
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-red-500/30 hover:bg-red-500/5 transition-all group">
            <div>
              <h3 className="text-sm font-bold text-zinc-200 group-hover:text-red-500 transition-colors">Remove monitor</h3>
              <p className="text-xs text-zinc-500 mt-1">Delete all associated data forever.</p>
            </div>
            <button
              type="button"
              onClick={() => setRemoveOpen(true)}
              className="h-9 px-4 rounded-lg bg-white/5 border border-white/5 text-zinc-300 hover:bg-red-500 hover:border-red-500 hover:text-white transition-all text-xs font-bold uppercase tracking-wider"
            >
              Remove Monitor...
            </button>
          </div>
        </div>
      </section>

      {removeOpen ? (
        <MonitorDeleteConfirm
          monitorId={props.id}
          onClose={() => setRemoveOpen(false)}
        />
      ) : null}

      {clearAlertsOpen ? (
        <MonitorClearAlertsConfirm
          monitorId={props.id}
          onClose={() => setClearAlertsOpen(false)}
        />
      ) : null}
    </div>
  )
}
