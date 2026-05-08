import { describe, it, expect } from 'vitest'
import { TIMEFRAME_TOOLTIPS, buildViewHref, buildMonitorHref } from './monitor-href'

describe('TIMEFRAME_TOOLTIPS', () => {
  const expectedRanges = ['1h', '4h', '24h', '7d', '30d', '90d']

  it('has an entry for every supported timeframe', () => {
    for (const r of expectedRanges) {
      expect(TIMEFRAME_TOOLTIPS[r], `missing tooltip for "${r}"`).toBeDefined()
    }
  })

  it('tooltip text is non-empty for all timeframes', () => {
    for (const r of expectedRanges) {
      expect(TIMEFRAME_TOOLTIPS[r].length).toBeGreaterThan(0)
    }
  })

  it('short timeframes describe hours, long timeframes describe days', () => {
    expect(TIMEFRAME_TOOLTIPS['1h']).toMatch(/hour/i)
    expect(TIMEFRAME_TOOLTIPS['4h']).toMatch(/hour/i)
    expect(TIMEFRAME_TOOLTIPS['7d']).toMatch(/day/i)
    expect(TIMEFRAME_TOOLTIPS['30d']).toMatch(/day/i)
    expect(TIMEFRAME_TOOLTIPS['90d']).toMatch(/day/i)
  })
})

describe('buildViewHref', () => {
  it('omits range param when range is 24h (default)', () => {
    const href = buildViewHref('performance', '24h')
    expect(href).not.toContain('range=')
  })

  it('includes range param for non-default values', () => {
    expect(buildViewHref('trends', '1h')).toContain('range=1h')
    expect(buildViewHref('trends', '4h')).toContain('range=4h')
    expect(buildViewHref('trends', '7d')).toContain('range=7d')
    expect(buildViewHref('trends', '30d')).toContain('range=30d')
    expect(buildViewHref('trends', '90d')).toContain('range=90d')
  })

  it('includes monitorId in path when provided', () => {
    const href = buildViewHref('performance', '7d', 'abc-123')
    expect(href).toContain('/dashboard/monitors/abc-123')
  })
})

describe('buildMonitorHref', () => {
  it('omits range for default 24h', () => {
    expect(buildMonitorHref('performance', '24h')).not.toContain('range=')
  })

  it('includes range for 1h and 4h', () => {
    expect(buildMonitorHref('performance', '1h')).toContain('range=1h')
    expect(buildMonitorHref('performance', '4h')).toContain('range=4h')
  })
})
