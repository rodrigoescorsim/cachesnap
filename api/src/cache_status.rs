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

/// Canonical edge-cache hit literals — keep in sync with `CACHE_HIT_STATUSES` in TS.
pub const CACHE_HIT_STATUSES: &[&str] = &[
    "HIT", "STALE", "REVALIDATED", "UPDATING", "REVALIDATE", "REFRESH_HIT",
];

/// Explicit CDN miss literals — keep in sync with `CACHE_MISS_STATUSES` in TS.
pub const CACHE_MISS_STATUSES: &[&str] = &["MISS", "EXPIRED", "ERROR"];

/// Status strings counted as **edge cache hits** (numerator for `cache_hit_pct`).
pub const CACHE_HIT_FILTER: &str =
    "cache_status IN ('HIT','STALE','REVALIDATED','UPDATING','REVALIDATE','REFRESH_HIT')";

/// Explicit CDN misses — lenient TTFB tier in row tables and slow-region SQL.
pub const CACHE_CDN_MISS_FILTER: &str = "cache_status IN ('MISS','EXPIRED','ERROR')";

/// Status strings counted as **CDN-classifiable** (denominator for `cache_hit_pct`).
/// Excludes `BYPASS` / `DYNAMIC` / compound vendor strings — same set used by
/// `probe_results_hourly.cdn_count`.
pub const CACHE_CDN_CLASSIFIABLE_FILTER: &str =
    "cache_status IN ('HIT','MISS','STALE','REVALIDATED','UPDATING','EXPIRED','REVALIDATE','REFRESH_HIT','REFRESH_MISS')";

/// Runtime hit check — same set as [`CACHE_HIT_FILTER`] (not compound vendor strings).
#[inline]
pub fn probe_is_cache_hit(cache_status: Option<&str>) -> bool {
    cache_status.is_some_and(|s| CACHE_HIT_STATUSES.contains(&s))
}

/// Runtime miss check — same set as [`CACHE_CDN_MISS_FILTER`].
#[inline]
pub fn probe_is_cache_miss(cache_status: Option<&str>) -> bool {
    cache_status.is_some_and(|s| CACHE_MISS_STATUSES.contains(&s))
}

/// Short label for `ttfb_limit` alert summaries.
pub fn probe_ttfb_limit_alert_label(cache_status: Option<&str>) -> &'static str {
    if probe_is_cache_hit(cache_status) {
        "Cache HIT"
    } else if probe_is_cache_miss(cache_status) {
        "Cache MISS"
    } else if cache_status.is_some() {
        "Non-cacheable response"
    } else {
        "Response"
    }
}

/// Stratum phrase for TTFB anomaly alerts (7-day baseline comparison).
pub fn probe_anomaly_stratum_label(cache_status: Option<&str>) -> &'static str {
    if probe_is_cache_hit(cache_status) {
        "cached responses"
    } else if probe_is_cache_miss(cache_status) {
        "uncached / edge-miss responses"
    } else if cache_status.is_some() {
        "non-cacheable responses"
    } else {
        "all responses"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hit_statuses_match_sql_filter_literals() {
        for status in CACHE_HIT_STATUSES {
            assert!(
                CACHE_HIT_FILTER.contains(status),
                "CACHE_HIT_FILTER missing {status}"
            );
        }
    }

    #[test]
    fn miss_statuses_match_sql_filter_literals() {
        for status in CACHE_MISS_STATUSES {
            assert!(
                CACHE_CDN_MISS_FILTER.contains(status),
                "CACHE_CDN_MISS_FILTER missing {status}"
            );
        }
    }

    #[test]
    fn probe_is_cache_hit_includes_updating_and_refresh_hit() {
        assert!(probe_is_cache_hit(Some("UPDATING")));
        assert!(probe_is_cache_hit(Some("REFRESH_HIT")));
        assert!(probe_is_cache_hit(Some("REVALIDATE")));
        assert!(!probe_is_cache_hit(Some("MISS")));
        assert!(!probe_is_cache_hit(Some("DYNAMIC")));
        assert!(!probe_is_cache_hit(None));
    }

    #[test]
    fn alert_labels_distinguish_miss_from_bypass() {
        assert_eq!(probe_ttfb_limit_alert_label(Some("HIT")), "Cache HIT");
        assert_eq!(probe_ttfb_limit_alert_label(Some("MISS")), "Cache MISS");
        assert_eq!(
            probe_ttfb_limit_alert_label(Some("NO HEADER")),
            "Non-cacheable response"
        );
        assert_eq!(
            probe_anomaly_stratum_label(Some("UPDATING")),
            "cached responses"
        );
        assert_eq!(
            probe_anomaly_stratum_label(Some("BYPASS")),
            "non-cacheable responses"
        );
    }
}
