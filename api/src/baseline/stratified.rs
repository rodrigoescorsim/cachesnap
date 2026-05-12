//! Shared rules for stratified TTFB baselines (calculator + anomaly detector).

/// Minimum samples in the 7-day window before we compare anomalies to a
/// stratum-specific baseline (HIT-only or explicit-MISS-only) instead of the
/// combined baseline. Keep in sync with SQL in `detector.rs` (ttfb_anomaly region query).
pub const STRATIFIED_BASELINE_MIN_SAMPLES: i32 = 30;

/// Same definition as `check_probe_alerts` / alert thresholds (HIT path).
#[inline]
pub fn probe_is_cache_hit(cache_status: Option<&str>) -> bool {
    cache_status.is_some_and(|s| s == "HIT" || s == "STALE" || s == "REVALIDATED")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_is_cache_hit_matches_detector() {
        assert!(probe_is_cache_hit(Some("HIT")));
        assert!(probe_is_cache_hit(Some("STALE")));
        assert!(probe_is_cache_hit(Some("REVALIDATED")));
        assert!(!probe_is_cache_hit(Some("MISS")));
        assert!(!probe_is_cache_hit(Some("DYNAMIC")));
        assert!(!probe_is_cache_hit(None));
    }
}
