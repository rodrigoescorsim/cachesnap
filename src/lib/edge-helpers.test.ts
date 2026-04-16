import { describe, it, expect } from 'vitest'
import { extractPop, detectCdn, popToCity } from './edge-helpers'

describe('extractPop', () => {
  it('extracts IATA code from a standard CF-Ray', () => {
    expect(extractPop('87c1d4a2b3c4d5e6-GRU')).toBe('GRU')
    expect(extractPop('abc123def456789a-IAD')).toBe('IAD')
    expect(extractPop('1234567890abcdef-FRA')).toBe('FRA')
  })

  it('handles 2-letter and 4-letter colo codes', () => {
    expect(extractPop('abcdef1234567890-SG')).toBe('SG')
    expect(extractPop('abcdef1234567890-LAXB')).toBe('LAXB')
  })

  it('returns null for null input', () => {
    expect(extractPop(null)).toBeNull()
  })

  it('returns null when no uppercase suffix after hyphen', () => {
    expect(extractPop('no-match-here')).toBeNull()  // ends with lowercase
    expect(extractPop('plainstring')).toBeNull()
    expect(extractPop('')).toBeNull()
  })

  it('extracts colo from Fastly cache-<node>-<COLO> format', () => {
    expect(extractPop('cache-lax8632-LAX')).toBe('LAX')
    expect(extractPop('cache-gru1234')).toBeNull()
  })

  it('extracts airport code from CloudFront POP token', () => {
    expect(extractPop('IAD89-P1')).toBe('IAD')
  })

  it('extracts Vercel region prefix from x-vercel-id style value', () => {
    expect(extractPop('gru1::h6r2m')).toBe('GRU')
  })
})

describe('popToCity', () => {
  it('translates known IATA codes to city names', () => {
    expect(popToCity('GRU')).toBe('São Paulo')
    expect(popToCity('gru')).toBe('São Paulo') // handles lowercase
    expect(popToCity('IAD')).toBe('Dulles, VA')
    expect(popToCity('FRA')).toBe('Frankfurt')
  })

  it('returns the input code if no mapping is found', () => {
    expect(popToCity('UNKNOWN')).toBe('UNKNOWN')
    expect(popToCity('XXX')).toBe('XXX')
  })

  it('returns null for null input', () => {
    expect(popToCity(null)).toBeNull()
  })
})

describe('detectCdn', () => {
  it('identifies Cloudflare from CF-Ray format', () => {
    expect(detectCdn('87c1d4a2b3c4d5e6-GRU')).toBe('Cloudflare')
    expect(detectCdn('abc123def456789a-IAD')).toBe('Cloudflare')
  })

  it('identifies Fastly from cache- prefix', () => {
    expect(detectCdn('cache-lax8632-LAX')).toBe('Fastly')
    expect(detectCdn('cache-gru1-GRU')).toBe('Fastly')
  })

  it('returns null for null input', () => {
    expect(detectCdn(null)).toBeNull()
  })

  it('returns null for unrecognized formats', () => {
    expect(detectCdn('some-random-value')).toBeNull()
    expect(detectCdn('nginx/1.21')).toBeNull()
    expect(detectCdn('')).toBeNull()
  })
})
