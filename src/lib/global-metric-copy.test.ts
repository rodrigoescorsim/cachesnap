import { describe, expect, it } from 'vitest'
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
    expect(globalTtfbFooterContext(250, -5)).toContain('Under 300ms')
  })

  it('uses sign of delta vs pooled 24h', () => {
    expect(globalTtfbFooterContext(400, -9)).toContain('below')
    expect(globalTtfbFooterContext(400, 9)).toContain('above')
    expect(globalTtfbFooterContext(400, 0)).toContain('Matches')
  })
})

describe('globalCacheFooterPill', () => {
  it('aligns with 85 / 70 bands', () => {
    expect(globalCacheFooterPill(86).label).toBe('GOOD')
    expect(globalCacheFooterPill(75).label).toBe('DEGRADED')
    expect(globalCacheFooterPill(50).label).toBe('CRITICAL')
  })
})

describe('globalCacheFooterContext', () => {
  it('mentions target when below good band', () => {
    expect(globalCacheFooterContext(82)).toContain('85%')
    expect(globalCacheFooterContext(50)).toContain('85%')
  })
})

describe('compact footer copy', () => {
  it('globalTtfbFooterContextCompact stays short', () => {
    expect(globalTtfbFooterContextCompact(400, -9).length).toBeLessThan(80)
    expect(globalTtfbFooterContextCompact(250, 0)).toContain('300')
  })

  it('globalCacheFooterContextCompact stays short', () => {
    expect(globalCacheFooterContextCompact(82)).toBe('Below 85% target.')
    expect(globalCacheFooterContextCompact(90)).toBe('On target.')
  })
})
