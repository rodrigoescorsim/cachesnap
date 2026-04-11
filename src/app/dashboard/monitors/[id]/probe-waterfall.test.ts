import { describe, it, expect } from 'vitest'
import {
  pct,
  breakdownEntries,
  breakdownColor,
  cacheClass,
  formatAge,
} from './probe-waterfall.helpers'

// ── pct ──────────────────────────────────────────────────────────────────────

describe('pct', () => {
  it('returns correct percentage of total', () => {
    expect(pct(50, 100)).toBe('50.00%')
    expect(pct(25, 200)).toBe('12.50%')
  })

  it('clamps minimum to 0.5% so tiny segments stay visible', () => {
    expect(pct(0.1, 10000)).toBe('0.50%')
    expect(pct(1, 10000)).toBe('0.50%')
  })

  it('clamps maximum to 100%', () => {
    expect(pct(200, 100)).toBe('100.00%')
  })

  it('returns 0% when total is zero or negative', () => {
    expect(pct(50, 0)).toBe('0%')
    expect(pct(50, -1)).toBe('0%')
  })

  it('returns 0% when value is zero', () => {
    expect(pct(0, 100)).toBe('0%')
  })
})

// ── breakdownEntries ──────────────────────────────────────────────────────────

describe('breakdownEntries', () => {
  it('returns empty array for null input', () => {
    expect(breakdownEntries(null)).toEqual([])
  })

  it('filters out zero and negative values', () => {
    const result = breakdownEntries({ db: 10, cache: 0, app: -5, auth: 3 })
    expect(result.map(([k]) => k)).not.toContain('cache')
    expect(result.map(([k]) => k)).not.toContain('app')
  })

  it('sorts by value descending', () => {
    const result = breakdownEntries({ auth: 5, db: 20, app: 12 })
    expect(result.map(([k]) => k)).toEqual(['db', 'app', 'auth'])
  })

  it('coerces string values to numbers (DB may return strings from JSONB)', () => {
    // postgres.js typically returns JSONB numbers as numbers, but guard against strings
    const result = breakdownEntries({ db: '15' as unknown as number, app: '8' as unknown as number })
    expect(result).toEqual([['db', 15], ['app', 8]])
  })

  it('excludes non-finite values', () => {
    const result = breakdownEntries({ db: NaN, app: Infinity, auth: 5 })
    expect(result.map(([k]) => k)).toEqual(['auth'])
  })
})

// ── breakdownColor ────────────────────────────────────────────────────────────

describe('breakdownColor', () => {
  it('maps known DB-related names to red', () => {
    expect(breakdownColor('db')).toBe('bg-red-400')
    expect(breakdownColor('database')).toBe('bg-red-400')
    expect(breakdownColor('sql')).toBe('bg-red-400')
    expect(breakdownColor('mydb')).toBe('bg-red-400')
  })

  it('maps auth to violet', () => {
    expect(breakdownColor('auth')).toBe('bg-violet-400')
    expect(breakdownColor('authentication')).toBe('bg-violet-400')
  })

  it('maps cache/hit to violet (cache layer)', () => {
    expect(breakdownColor('cache')).toBe('bg-violet-400')
    expect(breakdownColor('cache-lookup')).toBe('bg-violet-400')
    expect(breakdownColor('hit')).toBe('bg-violet-500')
  })

  it('maps edge/cdn/cf to Edge fill (hex arbitrary, matches timing palette)', () => {
    expect(breakdownColor('edge')).toBe('bg-[#38bdf8]')
    expect(breakdownColor('cf-edge')).toBe('bg-[#38bdf8]')
    expect(breakdownColor('cdn')).toBe('bg-[#38bdf8]')
    expect(breakdownColor('cf')).toBe('bg-[#38bdf8]')
  })

  it('maps tcp to blue', () => {
    expect(breakdownColor('tcp')).toBe('bg-blue-500')
    expect(breakdownColor('tcp-handshake')).toBe('bg-blue-500')
  })

  it('maps app/server to amber', () => {
    expect(breakdownColor('app')).toBe('bg-amber-500')
    expect(breakdownColor('server')).toBe('bg-amber-500')
    expect(breakdownColor('appserver')).toBe('bg-amber-500')
  })

  it('falls back to zinc for unknown names', () => {
    expect(breakdownColor('unknown')).toBe('bg-zinc-400')
    expect(breakdownColor('xyz')).toBe('bg-zinc-400')
    expect(breakdownColor('')).toBe('bg-zinc-400')
  })
})

// ── cacheClass ────────────────────────────────────────────────────────────────

describe('cacheClass', () => {
  it('returns emerald for HIT', () => {
    const cls = cacheClass('HIT')
    expect(cls).toContain('emerald')
  })

  it('is case-insensitive', () => {
    expect(cacheClass('hit')).toBe(cacheClass('HIT'))
  })

  it('returns amber for MISS', () => {
    const cls = cacheClass('MISS')
    expect(cls).toContain('amber')
  })

  it('returns zinc for BYPASS and DYNAMIC', () => {
    expect(cacheClass('BYPASS')).toContain('zinc')
    expect(cacheClass('DYNAMIC')).toContain('zinc')
  })

  it('returns zinc for null', () => {
    expect(cacheClass(null)).toContain('zinc')
  })
})

// ── formatAge ────────────────────────────────────────────────────────────────

describe('formatAge', () => {
  it('returns null for null, 0, or negative', () => {
    expect(formatAge(null)).toBeNull()
    expect(formatAge(0)).toBeNull()
    expect(formatAge(-10)).toBeNull()
  })

  it('formats seconds under 1h as minutes', () => {
    expect(formatAge(120)).toBe('2m')
    expect(formatAge(3599)).toBe('60m')
  })

  it('formats seconds between 1h and 24h as hours', () => {
    expect(formatAge(3600)).toBe('1h')
    expect(formatAge(7200)).toBe('2h')
  })

  it('formats seconds over 24h as days', () => {
    expect(formatAge(86400)).toBe('1d')
    expect(formatAge(172800)).toBe('2d')
    expect(formatAge(259200)).toBe('3d')
  })
})
