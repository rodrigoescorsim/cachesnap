import { describe, it, expect } from 'vitest'
import { shouldRefresh } from './real-time-hub.helpers'

describe('shouldRefresh', () => {
  it('returns true when watchId is not set — dashboard watches all monitors', () => {
    expect(shouldRefresh('abc-123')).toBe(true)
    expect(shouldRefresh('abc-123', undefined)).toBe(true)
  })

  it('returns true when incoming id matches watchId — correct monitor updated', () => {
    expect(shouldRefresh('abc-123', 'abc-123')).toBe(true)
  })

  it('returns false when incoming id does not match watchId — other monitor updated', () => {
    expect(shouldRefresh('other-id', 'abc-123')).toBe(false)
    expect(shouldRefresh('', 'abc-123')).toBe(false)
  })

  it('treats empty-string watchId as watch-all (falsy)', () => {
    expect(shouldRefresh('abc-123', '')).toBe(true)
  })

  it('is exact-match only — no substring or prefix behaviour', () => {
    expect(shouldRefresh('abc-123-extra', 'abc-123')).toBe(false)
    expect(shouldRefresh('abc', 'abc-123')).toBe(false)
  })
})
