import { MapPin, CheckCircle2, AlertCircle, Lightbulb, Bell } from 'lucide-react'
import { LiveDot } from '@/components/dashboard/dashboard-ui'
import { PremiumTooltip } from '@/components/premium-tooltip'
import {
  SEVERITY_STYLES,
  alertTypeDisplay,
  alertTypeSeverity,
  comparatorDisplay,
  formatDuration,
  formatMetricDelta,
  formatMetricValue,
  formatTimestamp,
  incidentStatus,
  isCacheHitTrendDrop,
  isCacheMetric,
  metricUnit,
  severityContext,
  REGION_SUMMARY_PILL_LIMIT,
} from './incident-display'

export interface ActiveIncident {
  id: string
  alert_type: string
  severity: string
  affected_regions: string[]
  opened_at: Date | string
  last_notified_at: Date | string | null
  notification_count: number
  /** Rows in `alerts` tied to this incident (each fire / digest can add one). */
  alert_events_count?: number
  delivered_notification_count?: number
  failed_notification_count?: number
  snoozed_until: Date | string | null
  last_actual: number | null
  last_threshold: number | null
  duration_ms: number
  /** Latest diagnosis text from the most recent alert tied to this incident. */
  diagnosis?: string | null
  /** Latest recommended action text from the most recent alert tied to this incident. */
  action?: string | null
  /** Percentage delta (trend metrics) — drives the 3-column metric block. */
  delta_pct?: number | null
  /** Comparator slug for trend metrics (e.g. prev_hour, same_hour_prev_day, day_avg). */
  comparator?: string | null
  /** How many times the observed metric deviates from the baseline (anomaly alerts). */
  deviation_factor?: number | null
}

interface ActiveIncidentsPanelProps {
  /** Kept for API compatibility with parent pages; the panel no longer links out. */
  monitorId?: string
  incidents: ActiveIncident[]
  regionLabels?: Record<string, string>
}

// Re-exported for backwards compatibility with existing imports and tests.
export { alertTypeDisplay, formatDuration, formatMetricDelta }

function replaceRegionIds(
  text: string,
  regionLabels: Record<string, string>,
): string {
  return Object.entries(regionLabels).reduce(
    (acc, [id, label]) => acc.split(id).join(label),
    text,
  )
}

export function ActiveIncidentsPanel({
  incidents,
  regionLabels = {},
}: ActiveIncidentsPanelProps) {
  if (incidents.length === 0) {
    return (
      <section aria-labelledby="active-incidents-list-heading" className="space-y-3">
        <div className="flex items-center gap-2 mb-4 px-1">
          <h3
            id="active-incidents-list-heading"
            className="cs-view-section-title flex items-center gap-2"
          >
            <LiveDot colorClass="bg-emerald-500" />
            Active Incidents
          </h3>
        </div>
        <div className="rounded-xl bg-surface border border-border p-6 flex items-center gap-3 text-zinc-400">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <span className="text-sm">All clear — no active incidents right now.</span>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="active-incidents-list-heading" className="space-y-3">
      <div className="flex items-center gap-2 mb-4 px-1">
        <h3
          id="active-incidents-list-heading"
          className="cs-view-section-title flex items-center gap-2"
        >
          <LiveDot colorClass="bg-amber-500" />
          Active Incidents
        </h3>
        <span className="inline-flex h-5 items-center rounded-full bg-amber-500/10 px-2 text-[10px] font-bold text-amber-400 border border-amber-500/20">
          {incidents.length}
        </span>
      </div>

      <div className="space-y-3">
        {incidents.map(incident => {
          // Prefer severity tier derived from alert_type so the panel matches
          // the email even if alert_incidents.severity drifts.
          const severityKey = alertTypeSeverity(incident.alert_type)
          const sev = SEVERITY_STYLES[severityKey] ?? SEVERITY_STYLES.low
          const display = alertTypeDisplay(incident.alert_type)
          const duration = formatDuration(incident.duration_ms)
          const deliveredCount = incident.delivered_notification_count ?? 0
          const failedCount = incident.failed_notification_count ?? 0
          const pendingCount = Math.max(
            0,
            incident.notification_count - deliveredCount - failedCount,
          )
          const alertEventsCount = incident.alert_events_count ?? 0
          const status = incidentStatus(
            incident.notification_count,
            incident.snoozed_until,
          )
          const impact = severityContext(incident.alert_type)
          const diagnosis = incident.diagnosis
            ? replaceRegionIds(incident.diagnosis, regionLabels).trim()
            : ''
          const action = incident.action
            ? replaceRegionIds(incident.action, regionLabels).trim()
            : ''

          const visibleRegions = incident.affected_regions.slice(
            0,
            REGION_SUMMARY_PILL_LIMIT,
          )
          const hiddenRegionCount = Math.max(
            0,
            incident.affected_regions.length - visibleRegions.length,
          )
          const hiddenRegionLabels = incident.affected_regions
            .slice(visibleRegions.length)
            .map(r => regionLabels[r] ?? r)
            .join(', ')

          const strip = statusStripStyle(status.kind, severityKey)

          return (
            <article
              key={incident.id}
              className="cs-card group relative overflow-hidden"
            >
              <div className="cs-card-wash" aria-hidden />

              {/* ── Status strip (mirrors the email "New Alert / Still Ongoing" header) ── */}
              <div
                className={`relative z-10 flex items-center justify-between gap-3 px-4 py-2 ${strip.bg} ${strip.border}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${strip.text}`}>
                    {status.label}
                  </span>
                  {incident.notification_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-400">
                      <Bell className="h-3 w-3 opacity-80" aria-hidden />
                      {incident.notification_count} notification
                      {incident.notification_count === 1 ? '' : 's'} sent
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${sev.badge}`}
                  aria-label={`Severity: ${severityKey}`}
                >
                  {severityKey}
                </span>
              </div>

              <div className="relative z-10 p-4 space-y-4">
                {/* ── Headline ── */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-base font-bold text-zinc-100 truncate">
                      {display}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      <span className={`font-semibold ${sev.text}`}>
                        {impact.label}
                      </span>
                      <span className="text-zinc-500"> — {impact.note}</span>
                    </p>
                  </div>

                  {incident.affected_regions.length > 0 && (
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 max-w-[55%]">
                      <MapPin
                        className="h-3 w-3 text-zinc-500 shrink-0"
                        aria-hidden
                      />
                      {visibleRegions.map(r => (
                        <span
                          key={r}
                          className="inline-flex items-center rounded-md bg-white/[0.025] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
                        >
                          {regionLabels[r] ?? r}
                        </span>
                      ))}
                      {hiddenRegionCount > 0 && (
                        <PremiumTooltip
                          content={
                            <span className="text-zinc-300">
                              Also includes:{' '}
                              <span className="font-medium text-zinc-100">{hiddenRegionLabels}</span>
                            </span>
                          }
                          position="top-right"
                          panelSizing="hug"
                        >
                          <span className="inline-flex cursor-default items-center rounded-md bg-white/[0.025] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                            +{hiddenRegionCount} more
                          </span>
                        </PremiumTooltip>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Metrics block (mirrors the email 3-column layout when delta is present) ── */}
                <MetricsBlock incident={incident} severityKey={severityKey} />

                {/* ── Diagnosis (Cause) ── */}
                {diagnosis && (
                  <div className="rounded-lg bg-white/[0.015] border border-border p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">
                        Cause
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                      {diagnosis}
                    </p>
                  </div>
                )}

                {/* ── Recommended action ── */}
                {action && (
                  <div
                    className="rounded-lg p-3 space-y-1.5 border"
                    style={{
                      backgroundColor: 'rgba(var(--brand-primary-rgb), 0.06)',
                      borderColor: 'rgba(var(--brand-primary-rgb), 0.22)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Lightbulb
                        className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                        aria-hidden
                      />
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--brand-primary)]">
                        Recommendation
                      </span>
                    </div>
                    <p className="text-xs text-[var(--brand-primary)]/90 leading-relaxed font-medium whitespace-pre-line">
                      {action}
                    </p>
                  </div>
                )}

                {/* ── Footer: timestamps + delivery ── */}
                <div className="border-t border-border pt-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                    <span>
                      Open for{' '}
                      <span className="font-medium text-zinc-300">{duration}</span>
                    </span>
                    {alertEventsCount > 0 && (
                      <span>
                        <span className="text-zinc-500">Events logged</span>{' '}
                        <span className="font-medium text-zinc-300">{alertEventsCount}</span>
                      </span>
                    )}
                    <span>
                      Opened{' '}
                      <span
                        className="text-zinc-300 font-medium"
                        title={new Date(incident.opened_at).toISOString()}
                      >
                        {formatTimestamp(incident.opened_at)}
                      </span>
                    </span>
                    {incident.last_notified_at && (
                      <span>
                        Last notified{' '}
                        <span
                          className="text-zinc-300 font-medium"
                          title={new Date(
                            incident.last_notified_at,
                          ).toISOString()}
                        >
                          {formatTimestamp(incident.last_notified_at)}
                        </span>
                      </span>
                    )}
                    {deliveredCount > 0 && (
                      <span className="text-zinc-500">
                        {deliveredCount} delivered
                      </span>
                    )}
                    {failedCount > 0 && (
                      <span className="text-red-400">
                        {failedCount} delivery failed
                      </span>
                    )}
                    {pendingCount > 0 &&
                      deliveredCount === 0 &&
                      failedCount === 0 && (
                        <span className="text-zinc-500">
                          {pendingCount} delivery pending
                        </span>
                      )}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Status strip styling — translucent tints aligned with the cs-badge palette
 * (globals.css) so the strip reads as a "soft band" instead of a saturated
 * banner.  Severity colours are used for fresh "New Alert" fires; ongoing /
 * snoozed states fall back to the neutral surface so they don't compete with
 * the body content.
 */
function statusStripStyle(
  kind: ReturnType<typeof incidentStatus>['kind'],
  severityKey: ReturnType<typeof alertTypeSeverity>,
): { bg: string; border: string; text: string } {
  if (kind === 'snoozed' || kind === 'ongoing') {
    return {
      bg: 'bg-white/[0.02]',
      border: 'border-b border-border',
      text: 'text-zinc-300',
    }
  }
  switch (severityKey) {
    case 'critical':
      return {
        bg: 'bg-red-500/[0.08]',
        border: 'border-b border-red-500/20',
        text: 'text-red-300',
      }
    case 'high':
      return {
        bg: 'bg-orange-500/[0.08]',
        border: 'border-b border-orange-500/20',
        text: 'text-orange-300',
      }
    case 'medium':
      return {
        bg: 'bg-amber-500/[0.08]',
        border: 'border-b border-amber-500/20',
        text: 'text-amber-300',
      }
    default:
      return {
        bg: 'bg-white/[0.02]',
        border: 'border-b border-border',
        text: 'text-zinc-300',
      }
  }
}

/**
 * Mirrors the metrics table built by api/src/alerts/notifier.rs::build_metrics_html.
 *
 * Renders three layouts in this order of preference:
 *   1. 3-column: Current · vs comparator (delta) · Reference   — when delta_pct + actual + threshold
 *   2. 2-column: Current · Threshold                            — when actual + threshold only
 *   3. Single value or hidden when no metric data is available
 */
function MetricsBlock({
  incident,
  severityKey,
}: {
  incident: ActiveIncident
  severityKey: ReturnType<typeof alertTypeSeverity>
}) {
  const { last_actual, last_threshold, delta_pct, comparator, alert_type } = incident
  const sev = SEVERITY_STYLES[severityKey] ?? SEVERITY_STYLES.low
  const unit = metricUnit(alert_type)

  if (last_actual == null && last_threshold == null) return null

  // 3-column trend layout
  if (last_actual != null && last_threshold != null && delta_pct != null) {
    const cmp = comparatorDisplay(comparator)
    const cacheBased = isCacheMetric(alert_type)
    // For cache metrics: a negative delta means worse; for latency: a positive delta means worse.
    const isWorse = cacheBased ? delta_pct < 0 : delta_pct > 0
    const deltaColor = isWorse ? 'text-red-400' : 'text-emerald-400'

    const trendDrop = isCacheHitTrendDrop(alert_type)
    const deltaText = trendDrop
      ? `${delta_pct.toFixed(1)} pp`
      : `${delta_pct > 0 ? '+' : ''}${delta_pct.toFixed(1)}%`

    const referenceLabel = trendDrop ? 'Reference' : cacheBased ? 'Target' : 'Reference'

    return (
      <div className="grid grid-cols-3 gap-3 rounded-lg bg-white/[0.015] border border-border p-3">
        <MetricCell
          label="Current"
          value={formatMetricValue(last_actual, alert_type)}
          valueClass={`${sev.text} font-bold`}
        />
        <MetricCell
          label={`vs ${cmp}`}
          value={deltaText}
          valueClass={`${deltaColor} font-bold`}
        />
        <MetricCell
          label={referenceLabel}
          value={`${last_threshold.toFixed(1)}${unit}`}
          valueClass="text-zinc-300 font-bold"
        />
      </div>
    )
  }

  // 2-column current/threshold layout
  if (last_actual != null && last_threshold != null) {
    return (
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-white/[0.015] border border-border p-3">
        <MetricCell
          label="Current"
          value={formatMetricValue(last_actual, alert_type)}
          valueClass={`${sev.text} font-bold`}
          subtle={formatMetricDelta(last_actual, last_threshold, alert_type)}
        />
        <MetricCell
          label="Threshold"
          value={formatMetricValue(last_threshold, alert_type)}
          valueClass="text-zinc-300 font-bold"
        />
      </div>
    )
  }

  // Single metric
  if (last_actual != null) {
    return (
      <div className="rounded-lg bg-white/[0.015] border border-border p-3">
        <MetricCell
          label="Current"
          value={formatMetricValue(last_actual, alert_type)}
          valueClass={`${sev.text} font-bold`}
        />
      </div>
    )
  }
  return null
}

function MetricCell({
  label,
  value,
  valueClass,
  subtle,
}: {
  label: string
  value: string
  valueClass?: string
  subtle?: string
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-1">
        {label}
      </div>
      <div className={`text-xl tabular-nums ${valueClass ?? 'text-zinc-200'}`}>
        {value}
      </div>
      {subtle && (
        <div className="text-[10px] text-zinc-500 mt-0.5">{subtle}</div>
      )}
    </div>
  )
}
