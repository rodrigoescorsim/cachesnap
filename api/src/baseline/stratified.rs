//! Shared rules for stratified TTFB baselines (calculator + anomaly detector).

/// Minimum samples in the 7-day window before we compare anomalies to a
/// stratum-specific baseline (HIT-only or explicit-MISS-only) instead of the
/// combined baseline. Keep in sync with SQL in `detector.rs` (ttfb_anomaly region query).
pub const STRATIFIED_BASELINE_MIN_SAMPLES: i32 = 30;

pub use crate::cache_status::{probe_is_cache_hit, probe_is_cache_miss};

/// Per-row TTFB fast limit: HIT → hit_ms; MISS → miss_ms; NO HEADER / bypass → hit_ms.
pub fn probe_ttfb_row_fast_threshold_ms(
    cache_status: Option<&str>,
    hit_ms: i32,
    miss_ms: i32,
) -> i32 {
    if probe_is_cache_hit(cache_status) {
        hit_ms
    } else if probe_is_cache_miss(cache_status) {
        miss_ms
    } else {
        hit_ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_ttfb_row_fast_threshold_ms_strict_for_no_header() {
        assert_eq!(
            probe_ttfb_row_fast_threshold_ms(Some("NO HEADER"), 500, 1500),
            500
        );
        assert_eq!(probe_ttfb_row_fast_threshold_ms(Some("MISS"), 500, 1500), 1500);
        assert_eq!(probe_ttfb_row_fast_threshold_ms(Some("HIT"), 500, 1500), 500);
        assert_eq!(
            probe_ttfb_row_fast_threshold_ms(Some("UPDATING"), 500, 1500),
            500
        );
        assert_eq!(probe_ttfb_row_fast_threshold_ms(None, 500, 1500), 500);
    }
}
