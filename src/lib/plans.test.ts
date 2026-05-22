import { describe, it, expect } from 'vitest'
import { parsePlan, getMonitorLimit, getHistoryDays, capRangeToHistoryDays, PLAN_LIMITS, RANGE_DAYS } from './plans'

describe('parsePlan', () => {
  it('returns "free" for valid free plan', () => {
    expect(parsePlan('free')).toBe('free')
  })

  it('returns "pro" for valid pro plan', () => {
    expect(parsePlan('pro')).toBe('pro')
  })

  it('returns "team" for valid team plan', () => {
    expect(parsePlan('team')).toBe('team')
  })

  it('falls back to "free" for unknown plan string', () => {
    expect(parsePlan('enterprise')).toBe('free')
    expect(parsePlan('vip')).toBe('free')
  })

  it('falls back to "free" for null', () => {
    expect(parsePlan(null)).toBe('free')
  })

  it('falls back to "free" for undefined', () => {
    expect(parsePlan(undefined)).toBe('free')
  })

  it('falls back to "free" for empty string', () => {
    expect(parsePlan('')).toBe('free')
  })
})

describe('getMonitorLimit', () => {
  it('returns 2 for free plan', () => {
    expect(getMonitorLimit('free')).toBe(PLAN_LIMITS.free.monitors)
    expect(getMonitorLimit('free')).toBe(2)
  })

  it('returns 20 for pro plan', () => {
    expect(getMonitorLimit('pro')).toBe(PLAN_LIMITS.pro.monitors)
    expect(getMonitorLimit('pro')).toBe(20)
  })

  it('returns 100 for team plan', () => {
    expect(getMonitorLimit('team')).toBe(PLAN_LIMITS.team.monitors)
    expect(getMonitorLimit('team')).toBe(100)
  })

  it('falls back to free limit for invalid plan', () => {
    expect(getMonitorLimit('invalid')).toBe(PLAN_LIMITS.free.monitors)
  })
})

describe('getHistoryDays', () => {
  it('returns 7 for free', () => expect(getHistoryDays('free')).toBe(7))
  it('returns 30 for pro', () => expect(getHistoryDays('pro')).toBe(30))
  it('returns 90 for team', () => expect(getHistoryDays('team')).toBe(90))
  it('falls back to free (7) for invalid plan', () => expect(getHistoryDays('invalid')).toBe(7))
})

describe('capRangeToHistoryDays', () => {
  it('returns the range unchanged when within plan limit', () => {
    expect(capRangeToHistoryDays('7d', 7)).toBe('7d')
    expect(capRangeToHistoryDays('7d', 30)).toBe('7d')
    expect(capRangeToHistoryDays('30d', 30)).toBe('30d')
    expect(capRangeToHistoryDays('90d', 90)).toBe('90d')
  })

  it('caps to 7d for free plan (historyDays=7)', () => {
    expect(capRangeToHistoryDays('30d', 7)).toBe('7d')
    expect(capRangeToHistoryDays('90d', 7)).toBe('7d')
  })

  it('caps to 30d for pro plan (historyDays=30)', () => {
    expect(capRangeToHistoryDays('90d', 30)).toBe('30d')
  })

  it('does not cap sub-day ranges', () => {
    expect(capRangeToHistoryDays('1h', 7)).toBe('1h')
    expect(capRangeToHistoryDays('1d', 7)).toBe('1d')
  })
})

describe('RANGE_DAYS', () => {
  it('maps all expected ranges', () => {
    expect(RANGE_DAYS['7d']).toBe(7)
    expect(RANGE_DAYS['30d']).toBe(30)
    expect(RANGE_DAYS['90d']).toBe(90)
    expect(RANGE_DAYS['1d']).toBe(1)
    expect(RANGE_DAYS['1h']).toBe(1)
  })
})

describe('PLAN_LIMITS coherence', () => {
  it('free limit is less than pro', () => {
    expect(PLAN_LIMITS.free.monitors).toBeLessThan(PLAN_LIMITS.pro.monitors)
  })

  it('pro limit is less than team', () => {
    expect(PLAN_LIMITS.pro.monitors).toBeLessThan(PLAN_LIMITS.team.monitors)
  })

  it('free history is less than pro', () => {
    expect(PLAN_LIMITS.free.historyDays).toBeLessThan(PLAN_LIMITS.pro.historyDays)
  })

  it('pro history is less than team', () => {
    expect(PLAN_LIMITS.pro.historyDays).toBeLessThan(PLAN_LIMITS.team.historyDays)
  })
})
