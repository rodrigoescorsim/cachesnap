'use client'

import { useState, Fragment } from 'react'
import { AlertCircle, AlertTriangle, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { MONITOR_TABLE } from './monitor-table-styles'
import { ALERT_TYPE_LABELS, type AlertType } from './monitor-href'

interface Alert {
  id: string
  region: string
  alert_type: string
  metric: string
  baseline_ms: number | null
  actual_ms: number | null
  deviation_factor: number | null
  diagnosis: string | null
  action: string | null
  delta_pct: number | null
  comparator: string | null
  scope: string | null
  created_at: string
}

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
      {/* ── Fixed Header ── */}
      <div className="cs-card bg-black/20 border-white/5 rounded-xl overflow-hidden mb-2 shadow-sm">
        <div className={MONITOR_TABLE.innerScroll}>
          <table className={`${MONITOR_TABLE.tableBase} table-fixed`}>
            <ColGroup />
            <thead>
              <tr className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
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
                <div className="py-2 px-1">
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500/80">
                    {dateLabel}
                  </span>
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
                      {(parent.diagnosis || parent.action) && (
                        <tr className="border-t border-white/5">
                          <td colSpan={7} className="px-4 pb-3 pt-3">
                            <div className="rounded-lg bg-white/[0.02] border border-white/5 px-3.5 py-2.5 space-y-1.5">
                              {parent.diagnosis && (
                                <p className="text-[11px] text-zinc-300 leading-relaxed">
                                  <span className="text-zinc-500 font-bold uppercase tracking-tight text-[9px] mr-2">Cause</span>
                                  {parent.diagnosis}
                                </p>
                              )}
                              {parent.action && (
                                <p className="text-[11px] text-[var(--brand-primary)]/80 leading-relaxed">
                                  <span className="text-zinc-500 font-bold uppercase tracking-tight text-[9px] mr-2">Fix</span>
                                  {parent.action}
                                </p>
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
    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
    : severity === 'WARNING'
      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
      : 'bg-white/5 text-zinc-500 border border-white/10'

  const alertTypeIcon = alert.alert_type === 'down'
    ? <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
    : alert.alert_type === 'anomaly'
      ? <Zap className="w-3 h-3 text-amber-500 shrink-0" />
      : <AlertCircle className={`w-3 h-3 shrink-0 ${severity === 'CRITICAL' ? 'text-red-400' : 'text-zinc-400'}`} />

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
        <span className={`text-xs font-semibold ${isChild ? 'text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
          {regionLabels[alert.region] ?? alert.region}
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
