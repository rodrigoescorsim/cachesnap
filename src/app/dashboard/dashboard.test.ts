import { describe, expect, it } from 'vitest'
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
  cache_status: 'HIT',
  uptime_pct: 100,
  redirect_avg: 0,
  security_score: 5,
  last_probe_at: new Date(),
  alert_count: 0,
}

describe('statusLabel', () => {
  it('returns paused when inactive', () => {
    expect(statusLabel({ ...base, is_active: false })).toBe('Paused')
  })

  it('returns collecting data when no probes exist yet', () => {
    expect(statusLabel({ ...base, last_probe_at: null })).toBe('Collecting data')
  })

  it('returns needs attention when problems are present', () => {
    expect(statusLabel({ ...base, error_count: 1 })).toBe('Needs attention')
    expect(statusLabel({ ...base, alert_count: 2 })).toBe('Needs attention')
  })

  it('returns can improve for performance tuning cases', () => {
    expect(statusLabel({ ...base, ttfb_avg_ms: 950 })).toBe('Can improve')
    expect(statusLabel({ ...base, cache_hit_pct: 0 })).toBe('Can improve')
  })

  it('returns running normally when healthy', () => {
    expect(statusLabel(base)).toBe('Running normally')
  })
})

describe('advisorNarrative', () => {
  it('returns null when there are no monitors', () => {
    expect(advisorNarrative([])).toBeNull()
  })

  it('returns onboarding language when monitors have no data yet', () => {
    expect(advisorNarrative([{ ...base, is_active: false }])).toContain('Starting exploration')
    expect(advisorNarrative([{ ...base, last_probe_at: null }])).toContain('Starting exploration')
  })

  it('prioritizes errors over other signals', () => {
    const monitors = [
      { ...base, error_count: 2 },
      { ...base, id: '2', alert_count: 1 },
    ]
    expect(advisorNarrative(monitors)).toContain('need attention right now')
  })

  it('reports instability when alerts exist without errors', () => {
    const monitors = [{ ...base, alert_count: 1 }]
    expect(advisorNarrative(monitors)).toContain('signs of slowness or instability')
  })

  it('reports slowdown when monitors are slow', () => {
    const monitors = [
      { ...base, name: 'My API', ttfb_avg_ms: 1200 },
      { ...base, id: '2', ttfb_avg_ms: 900 },
    ]
    expect(advisorNarrative(monitors)).toContain('noticeable latency')
  })

  it('reports healthy state when everything is fine', () => {
    const monitors = [base, { ...base, id: '2' }]
    expect(advisorNarrative(monitors)).toContain('Everything is working normally')
  })
})

describe('speedSummary', () => {
  it('classifies speed ranges', () => {
    expect(speedSummary({ ...base, ttfb_avg_ms: 120 }).label).toBe('Fast')
    expect(speedSummary({ ...base, ttfb_avg_ms: 350 }).label).toBe('Normal')
    expect(speedSummary({ ...base, ttfb_avg_ms: 580 }).label).toBe('Normal')
    expect(speedSummary({ ...base, ttfb_avg_ms: 950 }).label).toBe('Slow')
    expect(speedSummary({ ...base, ttfb_avg_ms: 1400 }).label).toBe('Very slow')
  })

  it('shows collecting state when there is no data', () => {
    expect(speedSummary({ ...base, last_probe_at: null }).label).toBe('Collecting data')
  })
})

describe('cacheSummary', () => {
  it('keeps the cache label consistent', () => {
    expect(cacheSummary({ ...base, cache_hit_pct: 90 }).label).toBe('Cache hit rate')
    expect(cacheSummary({ ...base, cache_hit_pct: 45 }).label).toBe('Cache hit rate')
    expect(cacheSummary({ ...base, cache_hit_pct: 0, cache_status: 'DYNAMIC' }).label).toBe('Cache hit rate')
  })

  it('shows dynamic as the primary cache reading when the route is not cacheable', () => {
    const summary = cacheSummary({ ...base, cache_hit_pct: 0, cache_status: 'DYNAMIC' })
    expect(summary.detail).toBe('0%')
    expect(summary.helper).toBe('Dynamic')
    expect(summary.toneClass).toBe('text-zinc-500 dark:text-zinc-400')
  })

  it('uses red for clearly low cache hit rate', () => {
    expect(cacheSummary({ ...base, cache_hit_pct: 0, cache_status: 'MISS' }).toneClass).toBe('text-red-500')
  })
})

describe('problemsSummary', () => {
  it('classifies problem volume in human terms', () => {
    expect(problemsSummary({ ...base, alert_count: 0, error_count: 0 }).label).toBe('None in last 24h')
    expect(problemsSummary({ ...base, alert_count: 2, error_count: 0 }).label).toBe('Few issues')
    expect(problemsSummary({ ...base, alert_count: 3, error_count: 2 }).label).toBe('Many issues')
  })
})
