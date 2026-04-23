use crate::{alerts::notifier::{self, AlertNotification}, AppState};
use tracing::{info, warn};
use uuid::Uuid;

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

        // Regional checks
        for region in &regions {
            if m.alert_cache_hit_trend_enabled {
                let (f, s) = check_metric(state, m, region, "cache_hit_pct", bucket_hour).await;
                fired += f; skipped += s;
            }
            if m.alert_ttfb_trend_enabled {
                let (f, s) = check_metric(state, m, region, "ttfb_avg_ms", bucket_hour).await;
                fired += f; skipped += s;
            }
        }

        // Global secondary checks
        if m.alert_trend_global_enabled {
            if m.alert_cache_hit_trend_enabled {
                let (f, s) = check_metric(state, m, "__global__", "cache_hit_pct", bucket_hour).await;
                fired += f; skipped += s;
            }
            if m.alert_ttfb_trend_enabled {
                let (f, s) = check_metric(state, m, "__global__", "ttfb_avg_ms", bucket_hour).await;
                fired += f; skipped += s;
            }
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
    alert_cache_hit_trend_threshold_pct: f64,
    alert_cache_hit_trend_comparators: Vec<String>,
    alert_ttfb_trend_enabled: bool,
    alert_ttfb_trend_threshold_pct: f64,
    alert_ttfb_trend_comparators: Vec<String>,
    alert_ttfb_trend_direction: String,
    alert_trend_min_samples: i32,
    alert_trend_cooldown_minutes: i32,
    alert_trend_require_consecutive: bool,
    alert_trend_global_enabled: bool,
    alert_trend_global_threshold_factor: f64,
}

async fn fetch_trend_monitors(state: &AppState) -> Result<Vec<MonitorTrendConfig>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (
        Uuid, bool, f64, Vec<String>, bool, f64, Vec<String>, String,
        i32, i32, bool, bool, f64,
    )>(
        r#"
        SELECT id,
               alert_cache_hit_trend_enabled,  alert_cache_hit_trend_threshold_pct, alert_cache_hit_trend_comparators,
               alert_ttfb_trend_enabled,        alert_ttfb_trend_threshold_pct,      alert_ttfb_trend_comparators,
               alert_ttfb_trend_direction,
               alert_trend_min_samples,         alert_trend_cooldown_minutes,
               alert_trend_require_consecutive, alert_trend_global_enabled,
               alert_trend_global_threshold_factor
        FROM monitors
        WHERE is_active = true
          AND (alert_cache_hit_trend_enabled = true OR alert_ttfb_trend_enabled = true)
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(rows.into_iter().map(|(
        id, cache_en, cache_thr, cache_cmp, ttfb_en, ttfb_thr, ttfb_cmp, ttfb_dir,
        min_s, cool, req_consec, global_en, global_factor,
    )| MonitorTrendConfig {
        id,
        alert_cache_hit_trend_enabled: cache_en,
        alert_cache_hit_trend_threshold_pct: cache_thr,
        alert_cache_hit_trend_comparators: cache_cmp,
        alert_ttfb_trend_enabled: ttfb_en,
        alert_ttfb_trend_threshold_pct: ttfb_thr,
        alert_ttfb_trend_comparators: ttfb_cmp,
        alert_ttfb_trend_direction: ttfb_dir,
        alert_trend_min_samples: min_s,
        alert_trend_cooldown_minutes: cool,
        alert_trend_require_consecutive: req_consec,
        alert_trend_global_enabled: global_en,
        alert_trend_global_threshold_factor: global_factor,
    }).collect())
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

fn should_fire_cache_hit(delta: f64, threshold: f64) -> bool {
    delta <= -threshold
}

fn should_fire_ttfb(delta: f64, threshold: f64, direction: &str) -> bool {
    if delta >= threshold { return true; }
    if direction == "both" && delta <= -threshold { return true; }
    false
}

fn alert_type_for(metric: &str, scope: &str, is_improvement: bool) -> &'static str {
    match (metric, scope, is_improvement) {
        ("cache_hit_pct", "region", _)   => "cache_hit_trend_drop_region",
        ("cache_hit_pct", "global", _)   => "cache_hit_trend_drop_global",
        ("ttfb_avg_ms",   "region", false) => "ttfb_trend_up_region",
        ("ttfb_avg_ms",   "global", false) => "ttfb_trend_up_global",
        ("ttfb_avg_ms",   "region", true)  => "ttfb_trend_down_region",
        ("ttfb_avg_ms",   "global", true)  => "ttfb_trend_down_global",
        _ => "unknown_trend",
    }
}

async fn cooldown_active(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    alert_type: &str,
    comparator: &str,
    cooldown_minutes: i32,
) -> bool {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alerts WHERE monitor_id = $1 AND region = $2 AND alert_type = $3 AND comparator = $4 AND created_at > NOW() - ($5 * INTERVAL '1 minute')",
    )
    .bind(monitor_id)
    .bind(region)
    .bind(alert_type)
    .bind(comparator)
    .bind(cooldown_minutes)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    count > 0
}

async fn consecutive_confirmed(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    alert_type: &str,
    comparator: &str,
) -> bool {
    // Previous window alert would have been created ~1-2h ago
    let count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM alerts
           WHERE monitor_id = $1 AND region = $2 AND alert_type = $3 AND comparator = $4
             AND created_at > NOW() - INTERVAL '3 hours'"#,
    )
    .bind(monitor_id)
    .bind(region)
    .bind(alert_type)
    .bind(comparator)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    count > 0
}

// Returns (fired_count, skipped_count)
async fn check_metric(
    state: &AppState,
    m: &MonitorTrendConfig,
    region: &str,
    metric: &str,
    bucket_hour: chrono::DateTime<chrono::Utc>,
) -> (usize, usize) {
    let scope = if region == "__global__" { "global" } else { "region" };
    let is_global = scope == "global";

    let threshold = if metric == "cache_hit_pct" {
        m.alert_cache_hit_trend_threshold_pct
    } else {
        m.alert_ttfb_trend_threshold_pct
    };

    let effective_threshold = if is_global {
        threshold * m.alert_trend_global_threshold_factor
    } else {
        threshold
    };

    let comparators = if metric == "cache_hit_pct" {
        &m.alert_cache_hit_trend_comparators
    } else {
        &m.alert_ttfb_trend_comparators
    };

    // For global, require_consecutive is always true (conservative)
    let require_consecutive = is_global || m.alert_trend_require_consecutive;

    let baseline = match fetch_baseline(state, m.id, region, metric, bucket_hour).await {
        Ok(Some(b)) => b,
        Ok(None) => {
            warn!("trend_detector: monitor={} region={} metric={} decision=skipped reason=no_baseline", m.id, region, metric);
            return (0, comparators.len());
        }
        Err(e) => {
            warn!("trend_detector: monitor={} region={} metric={} decision=skipped reason=db_error error={}", m.id, region, metric, e);
            return (0, comparators.len());
        }
    };

    let current = match baseline.current_value {
        Some(v) => v,
        None => {
            warn!("trend_detector: monitor={} region={} metric={} decision=skipped reason=no_current_value", m.id, region, metric);
            return (0, comparators.len());
        }
    };

    let current_samples = baseline.current_samples.unwrap_or(0);
    if current_samples < m.alert_trend_min_samples {
        warn!(
            "trend_detector: monitor={} region={} metric={} decision=skipped reason=insufficient_samples count={} min={}",
            m.id, region, metric, current_samples, m.alert_trend_min_samples
        );
        return (0, comparators.len());
    }

    let mut fired = 0usize;
    let mut skipped = 0usize;

    for comparator in comparators {
        let (ref_value, ref_samples) = match comparator.as_str() {
            "prev_hour" => (baseline.prev_hour_value, baseline.prev_hour_samples.unwrap_or(0)),
            "same_hour_prev_day" => (baseline.same_hour_yday_value, baseline.same_hour_yday_samples.unwrap_or(0)),
            "day_avg" => (baseline.day_avg_value, baseline.day_avg_samples.unwrap_or(0)),
            _ => {
                warn!("trend_detector: unknown comparator {}", comparator);
                skipped += 1;
                continue;
            }
        };

        let reference = match ref_value {
            Some(v) if v > 0.0 && ref_samples >= m.alert_trend_min_samples => v,
            _ => {
                warn!(
                    "trend_detector: monitor={} region={} metric={} comparator={} decision=skipped reason=no_baseline",
                    m.id, region, metric, comparator
                );
                skipped += 1;
                continue;
            }
        };

        let delta = delta_pct(current, reference);

        let fires = if metric == "cache_hit_pct" {
            should_fire_cache_hit(delta, effective_threshold)
        } else {
            should_fire_ttfb(delta, effective_threshold, &m.alert_ttfb_trend_direction)
        };

        if !fires {
            skipped += 1;
            continue;
        }

        let is_improvement = metric == "ttfb_avg_ms" && delta <= -effective_threshold;
        let alert_type = alert_type_for(metric, scope, is_improvement);

        if cooldown_active(state, m.id, region, alert_type, comparator, m.alert_trend_cooldown_minutes).await {
            warn!(
                "trend_detector: monitor={} region={} metric={} comparator={} decision=skipped reason=cooldown",
                m.id, region, metric, comparator
            );
            skipped += 1;
            continue;
        }

        if require_consecutive && !consecutive_confirmed(state, m.id, region, alert_type, comparator).await {
            warn!(
                "trend_detector: monitor={} region={} metric={} comparator={} decision=skipped reason=not_confirmed",
                m.id, region, metric, comparator
            );
            skipped += 1;
            continue;
        }

        let comparator_label = match comparator.as_str() {
            "prev_hour" => "previous hour",
            "same_hour_prev_day" => "same time yesterday",
            "day_avg" => "24h average",
            other => other,
        };

        let (diagnosis, action) = build_messages(metric, region, scope, comparator_label, current, reference, delta);

        if let Err(e) = save_trend_alert(
            state, m.id, region, alert_type, metric,
            current, reference, delta, current_samples as i32,
            comparator, scope, diagnosis, action,
        ).await {
            warn!("trend_detector: failed to save alert monitor={} region={} type={}: {}", m.id, region, alert_type, e);
            skipped += 1;
            continue;
        }

        info!(
            "trend_detector: monitor={} region={} metric={} comparator={} decision=fired delta={:.1}%",
            m.id, region, metric, comparator, delta
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
    delta: f64,
) -> (String, String) {
    let scope_prefix = if scope == "global" { "[Global] " } else { "" };

    let (diagnosis, action) = if metric == "cache_hit_pct" {
        let diagnosis = format!(
            "{}Cache hit dropped {:.1}% vs {} · {} · {:.1}% now vs {:.1}% reference",
            scope_prefix, delta.abs(), comparator_label,
            if scope == "region" { region } else { "all regions" },
            current, reference,
        );
        let action = "Investigate CDN cache configuration or sudden traffic pattern change. Common causes: short TTL, missing Cache-Control headers, or high dynamic content ratio.".to_string();
        (diagnosis, action)
    } else {
        let direction = if delta > 0.0 { "increased" } else { "improved" };
        let diagnosis = format!(
            "{}TTFB {} {:.1}% vs {} · {} · {:.0}ms now vs {:.0}ms reference",
            scope_prefix, direction, delta.abs(), comparator_label,
            if scope == "region" { region } else { "all regions" },
            current, reference,
        );
        let action = "Check origin server latency, CDN routing changes, or upstream infrastructure. Compare edge vs origin TTFB in the Performance tab.".to_string();
        (diagnosis, action)
    };

    (diagnosis, action)
}

async fn save_trend_alert(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    alert_type: &str,
    metric: &str,
    actual: f64,
    baseline: f64,
    delta_pct: f64,
    sample_count: i32,
    comparator: &str,
    scope: &str,
    diagnosis: String,
    action: String,
) -> Result<(), anyhow::Error> {
    let alert_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO alerts (
            monitor_id, region, alert_type, metric,
            actual_ms, baseline_ms, diagnosis, action,
            delta_pct, sample_count, comparator, scope
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, $12
        ) RETURNING id
        "#,
    )
    .bind(monitor_id)
    .bind(region)
    .bind(alert_type)
    .bind(metric)
    .bind(actual)
    .bind(baseline)
    .bind(&diagnosis)
    .bind(&action)
    .bind(delta_pct)
    .bind(sample_count)
    .bind(comparator)
    .bind(scope)
    .fetch_one(&state.db)
    .await?;

    tokio::spawn(notifier::notify(state.clone(), AlertNotification {
        alert_id,
        monitor_id,
        alert_type: alert_type.to_string(),
        region: region.to_string(),
        diagnosis: Some(diagnosis),
        action: Some(action),
        actual_ms: Some(actual),
        baseline_ms: Some(baseline),
        deviation_factor: None,
        delta_pct: Some(delta_pct),
        comparator: Some(comparator.to_string()),
    }));

    Ok(())
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
        // Should not panic; caller guards reference > 0
        let d = delta_pct(1.0, 0.1);
        assert!(d > 0.0);
    }

    #[test]
    fn test_cache_hit_fires_on_drop() {
        assert!(should_fire_cache_hit(-10.0, 10.0));  // exactly at threshold
        assert!(should_fire_cache_hit(-15.0, 10.0));  // beyond threshold
        assert!(!should_fire_cache_hit(-9.9, 10.0));  // below threshold
        assert!(!should_fire_cache_hit(5.0, 10.0));   // improvement — no fire
    }

    #[test]
    fn test_ttfb_worsening_only() {
        assert!(should_fire_ttfb(10.0, 10.0, "worsening"));   // exactly at
        assert!(should_fire_ttfb(15.0, 10.0, "worsening"));   // beyond
        assert!(!should_fire_ttfb(9.9, 10.0, "worsening"));   // below
        assert!(!should_fire_ttfb(-15.0, 10.0, "worsening")); // improvement — no fire
    }

    #[test]
    fn test_ttfb_both_directions() {
        assert!(should_fire_ttfb(10.0, 10.0, "both"));   // worsening
        assert!(should_fire_ttfb(-10.0, 10.0, "both"));  // improvement at threshold
        assert!(should_fire_ttfb(-15.0, 10.0, "both"));  // significant improvement
        assert!(!should_fire_ttfb(-9.9, 10.0, "both"));  // improvement below threshold
        assert!(!should_fire_ttfb(9.9, 10.0, "both"));   // worsening below threshold
    }

    #[test]
    fn test_alert_type_routing() {
        assert_eq!(alert_type_for("cache_hit_pct", "region", false), "cache_hit_trend_drop_region");
        assert_eq!(alert_type_for("cache_hit_pct", "global", false), "cache_hit_trend_drop_global");
        assert_eq!(alert_type_for("ttfb_avg_ms", "region", false), "ttfb_trend_up_region");
        assert_eq!(alert_type_for("ttfb_avg_ms", "global", false), "ttfb_trend_up_global");
        assert_eq!(alert_type_for("ttfb_avg_ms", "region", true),  "ttfb_trend_down_region");
        assert_eq!(alert_type_for("ttfb_avg_ms", "global", true),  "ttfb_trend_down_global");
    }

    #[test]
    fn test_global_threshold_factor() {
        let base = 10.0f64;
        let factor = 1.5f64;
        let effective = base * factor;
        assert!(!should_fire_cache_hit(-14.9, effective)); // below global threshold
        assert!(should_fire_cache_hit(-15.0, effective));  // exactly at global threshold
    }
}
