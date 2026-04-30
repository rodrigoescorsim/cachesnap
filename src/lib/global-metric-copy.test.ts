import { describe, expect, it } from 'vitest'
import { GLOBAL_CACHE, GLOBAL_TTFB } from '@/lib/thresholds'
import {
  globalCacheFooterContext,
  globalCacheFooterContextCompact,
  globalCacheFooterPill,
  globalTtfbFooterContext,
  globalTtfbFooterContextCompact,
  globalTtfbFooterPill,
} from './global-metric-copy'

describe('globalTtfbFooterContext', () => {
  it('describes healthy aggregate', () => {
    expect(globalTtfbFooterContext(250, -5)).toContain(`under ${GLOBAL_TTFB.FAST}ms`)
  })

  it('uses sign of delta vs pooled 24h', () => {
    expect(globalTtfbFooterContext(600, -9)).toContain('faster')
    expect(globalTtfbFooterContext(600, 9)).toContain('slower')
    expect(globalTtfbFooterContext(600, 0)).toContain('matches')
  })
})

describe('globalCacheFooterPill', () => {
  it('aligns with GOOD / FAIR bands', () => {
    expect(globalCacheFooterPill(GLOBAL_CACHE.GOOD + 1).label).toBe('GOOD')
    expect(globalCacheFooterPill(GLOBAL_CACHE.FAIR + 1).label).toBe('DEGRADED')
    expect(globalCacheFooterPill(GLOBAL_CACHE.FAIR - 1).label).toBe('CRITICAL')
  })
})

describe('globalCacheFooterContext', () => {
  it('reflects qualitative efficiency by current bands', () => {
    expect(globalCacheFooterContext(GLOBAL_CACHE.GOOD + 2)).toContain('Excellent efficiency')
    expect(globalCacheFooterContext(GLOBAL_CACHE.FAIR + 2)).toContain('Partial efficiency')
    expect(globalCacheFooterContext(GLOBAL_CACHE.FAIR - 1)).toContain('Low efficiency')
  })
})

describe('compact footer copy', () => {
  it('globalTtfbFooterContextCompact stays short', () => {
    expect(globalTtfbFooterContextCompact(600, -9).length).toBeLessThan(80)
    expect(globalTtfbFooterContextCompact(250, 0)).toBe('Healthy global latency.')
  })

  it('globalCacheFooterContextCompact stays short', () => {
    expect(globalCacheFooterContextCompact(GLOBAL_CACHE.GOOD + 2)).toBe('High efficiency.')
    expect(globalCacheFooterContextCompact(GLOBAL_CACHE.FAIR + 2)).toBe('Partial efficiency.')
  })
})
