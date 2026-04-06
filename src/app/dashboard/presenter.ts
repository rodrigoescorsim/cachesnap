export interface MonitorSummary {
  id: string
  url: string
  name: string | null
  is_active: boolean
  ttfb_avg_ms: number | null
  ttfb_worst_ms: number | null
  error_count: number
  cache_hit_pct: number | null
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

export function primaryInsight(
  monitor: MonitorSummary,
  speed: MetricSummary,
  cache: MetricSummary,
  problems: MetricSummary,
) {
  if (!monitor.last_probe_at) return 'Estamos analisando este site agora.'
  if (monitor.error_count + monitor.alert_count > 0) return problems.helper
  if (speed.label === 'Muito lento' || speed.label === 'Lento') return speed.helper
  if (cache.label === 'Baixa') return cache.helper
  return 'Tudo está rodando bem para os visitantes.'
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
  if (state === 'paused') return 'Pausado'
  if (state === 'collecting') return 'Coletando dados'
  if (state === 'attention') return 'Precisa de atenção'
  if (state === 'improving') return 'Pode melhorar'
  return 'Funcionando normalmente'
}

export function speedSummary(monitor: MonitorSummary): MetricSummary {
  if (!monitor.last_probe_at || monitor.ttfb_avg_ms == null) {
    return {
      label: 'Coletando dados',
      detail: 'Aguardando medições',
      toneClass: 'text-zinc-500 dark:text-zinc-400',
      helper: 'Estamos analisando a velocidade.',
    }
  }

  if (monitor.ttfb_avg_ms < 200) {
    return {
      label: 'Rápido',
      detail: `${monitor.ttfb_avg_ms} ms`,
      toneClass: 'text-emerald-500',
      helper: 'Boa experiência para quem visita.',
    }
  }

  if (monitor.ttfb_avg_ms <= 800) {
    return {
      label: 'Normal',
      detail: `${monitor.ttfb_avg_ms} ms`,
      toneClass: 'text-emerald-500',
      helper: 'Estável para a maioria dos visitantes.',
    }
  }

  if (monitor.ttfb_avg_ms <= 1200) {
    return {
      label: 'Lento',
      detail: `${monitor.ttfb_avg_ms} ms`,
      toneClass: 'text-amber-500',
      helper: 'Alguns usuários podem perceber lentidão.',
    }
  }

  return {
    label: 'Muito lento',
    detail: `${monitor.ttfb_avg_ms} ms`,
    toneClass: 'text-red-500',
    helper: 'Usuários podem perceber lentidão.',
  }
}

export function cacheSummary(monitor: MonitorSummary): MetricSummary {
  if (!monitor.last_probe_at || monitor.cache_hit_pct == null) {
    return {
      label: 'Analisando',
      detail: 'Sem histórico suficiente',
      toneClass: 'text-zinc-500 dark:text-zinc-400',
      helper: 'Estamos medindo o uso de cache.',
    }
  }

  if (monitor.cache_hit_pct > 70) {
    return {
      label: 'Boa',
      detail: `${monitor.cache_hit_pct}%`,
      toneClass: 'text-emerald-500',
      helper: 'O cache está ajudando na velocidade.',
    }
  }

  if (monitor.cache_hit_pct >= 20) {
    return {
      label: 'Média',
      detail: `${monitor.cache_hit_pct}%`,
      toneClass: 'text-amber-500',
      helper: 'Ainda há espaço para acelerar mais.',
    }
  }

  return {
    label: 'Baixa',
    detail: `${monitor.cache_hit_pct}%`,
    toneClass: 'text-amber-500',
    helper: 'O site pode depender demais do servidor de origem.',
  }
}

export function problemsSummary(monitor: MonitorSummary): MetricSummary {
  const totalProblems = monitor.error_count + monitor.alert_count

  if (!monitor.last_probe_at) {
    return {
      label: 'Coletando dados',
      detail: 'Sem dados nas últimas 24h',
      toneClass: 'text-zinc-500 dark:text-zinc-400',
      helper: 'Estamos acompanhando possíveis falhas.',
    }
  }

  if (totalProblems === 0) {
    return {
      label: 'Nenhum nas últimas 24h',
      detail: 'Tudo normal',
      toneClass: 'text-emerald-500',
      helper: 'Sem impacto recente para visitantes.',
    }
  }

  if (totalProblems <= 3) {
    return {
      label: 'Poucos problemas',
      detail: `${totalProblems} ocorrência${totalProblems > 1 ? 's' : ''}`,
      toneClass: 'text-amber-500',
      helper: 'Vale revisar em breve.',
    }
  }

  return {
    label: 'Muitos problemas',
    detail: `${totalProblems} ocorrências`,
    toneClass: 'text-red-500',
    helper: 'Isso pode afetar usuários e conversões.',
  }
}

export function advisorNarrative(monitors: MonitorSummary[]): string | null {
  const active = monitors.filter(m => m.is_active && m.last_probe_at)
  if (active.length === 0) {
    if (monitors.length === 0) return null
    return 'Estamos começando a analisar seus sites monitorados.'
  }

  const withErrors = active.filter(m => m.error_count > 0)
  if (withErrors.length > 0) {
    return `${withErrors.length} site${withErrors.length > 1 ? 's' : ''} precisa${withErrors.length > 1 ? 'm' : ''} de atenção agora.`
  }

  const withAlerts = active.filter(m => m.alert_count > 0)
  if (withAlerts.length > 0) {
    return `${withAlerts.length} site${withAlerts.length > 1 ? 's' : ''} mostra${withAlerts.length > 1 ? 'm' : ''} sinais de lentidão ou instabilidade.`
  }

  const slow = active.filter(m => (m.ttfb_avg_ms ?? 0) > 800)
  if (slow.length > 0) {
    return 'Seus sites estão no ar, mas alguns já mostram lentidão perceptível.'
  }

  return 'Seu site está funcionando normalmente. Nenhum problema nas últimas 24 horas.'
}
