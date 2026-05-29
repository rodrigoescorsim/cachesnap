import { describe, it, expect } from 'vitest'
import { MONITOR_TTFB, ttfbRowFastMs } from './thresholds'

describe('ttfbRowFastMs', () => {
  it('uses hit tier for HIT', () => {
    expect(ttfbRowFastMs('HIT')).toBe(MONITOR_TTFB.FAST)
  })

  it('uses miss tier for MISS', () => {
    expect(ttfbRowFastMs('MISS')).toBe(MONITOR_TTFB.MISS_FAST)
  })

  it('uses strict tier for NO HEADER', () => {
    expect(ttfbRowFastMs('NO HEADER')).toBe(MONITOR_TTFB.FAST)
  })

  it('respects per-monitor thresholds on Live', () => {
    expect(ttfbRowFastMs('HIT', { thresholdHitMs: 400, thresholdMs: 1200 })).toBe(400)
    expect(ttfbRowFastMs('MISS', { thresholdHitMs: 400, thresholdMs: 1200 })).toBe(1200)
    expect(ttfbRowFastMs('NO HEADER', { thresholdHitMs: 400, thresholdMs: 1200 })).toBe(400)
  })
})
