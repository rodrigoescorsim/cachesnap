import { describe, it, expect } from 'vitest'
import { 
  isCacheHit, 
  isCacheMiss, 
  isCacheBypass, 
  getCacheDisplayLabel,
  CACHE_HIT_STATUSES, 
  CACHE_MISS_STATUSES, 
  CACHE_BYPASS_STATUSES 
} from './cache-utils'

describe('cache-utils', () => {
  describe('Classification Lists', () => {
    it('should have expanded hit statuses', () => {
      expect(CACHE_HIT_STATUSES).toContain('HIT')
      expect(CACHE_HIT_STATUSES).toContain('STALE')
      expect(CACHE_HIT_STATUSES).toContain('REVALIDATED')
      expect(CACHE_HIT_STATUSES).toContain('UPDATING')
      expect(CACHE_HIT_STATUSES).toContain('REFRESH_HIT')
    })

    it('should have expanded miss statuses', () => {
      expect(CACHE_MISS_STATUSES).toContain('MISS')
      expect(CACHE_MISS_STATUSES).toContain('EXPIRED')
      expect(CACHE_MISS_STATUSES).toContain('ERROR')
    })

    it('should have expanded bypass/intentional statuses', () => {
      expect(CACHE_BYPASS_STATUSES).toContain('BYPASS')
      expect(CACHE_BYPASS_STATUSES).toContain('DYNAMIC')
      expect(CACHE_BYPASS_STATUSES).toContain('PASS')
      expect(CACHE_BYPASS_STATUSES).toContain('NO HEADER')
      expect(CACHE_BYPASS_STATUSES).toContain('UNCALCULABLE')
    })
  })

  describe('isCacheHit', () => {
    it('should return true for all hit variants', () => {
      expect(isCacheHit('HIT')).toBe(true)
      expect(isCacheHit('STALE')).toBe(true)
      expect(isCacheHit('REFRESH_HIT')).toBe(true)
      expect(isCacheHit('cloudflare HIT')).toBe(true)
    })

    it('should return false for MISS or BYPASS', () => {
      expect(isCacheHit('MISS')).toBe(false)
      expect(isCacheHit('DYNAMIC')).toBe(false)
    })
  })

  describe('isCacheMiss', () => {
    it('should return true for MISS and EXPIRED', () => {
      expect(isCacheMiss('MISS')).toBe(true)
      expect(isCacheMiss('EXPIRED')).toBe(true)
      expect(isCacheMiss('ERROR')).toBe(true)
    })

    it('should return false for HIT or DYNAMIC', () => {
      expect(isCacheMiss('HIT')).toBe(false)
      expect(isCacheMiss('DYNAMIC')).toBe(false)
    })
  })

  describe('isCacheBypass', () => {
    it('should return true for intentional origin fetches', () => {
      expect(isCacheBypass('DYNAMIC')).toBe(true)
      expect(isCacheBypass('BYPASS')).toBe(true)
      expect(isCacheBypass('PASS')).toBe(true)
    })

    it('should treat null or empty as NO HEADER (Bypass)', () => {
      expect(isCacheBypass(null)).toBe(true)
      expect(isCacheBypass(undefined)).toBe(true)
      expect(isCacheBypass('')).toBe(true)
    })

    it('should return false for HIT or MISS', () => {
      expect(isCacheBypass('HIT')).toBe(false)
      expect(isCacheBypass('MISS')).toBe(false)
    })
  })

  describe('getCacheDisplayLabel', () => {
    it('should extract clean labels from prefixed statuses', () => {
      expect(getCacheDisplayLabel('BYPASS:Cloudflare DYNAMIC')).toBe('DYNAMIC')
      expect(getCacheDisplayLabel('HIT:Vercel HIT')).toBe('HIT')
      expect(getCacheDisplayLabel('MISS:Fastly MISS')).toBe('MISS')
    })

    it('should return NO HEADER for null or empty values', () => {
      expect(getCacheDisplayLabel(null)).toBe('NO HEADER')
      expect(getCacheDisplayLabel(undefined)).toBe('NO HEADER')
      expect(getCacheDisplayLabel('')).toBe('NO HEADER')
      expect(getCacheDisplayLabel('—')).toBe('NO HEADER')
    })

    it('should return the uppercase status for single words', () => {
      expect(getCacheDisplayLabel('hit')).toBe('HIT')
      expect(getCacheDisplayLabel('Dynamic')).toBe('DYNAMIC')
    })
  })
})
