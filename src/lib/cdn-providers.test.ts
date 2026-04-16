import { describe, it, expect } from 'vitest'
import {
  detectCdnProvider,
  resolveCdnLabel,
  cdnSignalsFromHeaderMap,
} from './cdn-providers'

describe('detectCdnProvider', () => {
  it('identifies Cloudflare from cf-ray', () => {
    expect(detectCdnProvider({ cfRay: 'abc-GRU' })).toBe('Cloudflare')
  })

  it('identifies AWS CloudFront from amz headers', () => {
    expect(detectCdnProvider({ xAmzCfPop: 'IAD89-P1' })).toBe('AWS CloudFront')
    expect(detectCdnProvider({ xAmzCfId: 'opaque' })).toBe('AWS CloudFront')
  })

  it('identifies Vercel', () => {
    expect(detectCdnProvider({ xVercelId: 'gru1::x' })).toBe('Vercel')
    expect(detectCdnProvider({ server: 'Vercel' })).toBe('Vercel')
  })

  it('identifies Netlify', () => {
    expect(detectCdnProvider({ xNfRequestId: '01...' })).toBe('Netlify')
    expect(detectCdnProvider({ via: '1.1 Netlify' })).toBe('Netlify')
  })

  it('identifies BunnyCDN', () => {
    expect(detectCdnProvider({ xBunnycdnCache: 'HIT' })).toBe('BunnyCDN')
    expect(detectCdnProvider({ server: 'BunnyCDN' })).toBe('BunnyCDN')
  })

  it('identifies Fastly', () => {
    expect(detectCdnProvider({ xFastlyRequestId: 'abc' })).toBe('Fastly')
    expect(detectCdnProvider({ xServedBy: 'cache-lax123-LAX' })).toBe('Fastly')
    expect(detectCdnProvider({ xTimer: 'S123' })).toBe('Fastly')
  })

  it('identifies Akamai, Azure, KeyCDN, Imperva', () => {
    expect(detectCdnProvider({ xAkamaiRequestId: 'x' })).toBe('Akamai')
    expect(detectCdnProvider({ xAzureRef: 'ref' })).toBe('Azure CDN')
    expect(detectCdnProvider({ xKeycdn: 'HIT' })).toBe('KeyCDN')
    expect(detectCdnProvider({ via: '1.1 incapsula' })).toBe('Imperva')
  })

  it('identifies LiteSpeed / QUIC.cloud', () => {
    expect(detectCdnProvider({ xLiteSpeedCache: 'hit' })).toBe('QUIC.cloud / LiteSpeed')
  })

  it('identifies Fly.io', () => {
    expect(detectCdnProvider({ server: 'Fly/fly.io' })).toBe('Fly.io')
  })

  it('falls back to served_by patterns', () => {
    expect(detectCdnProvider({ servedBy: '87c1d4a2b3c4d5e6-GRU' })).toBe('Cloudflare')
    expect(detectCdnProvider({ servedBy: 'gru1::h6r2m' })).toBe('Vercel')
    expect(detectCdnProvider({ servedBy: 'cache-lax8632-LAX' })).toBe('Fastly')
    expect(detectCdnProvider({ servedBy: 'IAD89-P1' })).toBe('AWS CloudFront')
  })

  it('returns null when unknown', () => {
    expect(detectCdnProvider({ server: 'nginx' })).toBeNull()
    expect(detectCdnProvider({ servedBy: 'random' })).toBeNull()
  })
})

describe('cdnSignalsFromHeaderMap', () => {
  it('reads lowercase header keys', () => {
    const s = cdnSignalsFromHeaderMap({
      'cf-ray': 'x',
      'x-amz-cf-pop': 'IAD89-P1',
      server: 'nginx',
    })
    expect(s.cfRay).toBe('x')
    expect(s.xAmzCfPop).toBe('IAD89-P1')
    expect(s.server).toBe('nginx')
  })
})

describe('resolveCdnLabel', () => {
  it('prefers stored label', () => {
    expect(resolveCdnLabel('AWS CloudFront', 'ignored')).toBe('AWS CloudFront')
  })

  it('falls back to heuristic', () => {
    expect(resolveCdnLabel(null, '87c1d4a2b3c4d5e6-GRU')).toBe('Cloudflare')
    expect(resolveCdnLabel('', '87c1d4a2b3c4d5e6-GRU')).toBe('Cloudflare')
  })
})
