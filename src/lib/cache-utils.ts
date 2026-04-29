/**
 * Centralized logic for cache hit status across the frontend.
 */

export const CACHE_HIT_STATUSES = ['HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT'];
export const CACHE_MISS_STATUSES = ['MISS', 'EXPIRED', 'ERROR'];
export const CACHE_BYPASS_STATUSES = ['BYPASS', 'DYNAMIC', 'NONE', 'PASS', 'NO-CACHE', 'UNCALCULABLE', 'UNCACHEABLE', 'IGNORED', 'NO HEADER'];

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
  
  if (upper.includes(':')) {
    const parts = upper.split(':')
    const details = parts[1].trim() // "Cloudflare DYNAMIC"
    const detailParts = details.split(' ')
    // We take the last word, which is typically the status (HIT, MISS, DYNAMIC, etc.)
    return detailParts[detailParts.length - 1]
  }
  
  return upper
}
