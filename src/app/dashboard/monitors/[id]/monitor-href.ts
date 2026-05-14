/** URL builders for monitor detail query tabs and performance views (shared by server page + client rail). */

export const TIMEFRAME_TOOLTIPS: Record<string, string> = {
  '1h': 'Last 1 hour — most recent activity',
  '4h': 'Last 4 hours — short-term trends',
  '24h': 'Last 24 hours — daily overview',
  '7d': 'Last 7 days — weekly patterns',
  '30d': 'Last 30 days — monthly overview',
  '90d': 'Last 90 days — quarterly view',
}

export type MonitorTab =
  | 'performance'
  | 'on-demand'
  | 'resilience'
  | 'security'
  | 'settings'
  | 'incidents'
  | 'alert-history'

export type PerformanceView = 'real-time' | 'performance' | 'trends' | 'patterns' | 'infrastructure'

export type AlertType =
  | 'down'
  | 'slow_timeout'
  | 'ttfb_limit'
  | 'ttfb_anomaly'
  | 'anycast'
  | 'cache_age_alert'
  | 'cache_hit_low'
  | 'cache_hit_trend_drop_region'
  | 'cache_hit_trend_drop_global'
  | 'ttfb_trend_up_region'
  | 'ttfb_trend_up_global'
  | 'ttfb_trend_down_region'
  | 'ttfb_trend_down_global'

export const VALID_ALERT_TYPES = [
  'down', 'slow_timeout', 'ttfb_limit', 'ttfb_anomaly', 'anycast', 'cache_age_alert', 'cache_hit_low',
  'cache_hit_trend_drop_region', 'cache_hit_trend_drop_global',
  'ttfb_trend_up_region', 'ttfb_trend_up_global',
  'ttfb_trend_down_region', 'ttfb_trend_down_global',
] as const satisfies readonly AlertType[]

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  down: 'Monitor Down',
  slow_timeout: 'Slow Response (Probe Timeout)',
  ttfb_limit: 'TTFB Above Limit',
  ttfb_anomaly: 'TTFB Anomaly',
  anycast: 'Anycast Issue',
  cache_hit_trend_drop_region: 'Cache Hit Drop (Region)',
  cache_hit_trend_drop_global: 'Cache Hit Drop (Global)',
  ttfb_trend_up_region: 'TTFB Worsening (Region)',
  ttfb_trend_up_global: 'TTFB Worsening (Global)',
  ttfb_trend_down_region: 'TTFB Improving (Region)',
  ttfb_trend_down_global: 'TTFB Improving (Global)',
  cache_age_alert: 'Cache Age Alert',
  cache_hit_low: 'Low Cache Hit Rate',
}

export function buildMonitorHref(
  tab: MonitorTab,
  range: string,
  alertType: AlertType | null = null,
  alertsLimit: number | null = null,
  hash: string = '',
  monitorId: string | null = null,
): string {
  const params = new URLSearchParams()
  params.set('tab', tab)
  if (range && range !== '24h') params.set('range', range)
  if (tab === 'alert-history' && alertType) params.set('alert_type', alertType)
  if (tab === 'alert-history' && alertsLimit && alertsLimit > 100) {
    params.set('alerts_limit', String(alertsLimit))
  }
  const query = params.toString()
  const base = query ? `?${query}` : ''
  const path = monitorId ? `/dashboard/monitors/${monitorId}` : ''
  const full = `${path}${base}`

  const finalHash = typeof hash === 'string' && hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''
  return `${full}${finalHash}`
}

/** Default range per Performance view — must match server-side resolution in monitor `page.tsx`. */
const VIEW_DEFAULT_RANGE: Record<PerformanceView, string> = {
  'real-time': '24h',
  performance: '24h',
  trends: '1h',
  patterns: '24h',
  infrastructure: '24h',
}

export function buildViewHref(view: PerformanceView, range: string, monitorId: string | null = null): string {
  const params = new URLSearchParams()
  params.set('tab', 'performance')
  params.set('view', view)
  const defaultRange = VIEW_DEFAULT_RANGE[view]
  if (range && range !== defaultRange) params.set('range', range)
  const query = params.toString()
  const path = monitorId ? `/dashboard/monitors/${monitorId}` : ''
  return `${path}?${query}`
}
