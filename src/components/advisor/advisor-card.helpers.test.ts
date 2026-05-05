import { describe, it, expect } from 'vitest'
import {
  derivePortfolioAdvisor,
  deriveMonitorDetailLiveAdvisor,
  deriveMonitorPerformancePeriodAdvisor,
} from './advisor-card.helpers'
import type { Monitor } from '@/types/monitor'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id:                'mon_test',
    name:              'example.com',
    url:               'https://example.com',
    status:            'active',
    ttfbCurrent:       100,
    ttfbCurrentDelta:  0,
    ttfbAvg24h:        100,
    ttfbSparkline:     [100, 105, 95, 110],
    cacheHitCurrent:   90,
    cacheHitAvg24h:    88,
    cacheHitDelta:     2,
    cacheStatusCurrent: 'HIT',
    regions:           [],
    slowRegionCount:   0,
    totalRegionCount:  4,
    errorRegionCount:  0,
    error5xxCount:     0,
    error4xxCount:     0,
    isWafBlocked:      false,
    uptime24h:         100,
    lastCheckedAt:     new Date(),
    ...overrides,
  }
}

function makePortfolio(count = 4, overrides: Partial<Monitor> = {}): Monitor[] {
  return Array.from({ length: count }, (_, i) =>
    makeMonitor({ id: `mon_${i}`, url: `https://site${i}.com`, name: `site${i}.com`, ...overrides }),
  )
}

function makeLiveInput(overrides: Partial<Parameters<typeof deriveMonitorDetailLiveAdvisor>[0]> = {}) {
  return {
    monitorId: 'mon_test',
    url: 'https://example.com',
    liveAvgTtfb: 100,
    periodAvgTtfb: 100,
    liveGlobalHitRate: 90,
    hasLiveCacheData: true,
    liveDominantStatus: 'HIT',
    liveAvgEdgeMs: 50,
    liveAvgOriginMs: 50,
    errorRegionCount: 0,
    slowRegionCount: 0,
    totalRegionCount: 4,
    ttfbVsPeriodPct: 0,
    ...overrides,
  }
}

describe('deriveMonitorDetailLiveAdvisor - Resolution Logic', () => {
  it('recommends origin optimization when origin latency is dominant', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 900,
      liveAvgOriginMs: 800,
      liveAvgEdgeMs: 100
    }))
    expect(result?.recommendation).toContain('Origin latency is dominant')
  })

  it('recommends edge check when network/TLS is slow', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 900,
      liveAvgOriginMs: 100,
      liveAvgEdgeMs: 800
    }))
    expect(result?.recommendation).toContain('Edge latency is elevated')
  })

  it('provides specific advice for DYNAMIC cache status', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveGlobalHitRate: 10,
      liveDominantStatus: 'DYNAMIC'
    }))
    expect(result?.recommendation).toContain('marked as DYNAMIC')
  })

  it('provides specific advice for BYPASS cache status', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveGlobalHitRate: 10,
      liveDominantStatus: 'BYPASS'
    }))
    expect(result?.recommendation).toContain('Cache is being bypassed')
  })
})

// ─── derivePortfolioAdvisor ───────────────────────────────────────────────────

describe('derivePortfolioAdvisor', () => {
  it('returns null when fewer than 3 active monitors', () => {
    expect(derivePortfolioAdvisor(makePortfolio(2))).toBeNull()
  })

  it('returns null when fewer than 3 active monitors due to paused', () => {
    const monitors = [
      makeMonitor({ id: 'a', status: 'active' }),
      makeMonitor({ id: 'b', status: 'active' }),
      makeMonitor({ id: 'c', status: 'paused' }),
      makeMonitor({ id: 'd', status: 'paused' }),
    ]
    expect(derivePortfolioAdvisor(monitors)).toBeNull()
  })

  it('returns good state when all monitors are healthy', () => {
    const result = derivePortfolioAdvisor(makePortfolio(5))
    expect(result?.severity).toBe('good')
    expect(result?.headline).toContain('healthy')
    expect(result?.actions).toHaveLength(0)
  })

  it('returns critical when at least one monitor is fully down', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', url: 'https://down.com', errorRegionCount: 4, totalRegionCount: 4 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toContain('DOWN')
  })

  it('critical headline counts multiple DOWN monitors', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', errorRegionCount: 4, totalRegionCount: 4 }),
      makeMonitor({ id: 'down_2', errorRegionCount: 4, totalRegionCount: 4 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.headline).toContain('2 monitors DOWN')
  })

  it('critical body includes region count', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', url: 'https://down.com', errorRegionCount: 4, totalRegionCount: 4 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.body).toContain('4 regions')
  })

  it('critical headline includes issue count suffix', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'm1', errorRegionCount: 4, totalRegionCount: 4 }),
      makeMonitor({ id: 'm2', ttfbCurrent: 900 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.headline).toContain('1 monitor DOWN • 2 issues in total')
  })

  it('critical headline includes issue count when present', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', errorRegionCount: 4, totalRegionCount: 4 }),
      makeMonitor({ id: 'deg_1', ttfbCurrent: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.headline).toContain('2 issues in total')
    expect(result?.actions.some(a => a.label.startsWith('Degraded Monitors'))).toBe(true)
  })

  it('critical action label for down monitors uses "Monitors DOWN"', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', errorRegionCount: 4, totalRegionCount: 4 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.actions.some(a => a.label.startsWith('Monitors DOWN'))).toBe(true)
  })

  it('returns critical when origin reports 5xx errors (AD14)', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'err_1', error5xxCount: 1 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toContain('Origin Health')
    expect(result?.body).toContain('5xx errors')
  })

  it('returns warning when degraded monitors exist', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'slow_1', url: 'https://slow.com', ttfbCurrent: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('degraded')
  })

  it('warning body includes TTFB value', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'slow_1', url: 'https://slow.com', ttfbCurrent: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.body).toContain('600ms')
  })

  it('warning body includes cache hit when low', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'slow_1', ttfbCurrent: 600, cacheHitCurrent: 30, cacheStatusCurrent: 'MISS' }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.body).toContain('30% cache hit')
  })

  it('returns warning when monitors have no cache headers', () => {
    const monitors = makePortfolio(4, { cacheStatusCurrent: null, cacheHitCurrent: null })
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('cache headers')
  })

  it('returns at most 3 actions', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', errorRegionCount: 4, totalRegionCount: 4 }),
      makeMonitor({ id: 'deg_1', ttfbCurrent: 600 }),
      makeMonitor({ id: 'nc_1', cacheStatusCurrent: null, cacheHitCurrent: null }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.actions.length).toBeLessThanOrEqual(3)
  })

  it('returns warning when monitors have origin 4xx errors', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'err_1', error4xxCount: 1 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('origin errors')
    expect(result?.body).toContain('4xx status codes')
  })

  it('warning actions includes "Degraded Monitors"', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'deg_1', ttfbCurrent: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.actions.some(a => a.label.startsWith('Degraded Monitors'))).toBe(true)
  })

  it('warning actions includes "Missing Cache Headers" when relevant', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'm1', cacheStatusCurrent: null }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.actions.some(a => a.label.startsWith('Missing Cache Headers'))).toBe(true)
  })

  it('good state body includes avg TTFB', () => {
    const monitors = makePortfolio(4, { ttfbCurrent: 120 })
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.body).toContain('120ms')
  })
})

// ─── deriveMonitorDetailLiveAdvisor ──────────────────────────────────────────

describe('deriveMonitorDetailLiveAdvisor', () => {
  it('returns null for a healthy monitor', () => {
    expect(deriveMonitorDetailLiveAdvisor(makeLiveInput())).toBeNull()
  })

  it('returns null when all regions are down (caller shows isDown banner)', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ errorRegionCount: 4, totalRegionCount: 4 }))
    expect(result).toBeNull()
  })

  it('returns null for partial outage (caller shows isDegraded banner)', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ errorRegionCount: 2, totalRegionCount: 4 }))
    expect(result).toBeNull()
  })

  it('returns critical for TTFB above SLOW threshold', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveAvgTtfb: 900 }))
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toContain('900ms')
  })

  it('critical body includes threshold and current value', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveAvgTtfb: 900 }))
    expect(result?.body).toContain('900ms')
    expect(result?.body).toContain('800ms threshold')
  })

  it('critical body includes period avg when trending worse', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 900, periodAvgTtfb: 600, ttfbVsPeriodPct: 50,
    }))
    expect(result?.body).toContain('~600ms')
    expect(result?.body).toContain('+50%')
  })

  it('critical actions use "Audit example.com Edge" and "View example.com Breakdown"', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveAvgTtfb: 900 }))
    expect(result?.actions.map(a => a.label)).toContain('Audit example.com Edge')
    expect(result?.actions.map(a => a.label)).toContain('View example.com Breakdown')
  })

  it('returns warning for elevated TTFB + worsening trend', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 500, periodAvgTtfb: 380, ttfbVsPeriodPct: 32,
    }))
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('TTFB up')
    expect(result?.body).toContain('~380ms')
  })

  it('does not warn on elevated TTFB without significant trend', () => {
    expect(deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveAvgTtfb: 500, ttfbVsPeriodPct: 5 }))).toBeNull()
  })

  it('returns critical for very low cache hit', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveGlobalHitRate: 20 }))
    expect(result?.severity).toBe('critical')
  })

  it('low cache hit headline includes the percentage', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveGlobalHitRate: 35 }))
    expect(result?.headline).toContain('35%')
    expect(result?.headline).toContain('Low cache hit')
  })

  it('low cache hit body includes origin percentage', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveGlobalHitRate: 35 }))
    expect(result?.body).toContain('65%')
  })

  it('ignores cache hit when no cache data', () => {
    expect(deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveGlobalHitRate: 0, hasLiveCacheData: false }))).toBeNull()
  })

  it('returns warning for slow regions, body mentions threshold', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ slowRegionCount: 2 }))
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('2 slow regions')
    expect(result?.body).toContain('300ms')
  })

  it('full outage does not return outage message (caller handles it)', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 900, errorRegionCount: 4, totalRegionCount: 4,
    }))
    expect(result).toBeNull()
  })
})

// ─── deriveMonitorPerformancePeriodAdvisor ────────────────────────────────────

describe('deriveMonitorPerformancePeriodAdvisor', () => {
  function makePerf(overrides: Partial<Parameters<typeof deriveMonitorPerformancePeriodAdvisor>[0]> = {}) {
    return {
      monitorId: 'mon_test',
      url: 'https://example.com',
      range: '7d',
      avgTtfb: 200,
      prevAvgTtfb: 200,
      globalHitRate: 90,
      prevGlobalHitRate: 90,
      hasHistory: true,
      worstRegion: null,
      spikeCount: 0,
      ...overrides,
    }
  }

  it('returns null when no history', () => {
    expect(deriveMonitorPerformancePeriodAdvisor(makePerf({ hasHistory: false }))).toBeNull()
  })

  it('returns null when prevAvgTtfb is 0', () => {
    expect(deriveMonitorPerformancePeriodAdvisor(makePerf({ prevAvgTtfb: 0 }))).toBeNull()
  })

  it('returns null for minor change', () => {
    expect(deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 210 }))).toBeNull()
  })

  it('returns critical for TTFB regression over 30%', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 300, prevAvgTtfb: 200 }))
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toContain('+50%')
  })

  it('critical body includes both absolute values', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 300, prevAvgTtfb: 200 }))
    expect(result?.body).toContain('300ms')
    expect(result?.body).toContain('200ms')
  })

  it('critical body includes worst region when provided', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({
      avgTtfb: 300, prevAvgTtfb: 200,
      worstRegion: { label: 'São Paulo', changePct: 65 },
    }))
    expect(result?.body).toContain('São Paulo')
  })

  it('returns warning for 10-30% TTFB increase', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 230, prevAvgTtfb: 200 }))
    expect(result?.severity).toBe('warning')
    expect(result?.body).toContain('230ms')
    expect(result?.body).toContain('200ms')
  })

  it('warning body includes spike count', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 230, prevAvgTtfb: 200, spikeCount: 3 }))
    expect(result?.body).toContain('3 spikes')
  })

  it('returns warning for cache drop over 10pp', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ globalHitRate: 70, prevGlobalHitRate: 85 }))
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('cache hit')
  })

  it('returns good for notable TTFB improvement', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 160, prevAvgTtfb: 200 }))
    expect(result?.severity).toBe('good')
    expect(result?.body).toContain('160ms')
    expect(result?.body).toContain('200ms')
  })

  it('good actions are empty', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 160, prevAvgTtfb: 200 }))
    expect(result?.actions).toHaveLength(0)
  })

  it('critical actions use "Analyze example.com Trends" and "Audit example.com Edge"', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 300, prevAvgTtfb: 200 }))
    expect(result?.actions.map(a => a.label)).toContain('Analyze example.com Trends')
    expect(result?.actions.map(a => a.label)).toContain('Audit example.com Edge')
  })
})
