/**
 * Centralized logic for cache hit status across the frontend.
 */

export const CACHE_HIT_STATUSES = ['HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT'];
export const CACHE_MISS_STATUSES = ['MISS', 'EXPIRED', 'ERROR'];
export const CACHE_BYPASS_STATUSES = [
  'BYPASS',
  'DYNAMIC',
  'NONE',
  'PASS',
  'NO-CACHE',
  'UNCALCULABLE',
  'UNCACHEABLE',
  'IGNORED',
  'NO HEADER',
  'LAMBDAGENERATED',
  /** User-facing label for long CDN strings such as CloudFront `NOTCACHEABLE FROM CHILD`. */
  'NOT CACHEABLE',
];

/**
 * Same classification as Timescale `probe_results_hourly.cdn_count` / alert worker:
 * only these literal `cache_status` values count toward CDN hit-rate denominator.
 * BYPASS / DYNAMIC / compound vendor strings are excluded (not comparable edge-cache rows).
 */
export const PG_CACHE_CDN_HIT_FILTER =
  "cache_status IN ('HIT', 'STALE', 'REVALIDATED', 'UPDATING', 'REVALIDATE', 'REFRESH_HIT')"

export const PG_CACHE_CDN_CLASSIFIABLE_FILTER =
  "cache_status IN ('HIT', 'MISS', 'STALE', 'REVALIDATED', 'UPDATING', 'EXPIRED', 'REVALIDATE', 'REFRESH_HIT', 'REFRESH_MISS')"

/** Explicit CDN misses — lenient TTFB tier in row tables and slow-region SQL. */
export const PG_CACHE_CDN_MISS_FILTER =
  `cache_status IN (${CACHE_MISS_STATUSES.map((s) => `'${s}'`).join(', ')})`

/**
 * SQL boolean: row TTFB exceeds the per-row fast limit (slow region).
 * Aligns with `ttfbRowFastMs` in `thresholds.ts` (NO HEADER / bypass → hit threshold).
 */
export function pgTtfbExceedsRowLimitSql(opts: {
  ttfbExpr: string
  hitMsExpr: string
  missMsExpr: string
  statusExpr?: string
}): string {
  const status = opts.statusExpr ?? 'cache_status'
  const hitFilter = PG_CACHE_CDN_HIT_FILTER.replace(/^cache_status/, status)
  const missList = CACHE_MISS_STATUSES.map((s) => `'${s}'`).join(', ')
  return `CASE
    WHEN ${hitFilter} THEN ${opts.ttfbExpr} > ${opts.hitMsExpr}
    WHEN ${status} IN (${missList}) THEN ${opts.ttfbExpr} > ${opts.missMsExpr}
    ELSE ${opts.ttfbExpr} > ${opts.hitMsExpr}
  END`
}

/**
 * SQL fragment options shared by the cache-hit helpers below.
 * - `extraFilter`: AND-appended to the inner `cache_status IN (...)` predicate
 *   (used by callers that need `AND error IS NULL`).
 */
type CacheSqlOpts = { extraFilter?: string }

function withExtra(base: string, extra?: string): string {
  return extra ? `${base} AND ${extra}` : base
}

/** SQL fragment counting edge cache hits (numerator). Returns `::int`. */
export function pgCacheEdgeHitSamplesSqlExpr(opts: CacheSqlOpts = {}): string {
  return `COUNT(*) FILTER (WHERE ${withExtra(PG_CACHE_CDN_HIT_FILTER, opts.extraFilter)})::int`
}

/** SQL fragment counting CDN-classifiable probes (denominator). Returns `::int`. */
export function pgCacheCdnSamplesSqlExpr(opts: CacheSqlOpts = {}): string {
  return `COUNT(*) FILTER (WHERE ${withExtra(PG_CACHE_CDN_CLASSIFIABLE_FILTER, opts.extraFilter)})::int`
}

/**
 * SQL fragment for `cache_hit_pct = ROUND(100 * HIT / NULLIF(CDN, 0), decimals)`.
 * Returns `NULL` when there are no CDN-classifiable probes — same definition as
 * Timescale `probe_results_hourly.cdn_count`.
 *
 * Options:
 * - `decimals`: rounding precision (default 1).
 * - `extraFilter`: AND-appended to both inner predicates (e.g. `'error IS NULL'`).
 * - `cast`: optional Postgres cast appended to the outer ROUND (e.g. `'int'` or `'float'`).
 */
export function pgCacheHitPctSqlExpr(
  opts: { decimals?: number; extraFilter?: string; cast?: string } = {}
): string {
  const decimals = opts.decimals ?? 1
  const hit = withExtra(PG_CACHE_CDN_HIT_FILTER, opts.extraFilter)
  const cdn = withExtra(PG_CACHE_CDN_CLASSIFIABLE_FILTER, opts.extraFilter)
  const expr = `ROUND(
    (
      CASE
        WHEN COUNT(*) FILTER (WHERE ${cdn}) = 0 THEN NULL
        ELSE (100.0 * COUNT(*) FILTER (WHERE ${hit})
          / NULLIF(COUNT(*) FILTER (WHERE ${cdn}), 0))::numeric
      END
    ),
    ${decimals}
  )`
  return opts.cast ? `${expr}::${opts.cast}` : expr
}

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
 * Tooltip copy for cache badges (plain language; raw vendor text only when useful).
 */
export function getCacheStatusTooltip(status: string | null | undefined): string {
  if (!status || status === '—') {
    return 'No cache header detected'
  }
  const upper = status.toUpperCase()
  if (upper.includes('NOTCACHEABLE')) {
    return 'Not cacheable at the edge. Usually cache headers or dynamic content.'
  }
  if (upper.includes(':')) {
    const detail = status.slice(status.indexOf(':') + 1).trim()
    if (detail.length > 0) {
      return detail.length > 200 ? `${detail.slice(0, 197)}…` : detail
    }
  }
  if (isCacheHit(status)) return 'Cache hit observed'
  if (isCacheMiss(status)) return 'Request was cacheable but not found in edge cache'
  if (isCacheBypass(status)) return 'Response bypassed or skipped edge cache'
  return 'From response cache headers'
}

/**
 * Extracts a clean, short display label from a status string.
 * Example: "BYPASS:Cloudflare DYNAMIC" -> "DYNAMIC"
 */
export function getCacheDisplayLabel(status: string | null | undefined): string {
  if (!status || status === '—') return 'NO HEADER'
  const upper = status.toUpperCase()

  // CloudFront (and similar): internal "not cacheable at this edge tier" phrasing — unreadable in UI.
  if (upper.includes('NOTCACHEABLE')) {
    return 'NOT CACHEABLE'
  }

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
