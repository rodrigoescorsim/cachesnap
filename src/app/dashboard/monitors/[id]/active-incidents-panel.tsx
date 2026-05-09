import Link from 'next/link'
import { Clock, MapPin, ArrowRight } from 'lucide-react'
import { LiveDot } from '@/components/dashboard/dashboard-ui'

export interface ActiveIncident {
  id: string
  alert_type: string
  severity: string
  affected_regions: string[]
  opened_at: Date | string
  last_notified_at: Date | string | null
  notification_count: number
  snoozed_until: Date | string | null
  last_actual: number | null
  last_threshold: number | null
  duration_ms: number
}

interface ActiveIncidentsPanelProps {
  monitorId: string
  incidents: ActiveIncident[]
  regionLabels?: Record<string, string>
}

const ALERT_TYPE_DISPLAY: Record<string, string> = {
  down: 'Monitor Offline',
  ttfb_threshold: 'TTFB Threshold Exceeded',
  anomaly: 'Latency Anomaly',
  cache_hit_low: 'Cache Hit Rate Low',
  ssl_expiry: 'SSL Certificate Expiring',
  zombie_cache: 'Zombie Cache Detected',
  anycast: 'Anycast Routing Issue',
  cache_hit_trend_drop_region: 'Cache Hit Trend Drop (Region)',
  cache_hit_trend_drop_global: 'Cache Hit Trend Drop (Global)',
  ttfb_trend_up_region: 'TTFB Trend Worsening (Region)',
  ttfb_trend_up_global: 'TTFB Trend Worsening (Global)',
  ttfb_trend_down_region: 'TTFB Improved (Region)',
  ttfb_trend_down_global: 'TTFB Improved (Global)',
}

const SEVERITY_STYLES: Record<string, { badge: string; text: string }> = {
  critical: {
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    text: 'text-red-400',
  },
  high: {
    badge: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    text: 'text-orange-400',
  },
  medium: {
    badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    text: 'text-amber-400',
  },
  low: {
    badge: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
    text: 'text-zinc-400',
  },
}

export function alertTypeDisplay(alertType: string): string {
  return ALERT_TYPE_DISPLAY[alertType] ?? 'Unknown Alert'
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

function isCacheMetric(alertType: string): boolean {
  return alertType.includes('cache_hit')
}

export function formatMetricDelta(actual: number, threshold: number, alertType: string): string {
  const diff = actual - threshold
  if (isCacheMetric(alertType)) {
    const sign = diff >= 0 ? '+' : '−'
    return `${sign}${Math.abs(diff).toFixed(1)}pp vs threshold`
  }
  const sign = diff >= 0 ? '+' : '−'
  return `${sign}${Math.abs(Math.round(diff))}ms vs threshold`
}

function formatMetricValue(value: number, alertType: string): string {
  if (isCacheMetric(alertType)) return `${value.toFixed(1)}%`
  return `${Math.round(value)}ms`
}

function getActionTab(alertType: string): string {
  if (alertType === 'down' || alertType === 'offline') return 'live'
  if (alertType.includes('cache_hit')) return 'trends'
  if (alertType === 'anomaly' || alertType === 'zombie_cache' || alertType === 'anycast') return 'patterns'
  return 'performance'
}

export function ActiveIncidentsPanel({ monitorId, incidents, regionLabels = {} }: ActiveIncidentsPanelProps) {
  if (incidents.length === 0) return null

  return (
    <section aria-labelledby="active-incidents-heading" className="space-y-3">
      <div className="flex items-center gap-2 mb-4 px-1">
        <h2 id="active-incidents-heading" className="cs-view-section-title flex items-center gap-2">
          <LiveDot colorClass="bg-amber-500" />
          Active Incidents
        </h2>
        <span className="inline-flex h-5 items-center rounded-full bg-amber-500/10 px-2 text-[10px] font-bold text-amber-400 border border-amber-500/20">
          {incidents.length}
        </span>
      </div>

      <div className="space-y-3">
        {incidents.map(incident => {
          const sev = SEVERITY_STYLES[incident.severity] ?? SEVERITY_STYLES.low
          const display = alertTypeDisplay(incident.alert_type)
          const duration = formatDuration(incident.duration_ms)
          const isSnoozed =
            incident.snoozed_until != null &&
            new Date(incident.snoozed_until) > new Date()

          return (
            <article
              key={incident.id}
              className="rounded-xl bg-surface border border-border p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${sev.badge}`}
                    aria-label={`Severity: ${incident.severity}`}
                  >
                    {incident.severity}
                  </span>
                  <span className="text-sm font-semibold text-zinc-200 truncate">{display}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {incident.affected_regions.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-zinc-500 shrink-0" aria-hidden />
                      {incident.affected_regions.map(r => (
                        <span
                          key={r}
                          className="inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-300"
                        >
                          {regionLabels[r] ?? r}
                        </span>
                      ))}
                    </div>
                  )}
                  {isSnoozed && (
                    <span className="shrink-0 inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-[9px] font-bold text-zinc-400 border border-zinc-500/20 uppercase tracking-widest">
                      Snoozed
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0" aria-hidden />
                  Active for {duration}
                </span>

                {incident.notification_count > 0 && (
                  <span className="text-zinc-500">
                    {incident.notification_count} notification{incident.notification_count !== 1 ? 's' : ''} sent
                  </span>
                )}
              </div>


              <div className="flex items-center justify-between gap-4 mt-2">
                {incident.last_actual != null ? (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-zinc-400">
                      Current:{' '}
                      <span className={`font-semibold ${sev.text}`}>
                        {formatMetricValue(incident.last_actual, incident.alert_type)}
                      </span>
                    </span>
                    {incident.last_threshold != null && (
                      <>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-500">
                          Threshold: {formatMetricValue(incident.last_threshold, incident.alert_type)}
                        </span>
                        <span className={`font-medium ${sev.text}`}>
                          ({formatMetricDelta(incident.last_actual, incident.last_threshold, incident.alert_type)})
                        </span>
                      </>
                    )}
                  </div>
                ) : <div />}

                <Link
                  href={`/dashboard/monitors/${monitorId}?tab=${getActionTab(incident.alert_type)}`}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Analyze
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
