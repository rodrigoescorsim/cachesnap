export interface MonitorSummary {
  id: string
  url: string
  name: string | null
  is_active: boolean
  ttfb_avg_ms: number | null
  ttfb_worst_ms: number | null
  error_count: number
  cache_hit_pct: number | null
  cache_status: string | null
  uptime_pct: number | null
  redirect_avg: number | null
  security_score: number | null
  last_probe_at: Date | null
  alert_count: number
}

interface MetricSummary {
  label: string
  detail: string
  toneClass: string
  helper: string
}

type SiteState = 'paused' | 'collecting' | 'attention' | 'improving' | 'healthy'

function evaluateSiteState(monitor: MonitorSummary): SiteState {
  if (!monitor.is_active) return 'paused'
  if (!monitor.last_probe_at) return 'collecting'

  const totalProblems = monitor.error_count + monitor.alert_count
  if (totalProblems > 0) return 'attention'
  if ((monitor.ttfb_avg_ms ?? 0) > 800) return 'improving'
  if (monitor.cache_hit_pct != null && monitor.cache_hit_pct < 20) return 'improving'

  return 'healthy'
}

export function statusColor(monitor: MonitorSummary) {
  const state = evaluateSiteState(monitor)
  if (state === 'paused') return 'text-zinc-400'
  if (state === 'collecting') return 'text-amber-500'
  if (state === 'attention') return 'text-red-500'
  if (state === 'improving') return 'text-amber-500'
  return 'text-emerald-500'
}

export function statusLabel(monitor: MonitorSummary) {
  const state = evaluateSiteState(monitor)
  if (state === 'paused') return 'Paused'
  if (state === 'collecting') return 'Collecting data'
  if (state === 'attention') return 'Needs attention'
  if (state === 'improving') return 'Can improve'
  return 'Running normally'
}

export function speedSummary(monitor: MonitorSummary): MetricSummary {
  if (!monitor.last_probe_at || monitor.ttfb_avg_ms == null) {
    return {
      label: 'Speed',
      detail: '—',
      toneClass: 'text-zinc-500 dark:text-zinc-400',
      helper: 'Collecting data',
    }
  }

  if (monitor.ttfb_avg_ms < 200) {
    return {
      label: 'Fast',
      detail: `${monitor.ttfb_avg_ms} ms`,
      toneClass: 'text-emerald-500',
      helper: 'Great experience for visitors.',
    }
  }

  if (monitor.ttfb_avg_ms <= 800) {
    return {
      label: 'Normal',
      detail: `${monitor.ttfb_avg_ms} ms`,
      toneClass: 'text-emerald-500',
      helper: 'Stable for most visitors.',
    }
  }

  if (monitor.ttfb_avg_ms <= 1200) {
    return {
      label: 'Slow',
      detail: `${monitor.ttfb_avg_ms} ms`,
      toneClass: 'text-amber-500',
      helper: 'Some users might notice slowness.',
    }
  }

  return {
    label: 'Very slow',
    detail: `${monitor.ttfb_avg_ms} ms`,
    toneClass: 'text-red-500',
    helper: 'Users may experience significant delays.',
  }
}

export function cacheSummary(monitor: MonitorSummary): MetricSummary {
  if (!monitor.last_probe_at || monitor.cache_hit_pct == null) {
    return {
      label: 'Cache hit rate',
      detail: '—',
      toneClass: 'text-zinc-500 dark:text-zinc-400',
      helper: 'Collecting data',
    }
  }

  const cacheStatus = monitor.cache_status?.toUpperCase() ?? null
  const isDynamic = cacheStatus === 'DYNAMIC' || cacheStatus === 'BYPASS'

  if (isDynamic) {
    return {
      label: 'Cache hit rate',
      detail: '0%',
      toneClass: 'text-zinc-500 dark:text-zinc-400',
      helper: 'Dynamic',
    }
  }

  if (monitor.cache_hit_pct > 70) {
    return {
      label: 'Cache hit rate',
      detail: `${monitor.cache_hit_pct}%`,
      toneClass: 'text-emerald-500',
      helper: 'Cache is helping speed up requests.',
    }
  }

  if (monitor.cache_hit_pct >= 30) {
    return {
      label: 'Cache hit rate',
      detail: `${monitor.cache_hit_pct}%`,
      toneClass: 'text-amber-500',
      helper: 'Room for further optimization.',
    }
  }

  return {
    label: 'Cache hit rate',
    detail: `${monitor.cache_hit_pct}%`,
    toneClass: 'text-red-500',
    helper: 'Heavily dependent on origin server.',
  }
}

export function problemsSummary(monitor: MonitorSummary): MetricSummary {
  const totalProblems = monitor.error_count + monitor.alert_count

  if (!monitor.last_probe_at) {
    return {
      label: 'Issues',
      detail: '—',
      toneClass: 'text-zinc-500 dark:text-zinc-400',
      helper: 'Collecting data',
    }
  }

  if (totalProblems === 0) {
    return {
      label: 'None in last 24h',
      detail: 'All normal',
      toneClass: 'text-emerald-500',
      helper: 'No recent impact for visitors.',
    }
  }

  if (totalProblems <= 3) {
    return {
      label: 'Few issues',
      detail: `${totalProblems} incident${totalProblems > 1 ? 's' : ''}`,
      toneClass: 'text-amber-500',
      helper: 'Review recommended.',
    }
  }

  return {
    label: 'Many issues',
    detail: `${totalProblems} incidents`,
    toneClass: 'text-amber-500',
    helper: 'Review recommended.',
  }
}

export function advisorNarrative(monitors: MonitorSummary[]): string | null {
  const active = monitors.filter(m => m.is_active && m.last_probe_at)
  if (active.length === 0) {
    if (monitors.length === 0) return null
    return 'Starting exploration for your monitored sites.'
  }

  const withErrors = active.filter(m => m.error_count > 0)
  if (withErrors.length > 0) {
    return `${withErrors.length} site${withErrors.length > 1 ? 's' : ''} need${withErrors.length > 1 ? '' : 's'} attention right now.`
  }

  const withAlerts = active.filter(m => m.alert_count > 0)
  if (withAlerts.length > 0) {
    return `${withAlerts.length} site${withAlerts.length > 1 ? 's' : ''} have active issues.`
  }

  const slow = active.filter(m => (m.ttfb_avg_ms ?? 0) > 800)
  if (slow.length > 0) {
    return 'Your sites are up, but some have noticeable latency.'
  }

  return 'Everything is working normally. No issues in the last 24 hours.'
}
