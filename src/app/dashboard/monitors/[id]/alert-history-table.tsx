'use client'

import { useState, Fragment } from 'react'
import { AlertCircle, AlertTriangle, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { MONITOR_TABLE } from './monitor-table-styles'
import { ALERT_TYPE_LABELS, type AlertType } from './monitor-href'
import { type Alert } from '@/types/monitor'


interface AlertHistoryTableProps {
  alerts: Alert[]
  regionLabels: Record<string, string>
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  return `${ms.toFixed(0)}ms`
}

export function AlertHistoryTable({ alerts, regionLabels }: AlertHistoryTableProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  // Group alerts by consecutive region + type
  const groupedAlerts: { parent: Alert; children: Alert[] }[] = []
  let currentGroup: { parent: Alert; children: Alert[] } | null = null

  for (const alert of alerts) {
    const isRepeating = currentGroup &&
      currentGroup.parent.region === alert.region &&
      currentGroup.parent.alert_type === alert.alert_type

    if (isRepeating) {
      currentGroup!.children.push(alert)
    } else {
      currentGroup = { parent: alert, children: [] }
      groupedAlerts.push(currentGroup)
    }
  }

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Consistent column widths for all tables
  const ColGroup = () => (
    <colgroup>
      <col className="w-[14%]" />
      <col className="w-[12%]" />
      <col className="w-[16%]" />
      <col className="w-[18%]" />
      <col className="w-[14%]" />
      <col className="w-[14%]" />
      <col className="w-[12%]" />
    </colgroup>
  )

  return (
    <div className="space-y-4">


      {/* ── Alert Cards ── */}
      <div className="space-y-3">
        {groupedAlerts.map((group, groupIdx) => {
          const { parent, children } = group
          const isExpanded = expandedGroups[parent.id]

          const currentDate = new Date(parent.created_at)
          const prevDate = groupIdx > 0 ? new Date(groupedAlerts[groupIdx - 1].parent.created_at) : null
          const isDifferentDay = !prevDate || currentDate.toDateString() !== prevDate.toDateString()

          let dateLabel = ''
          if (isDifferentDay) {
            const today = new Date().toDateString()
            const yesterday = new Date(Date.now() - 86400000).toDateString()
            const dateStr = currentDate.toDateString()
            if (dateStr === today) dateLabel = 'Today'
            else if (dateStr === yesterday) dateLabel = 'Yesterday'
            else dateLabel = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          }

          return (
            <Fragment key={parent.id}>
              {isDifferentDay && (
                <div className="py-2 px-1 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500/80">
                    {dateLabel}
                  </span>
                  <div className="mt-4">
                    <div className={MONITOR_TABLE.innerScroll}>
                      <table className={`${MONITOR_TABLE.tableBase} table-fixed`}>
                        <ColGroup />
                        <thead>
                          <tr className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight border-b border-border/50">
                            <th className="px-4 py-3 text-left">Timestamp</th>
                            <th className="px-4 py-3 text-left">Region</th>
                            <th className="px-4 py-3 text-left">Event Type</th>
                            <th className="px-4 py-3 text-left">Metric</th>
                            <th className="px-4 py-3 text-right">Threshold</th>
                            <th className="px-4 py-3 text-right">Observed</th>
                            <th className="px-4 py-3 text-right">Severity</th>
                          </tr>
                        </thead>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="cs-card cs-card-glass group relative overflow-hidden transition-all duration-300 hover:border-zinc-700/80 hover:bg-white/[0.03]">
                <div className="cs-card-wash" />

                <div className={MONITOR_TABLE.innerScroll}>
                  <table className={`${MONITOR_TABLE.tableBase} table-fixed relative z-10`}>
                    <ColGroup />
                    <tbody>
                      <AlertRow
                        alert={parent}
                        regionLabels={regionLabels}
                        hasChildren={children.length > 0}
                        isExpanded={isExpanded}
                        onToggle={() => toggleGroup(parent.id)}
                        showTopBorder={false}
                      />

                      {/* Diagnosis Block for Parent */}
                      {(parent.diagnosis?.trim() || parent.action?.trim()) && (
                        <tr className="border-t border-white/5">
                          <td colSpan={7} className="px-4 pb-3 pt-2">
                            <div className="rounded-xl bg-white/[0.015] border border-white/5 p-5 space-y-5 shadow-2xl relative overflow-hidden">
                              {/* Subtle side accent */}
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--brand-primary)]/10" />

                              {parent.diagnosis?.trim() && (
                                <div className="space-y-2.5">
                                  <div className="flex items-center gap-3">
                                    <span className="text-zinc-400 font-black uppercase tracking-[0.15em] text-[9px] whitespace-nowrap">Cause</span>
                                    <div className="h-px w-8 bg-white/10" />
                                  </div>
                                  <div className="text-[11px] text-zinc-300 leading-relaxed pl-1">
                                    {(() => {
                                      const marker = "Affected regions: ";
                                      const parts = parent.diagnosis!.split(marker);
                                      if (parts.length > 1) {
                                        const regions = parts[1].replace(/\.$/, '').split(',').map(r => r.trim());
                                        return (
                                          <div className="space-y-3">
                                            <p className="font-medium">{parts[0]}</p>
                                            <div className="flex flex-wrap gap-2 pt-1">
                                              {regions.map(r => (
                                                <span
                                                  key={r}
                                                  className="px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-zinc-400 font-bold hover:bg-white/10 hover:border-white/20 transition-all cursor-default"
                                                >
                                                  {regionLabels[r as keyof typeof regionLabels] || r}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      }
                                      return parent.diagnosis;
                                    })()}
                                  </div>
                                </div>
                              )}

                              {parent.action?.trim() && (
                                <div className="space-y-2.5">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[var(--brand-primary)] font-black uppercase tracking-[0.15em] text-[9px] whitespace-nowrap">Recommendation</span>
                                    <div className="h-px w-8 bg-[var(--brand-primary)]/20" />
                                  </div>
                                  <p className="text-[11px] text-[var(--brand-primary)]/90 leading-relaxed font-bold pl-1">
                                    {parent.action}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Children Rows (Collapsed/Expanded) */}
                      {children.length > 0 && isExpanded && children.map((child) => (
                        <AlertRow
                          key={child.id}
                          alert={child}
                          regionLabels={regionLabels}
                          isChild
                        />
                      ))}

                      {/* Expand/Collapse Button Row */}
                      {children.length > 0 && !isExpanded && (
                        <tr className="border-t border-white/5 bg-white/[0.01]">
                          <td colSpan={7} className="px-4 py-1 text-center">
                            <button
                              onClick={() => toggleGroup(parent.id)}
                              className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1.5 mx-auto py-2"
                            >
                              <ChevronDown className="w-3 h-3" />
                              Show {children.length} more repeating events
                            </button>
                          </td>
                        </tr>
                      )}

                      {children.length > 0 && isExpanded && (
                        <tr className="border-t border-white/5 bg-white/[0.01]">
                          <td colSpan={7} className="px-4 py-1.5 text-center">
                            <button
                              onClick={() => toggleGroup(parent.id)}
                              className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1.5 mx-auto py-2"
                            >
                              <ChevronUp className="w-3 h-3" />
                              Collapse history
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function AlertRow({
  alert,
  regionLabels,
  isChild = false,
  hasChildren = false,
  isExpanded = false,
  onToggle,
  showTopBorder = false
}: {
  alert: Alert
  regionLabels: Record<string, string>
  isChild?: boolean
  hasChildren?: boolean
  isExpanded?: boolean
  onToggle?: () => void
  showTopBorder?: boolean
}) {
  const actual = alert.actual_ms ?? 0
  const baseline = alert.baseline_ms ?? 0
  const ratio = baseline > 0 ? actual / baseline : 1

  let severity = 'INFO'
  if (alert.alert_type === 'down') {
    severity = 'CRITICAL'
  } else if (alert.deviation_factor != null) {
    const df = alert.deviation_factor
    severity = df > 4 ? 'CRITICAL' : df > 2 ? 'WARNING' : 'INFO'
  } else if (alert.alert_type === 'ttfb_threshold') {
    severity = ratio > 2.0 ? 'CRITICAL' : ratio > 1.25 ? 'WARNING' : 'INFO'
  }

  const severityColor = severity === 'CRITICAL'
    ? 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
    : severity === 'WARNING'
      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
      : 'bg-white/5 text-zinc-500 border border-white/10'

  const alertTypeIcon = alert.alert_type === 'down'
    ? <div className="relative">
      <div className="absolute inset-0 bg-red-500 blur-sm opacity-20 animate-pulse" />
      <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 relative z-10" />
    </div>
    : alert.alert_type === 'anomaly'
      ? <Zap className="w-3 h-3 text-amber-500 shrink-0" />
      : <AlertCircle className={`w-3 h-3 shrink-0 ${severity === 'CRITICAL' ? 'text-red-400' : 'text-zinc-400'}`} />

  const isMultiple = alert.region === 'Multiple'

  return (
    <tr className={`${MONITOR_TABLE.tbodyRow} ${alert.diagnosis && !isChild ? 'border-b-0' : ''} ${isChild ? 'opacity-60 bg-white/[0.01]' : ''} ${showTopBorder ? 'border-t border-zinc-800' : ''}`}>
      <td className="px-4 py-3.5">
        <div className="flex flex-col">
          <span className="text-[11px] text-zinc-500 font-medium tabular-nums">
            {new Date(alert.created_at).toLocaleString('en-US', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
          {isChild && (
            <span className="text-[8px] font-black uppercase tracking-tighter text-zinc-400/60 leading-none mt-0.5">Repeating</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span className={`text-xs font-semibold ${isChild ? 'text-zinc-400' : isMultiple ? 'text-[var(--brand-primary)] font-black' : 'text-zinc-700 dark:text-zinc-300'}`}>
          {isMultiple ? 'Multiple Regions' : (regionLabels[alert.region] ?? alert.region)}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          {alertTypeIcon}
          <span className={`text-[11px] font-bold uppercase tracking-tight ${isChild ? 'text-zinc-500' : 'text-zinc-600 dark:text-zinc-400'}`}>
            {ALERT_TYPE_LABELS[alert.alert_type as AlertType] ?? alert.alert_type.replace('_', ' ')}
          </span>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <code className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
          {alert.metric}
        </code>
      </td>
      <td className="px-4 py-3.5 text-right text-xs tabular-nums text-zinc-400">
        {alert.delta_pct != null
          ? <span className={alert.delta_pct < 0 ? 'text-red-400' : 'text-amber-400'}>{alert.delta_pct > 0 ? '+' : ''}{alert.delta_pct.toFixed(1)}%</span>
          : alert.alert_type === 'cache_hit_low'
            ? (alert.baseline_ms != null ? `${alert.baseline_ms.toFixed(0)}%` : '—')
            : formatMs(alert.baseline_ms)}
      </td>
      <td className="px-4 py-3.5 text-right text-xs tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
        {alert.comparator != null
          ? <span className="text-[10px] font-normal text-zinc-500 uppercase tracking-tight">{alert.comparator.replace(/_/g, ' ')}</span>
          : alert.alert_type === 'cache_hit_low'
            ? (alert.actual_ms != null ? `${alert.actual_ms.toFixed(1)}%` : '—')
            : formatMs(alert.actual_ms)}
      </td>
      <td className="px-4 py-3.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black tracking-tighter ${severityColor}`}>
            {alert.deviation_factor != null ? `${alert.deviation_factor.toFixed(1)}×` : severity}
          </span>
          {hasChildren && (
            <button onClick={onToggle} className="text-zinc-400 hover:text-zinc-200 transition-colors">
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
