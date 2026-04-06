import { describe, it, expect } from 'vitest'
import {
  advisorNarrative,
  cacheSummary,
  problemsSummary,
  speedSummary,
  statusLabel,
  type MonitorSummary,
} from './presenter'

const base: MonitorSummary = {
  id: '1',
  url: 'https://example.com',
  name: null,
  is_active: true,
  ttfb_avg_ms: 200,
  ttfb_worst_ms: 300,
  error_count: 0,
  cache_hit_pct: 90,
  last_probe_at: new Date(),
  alert_count: 0,
}

describe('statusLabel', () => {
  it('returns Pausado when inactive', () => {
    expect(statusLabel({ ...base, is_active: false })).toBe('Pausado')
  })

  it('returns Coletando dados when no probes yet', () => {
    expect(statusLabel({ ...base, last_probe_at: null })).toBe('Coletando dados')
  })

  it('returns Precisa de atenção when there are problems', () => {
    expect(statusLabel({ ...base, error_count: 1 })).toBe('Precisa de atenção')
    expect(statusLabel({ ...base, alert_count: 2 })).toBe('Precisa de atenção')
  })

  it('returns Pode melhorar when there are no incidents but performance needs tuning', () => {
    expect(statusLabel({ ...base, ttfb_avg_ms: 950 })).toBe('Pode melhorar')
    expect(statusLabel({ ...base, cache_hit_pct: 0 })).toBe('Pode melhorar')
  })

  it('returns Funcionando normalmente when all good', () => {
    expect(statusLabel(base)).toBe('Funcionando normalmente')
  })
})

describe('advisorNarrative', () => {
  it('returns null when there are no monitors', () => {
    expect(advisorNarrative([])).toBeNull()
  })

  it('returns onboarding message when there are monitors but no data yet', () => {
    expect(advisorNarrative([{ ...base, is_active: false }])).toContain('analisar')
    expect(advisorNarrative([{ ...base, last_probe_at: null }])).toContain('analisar')
  })

  it('reports errors first', () => {
    const monitors = [
      { ...base, error_count: 2 },
      { ...base, id: '2', alert_count: 1 },
    ]
    expect(advisorNarrative(monitors)).toContain('precisa de atenção')
  })

  it('reports alerts when no errors', () => {
    const monitors = [{ ...base, alert_count: 1 }]
    expect(advisorNarrative(monitors)).toContain('sinais de lentidão')
  })

  it('reports slowdown when monitors are slow', () => {
    const monitors = [
      { ...base, name: 'My API', ttfb_avg_ms: 1200 },
      { ...base, id: '2', ttfb_avg_ms: 900 },
    ]
    expect(advisorNarrative(monitors)).toContain('lentidão perceptível')
  })

  it('reports healthy when all monitors are fine', () => {
    const monitors = [base, { ...base, id: '2' }]
    expect(advisorNarrative(monitors)).toContain('funcionando normalmente')
  })
})

describe('speedSummary', () => {
  it('classifies speed ranges in human terms', () => {
    expect(speedSummary({ ...base, ttfb_avg_ms: 120 }).label).toBe('Rápido')
    expect(speedSummary({ ...base, ttfb_avg_ms: 350 }).label).toBe('Normal')
    expect(speedSummary({ ...base, ttfb_avg_ms: 580 }).label).toBe('Normal')
    expect(speedSummary({ ...base, ttfb_avg_ms: 950 }).label).toBe('Lento')
    expect(speedSummary({ ...base, ttfb_avg_ms: 1400 }).label).toBe('Muito lento')
  })

  it('shows collecting state when there is no data', () => {
    expect(speedSummary({ ...base, last_probe_at: null }).label).toBe('Coletando dados')
  })
})

describe('cacheSummary', () => {
  it('classifies cache ranges in human terms', () => {
    expect(cacheSummary({ ...base, cache_hit_pct: 90 }).label).toBe('Boa')
    expect(cacheSummary({ ...base, cache_hit_pct: 45 }).label).toBe('Média')
    expect(cacheSummary({ ...base, cache_hit_pct: 0 }).label).toBe('Baixa')
  })

  it('uses red for clearly low cache usage', () => {
    expect(cacheSummary({ ...base, cache_hit_pct: 0 }).toneClass).toBe('text-red-500')
  })
})

describe('problemsSummary', () => {
  it('classifies problem volume in human terms', () => {
    expect(problemsSummary({ ...base, alert_count: 0, error_count: 0 }).label).toBe('Nenhum nas últimas 24h')
    expect(problemsSummary({ ...base, alert_count: 2, error_count: 0 }).label).toBe('Poucos problemas')
    expect(problemsSummary({ ...base, alert_count: 3, error_count: 2 }).label).toBe('Muitos problemas')
  })
})
