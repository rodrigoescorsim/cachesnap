'use client'

import { useState, Fragment, type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Zap, ChevronDown, ChevronUp, ShieldAlert, Lightbulb } from 'lucide-react'
import { PremiumTooltip } from '@/components/premium-tooltip'
import { MONITOR_TABLE } from './monitor-table-styles'
import { ALERT_TYPE_LABELS, type AlertType } from './monitor-href'
import { type Alert } from '@/types/monitor'
import {
  severityContext,
  alertTypeSeverity,
  SEVERITY_STYLES,
  REGION_SUMMARY_PILL_LIMIT,
  normalizeLegacyTrendDiagnosisCopy,
} from './incident-display'

interface AlertHistoryTableProps {
  alerts: Alert[]
  regionLabels: Record<string, string>
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  return `${ms.toFixed(0)}ms`
}

function SummaryMiniCard({
  label,
  align = 'start',
  className,
  children,
}: {
  label: string
  align?: 'start' | 'end' | 'center'
  className?: string
  children: ReactNode
}) {
  const labelAlign =
    align === 'end' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const rowAlign =
    align === 'end'
      ? 'justify-end text-right'
      : align === 'center'
        ? 'justify-center text-center'
        : 'justify-start text-left'

  return (
    <div
      className={`min-w-0 rounded-lg border border-border bg-white/[0.02] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className ?? ''}`}
    >
      <div className={`mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500 ${labelAlign}`}>
        {label}
      </div>
      <div className={`flex min-h-[1.375rem] items-center text-[11px] leading-snug ${rowAlign}`}>
        <div className="min-w-0 w-full">{children}</div>
      </div>
    </div>
  )
}

function alertSeverityPresentation(alert: Alert) {
  /** Same tier as `severityContext` / Active Incidents — mirrors `alertTypeSeverity` + notifier copy. */
  const severityKey = alertTypeSeverity(alert.alert_type)
  const sev = SEVERITY_STYLES[severityKey] ?? SEVERITY_STYLES.low

  const chipText =
    alert.deviation_factor != null
      ? `${severityKey} ${alert.deviation_factor.toFixed(1)}×`
      : severityKey

  const alertTypeIcon =
    alert.alert_type === 'down' ? (
      <div className="relative">
        <div className="absolute inset-0 animate-pulse rounded-full bg-red-500 opacity-20 blur-sm" />
        <AlertTriangle className="relative z-10 h-3 w-3 shrink-0 text-red-500" />
      </div>
    ) : alert.alert_type === 'ttfb_anomaly' ? (
      <Zap className="h-3 w-3 shrink-0 text-amber-500" />
    ) : (
      <AlertCircle className={`h-3 w-3 shrink-0 ${severityKey === 'critical' ? 'text-red-400' : 'text-zinc-400'}`} />
    )

  return { severityKey, sev, chipText, alertTypeIcon }
}

function AlertSummaryFields({
  alert,
  regionLabels,
  isChild = false,
  hasChildren = false,
  isExpanded = false,
  onToggle,
}: {
  alert: Alert
  regionLabels: Record<string, string>
  isChild?: boolean
  hasChildren?: boolean
  isExpanded?: boolean
  onToggle?: () => void
}) {
  const { sev, chipText, alertTypeIcon } = alertSeverityPresentation(alert)
  const isMultiple = alert.region === 'Multiple'
  const muted = isChild ? 'opacity-95' : ''

  const thresholdNode =
    alert.delta_pct != null ? (
      <span className={`tabular-nums font-semibold ${alert.delta_pct < 0 ? 'text-red-400' : 'text-amber-400'}`}>
        {alert.delta_pct > 0 ? '+' : ''}
        {alert.delta_pct.toFixed(1)}%
      </span>
    ) : alert.alert_type === 'cache_hit_low' ? (
      <span className="tabular-nums font-semibold text-zinc-300">
        {alert.baseline_ms != null ? `${alert.baseline_ms.toFixed(0)}%` : '—'}
      </span>
    ) : (
      <span className="tabular-nums font-semibold text-zinc-300">{formatMs(alert.baseline_ms)}</span>
    )

  const observedNode =
    alert.comparator != null ? (
      <span className="text-[10px] font-medium uppercase tracking-tight text-zinc-500">
        {alert.comparator.replace(/_/g, ' ')}
      </span>
    ) : alert.alert_type === 'cache_hit_low' ? (
      <span className="tabular-nums font-semibold text-zinc-200">
        {alert.actual_ms != null ? `${alert.actual_ms.toFixed(1)}%` : '—'}
      </span>
    ) : (
      <span className="tabular-nums font-semibold text-zinc-200">{formatMs(alert.actual_ms)}</span>
    )

  return (
    <div className={`w-full min-w-0 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] ${muted}`}>
      <div className="flex w-full flex-row flex-nowrap items-stretch gap-2">
        <SummaryMiniCard label="Timestamp" className="min-w-0 basis-0 grow">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium tabular-nums text-zinc-300">
              {new Date(alert.created_at).toLocaleString('en-US', {
                hour12: false,
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {isChild && (
              <span className="text-[8px] font-black uppercase tracking-tighter text-zinc-500">Repeating</span>
            )}
          </div>
        </SummaryMiniCard>

        <SummaryMiniCard label="Region" className="min-w-0 basis-0 grow">
          <span
            className={`font-semibold ${
              isChild ? 'text-zinc-400' : isMultiple ? 'font-black text-[var(--brand-primary)]' : 'text-zinc-200'
            }`}
          >
            {isMultiple ? 'Multiple Regions' : (regionLabels[alert.region] ?? alert.region)}
          </span>
        </SummaryMiniCard>

        <SummaryMiniCard label="Event type" className="min-w-0 basis-0 [flex-grow:1.35]">
          <div className="flex min-w-0 items-center gap-2">
            {alertTypeIcon}
            <span
              className={`min-w-0 truncate font-bold uppercase tracking-tight ${
                isChild ? 'text-zinc-500' : 'text-zinc-300'
              }`}
            >
              {ALERT_TYPE_LABELS[alert.alert_type as AlertType] ?? alert.alert_type.replace('_', ' ')}
            </span>
          </div>
        </SummaryMiniCard>

        <SummaryMiniCard label="Threshold" align="end" className="min-w-0 basis-0 grow">
          {thresholdNode}
        </SummaryMiniCard>

        <SummaryMiniCard label="Observed" align="end" className="min-w-0 basis-0 grow">
          {observedNode}
        </SummaryMiniCard>

        <SummaryMiniCard label="Severity" align="end" className="min-w-0 basis-0 grow">
          <div className="flex w-full min-w-0 items-center justify-end gap-2">
            <span
              className={`inline-flex min-w-0 max-w-full items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${sev.badge}`}
            >
              <span className="truncate">{chipText}</span>
            </span>
            {hasChildren && onToggle && (
              <button
                type="button"
                onClick={onToggle}
                className="shrink-0 text-zinc-400 transition-colors hover:text-zinc-200"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Collapse repeating events' : 'Expand repeating events'}
              >
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </SummaryMiniCard>
      </div>
    </div>
  )
}

export function AlertHistoryTable({ alerts, regionLabels }: AlertHistoryTableProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const groupedAlerts: { parent: Alert; children: Alert[] }[] = []
  let currentGroup: { parent: Alert; children: Alert[] } | null = null

  for (const alert of alerts) {
    const isRepeating =
      currentGroup &&
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

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {groupedAlerts.map((group, groupIdx) => {
          const { parent, children } = group
          const isExpanded = expandedGroups[parent.id]

          const currentDate = new Date(parent.created_at)
          const prevDate = groupIdx > 0 ? new Date(groupedAlerts[groupIdx - 1].parent.created_at) : null
          const isDifferentDay = !prevDate || currentDate.toDateString() !== prevDate.toDateString()

          let dateLabel = ''
          if (isDifferentDay) {
            const now = new Date()
            const today = now.toDateString()
            const yesterday = new Date(now.getTime() - 86400000).toDateString()
            const dateStr = currentDate.toDateString()
            if (dateStr === today) dateLabel = 'Today'
            else if (dateStr === yesterday) dateLabel = 'Yesterday'
            else
              dateLabel = currentDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
          }

          return (
            <Fragment key={parent.id}>
              {isDifferentDay && (
                <div className="px-1 pb-1 pt-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500/80">
                    {dateLabel}
                  </span>
                </div>
              )}

              <div className="cs-card group relative overflow-hidden">
                <div className="cs-card-wash" />

                <div className={`${MONITOR_TABLE.innerScroll} relative z-10`}>
                  <div className="p-4 pb-3">
                    <AlertSummaryFields
                      alert={parent}
                      regionLabels={regionLabels}
                      hasChildren={children.length > 0}
                      isExpanded={isExpanded}
                      onToggle={children.length > 0 ? () => toggleGroup(parent.id) : undefined}
                    />
                  </div>

                  <div className="border-t border-border px-4 pb-3 pt-2">
                    {(() => {
                      const impact = severityContext(parent.alert_type)
                      const severityKey = alertTypeSeverity(parent.alert_type)
                      const sev = SEVERITY_STYLES[severityKey] ?? SEVERITY_STYLES.low
                      return (
                        <div className="relative space-y-4 overflow-hidden rounded-lg border border-border bg-white/[0.015] p-4">
                          <div className="absolute bottom-0 left-0 top-0 w-1 bg-[var(--brand-primary)]/10" />

                          <div className="flex items-start gap-2.5 pl-1">
                            <ShieldAlert className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${sev.text}`} aria-hidden />
                            <p className="text-[11px] leading-relaxed">
                              <span className={`font-black uppercase tracking-[0.12em] ${sev.text}`}>
                                {impact.label}
                              </span>
                              <span className="text-zinc-400"> — {impact.note}</span>
                            </p>
                          </div>

                          {parent.diagnosis?.trim() && (
                            <div className="space-y-2.5 rounded-lg border border-border bg-white/[0.015] p-3">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">
                                  Cause
                                </span>
                              </div>
                              <div className="pl-0.5 text-[11px] leading-relaxed text-zinc-300">
                                {(() => {
                                  const marker = 'Affected regions: '
                                  const normalizedDiagnosis = normalizeLegacyTrendDiagnosisCopy(
                                    parent.diagnosis!.trim(),
                                  )
                                  const parts = normalizedDiagnosis.split(marker)
                                  if (parts.length > 1) {
                                    const regions = parts[1]
                                      .replace(/\.$/, '')
                                      .split(',')
                                      .map(r => r.trim())
                                    const visible = regions.slice(0, REGION_SUMMARY_PILL_LIMIT)
                                    const hidden = regions.slice(REGION_SUMMARY_PILL_LIMIT)
                                    const hiddenTitle = hidden
                                      .map(r => regionLabels[r as keyof typeof regionLabels] || r)
                                      .join(', ')
                                    return (
                                      <div className="space-y-3">
                                        <p className="font-medium">{parts[0]}</p>
                                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                                          {visible.map(r => (
                                            <span
                                              key={r}
                                              className="inline-flex items-center rounded-md bg-white/[0.025] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
                                            >
                                              {regionLabels[r as keyof typeof regionLabels] || r}
                                            </span>
                                          ))}
                                          {hidden.length > 0 && (
                                            <PremiumTooltip
                                              content={
                                                <span className="text-zinc-300">
                                                  Also includes:{' '}
                                                  <span className="font-medium text-zinc-100">{hiddenTitle}</span>
                                                </span>
                                              }
                                              position="top-right"
                                              panelSizing="hug"
                                            >
                                              <span className="inline-flex cursor-default items-center rounded-md bg-white/[0.025] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                                                +{hidden.length} more
                                              </span>
                                            </PremiumTooltip>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  }
                                  return normalizedDiagnosis
                                })()}
                              </div>
                            </div>
                          )}

                          {parent.action?.trim() && (
                            <div
                              className="space-y-2 rounded-lg border p-3"
                              style={{
                                backgroundColor: 'rgba(var(--brand-primary-rgb), 0.06)',
                                borderColor: 'rgba(var(--brand-primary-rgb), 0.22)',
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <Lightbulb
                                  className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]"
                                  aria-hidden
                                />
                                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--brand-primary)]">
                                  Recommendation
                                </span>
                              </div>
                              <p className="pl-0.5 text-[11px] font-medium leading-relaxed text-[var(--brand-primary)]/90">
                                {parent.action}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {children.length > 0 && !isExpanded && (
                    <div className="border-t border-border bg-white/[0.01] px-4 py-1">
                      <button
                        type="button"
                        onClick={() => toggleGroup(parent.id)}
                        className="mx-auto flex items-center justify-center gap-1.5 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-300"
                      >
                        <ChevronDown className="h-3 w-3" />
                        Show {children.length} more repeating events
                      </button>
                    </div>
                  )}

                  {children.length > 0 &&
                    isExpanded &&
                    children.map(child => (
                      <div
                        key={child.id}
                        className="border-t border-border bg-white/[0.01] px-4 py-3 opacity-[0.92]"
                      >
                        <AlertSummaryFields alert={child} regionLabels={regionLabels} isChild />
                      </div>
                    ))}

                  {children.length > 0 && isExpanded && (
                    <div className="border-t border-border bg-white/[0.01] px-4 py-1.5">
                      <button
                        type="button"
                        onClick={() => toggleGroup(parent.id)}
                        className="mx-auto flex items-center justify-center gap-1.5 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-300"
                      >
                        <ChevronUp className="h-3 w-3" />
                        Collapse history
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
