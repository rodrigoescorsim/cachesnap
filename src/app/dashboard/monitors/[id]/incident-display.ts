// Shared helpers for the Incidents tab (Active Incidents panel + Alert History).
// Mirrors the copy produced by the backend notifier (api/src/alerts/notifier.rs +
// api/src/alerts/severity.rs) so the dashboard and the email tell the same story.

export type IncidentStatus = 'new' | 'ongoing' | 'snoozed'

/** Inline region chips before "+N more" — mirrors `format_region_summary` in notifier.rs. */
export const REGION_SUMMARY_PILL_LIMIT = 4

export const ALERT_TYPE_DISPLAY: Record<string, string> = {
  down: 'Monitor Down',
  ttfb_limit: 'TTFB Above Limit',
  ttfb_anomaly: 'TTFB Anomaly',
  cache_hit_low: 'Low Cache Hit Rate',
  ssl_expiry: 'SSL Expiry Alert',
  cache_age_alert: 'Cache Age Alert',
  anycast: 'Anycast Issue',
  cache_hit_trend_drop_region: 'Cache Hit Drop (Region)',
  cache_hit_trend_drop_global: 'Cache Hit Drop (Global)',
  ttfb_trend_up_region: 'TTFB Worsening (Region)',
  ttfb_trend_up_global: 'TTFB Worsening (Global)',
  ttfb_trend_down_region: 'TTFB Improving (Region)',
  ttfb_trend_down_global: 'TTFB Improving (Global)',
}

export function alertTypeDisplay(alertType: string): string {
  return ALERT_TYPE_DISPLAY[alertType] ?? 'Unknown Alert'
}

export const SEVERITY_STYLES: Record<string, { badge: string; text: string; ring: string }> = {
  critical: {
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    text: 'text-red-400',
    ring: 'ring-red-500/30',
  },
  high: {
    badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    text: 'text-orange-400',
    ring: 'ring-orange-500/30',
  },
  medium: {
    badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    text: 'text-amber-400',
    ring: 'ring-amber-500/30',
  },
  low: {
    badge: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
    text: 'text-zinc-400',
    ring: 'ring-zinc-500/30',
  },
}

/** Maps alert_type slug to severity tier — mirrors api/src/alerts/severity.rs::alert_severity. */
export function alertTypeSeverity(alertType: string): 'critical' | 'high' | 'medium' | 'low' {
  if (alertType === 'down') return 'critical'
  if (alertType === 'ttfb_limit' || alertType === 'ttfb_anomaly') return 'high'
  if (
    alertType === 'cache_hit_low' ||
    alertType === 'cache_hit_trend_drop_region' ||
    alertType === 'cache_hit_trend_drop_global'
  ) {
    return 'medium'
  }
  return 'low'
}

/** Human-friendly impact label + sentence — mirrors notifier.rs::severity_context. */
export function severityContext(
  alertType: string,
): { label: string; note: string } {
  switch (alertTypeSeverity(alertType)) {
    case 'critical':
      return { label: 'Critical impact', note: 'Service is unavailable or failing.' }
    case 'high':
      return { label: 'High impact', note: 'Users may see a noticeable performance issue.' }
    case 'medium':
      return {
        label: 'Medium impact',
        note: 'Needs attention, but the monitor is still reachable.',
      }
    default:
      return { label: 'Low impact', note: 'Worth tracking, but not urgent.' }
  }
}

export function isCacheHitTrendDrop(alertType: string): boolean {
  return (
    alertType === 'cache_hit_trend_drop_region' ||
    alertType === 'cache_hit_trend_drop_global'
  )
}

export function isCacheMetric(alertType: string): boolean {
  return alertType.includes('cache_hit')
}

export function metricUnit(alertType: string): string {
  return isCacheMetric(alertType) ? '%' : 'ms'
}

export function formatMetricDelta(
  actual: number,
  threshold: number,
  alertType: string,
): string {
  const diff = actual - threshold
  const absDiff = Math.abs(diff)

  if (isCacheHitTrendDrop(alertType)) {
    if (diff < 0) return `${absDiff.toFixed(1)} pp below reference`
    return `${absDiff.toFixed(1)} pp above reference`
  }
  if (isCacheMetric(alertType)) {
    if (diff < 0) return `${absDiff.toFixed(1)}% below target`
    return `${absDiff.toFixed(1)}% above target`
  }
  if (diff > 0) return `${Math.round(absDiff)}ms above limit`
  return `${Math.round(absDiff)}ms below limit`
}

export function formatMetricValue(value: number, alertType: string): string {
  if (isCacheMetric(alertType)) return `${value.toFixed(1)}%`
  return `${Math.round(value)}ms`
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const totalHours = Math.floor(ms / 3600000)
  const totalDays = Math.floor(ms / 86400000)
  if (totalDays >= 2) return `${totalDays} days`
  if (totalDays === 1) return '1 day'
  if (totalHours >= 2) return `${totalHours} hours`
  if (totalHours === 1) return '1 hour'
  if (totalMinutes === 1) return '1 minute'
  return `${Math.max(0, totalMinutes)} minutes`
}

/** Mirrors notifier.rs::comparator_display for the metrics block. */
export function comparatorDisplay(comparator: string | null | undefined): string {
  switch (comparator) {
    case 'prev_hour':
      return 'previous hour'
    case 'same_hour_prev_day':
      return 'same time yesterday'
    case 'day_avg':
      return '24h average'
    case null:
    case undefined:
    case '':
      return 'reference'
    default:
      return comparator
  }
}

/**
 * Status label that mirrors notifier.rs header copy:
 *   FirstFire → "New Alert"
 *   Digest    → "Still Ongoing"
 * The notifier sends a Digest only after the cooldown elapses; we infer that
 * from notification_count (>1 means at least one digest was sent).
 */
export function incidentStatus(
  notificationCount: number,
  snoozedUntil: Date | string | null,
): { kind: IncidentStatus; label: string } {
  if (snoozedUntil && new Date(snoozedUntil) > new Date()) {
    return { kind: 'snoozed', label: 'Snoozed' }
  }
  if (notificationCount <= 1) return { kind: 'new', label: 'New Alert' }
  return { kind: 'ongoing', label: 'Still Ongoing' }
}

/** Format an absolute timestamp for the incident card footer. */
export function formatTimestamp(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
