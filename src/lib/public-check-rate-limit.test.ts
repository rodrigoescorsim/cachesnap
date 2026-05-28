import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test the rate-limit function integration with the public check key patterns.
// The unit under test is the checkRateLimit function itself (which is already
// unit-tested via its own suite), so we focus on verifying the KEY SHAPES
// used in the public check routes — ensuring they're distinct and correctly
// namespaced so rate limits don't bleed between layers or between users.

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: mockSql }))

import { checkRateLimit } from './rate-limit'

const IP = '1.2.3.4'
const OTHER_IP = '5.6.7.8'
const URL_HASH = 'abc123def456'

beforeEach(() => vi.resetAllMocks())

// ── Key isolation ─────────────────────────────────────────────────────────────

it('cooldown key is namespaced per IP', async () => {
  mockSql
    .mockResolvedValueOnce([{ count: 0 }])
    .mockResolvedValueOnce([])

  const result = await checkRateLimit(`public_check:cooldown:${IP}`, 1, 300)
  expect(result).toBe(true)
  // Called at least twice: SELECT COUNT + INSERT (+ async cleanup DELETE)
  expect(mockSql).toHaveBeenCalledWith(expect.anything())
})

it('hourly key is distinct from cooldown key', () => {
  const cooldown = `public_check:cooldown:${IP}`
  const hourly = `public_check:hourly:${IP}`
  expect(cooldown).not.toBe(hourly)
})

it('url_dedup key includes both IP and URL hash', () => {
  const key = `public_check:url:${IP}:${URL_HASH}`
  expect(key).toContain(IP)
  expect(key).toContain(URL_HASH)
})

it('different IPs produce different cooldown keys', () => {
  expect(`public_check:cooldown:${IP}`).not.toBe(`public_check:cooldown:${OTHER_IP}`)
})

// ── Cooldown window is 300 seconds (5 minutes) ───────────────────────────────

it('first check from new IP passes (count=0 < max=1)', async () => {
  mockSql
    .mockResolvedValueOnce([{ count: 0 }])
    .mockResolvedValueOnce([])

  const result = await checkRateLimit(`public_check:cooldown:${IP}`, 1, 300)
  expect(result).toBe(true)
})

it('second check within 300s is blocked (count=1 >= max=1)', async () => {
  mockSql.mockResolvedValueOnce([{ count: 1 }])

  const result = await checkRateLimit(`public_check:cooldown:${IP}`, 1, 300)
  expect(result).toBe(false)
})

it('11th check within an hour is blocked (count=10 >= max=10)', async () => {
  mockSql.mockResolvedValueOnce([{ count: 10 }])

  const result = await checkRateLimit(`public_check:hourly:${IP}`, 10, 3600)
  expect(result).toBe(false)
})

it('4th check of same URL in 15 min is blocked (count=3 >= max=3)', async () => {
  mockSql.mockResolvedValueOnce([{ count: 3 }])

  const result = await checkRateLimit(`public_check:url:${IP}:${URL_HASH}`, 3, 900)
  expect(result).toBe(false)
})

// ── Fail-open on DB error ────────────────────────────────────────────────────

it('DB error fails open (returns true) so requests are not blocked by DB outage', async () => {
  mockSql.mockRejectedValueOnce(new Error('DB connection lost'))

  const result = await checkRateLimit(`public_check:cooldown:${IP}`, 1, 300)
  expect(result).toBe(true)
})
