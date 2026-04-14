'use client'

import { MonitorDispatchButtons } from './monitor-dispatch-buttons'

export function MonitorOnDemandPanel({ monitorId }: { monitorId: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-6">
      <MonitorDispatchButtons monitorId={monitorId} />
    </div>
  )
}
