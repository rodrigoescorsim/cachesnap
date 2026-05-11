/**
 * Centralized logic for cache hit status across the frontend.
 */

export const CACHE_HIT_STATUSES = ['HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT'];
export const CACHE_MISS_STATUSES = ['MISS', 'EXPIRED', 'ERROR'];
export const CACHE_BYPASS_STATUSES = ['BYPASS', 'DYNAMIC', 'NONE', 'PASS', 'NO-CACHE', 'UNCALCULABLE', 'UNCACHEABLE', 'IGNORED', 'NO HEADER', 'LAMBDAGENERATED'];

/**
 * SQL fragment to be used in raw queries (Postgres/Neon).
 */
export const IS_HIT_SQL = `cache_status IN ('${CACHE_HIT_STATUSES.join("', '")}')`;

/**
 * Helper to check if a status string is a hit in JS logic.
 */
export function isCacheHit(status: string | null | undefined): boolean {
  if (!status) return false
  const label = getCacheDisplayLabel(status)
  return CACHE_HIT_STATUSES.includes(label)
}

/**
 * Helper to check if a status string is a miss.
 */
export function isCacheMiss(status: string | null | undefined): boolean {
  if (!status) return false
  const label = getCacheDisplayLabel(status)
  return CACHE_MISS_STATUSES.includes(label)
}

/**
 * Helper to check if a status string is a bypass/dynamic.
 */
export function isCacheBypass(status: string | null | undefined): boolean {
  if (!status) return true // Treat null/undefined as a bypass category (No Header)
  const label = getCacheDisplayLabel(status)
  return CACHE_BYPASS_STATUSES.includes(label)
}

/**
 * Extracts a clean, short display label from a status string.
 * Example: "BYPASS:Cloudflare DYNAMIC" -> "DYNAMIC"
 */
export function getCacheDisplayLabel(status: string | null | undefined): string {
  if (!status || status === '—') return 'NO HEADER'
  const upper = status.toUpperCase()

  // 1. CDN vendor-prefixed format: "BYPASS:Cloudflare DYNAMIC", "HIT:Vercel HIT", etc.
  //    Parse the suffix first so the actual CDN status wins over the category prefix.
  if (upper.includes(':')) {
    const details = upper.split(':')[1].trim()
    const words = details.split(' ')
    const lastWord = words[words.length - 1]
    const PROVIDERS = ['CLOUDFRONT', 'CLOUDFLARE', 'AKAMAI', 'FASTLY', 'VERCEL']
    if (PROVIDERS.includes(lastWord)) {
      if (words.length > 1) return words[words.length - 2]
      return upper.split(':')[0].trim()
    }
    return lastWord
  }

  // 2. Keyword shortcuts for plain (non-prefixed) statuses
  if (upper.includes('HIT')) return 'HIT'
  if (upper.includes('MISS')) return 'MISS'
  if (upper.includes('BYPASS')) return 'BYPASS'
  if (upper.includes('STALE')) return 'STALE'
  if (upper.includes('DYNAMIC')) return 'DYNAMIC'
  if (upper.includes('LAMBDAGENERATED')) return 'DYNAMIC'
  if (upper.includes('EXPIRED')) return 'EXPIRED'
  if (upper.includes('REVALIDATED')) return 'REVALIDATED'
  if (upper.includes('ERROR')) return 'MISS'

  return upper
}
