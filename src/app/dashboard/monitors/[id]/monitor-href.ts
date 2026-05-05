/** URL builders for monitor detail query tabs and performance views (shared by server page + client rail). */

export type MonitorTab =
  | 'performance'
  | 'on-demand'
  | 'resilience'
  | 'security'
  | 'settings'
  | 'incidents'

export type PerformanceView = 'real-time' | 'performance' | 'trends' | 'patterns' | 'infrastructure'

export type AlertType =
  | 'down'
  | 'anomaly'
  | 'anycast'
  | 'zombie_cache'
  | 'cache_hit_low'
  | 'cache_hit_trend_drop_region'
  | 'cache_hit_trend_drop_global'
  | 'ttfb_trend_up_region'
  | 'ttfb_trend_up_global'
  | 'ttfb_trend_down_region'
  | 'ttfb_trend_down_global'

export function buildMonitorHref(
  tab: MonitorTab,
  range: string,
  alertType: AlertType | null = null,
  hash: string = '',
  monitorId: string | null = null,
): string {
  const params = new URLSearchParams()
  params.set('tab', tab)
  if (range && range !== '24h') params.set('range', range)
  if (tab === 'incidents' && alertType) params.set('alert_type', alertType)
  const query = params.toString()
  const base = query ? `?${query}` : ''
  const path = monitorId ? `/dashboard/monitors/${monitorId}` : ''
  const full = `${path}${base}`
  return hash ? `${full}${hash.startsWith('#') ? hash : `#${hash}`}` : full
}

export function buildViewHref(view: PerformanceView, range: string, monitorId: string | null = null): string {
  const params = new URLSearchParams()
  params.set('tab', 'performance')
  params.set('view', view)
  if (range && range !== '24h') params.set('range', range)
  const query = params.toString()
  const path = monitorId ? `/dashboard/monitors/${monitorId}` : ''
  return `${path}?${query}`
}
