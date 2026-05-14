import { describe, it, expect } from 'vitest'
import {
  derivePortfolioAdvisor,
  deriveMonitorDetailLiveAdvisor,
  deriveMonitorPerformancePeriodAdvisor,
  deriveMonitorTrendsAdvisor,
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
    ttfbAvg1h:         100,
    ttfbAvg24h:        100,
    ttfbSparkline:     [100, 105, 95, 110],
    cacheHitCurrent:   90,
    cacheHitAvg1h:     90,
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
    activeIncidentCount: 0,
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
      liveAvgTtfb: 1200,
      liveAvgOriginMs: 800,
      liveAvgEdgeMs: 100
    }))
    expect(result?.body).toContain('Origin latency is dominant')
  })

  it('recommends edge check when network/TLS is slow', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 1200,
      liveAvgOriginMs: 100,
      liveAvgEdgeMs: 800
    }))
    expect(result?.body).toContain('Edge latency is elevated')
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

  it('critical body mentions all regions', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', url: 'https://down.com', errorRegionCount: 4, totalRegionCount: 4 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.body).toContain('all regions')
  })

  it('critical headline includes issue count suffix', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'm1', errorRegionCount: 4, totalRegionCount: 4 }),
      makeMonitor({ id: 'm2', ttfbAvg1h: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.headline).toContain('1 monitor DOWN')
    expect(result?.headline).toContain('2 issues total')
  })

  it('critical headline includes issue count when present', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', errorRegionCount: 4, totalRegionCount: 4 }),
      makeMonitor({ id: 'deg_1', ttfbAvg1h: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.headline).toContain('2 issues total')
    expect(result?.actions.some(a => a.label.startsWith('Down ('))).toBe(true)
  })

  it('critical action label for down monitors uses "Down"', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'down_1', errorRegionCount: 4, totalRegionCount: 4 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.actions.some(a => a.label.startsWith('Down ('))).toBe(true)
  })

  it('returns critical when origin reports 5xx errors (AD14)', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'err_1', error5xxCount: 1 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toContain('Origin Health')
    expect(result?.body).toContain('5xx origin errors')
  })

  it('returns warning when degraded monitors exist', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'slow_1', url: 'https://slow.com', ttfbAvg1h: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('degraded')
  })

  it('warning body mentions the degraded monitor', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'slow_1', url: 'https://slow.com', ttfbAvg1h: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.body).toContain('slow.com')
  })

  it('warning body mentions performance when cache hit is low', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'slow_1', ttfbAvg1h: 600, cacheHitAvg1h: 65, cacheStatusCurrent: 'MISS' }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.body).toContain('performance warnings')
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
    expect(result?.headline).toContain('4xx errors')
    expect(result?.body).toContain('performance warnings')
  })

  it('warning actions includes "Degraded" link', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'deg_1', ttfbAvg1h: 600 }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.actions.some(a => a.label.startsWith('Degraded'))).toBe(true)
  })

  it('warning actions includes "Headers" link when cache headers are missing', () => {
    const monitors = [
      ...makePortfolio(3),
      makeMonitor({ id: 'm1', cacheStatusCurrent: null }),
    ]
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.actions.some(a => a.label.startsWith('Headers'))).toBe(true)
  })

  it('good state body includes avg TTFB', () => {
    const monitors = makePortfolio(4, { ttfbAvg1h: 120 })
    const result = derivePortfolioAdvisor(monitors)
    expect(result?.body).toContain('120ms')
  })
})

// ─── deriveMonitorDetailLiveAdvisor ──────────────────────────────────────────

describe('deriveMonitorDetailLiveAdvisor', () => {
  it('returns "good" state for a healthy monitor', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput())
    expect(result?.severity).toBe('good')
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
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveAvgTtfb: 1200 }))
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toContain('1200ms')
  })

  it('critical body includes diagnostic context', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ 
      liveAvgTtfb: 1200,
      liveAvgOriginMs: 800,
      liveAvgEdgeMs: 100
    }))
    expect(result?.body).toContain('Origin latency is dominant')
    expect(result?.body).toContain('backend processing')
  })

  it('critical body includes period avg when trending worse', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 1200, periodAvgTtfb: 600, ttfbVsPeriodPct: 50,
    }))
    expect(result?.body).toContain('~600ms')
    expect(result?.body).toContain('+50%')
  })

  it('critical actions use "Edge vs Origin — example.com"', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveAvgTtfb: 1200 }))
    expect(result?.actions.map(a => a.label)).toContain('Edge vs Origin — example.com')
    expect(result?.actions).toHaveLength(1)
  })

  it('returns warning for elevated TTFB + worsening trend', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 600, periodAvgTtfb: 380, ttfbVsPeriodPct: 32,
    }))
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('TTFB 600ms')
    expect(result?.body).toContain('32%')
  })

  it('does not recommend any actions when cache data is missing during high latency', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      liveAvgTtfb: 1200,
      hasLiveCacheData: false
    }))
    expect(result?.actions).toHaveLength(0)
    expect(result?.body).toContain('No cache headers detected')
    expect(result?.recommendation).toContain('Enable \'Cache-Control\'')
  })

  it('returns "good" state for elevated TTFB at threshold without significant trend', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveAvgTtfb: 500, ttfbVsPeriodPct: 5 }))
    expect(result?.severity).toBe('good')
  })

  it('returns critical for very low cache hit', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveGlobalHitRate: 20 }))
    expect(result?.severity).toBe('critical')
  })

  it('low cache hit headline includes the percentage', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveGlobalHitRate: 35 }))
    expect(result?.headline).toContain('35%')
    expect(result?.headline).toContain('cache efficiency')
  })

  it('low cache hit body includes origin percentage', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveGlobalHitRate: 35 }))
    expect(result?.body).toContain('65%')
  })

  it('ignores cache hit when no cache data', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ liveGlobalHitRate: 0, hasLiveCacheData: false }))
    expect(result?.severity).toBe('good')
  })

  it('returns warning for slow regions, body mentions them', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({ slowRegionCount: 2 }))
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('2 slow regions')
    expect(result?.body).toContain('Slow regions detected')
  })

  it('includes affected region names in tooltip for slow regions', () => {
    const result = deriveMonitorDetailLiveAdvisor(makeLiveInput({
      slowRegionCount: 2,
      slowRegionLabels: ['Cape Town', 'Sydney'],
    }))
    expect(result?.contextTooltip).toContain('Cape Town')
    expect(result?.contextTooltip).toContain('Sydney')
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
      periodCacheCdnSamples: 1000,
      prevPeriodCacheCdnSamples: 1000,
      hasHistory: true,
      worstRegion: null,
      slowRegionCount: 0,
      ...overrides,
    }
  }

  it('returns "good" state when no history', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ hasHistory: false }))
    expect(result?.severity).toBe('good')
  })

  it('returns "good" state when prevAvgTtfb is 0', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ prevAvgTtfb: 0 }))
    expect(result?.severity).toBe('good')
  })

  it('returns stable state for minor change', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 210 }))
    expect(result?.severity).toBe('good')
    expect(result?.headline).toBe('Performance stable')
  })

  it('returns warning for slow regions even if global trend is stable', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({
      slowRegionCount: 3,
      slowRegionLabels: ['Cape Town', 'Sydney', 'Mumbai'],
    }))
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('3 slow regions')
    expect(result?.contextTooltip).toContain('Cape Town')
  })

  it('returns critical for TTFB regression over 40%', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 300, prevAvgTtfb: 200 }))
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toContain('up 50%')
  })

  it('critical body includes both absolute values', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 300, prevAvgTtfb: 200 }))
    expect(result?.body).toContain('300ms')
    expect(result?.body).toContain('200ms')
  })

  // (Worst region logic moved to Trends Advisor)

  it('returns warning for 10-40% TTFB increase', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 230, prevAvgTtfb: 200 }))
    expect(result?.severity).toBe('warning')
    expect(result?.body).toContain('Latency increased')
  })

  // (Spike count is now handled by the Trends Advisor)

  it('returns warning for cache drop over 10pp', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ globalHitRate: 70, prevGlobalHitRate: 85 }))
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toContain('Cache Hit')
  })

  it('returns good for notable TTFB improvement', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 160, prevAvgTtfb: 200 }))
    expect(result?.severity).toBe('good')
    expect(result?.body).toContain('160ms')
    expect(result?.body).toContain('200ms')
  })

  it('ignores cache hit rate when there are no CDN-classifiable probes (e.g. all DYNAMIC)', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({
      globalHitRate: 0,
      periodCacheCdnSamples: 0,
      prevPeriodCacheCdnSamples: 0,
    }))
    expect(result?.severity).toBe('good')
    expect(result?.headline).toBe('Performance stable')
  })

  it('good actions are empty', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 160, prevAvgTtfb: 200 }))
    expect(result?.actions).toHaveLength(0)
  })

  it('critical actions use "Analyze example.com Trends" and "Edge vs Origin — example.com"', () => {
    const result = deriveMonitorPerformancePeriodAdvisor(makePerf({ avgTtfb: 300, prevAvgTtfb: 200 }))
    expect(result?.actions.map(a => a.label)).toContain('Analyze example.com Trends')
    expect(result?.actions.map(a => a.label)).toContain('Edge vs Origin — example.com')
  })
})

// ─── deriveMonitorTrendsAdvisor ───────────────────────────────────────────────

describe('deriveMonitorTrendsAdvisor', () => {
  it('returns "good" state when no history yet', () => {
    const result = deriveMonitorTrendsAdvisor({ url: 'x.com', range: '24h', spikeCount: 0, hasHistory: false, worstRegion: null })
    expect(result?.severity).toBe('good')
  })

  it('returns good when no spikes and no regression', () => {
    const result = deriveMonitorTrendsAdvisor({ url: 'x.com', range: '24h', spikeCount: 0, hasHistory: true, worstRegion: null })
    expect(result?.severity).toBe('good')
    expect(result?.headline).toBe('Stable trends')
  })

  it('returns warning when spikes are between 1 and 5', () => {
    const result = deriveMonitorTrendsAdvisor({ url: 'x.com', range: '24h', spikeCount: 3, hasHistory: true, worstRegion: null })
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toBe('3 latency spikes')
  })

  it('suppresses spike warning on fresh monitors with too few buckets', () => {
    const result = deriveMonitorTrendsAdvisor({
      url: 'x.com', range: '1h', spikeCount: 1, totalBuckets: 2, hasHistory: false, worstRegion: null,
    })
    expect(result?.severity).toBe('good')
    expect(result?.headline).toBe('No spikes detected')
  })

  it('attributes spikes to specific regions when provided (single region)', () => {
    const result = deriveMonitorTrendsAdvisor({
      url: 'x.com', range: '1h', spikeCount: 1, totalBuckets: 4,
      spikeRegions: ['São Paulo'], hasHistory: true, worstRegion: null,
    })
    expect(result?.severity).toBe('warning')
    expect(result?.body).toContain('São Paulo')
    expect(result?.recommendation).toContain('São Paulo')
  })

  it('attributes spikes to multiple regions when provided', () => {
    const result = deriveMonitorTrendsAdvisor({
      url: 'x.com', range: '1h', spikeCount: 4, totalBuckets: 4,
      spikeRegions: ['São Paulo', 'Tokyo', 'Mumbai'], hasHistory: true, worstRegion: null,
    })
    expect(result?.body).toContain('São Paulo, Tokyo and 1 more')
  })

  it('returns warning for significant regional regression', () => {
    const result = deriveMonitorTrendsAdvisor({ url: 'x.com', range: '24h', spikeCount: 0, hasHistory: true, worstRegion: { label: 'Tokyo', changePct: 25 } })
    expect(result?.severity).toBe('warning')
    expect(result?.headline).toBe('Regional regression')
    expect(result?.body).toContain('Tokyo')
    expect(result?.body).toContain('25%')
  })

  it('returns critical when regional regression exceeds 50%', () => {
    const result = deriveMonitorTrendsAdvisor({ url: 'x.com', range: '24h', spikeCount: 0, hasHistory: true, worstRegion: { label: 'Tokyo', changePct: 60 } })
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toBe('Regional regression')
    expect(result?.body).toContain('60%')
  })

  it('returns critical when spikes exceed 5', () => {
    const result = deriveMonitorTrendsAdvisor({ url: 'x.com', range: '24h', spikeCount: 8, hasHistory: true, worstRegion: null })
    expect(result?.severity).toBe('critical')
    expect(result?.headline).toBe('8 latency spikes')
  })
})

