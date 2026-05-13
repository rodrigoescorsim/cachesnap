// Shared SQL predicates for `cache_status` classification.
//
// These constants mirror the definitions used by the Timescale `probe_results_hourly`
// continuous aggregate (`hit_count` / `cdn_count`) and the frontend constants in
// `src/lib/cache-utils.ts`. Use them in any raw SQL that needs to count "edge cache
// hits" or "CDN-classifiable probes" so the numerator/denominator stay in sync.
//
// Why this matters: using `COUNT(*)` (total probes) as denominator wrongly treats
// intentionally non-cacheable rows (`DYNAMIC`, `BYPASS`, vendor-prefixed strings, …)
// as 0% hit rate, which is what caused the false "Low Cache Hit Rate" alerts.

/// Status strings counted as **edge cache hits** (numerator for `cache_hit_pct`).
pub const CACHE_HIT_FILTER: &str =
    "cache_status IN ('HIT','STALE','REVALIDATED','UPDATING','REVALIDATE','REFRESH_HIT')";

/// Status strings counted as **CDN-classifiable** (denominator for `cache_hit_pct`).
/// Excludes `BYPASS` / `DYNAMIC` / compound vendor strings — same set used by
/// `probe_results_hourly.cdn_count`.
pub const CACHE_CDN_CLASSIFIABLE_FILTER: &str =
    "cache_status IN ('HIT','MISS','STALE','REVALIDATED','UPDATING','EXPIRED','REVALIDATE','REFRESH_HIT','REFRESH_MISS')";
