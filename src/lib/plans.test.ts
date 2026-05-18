import { describe, it, expect } from 'vitest'
import { parsePlan, getMonitorLimit, PLAN_LIMITS } from './plans'

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
