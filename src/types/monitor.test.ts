import { describe, it, expect } from 'vitest'
import {
  getTtfbTier,
  getCacheHitTier,
  monitorMatchesSearch,
  monitorMatchesQuickFilter,
  monitorHealthScore,
  type Monitor,
} from './monitor'
import { MONITOR_TTFB, MONITOR_CACHE } from '@/lib/thresholds'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 'mon_test',
    name: 'example.com',
    url: 'https://example.com',
    status: 'active',
    ttfbCurrent: 100,
    ttfbCurrentDelta: -5,
    ttfbAvg1h: 100,
    ttfbAvg24h: 110,
    ttfbSparkline: [100, 105, 95, 110],
    cacheHitCurrent: 95,
    cacheHitAvg1h: 95,
    cacheHitAvg24h: 92,
    cacheHitDelta: 3,
    cacheStatusCurrent: 'HIT',
    regions: [],
    slowRegionCount: 0,
    totalRegionCount: 4,
    errorRegionCount: 0,
    error5xxCount: 0,
    error4xxCount: 0,
    isWafBlocked: false,
    uptime24h: 100,
    lastCheckedAt: new Date(),
    activeIncidentCount: 0,
    ...overrides,
  }
}

// ─── getTtfbTier ──────────────────────────────────────────────────────────────

describe('getTtfbTier', () => {
  it('returns fast for TTFB below FAST threshold', () => {
    expect(getTtfbTier(0)).toBe('fast')
    expect(getTtfbTier(MONITOR_TTFB.FAST - 1)).toBe('fast')
  })

  it('returns med for TTFB between FAST and SLOW (inclusive)', () => {
    expect(getTtfbTier(MONITOR_TTFB.FAST)).toBe('med')
    expect(getTtfbTier(MONITOR_TTFB.SLOW)).toBe('med')
  })

  it('returns slow for TTFB above SLOW threshold', () => {
    expect(getTtfbTier(MONITOR_TTFB.SLOW + 1)).toBe('slow')
    expect(getTtfbTier(5000)).toBe('slow')
  })
})

// ─── getCacheHitTier ──────────────────────────────────────────────────────────

describe('getCacheHitTier', () => {
  it('returns high for pct above GOOD threshold', () => {
    expect(getCacheHitTier(MONITOR_CACHE.GOOD + 0.1)).toBe('high')
    expect(getCacheHitTier(100)).toBe('high')
  })

  it('returns mid for LOW ≤ pct < GOOD', () => {
    expect(getCacheHitTier(MONITOR_CACHE.LOW)).toBe('mid')
    expect(getCacheHitTier(MONITOR_CACHE.GOOD - 0.1)).toBe('mid')
  })

  it('returns low for pct below LOW threshold', () => {
    expect(getCacheHitTier(MONITOR_CACHE.LOW - 0.1)).toBe('low')
    expect(getCacheHitTier(0)).toBe('low')
  })
})

// ─── monitorMatchesSearch ─────────────────────────────────────────────────────

describe('monitorMatchesSearch', () => {
  const m = makeMonitor({ name: 'Microsoft', url: 'https://www.microsoft.com' })

  it('matches empty query (always true)', () => {
    expect(monitorMatchesSearch(m, '')).toBe(true)
    expect(monitorMatchesSearch(m, '   ')).toBe(true)
  })

  it('matches partial name case-insensitively', () => {
    expect(monitorMatchesSearch(m, 'micro')).toBe(true)
    expect(monitorMatchesSearch(m, 'MICROSOFT')).toBe(true)
  })

  it('matches partial URL', () => {
    expect(monitorMatchesSearch(m, 'microsoft.com')).toBe(true)
    expect(monitorMatchesSearch(m, 'www.')).toBe(true)
  })

  it('does not match unrelated string', () => {
    expect(monitorMatchesSearch(m, 'google')).toBe(false)
    expect(monitorMatchesSearch(m, 'apple')).toBe(false)
  })

  it('numeric cache filter ignores BYPASS (hit % is not a CDN quality signal)', () => {
    const bypass = makeMonitor({
      name: 'dyn.example',
      url: 'https://dyn.example',
      cacheHitCurrent: 0,
      cacheStatusCurrent: 'BYPASS',
    })
    expect(monitorMatchesSearch(bypass, 'hit < 50')).toBe(false)
  })

  it('keyword miss does not match intentional BYPASS', () => {
    const bypass = makeMonitor({
      name: 'dyn.example',
      url: 'https://dyn.example',
      cacheHitCurrent: 0,
      cacheStatusCurrent: 'BYPASS',
    })
    expect(monitorMatchesSearch(bypass, 'miss')).toBe(false)
  })
})

// ─── monitorMatchesQuickFilter ────────────────────────────────────────────────

describe('monitorMatchesQuickFilter', () => {
  it('"all" always returns true', () => {
    expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 999 }), 'all')).toBe(true)
  })

  describe('"healthy"', () => {
    it('passes when TTFB is below FAST threshold and cache hit is above GOOD threshold', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: MONITOR_TTFB.FAST - 1, cacheHitCurrent: MONITOR_CACHE.GOOD + 1 }), 'healthy')).toBe(true)
    })

    it('passes when TTFB is below FAST threshold and no cache data (null)', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: MONITOR_TTFB.FAST - 1, cacheHitCurrent: null }), 'healthy')).toBe(true)
    })

    it('fails when TTFB meets or exceeds FAST threshold', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbAvg1h: MONITOR_TTFB.FAST, cacheHitCurrent: 99 }), 'healthy')).toBe(false)
    })

    it('fails when cache hit is strictly below GOOD threshold (with data)', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 50, cacheHitAvg1h: MONITOR_CACHE.GOOD - 1 }), 'healthy')).toBe(false)
    })

    it('passes for intentional BYPASS when numeric hit is low (delivery is dynamic, not a cache failure)', () => {
      expect(
        monitorMatchesQuickFilter(
          makeMonitor({
            ttfbCurrent: MONITOR_TTFB.FAST - 1,
            cacheHitCurrent: 0,
            cacheStatusCurrent: 'BYPASS',
          }),
          'healthy',
        ),
      ).toBe(true)
    })
  })

  describe('"degraded"', () => {
    it('passes when TTFB meets or exceeds FAST threshold', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbAvg1h: MONITOR_TTFB.FAST }), 'degraded')).toBe(true)
    })

    it('passes when cache hit is below LOW threshold (with data)', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 100, cacheHitAvg1h: MONITOR_CACHE.LOW - 1 }), 'degraded')).toBe(true)
    })

    it('does not flag null cache hit as degraded', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 100, cacheHitCurrent: null }), 'degraded')).toBe(false)
    })

    it('does not treat BYPASS + low numeric hit as degraded when TTFB is fine and no region errors', () => {
      expect(
        monitorMatchesQuickFilter(
          makeMonitor({
            ttfbCurrent: 100,
            cacheHitCurrent: 0,
            cacheStatusCurrent: 'BYPASS',
            errorRegionCount: 0,
          }),
          'degraded',
        ),
      ).toBe(false)
    })
  })

  describe('"high-ttfb"', () => {
    it('passes when TTFB meets or exceeds FAST threshold', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbAvg1h: MONITOR_TTFB.FAST }), 'high-ttfb')).toBe(true)
    })

    it('fails when TTFB is below FAST threshold', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: MONITOR_TTFB.FAST - 1 }), 'high-ttfb')).toBe(false)
    })
  })

  describe('"low-cache-hit"', () => {
    it('passes when cache hit is below LOW threshold', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ cacheHitAvg1h: MONITOR_CACHE.LOW - 1 }), 'low-cache-hit')).toBe(true)
    })

    it('does not flag null cache hit as low (no data ≠ problem)', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ cacheHitCurrent: null }), 'low-cache-hit')).toBe(false)
    })

    it('fails when cache hit meets or exceeds GOOD threshold', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ cacheHitCurrent: MONITOR_CACHE.GOOD }), 'low-cache-hit')).toBe(false)
    })

    it('does not include NO HEADER in low-cache-hit even with low numeric value', () => {
      expect(
        monitorMatchesQuickFilter(
          makeMonitor({ cacheHitCurrent: 10, cacheStatusCurrent: null }),
          'low-cache-hit',
        ),
      ).toBe(false)
    })

    it('does not include BYPASS/DYNAMIC in low-cache-hit', () => {
      expect(
        monitorMatchesQuickFilter(
          makeMonitor({ cacheHitCurrent: 10, cacheStatusCurrent: 'BYPASS' }),
          'low-cache-hit',
        ),
      ).toBe(false)
      expect(
        monitorMatchesQuickFilter(
          makeMonitor({ cacheHitCurrent: 10, cacheStatusCurrent: 'DYNAMIC' }),
          'low-cache-hit',
        ),
      ).toBe(false)
    })

    it('includes monitor when 24h average cache hit is low (even if current is not low)', () => {
      expect(
        monitorMatchesQuickFilter(
          makeMonitor({ cacheHitCurrent: 90, cacheHitAvg24h: 72, cacheStatusCurrent: 'HIT' }),
          'low-cache-hit',
        ),
      ).toBe(true)
    })
  })
})

// ─── monitorHealthScore ───────────────────────────────────────────────────────

describe('monitorHealthScore', () => {
  it('returns 100 for a healthy monitor with no issues', () => {
    const m = makeMonitor({ ttfbCurrent: 50, cacheHitCurrent: null, errorRegionCount: 0, totalRegionCount: 4 })
    expect(monitorHealthScore(m)).toBe(100)
  })

  it('returns 0 when all regions have errors (full outage)', () => {
    const m = makeMonitor({ errorRegionCount: 4, totalRegionCount: 4, ttfbCurrent: 0 })
    expect(monitorHealthScore(m)).toBe(0)
  })

  it('returns 0 when errorRegionCount equals totalRegionCount (edge: single region)', () => {
    const m = makeMonitor({ errorRegionCount: 1, totalRegionCount: 1, ttfbCurrent: 0 })
    expect(monitorHealthScore(m)).toBe(0)
  })

  it('applies partial outage penalty proportional to failing ratio', () => {
    // 2 of 4 regions failing → 50% * 60 = 30 penalty
    const partial = makeMonitor({ errorRegionCount: 2, totalRegionCount: 4, ttfbCurrent: 50, cacheHitCurrent: null })
    expect(monitorHealthScore(partial)).toBe(70)
  })

  it('does not apply outage penalty when errorRegionCount is 0', () => {
    const m = makeMonitor({ errorRegionCount: 0, totalRegionCount: 4, ttfbCurrent: 50, cacheHitCurrent: null })
    expect(monitorHealthScore(m)).toBe(100)
  })

  it('does not penalize BYPASS for low numeric hit%', () => {
    const m = makeMonitor({
      ttfbCurrent: 50,
      cacheHitCurrent: 0,
      cacheStatusCurrent: 'BYPASS',
      errorRegionCount: 0,
    })
    expect(monitorHealthScore(m)).toBe(100)
  })
})

// ─── quick-filter DOWN/DEGRADED coverage ─────────────────────────────────────

describe('monitorMatchesQuickFilter — outage states', () => {
  it('"healthy" rejects a fully DOWN monitor (all regions erroring)', () => {
    const down = makeMonitor({ errorRegionCount: 4, totalRegionCount: 4, ttfbCurrent: 0, cacheHitCurrent: null })
    expect(monitorMatchesQuickFilter(down, 'healthy')).toBe(false)
  })

  it('"degraded" does NOT match a fully DOWN monitor (use "down" filter instead)', () => {
    const down = makeMonitor({ errorRegionCount: 4, totalRegionCount: 4, ttfbCurrent: 0, cacheHitCurrent: null })
    expect(monitorMatchesQuickFilter(down, 'degraded')).toBe(false)
  })

  it('"degraded" accepts a partially degraded monitor (some regions erroring)', () => {
    const partial = makeMonitor({ errorRegionCount: 1, totalRegionCount: 4, ttfbCurrent: 50, cacheHitCurrent: null })
    expect(monitorMatchesQuickFilter(partial, 'degraded')).toBe(true)
  })

  it('"healthy" accepts a monitor with no errors even if cache data is absent', () => {
    const ok = makeMonitor({ errorRegionCount: 0, ttfbCurrent: 50, cacheHitCurrent: null })
    expect(monitorMatchesQuickFilter(ok, 'healthy')).toBe(true)
  })
})
