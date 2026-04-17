'use client'

import { MonitorDispatchButtons } from './monitor-dispatch-buttons'

export function MonitorOnDemandPanel({ monitorId }: { monitorId: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-6">
      <div className="mb-6 space-y-1">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Instant Test</h2>
        <p className="text-sm text-zinc-500">Trigger a manual probe from all regions immediately. Useful for verifying cache rules or health changes.</p>
      </div>
      <MonitorDispatchButtons monitorId={monitorId} />
    </div>
  )
}
