import { describe, it, expect } from 'vitest'
import {
  getTtfbTier,
  getCacheHitTier,
  monitorMatchesSearch,
  monitorMatchesQuickFilter,
  type Monitor,
} from './monitor'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 'mon_test',
    name: 'example.com',
    url: 'https://example.com',
    status: 'active',
    ttfbCurrent: 100,
    ttfbCurrentDelta: -5,
    ttfbAvg24h: 110,
    ttfbSparkline: [100, 105, 95, 110],
    cacheHitCurrent: 95,
    cacheHitAvg24h: 92,
    cacheHitDelta: 3,
    regions: [],
    slowRegionCount: 0,
    totalRegionCount: 4,
    lastCheckedAt: new Date(),
    ...overrides,
  }
}

// ─── getTtfbTier ──────────────────────────────────────────────────────────────

describe('getTtfbTier', () => {
  it('returns fast for TTFB < 150ms', () => {
    expect(getTtfbTier(0)).toBe('fast')
    expect(getTtfbTier(149)).toBe('fast')
  })

  it('returns med for TTFB 150–300ms (inclusive)', () => {
    expect(getTtfbTier(150)).toBe('med')
    expect(getTtfbTier(300)).toBe('med')
  })

  it('returns slow for TTFB > 300ms', () => {
    expect(getTtfbTier(301)).toBe('slow')
    expect(getTtfbTier(1000)).toBe('slow')
  })
})

// ─── getCacheHitTier ──────────────────────────────────────────────────────────

describe('getCacheHitTier', () => {
  it('returns high for pct > 90', () => {
    expect(getCacheHitTier(90.1)).toBe('high')
    expect(getCacheHitTier(100)).toBe('high')
  })

  it('returns mid for 70 ≤ pct ≤ 90', () => {
    expect(getCacheHitTier(70)).toBe('mid')
    expect(getCacheHitTier(90)).toBe('mid')
  })

  it('returns low for pct < 70', () => {
    expect(getCacheHitTier(69.9)).toBe('low')
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
})

// ─── monitorMatchesQuickFilter ────────────────────────────────────────────────

describe('monitorMatchesQuickFilter', () => {
  it('"all" always returns true', () => {
    expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 999 }), 'all')).toBe(true)
  })

  describe('"healthy"', () => {
    it('passes when TTFB < 200 and cache hit > 90', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 199, cacheHitCurrent: 91 }), 'healthy')).toBe(true)
    })

    it('passes when TTFB < 200 and no cache data (null)', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 150, cacheHitCurrent: null }), 'healthy')).toBe(true)
    })

    it('fails when TTFB ≥ 200', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 200, cacheHitCurrent: 99 }), 'healthy')).toBe(false)
    })

    it('fails when cache hit ≤ 90 (with data)', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 100, cacheHitCurrent: 90 }), 'healthy')).toBe(false)
    })
  })

  describe('"degraded"', () => {
    it('passes when TTFB > 300', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 301 }), 'degraded')).toBe(true)
    })

    it('passes when cache hit < 70 (with data)', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 100, cacheHitCurrent: 69 }), 'degraded')).toBe(true)
    })

    it('does not flag null cache hit as degraded', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 100, cacheHitCurrent: null }), 'degraded')).toBe(false)
    })
  })

  describe('"high-ttfb"', () => {
    it('passes when TTFB > 300', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 301 }), 'high-ttfb')).toBe(true)
    })

    it('fails when TTFB ≤ 300', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ ttfbCurrent: 300 }), 'high-ttfb')).toBe(false)
    })
  })

  describe('"low-cache-hit"', () => {
    it('passes when cache hit is below 70', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ cacheHitCurrent: 69 }), 'low-cache-hit')).toBe(true)
    })

    it('does not flag null cache hit as low (no data ≠ problem)', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ cacheHitCurrent: null }), 'low-cache-hit')).toBe(false)
    })

    it('fails when cache hit ≥ 70', () => {
      expect(monitorMatchesQuickFilter(makeMonitor({ cacheHitCurrent: 70 }), 'low-cache-hit')).toBe(false)
    })
  })
})
