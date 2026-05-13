use crate::{alerts::worker, AppState};
use tracing::{info, warn};
use uuid::Uuid;

// Regional window: 4 closed hourly buckets (~48 probes/region at 5-min interval)
const REGIONAL_WINDOW_HOURS: i64 = 4;
// Minimum samples before firing — allows for some probe downtime
const REGIONAL_MIN_SAMPLES: i32 = 30;
// Global window: 1 closed hourly bucket (~96 probes across 8 regions)
const GLOBAL_MIN_SAMPLES: i32 = 70;

pub async fn run_cycle(state: &AppState) -> Result<(), anyhow::Error> {
    let bucket_hour: chrono::DateTime<chrono::Utc> = sqlx::query_scalar(
        "SELECT date_trunc('hour', NOW()) - INTERVAL '1 hour'",
    )
    .fetch_one(&state.db)
    .await?;

    let monitors = fetch_trend_monitors(state).await?;
    if monitors.is_empty() {
        return Ok(());
    }

    let mut fired = 0usize;
    let mut skipped = 0usize;

    for m in &monitors {
        let regions = sqlx::query_as::<_, (String,)>(
            "SELECT DISTINCT region FROM trend_baselines WHERE monitor_id = $1 AND bucket_hour = $2",
        )
        .bind(m.id)
        .bind(bucket_hour)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(r,)| r)
        .filter(|r| r != "__global__")
        .collect::<Vec<_>>();

        // Regional checks — 4h rolling window
        for region in &regions {
            if m.alert_cache_hit_trend_enabled {
                let (f, s) = check_regional(state, m, region, "cache_hit_pct", bucket_hour).await;
                fired += f; skipped += s;
            }
            if m.alert_ttfb_trend_enabled {
                let (f, s) = check_regional(state, m, region, "ttfb_avg_ms", bucket_hour).await;
                fired += f; skipped += s;
            }
        }

        // Global checks — 1h window via trend_baselines
        if m.alert_cache_hit_trend_global_enabled {
            let (f, s) = check_global(state, m, "cache_hit_pct", bucket_hour).await;
            fired += f; skipped += s;
        }
        if m.alert_ttfb_trend_global_enabled {
            let (f, s) = check_global(state, m, "ttfb_avg_ms", bucket_hour).await;
            fired += f; skipped += s;
        }
    }

    if fired > 0 || skipped > 0 {
        info!("trend_detector: bucket={} fired={} skipped={}", bucket_hour, fired, skipped);
    }

    Ok(())
}

struct MonitorTrendConfig {
    id: Uuid,
    alert_cache_hit_trend_enabled: bool,
    alert_cache_hit_trend_threshold_pp: f64,
    alert_cache_hit_trend_comparators: Vec<String>,
    alert_cache_hit_trend_global_enabled: bool,
    alert_cache_hit_trend_global_threshold_pp: f64,
    alert_ttfb_trend_enabled: bool,
    alert_ttfb_trend_threshold_pct: f64,
    alert_ttfb_trend_comparators: Vec<String>,
    alert_ttfb_trend_direction: String,
    alert_ttfb_trend_global_enabled: bool,
    alert_ttfb_trend_global_threshold_pct: f64,
}

async fn fetch_trend_monitors(state: &AppState) -> Result<Vec<MonitorTrendConfig>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (
        Uuid, bool, f64, Vec<String>, bool, f64,
        bool, f64, Vec<String>, String, bool, f64,
    )>(
        r#"
        SELECT id,
               alert_cache_hit_trend_enabled,        alert_cache_hit_trend_threshold_pp,  alert_cache_hit_trend_comparators,
               alert_cache_hit_trend_global_enabled,  alert_cache_hit_trend_global_threshold_pp,
               alert_ttfb_trend_enabled,              alert_ttfb_trend_threshold_pct,      alert_ttfb_trend_comparators,
               alert_ttfb_trend_direction,
               alert_ttfb_trend_global_enabled,       alert_ttfb_trend_global_threshold_pct
        FROM monitors
        WHERE is_active = true
          AND (alert_cache_hit_trend_enabled = true OR alert_ttfb_trend_enabled = true
               OR alert_cache_hit_trend_global_enabled = true OR alert_ttfb_trend_global_enabled = true)
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(rows.into_iter().map(|(
        id,
        cache_en, cache_thr, cache_cmp, cache_g_en, cache_g_thr,
        ttfb_en, ttfb_thr, ttfb_cmp, ttfb_dir, ttfb_g_en, ttfb_g_thr,
    )| MonitorTrendConfig {
        id,
        alert_cache_hit_trend_enabled: cache_en,
        alert_cache_hit_trend_threshold_pp: cache_thr,
        alert_cache_hit_trend_comparators: cache_cmp,
        alert_cache_hit_trend_global_enabled: cache_g_en,
        alert_cache_hit_trend_global_threshold_pp: cache_g_thr,
        alert_ttfb_trend_enabled: ttfb_en,
        alert_ttfb_trend_threshold_pct: ttfb_thr,
        alert_ttfb_trend_comparators: ttfb_cmp,
        alert_ttfb_trend_direction: ttfb_dir,
        alert_ttfb_trend_global_enabled: ttfb_g_en,
        alert_ttfb_trend_global_threshold_pct: ttfb_g_thr,
    }).collect())
}

/// Fetches the 4h rolling aggregate for a single region from probe_results_hourly.
/// Returns (cache_hit_pct, ttfb_avg_ms, cdn_count, sample_count).
///
/// `cdn_count` (CDN-classifiable probes) is the right sample size for the cache_hit_pct
/// metric — it matches the denominator used to compute the ratio and aligns with
/// `trend_baselines.current_samples` (see `baseline_computer.rs`). Using `total_count`
/// here would let trend alerts pass the min-samples gate while having almost zero
/// comparable CDN probes (e.g. DYNAMIC-heavy sites).
async fn fetch_regional_rolling(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> Result<Option<(Option<f64>, Option<f64>, i32, i32)>, sqlx::Error> {
    let window_start = bucket_hour - chrono::Duration::hours(REGIONAL_WINDOW_HOURS - 1);
    let row = sqlx::query_as::<_, (Option<f64>, Option<f64>, Option<i64>, Option<i64>)>(
        r#"
        SELECT
            CASE WHEN SUM(cdn_count) > 0
                 THEN SUM(hit_count)::float8 / SUM(cdn_count) * 100.0
                 ELSE NULL END,
            CASE WHEN SUM(sample_count) > 0
                 THEN SUM(ttfb_sum_ms) / SUM(sample_count)
                 ELSE NULL END,
            SUM(cdn_count)::bigint,
            SUM(sample_count)::bigint
        FROM probe_results_hourly
        WHERE monitor_id = $1
          AND region    = $2
          AND bucket   >= $3
          AND bucket   <= $4
        "#,
    )
    .bind(monitor_id)
    .bind(region)
    .bind(window_start)
    .bind(bucket_hour)
    .fetch_optional(&state.db)
    .await?;

    Ok(row.map(|(hit_pct, ttfb, cdn, samples)| {
        (hit_pct, ttfb, cdn.unwrap_or(0) as i32, samples.unwrap_or(0) as i32)
    }))
}

struct BaselineRow {
    current_value: Option<f64>,
    current_samples: Option<i32>,
    prev_hour_value: Option<f64>,
    prev_hour_samples: Option<i32>,
    same_hour_yday_value: Option<f64>,
    same_hour_yday_samples: Option<i32>,
    day_avg_value: Option<f64>,
    day_avg_samples: Option<i32>,
}

async fn fetch_baseline(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    metric: &str,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> Result<Option<BaselineRow>, sqlx::Error> {
    let row = sqlx::query_as::<_, (
        Option<f64>, Option<i32>,
        Option<f64>, Option<i32>,
        Option<f64>, Option<i32>,
        Option<f64>, Option<i32>,
    )>(
        r#"
        SELECT current_value, current_samples,
               prev_hour_value, prev_hour_samples,
               same_hour_yday_value, same_hour_yday_samples,
               day_avg_value, day_avg_samples
        FROM trend_baselines
        WHERE monitor_id = $1 AND region = $2 AND metric = $3 AND bucket_hour = $4
        "#,
    )
    .bind(monitor_id)
    .bind(region)
    .bind(metric)
    .bind(bucket_hour)
    .fetch_optional(&state.db)
    .await?;

    Ok(row.map(|(cv, cs, phv, phs, sdv, sds, dav, das)| BaselineRow {
        current_value: cv,
        current_samples: cs,
        prev_hour_value: phv,
        prev_hour_samples: phs,
        same_hour_yday_value: sdv,
        same_hour_yday_samples: sds,
        day_avg_value: dav,
        day_avg_samples: das,
    }))
}

fn delta_pct(current: f64, reference: f64) -> f64 {
    (current - reference) / reference * 100.0
}

fn cache_hit_pp_signed_delta(current: f64, reference: f64) -> f64 {
    current - reference
}

fn cache_hit_relative_drop_pct(current: f64, reference: f64) -> f64 {
    if reference <= 0.0 { return 0.0; }
    (reference - current) / reference * 100.0
}

fn should_fire_cache_hit_pp_drop(current: f64, reference: f64, threshold_pp: f64) -> bool {
    if reference <= 0.0 { return false; }
    (reference - current) >= threshold_pp
}

fn should_fire_ttfb(delta: f64, threshold: f64, direction: &str) -> bool {
    if delta >= threshold { return true; }
    if direction == "both" && delta <= -threshold { return true; }
    false
}

fn alert_type_for(metric: &str, scope: &str, is_improvement: bool) -> &'static str {
    match (metric, scope, is_improvement) {
        ("cache_hit_pct", "region", _)     => "cache_hit_trend_drop_region",
        ("cache_hit_pct", "global", _)     => "cache_hit_trend_drop_global",
        ("ttfb_avg_ms",   "region", false) => "ttfb_trend_up_region",
        ("ttfb_avg_ms",   "global", false) => "ttfb_trend_up_global",
        ("ttfb_avg_ms",   "region", true)  => "ttfb_trend_down_region",
        ("ttfb_avg_ms",   "global", true)  => "ttfb_trend_down_global",
        _ => "unknown_trend",
    }
}

/// Regional check: current value is a 4h rolling average from probe_results_hourly.
/// Reference values come from trend_baselines (pre-computed prev_hour / day_avg / same_hour_yday).
async fn check_regional(
    state: &AppState,
    m: &MonitorTrendConfig,
    region: &str,
    metric: &str,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> (usize, usize) {
    let comparators = if metric == "cache_hit_pct" {
        &m.alert_cache_hit_trend_comparators
    } else {
        &m.alert_ttfb_trend_comparators
    };
    let threshold = if metric == "cache_hit_pct" {
        m.alert_cache_hit_trend_threshold_pp
    } else {
        m.alert_ttfb_trend_threshold_pct
    };

    let rolling = match fetch_regional_rolling(state, m.id, region, bucket_hour).await {
        Ok(Some(r)) => r,
        Ok(None) => {
            warn!("trend_detector: regional monitor={} region={} metric={} decision=skipped reason=no_rolling_data", m.id, region, metric);
            return (0, comparators.len());
        }
        Err(e) => {
            warn!("trend_detector: regional monitor={} region={} metric={} decision=skipped reason=db_error error={}", m.id, region, metric, e);
            return (0, comparators.len());
        }
    };

    let (current, current_samples) = if metric == "cache_hit_pct" {
        (rolling.0, rolling.2)  // cache_hit_pct, cdn_count (CDN-classifiable probes only)
    } else {
        (rolling.1, rolling.3)  // ttfb_avg_ms, sample_count
    };

    let current = match current {
        Some(v) => v,
        None => {
            warn!("trend_detector: regional monitor={} region={} metric={} decision=skipped reason=no_current_value", m.id, region, metric);
            return (0, comparators.len());
        }
    };

    if current_samples < REGIONAL_MIN_SAMPLES {
        warn!(
            "trend_detector: regional monitor={} region={} metric={} decision=skipped reason=insufficient_samples count={} min={}",
            m.id, region, metric, current_samples, REGIONAL_MIN_SAMPLES
        );
        return (0, comparators.len());
    }

    // Reference values come from trend_baselines (1h granularity — acceptable as reference even for 4h current)
    let baseline = match fetch_baseline(state, m.id, region, metric, bucket_hour).await {
        Ok(Some(b)) => b,
        Ok(None) => {
            warn!("trend_detector: regional monitor={} region={} metric={} decision=skipped reason=no_baseline", m.id, region, metric);
            return (0, comparators.len());
        }
        Err(e) => {
            warn!("trend_detector: regional monitor={} region={} metric={} decision=skipped reason=baseline_db_error error={}", m.id, region, metric, e);
            return (0, comparators.len());
        }
    };

    run_comparators(state, m, region, "region", metric, comparators, current, current_samples, &baseline, threshold, bucket_hour).await
}

/// Global check: current value is the 1h aggregate from trend_baselines (__global__).
async fn check_global(
    state: &AppState,
    m: &MonitorTrendConfig,
    metric: &str,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> (usize, usize) {
    let comparators = if metric == "cache_hit_pct" {
        &m.alert_cache_hit_trend_comparators
    } else {
        &m.alert_ttfb_trend_comparators
    };
    let threshold = if metric == "cache_hit_pct" {
        m.alert_cache_hit_trend_global_threshold_pp
    } else {
        m.alert_ttfb_trend_global_threshold_pct
    };

    let baseline = match fetch_baseline(state, m.id, "__global__", metric, bucket_hour).await {
        Ok(Some(b)) => b,
        Ok(None) => {
            warn!("trend_detector: global monitor={} metric={} decision=skipped reason=no_baseline", m.id, metric);
            return (0, comparators.len());
        }
        Err(e) => {
            warn!("trend_detector: global monitor={} metric={} decision=skipped reason=db_error error={}", m.id, metric, e);
            return (0, comparators.len());
        }
    };

    let current = match baseline.current_value {
        Some(v) => v,
        None => {
            warn!("trend_detector: global monitor={} metric={} decision=skipped reason=no_current_value", m.id, metric);
            return (0, comparators.len());
        }
    };

    let current_samples = baseline.current_samples.unwrap_or(0);
    if current_samples < GLOBAL_MIN_SAMPLES {
        warn!(
            "trend_detector: global monitor={} metric={} decision=skipped reason=insufficient_samples count={} min={}",
            m.id, metric, current_samples, GLOBAL_MIN_SAMPLES
        );
        return (0, comparators.len());
    }

    run_comparators(state, m, "__global__", "global", metric, comparators, current, current_samples, &baseline, threshold, bucket_hour).await
}

async fn run_comparators(
    state: &AppState,
    m: &MonitorTrendConfig,
    region: &str,
    scope: &str,
    metric: &str,
    comparators: &[String],
    current: f64,
    _current_samples: i32,
    baseline: &BaselineRow,
    threshold: f64,
    _bucket_hour: chrono::DateTime<chrono::Utc>,
) -> (usize, usize) {
    let mut fired = 0usize;
    let mut skipped = 0usize;

    for comparator in comparators {
        let (ref_value, ref_samples) = match comparator.as_str() {
            "prev_hour"          => (baseline.prev_hour_value,      baseline.prev_hour_samples.unwrap_or(0)),
            "same_hour_prev_day" => (baseline.same_hour_yday_value,  baseline.same_hour_yday_samples.unwrap_or(0)),
            "day_avg"            => (baseline.day_avg_value,         baseline.day_avg_samples.unwrap_or(0)),
            _ => {
                warn!("trend_detector: unknown comparator {}", comparator);
                skipped += 1;
                continue;
            }
        };

        let min_ref = if scope == "global" { GLOBAL_MIN_SAMPLES } else { REGIONAL_MIN_SAMPLES / 2 };
        let reference = match ref_value {
            Some(v) if v > 0.0 && ref_samples >= min_ref => v,
            _ => {
                warn!(
                    "trend_detector: monitor={} region={} metric={} comparator={} decision=skipped reason=no_reference",
                    m.id, region, metric, comparator
                );
                skipped += 1;
                continue;
            }
        };

        let fires = if metric == "cache_hit_pct" {
            should_fire_cache_hit_pp_drop(current, reference, threshold)
        } else {
            let delta = delta_pct(current, reference);
            should_fire_ttfb(delta, threshold, &m.alert_ttfb_trend_direction)
        };

        if !fires {
            skipped += 1;
            continue;
        }

        let delta_for_incident: f64 = if metric == "cache_hit_pct" {
            cache_hit_pp_signed_delta(current, reference)
        } else {
            delta_pct(current, reference)
        };

        let is_improvement = metric == "ttfb_avg_ms" && delta_for_incident <= -threshold;
        let alert_type = alert_type_for(metric, scope, is_improvement);

        let comparator_label = match comparator.as_str() {
            "prev_hour"          => "previous hour",
            "same_hour_prev_day" => "same time yesterday",
            "day_avg"            => "24h average",
            other                => other,
        };

        let (diagnosis, action) = build_messages(metric, region, scope, comparator_label, current, reference, delta_for_incident);

        let affected = vec![region.to_string()];
        if let Err(e) = worker::handle_incident(
            state, m.id, alert_type, affected,
            Some(current), Some(reference),
            Some(diagnosis), Some(action),
            Some(delta_for_incident), Some(comparator.clone()), None,
        ).await {
            warn!("trend_detector: handle_incident failed monitor={} type={}: {}", m.id, alert_type, e);
            skipped += 1;
            continue;
        }

        info!(
            "trend_detector: monitor={} scope={} region={} metric={} comparator={} decision=fired delta={:.1}{}",
            m.id, scope, region, metric, comparator,
            delta_for_incident,
            if metric == "cache_hit_pct" { "pp" } else { "%" }
        );
        fired += 1;
    }

    (fired, skipped)
}

fn build_messages(
    metric: &str,
    region: &str,
    scope: &str,
    comparator_label: &str,
    current: f64,
    reference: f64,
    delta_pp_signed: f64,
) -> (String, String) {
    let scope_prefix = if scope == "global" { "[Global] " } else { "" };

    let (diagnosis, action) = if metric == "cache_hit_pct" {
        let pp_drop = (-delta_pp_signed).max(0.0);
        let rel = cache_hit_relative_drop_pct(current, reference);
        let diagnosis = format!(
            "{}Cache hit fell {:.1} pp vs {} ({:.1}% relative) · {} · {:.1}% now vs {:.1}% reference",
            scope_prefix, pp_drop, comparator_label, rel,
            if scope == "region" { region } else { "all regions" },
            current, reference,
        );
        let action = "Investigate CDN cache configuration or sudden traffic pattern change. Common causes: short TTL, missing Cache-Control headers, or high dynamic content ratio.".to_string();
        (diagnosis, action)
    } else {
        let direction = if delta_pp_signed > 0.0 { "increased" } else { "improved" };
        let diagnosis = format!(
            "{}TTFB {} {:.1}% vs {} · {} · {:.0}ms now vs {:.0}ms reference",
            scope_prefix, direction, delta_pp_signed.abs(), comparator_label,
            if scope == "region" { region } else { "all regions" },
            current, reference,
        );
        let action = "Check origin server latency, CDN routing changes, or upstream infrastructure. Compare edge vs origin TTFB in the Performance tab.".to_string();
        (diagnosis, action)
    };

    (diagnosis, action)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_delta_pct_nominal() {
        assert!((delta_pct(90.0, 100.0) - (-10.0)).abs() < 1e-9);
        assert!((delta_pct(110.0, 100.0) - 10.0).abs() < 1e-9);
        assert!((delta_pct(100.0, 100.0)).abs() < 1e-9);
    }

    #[test]
    fn test_delta_pct_small_reference() {
        let d = delta_pct(1.0, 0.1);
        assert!(d > 0.0);
    }

    #[test]
    fn test_cache_hit_pp_drop_fires() {
        assert!(should_fire_cache_hit_pp_drop(5.0, 20.0, 10.0));   // −15 pp
        assert!(should_fire_cache_hit_pp_drop(10.4, 20.5, 10.0));  // 10.1 pp
        assert!(!should_fire_cache_hit_pp_drop(11.0, 20.0, 10.0)); // 9 pp — no fire
        assert!(!should_fire_cache_hit_pp_drop(25.0, 20.0, 10.0)); // improvement
        assert!(!should_fire_cache_hit_pp_drop(10.0, 0.0, 5.0));   // invalid ref
    }

    #[test]
    fn test_cache_hit_pp_signed_delta() {
        assert!((cache_hit_pp_signed_delta(5.0, 15.5) - (-10.5)).abs() < 1e-9);
    }

    #[test]
    fn test_cache_hit_relative_drop_pct_message() {
        assert!((cache_hit_relative_drop_pct(5.0, 10.5) - 52.380952).abs() < 0.01);
    }

    #[test]
    fn test_ttfb_worsening_only() {
        assert!(should_fire_ttfb(10.0, 10.0, "worsening"));
        assert!(should_fire_ttfb(15.0, 10.0, "worsening"));
        assert!(!should_fire_ttfb(9.9, 10.0, "worsening"));
        assert!(!should_fire_ttfb(-15.0, 10.0, "worsening"));
    }

    #[test]
    fn test_ttfb_both_directions() {
        assert!(should_fire_ttfb(10.0, 10.0, "both"));
        assert!(should_fire_ttfb(-10.0, 10.0, "both"));
        assert!(should_fire_ttfb(-15.0, 10.0, "both"));
        assert!(!should_fire_ttfb(-9.9, 10.0, "both"));
        assert!(!should_fire_ttfb(9.9, 10.0, "both"));
    }

    #[test]
    fn test_alert_type_routing() {
        assert_eq!(alert_type_for("cache_hit_pct", "region", false), "cache_hit_trend_drop_region");
        assert_eq!(alert_type_for("cache_hit_pct", "global", false), "cache_hit_trend_drop_global");
        assert_eq!(alert_type_for("ttfb_avg_ms",   "region", false), "ttfb_trend_up_region");
        assert_eq!(alert_type_for("ttfb_avg_ms",   "global", false), "ttfb_trend_up_global");
        assert_eq!(alert_type_for("ttfb_avg_ms",   "region", true),  "ttfb_trend_down_region");
        assert_eq!(alert_type_for("ttfb_avg_ms",   "global", true),  "ttfb_trend_down_global");
    }

    #[test]
    fn test_regional_20pp_threshold_needs_5_flips() {
        // 48 probes in 4h → each probe = 100/48 ≈ 2.08 pp
        // 20 pp threshold requires ≈ 10 flips — solid signal
        let reference = 100.0f64;
        let current_9_flips  = 100.0 - 9.0 * (100.0 / 48.0); // ~18.75 pp drop — no fire
        let current_10_flips = 100.0 - 10.0 * (100.0 / 48.0); // ~20.83 pp drop — fires
        assert!(!should_fire_cache_hit_pp_drop(current_9_flips,  reference, 20.0));
        assert!( should_fire_cache_hit_pp_drop(current_10_flips, reference, 20.0));
    }

    #[test]
    fn test_global_10pp_threshold_needs_10_flips() {
        // 96 probes in 1h (8 regions) → each probe = 100/96 ≈ 1.04 pp
        // 10 pp threshold requires ≈ 10 flips — solid signal
        let reference = 100.0f64;
        let current_9_flips  = 100.0 - 9.0 * (100.0 / 96.0); // ~9.375 pp — no fire
        let current_10_flips = 100.0 - 10.0 * (100.0 / 96.0); // ~10.42 pp — fires
        assert!(!should_fire_cache_hit_pp_drop(current_9_flips,  reference, 10.0));
        assert!( should_fire_cache_hit_pp_drop(current_10_flips, reference, 10.0));
    }
}
