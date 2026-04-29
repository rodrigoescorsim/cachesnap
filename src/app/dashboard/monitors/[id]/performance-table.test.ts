import { describe, it, expect } from 'vitest'
import { regionRowServedFromLabel, regionRowCdnLabelTrimmed } from './performance-table'

describe('PerformanceTable Helpers', () => {
  describe('regionRowServedFromLabel', () => {
    it('returns empty string for null or empty input', () => {
      expect(regionRowServedFromLabel(null)).toBe('')
      expect(regionRowServedFromLabel('')).toBe('')
      expect(regionRowServedFromLabel('  ')).toBe('')
    })

    it('extracts and resolves PoP code to city name if available', () => {
      // Cloudflare style
      expect(regionRowServedFromLabel('87c1d4a2b3c4d5e6-GRU')).toBe('São Paulo')
      // Vercel style
      expect(regionRowServedFromLabel('gru1::h6r2m')).toBe('São Paulo')
      // AWS style
      expect(regionRowServedFromLabel('IAD89-P1')).toBe('Dulles, VA')
    })

    it('returns the PoP code if city name is not available', () => {
      expect(regionRowServedFromLabel('87c1d4a2b3c4d5e6-XYZ')).toBe('XYZ')
    })
  })

  describe('regionRowCdnLabelTrimmed', () => {
    it('returns empty string for null inputs', () => {
      expect(regionRowCdnLabelTrimmed(null, null)).toBe('')
    })

    it('resolves CDN label from provider and servedBy', () => {
      expect(regionRowCdnLabelTrimmed('cloudflare', '87c1d4a2b3c4d5e6-GRU')).toBe('cloudflare')
      expect(regionRowCdnLabelTrimmed(null, '87c1d4a2b3c4d5e6-GRU')).toBe('Cloudflare')
    })

    it('handles cases with only servedBy', () => {
      expect(regionRowCdnLabelTrimmed(null, 'IAD89-P1')).toBe('AWS CloudFront') 
      expect(regionRowCdnLabelTrimmed(null, 'gru1::h6r2m')).toBe('Vercel')
    })
  })
})
