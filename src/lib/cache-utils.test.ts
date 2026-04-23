import { describe, it, expect } from 'vitest'
import { isCacheHit, CACHE_HIT_STATUSES } from './cache-utils'

describe('cache-utils', () => {
  describe('CACHE_HIT_STATUSES', () => {
    it('should contain the expected hit statuses', () => {
      expect(CACHE_HIT_STATUSES).toContain('HIT')
      expect(CACHE_HIT_STATUSES).toContain('STALE')
      expect(CACHE_HIT_STATUSES).toContain('REVALIDATED')
      expect(CACHE_HIT_STATUSES).toContain('UPDATING')
    })
  })

  describe('isCacheHit', () => {
    it('should return true for standard hit statuses', () => {
      expect(isCacheHit('HIT')).toBe(true)
      expect(isCacheHit('STALE')).toBe(true)
      expect(isCacheHit('REVALIDATED')).toBe(true)
      expect(isCacheHit('UPDATING')).toBe(true)
    })

    it('should be case-insensitive', () => {
      expect(isCacheHit('hit')).toBe(true)
      expect(isCacheHit('stale')).toBe(true)
      expect(isCacheHit('Revalidated')).toBe(true)
    })

    it('should return false for miss statuses', () => {
      expect(isCacheHit('MISS')).toBe(false)
      expect(isCacheHit('DYNAMIC')).toBe(false)
      expect(isCacheHit('BYPASS')).toBe(false)
      expect(isCacheHit('EXPIRED')).toBe(false)
    })

    it('should return false for null or empty values', () => {
      expect(isCacheHit(null)).toBe(false)
      expect(isCacheHit(undefined)).toBe(false)
      expect(isCacheHit('')).toBe(false)
    })
  })
})
