/**
 * Centralized logic for cache hit status across the frontend.
 */

export const CACHE_HIT_STATUSES = ['HIT', 'STALE', 'REVALIDATED', 'UPDATING'];

/**
 * SQL fragment to be used in raw queries (Postgres/Neon).
 */
export const IS_HIT_SQL = `cache_status IN ('${CACHE_HIT_STATUSES.join("', '")}')`;

/**
 * Helper to check if a status string is a hit in JS logic.
 */
export function isCacheHit(status: string | null | undefined): boolean {
  if (!status) return false;
  return CACHE_HIT_STATUSES.includes(status.toUpperCase());
}
