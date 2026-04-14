/** URL builders for monitor detail query tabs and performance views (shared by server page + client rail). */

export type MonitorTab =
  | 'performance'
  | 'on-demand'
  | 'resilience'
  | 'security'
  | 'settings'
  | 'incidents'

export type PerformanceView = 'real-time' | 'trends' | 'diagnostics' | 'infrastructure'

export type AlertType = 'down' | 'anomaly' | 'anycast' | 'zombie_cache'

export function buildMonitorHref(
  tab: MonitorTab,
  range: string,
  alertType: AlertType | null = null,
  hash: string = '',
): string {
  const params = new URLSearchParams()
  params.set('tab', tab)
  if (range === '7d') params.set('range', '7d')
  if (tab === 'incidents' && alertType) params.set('alert_type', alertType)
  const query = params.toString()
  const base = query ? `?${query}` : '?'
  return hash ? `${base}${hash.startsWith('#') ? hash : `#${hash}`}` : base
}

export function buildViewHref(view: PerformanceView, range: string): string {
  const params = new URLSearchParams()
  params.set('tab', 'performance')
  params.set('view', view)
  if (range === '7d') params.set('range', '7d')
  const query = params.toString()
  return query ? `?${query}` : '?'
}
