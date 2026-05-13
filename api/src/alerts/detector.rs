use crate::{
    alerts::worker,
    baseline::stratified::{probe_is_cache_hit, STRATIFIED_BASELINE_MIN_SAMPLES},
    models::probe_result::ProbeResultPayload,
    AppState,
};
use std::time::Duration;
use tracing::error;

pub fn is_ttfb_anomalous(actual_ttfb: f64, avg: f64, stddev: f64, sigma_factor: f64) -> bool {
    // TTFB > avg + (sigma × stddev), with a +500ms floor to prevent noise on ultra-fast sites.
    let threshold = f64::max(avg + (sigma_factor * stddev), avg + 500.0);
    actual_ttfb > threshold
}

fn sensitivity_to_sigma(sensitivity: i16) -> f64 {
    match sensitivity {
        1 => 5.0,
        3 => 2.0,
        _ => 3.0,
    }
}

#[derive(sqlx::FromRow)]
struct MonitorAlertConfig {
    alert_threshold_ms: i32,
    alert_threshold_hit_ms: i32,
    alert_sensitivity: i16,
    alert_down_enabled: bool,
    alert_ttfb_enabled: bool,
    alert_ttfb_anomaly_enabled: bool,
}

async fn fetch_monitor_alert_config(state: &AppState, monitor_id: uuid::Uuid) -> Option<MonitorAlertConfig> {
    sqlx::query_as::<_, MonitorAlertConfig>(
        r#"
        SELECT alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity,
               alert_down_enabled, alert_ttfb_enabled, alert_ttfb_anomaly_enabled
        FROM monitors WHERE id = $1 LIMIT 1
        "#,
    )
    .bind(monitor_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None)
}

async fn count_consecutive_breaches(
    state: &AppState,
    monitor_id: uuid::Uuid,
    region: &str,
    threshold_ms: f64,
    limit: i32,
) -> i32 {
    if limit <= 1 {
        return 1;
    }

    let count: Option<i64> = sqlx::query_scalar!(
        r#"
        WITH recent_probes AS (
            SELECT ttfb_ms
            FROM probe_results
            WHERE monitor_id = $1 AND region = $2
            ORDER BY time DESC
            LIMIT $3
        )
        SELECT COUNT(*) FROM recent_probes WHERE ttfb_ms > $4
        "#,
        monitor_id,
        region,
        limit as i64,
        threshold_ms
    )
    .fetch_one(&state.db)
    .await
    .ok()
    .flatten();

    count.unwrap_or(0) as i32
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct MonitorBaselineRow {
    ttfb_avg_ms: Option<f64>,
    ttfb_stddev_ms: Option<f64>,
    ttfb_hit_avg_ms: Option<f64>,
    ttfb_hit_stddev_ms: Option<f64>,
    ttfb_hit_sample_count: Option<i32>,
    ttfb_miss_avg_ms: Option<f64>,
    ttfb_miss_stddev_ms: Option<f64>,
    ttfb_miss_sample_count: Option<i32>,
}

/// Picks HIT-only, MISS-only, or combined (7-day) stats so a MISS is not compared to a HIT baseline.
fn effective_baseline_for_anomaly(
    cache_status: Option<&str>,
    mb: &MonitorBaselineRow,
) -> (f64, f64) {
    if probe_is_cache_hit(cache_status) {
        if mb.ttfb_hit_sample_count.unwrap_or(0) >= STRATIFIED_BASELINE_MIN_SAMPLES {
            if let Some(avg) = mb.ttfb_hit_avg_ms {
                return (avg, mb.ttfb_hit_stddev_ms.unwrap_or(0.0));
            }
        }
    } else if cache_status.is_some() && !probe_is_cache_hit(cache_status) {
        if mb.ttfb_miss_sample_count.unwrap_or(0) >= STRATIFIED_BASELINE_MIN_SAMPLES {
            if let Some(avg) = mb.ttfb_miss_avg_ms {
                return (avg, mb.ttfb_miss_stddev_ms.unwrap_or(0.0));
            }
        }
    }
    (
        mb.ttfb_avg_ms.unwrap_or(0.0),
        mb.ttfb_stddev_ms.unwrap_or(0.0),
    )
}

pub async fn check_probe_alerts(state: AppState, payload: ProbeResultPayload) {
    let cfg = match fetch_monitor_alert_config(&state, payload.monitor_id).await {
        Some(c) => c,
        None => {
            error!("Monitor config not found for {}", payload.monitor_id);
            return;
        }
    };

    let is_hit = probe_is_cache_hit(payload.cache_status.as_deref());
    let effective_threshold = if is_hit {
        cfg.alert_threshold_hit_ms as f64
    } else {
        cfg.alert_threshold_ms as f64
    };
    let ttfb_over_threshold = payload.ttfb_ms.map(|t| t > effective_threshold).unwrap_or(false);
    let is_down = payload.error.is_some()
        || payload.status_code.map(|s| s >= 500).unwrap_or(false);

    if is_down && cfg.alert_down_enabled {
        dispatch_probe_alert(
            &state,
            payload.clone(),
            "down",
            None,
            "Site unreachable or failing.".to_string(),
            "Check server status and regional network connectivity.".to_string(),
            None,
        )
        .await;
        return;
    }

    if ttfb_over_threshold && cfg.alert_ttfb_enabled {
        let consecutive_limit = match cfg.alert_sensitivity {
            1 => 5, // Low — require 5 recent probes over the TTFB limit
            2 => 3, // Medium — require 3 recent probes
            _ => 1, // High — instant (see count_consecutive_breaches when limit <= 1)
        };
        let breach_count = count_consecutive_breaches(
            &state,
            payload.monitor_id,
            &payload.region,
            effective_threshold,
            consecutive_limit,
        )
        .await;

        if breach_count >= consecutive_limit {
            let hit_miss_label = if is_hit { "Cache HIT" } else { "Cache MISS" };
            let summary =
                format!("{} TTFB exceeded your limit ({:.0}ms).", hit_miss_label, effective_threshold);
            dispatch_probe_alert(
                &state,
                payload.clone(),
                "ttfb_limit",
                Some(effective_threshold),
                summary,
                "Investigate origin response time and CDN routing.".to_string(),
                None,
            )
            .await;
        }
        return;
    }

    if let (Some(actual_ttfb), true) = (payload.ttfb_ms, cfg.alert_ttfb_anomaly_enabled) {
        if let Ok(Some(row)) = sqlx::query_as::<_, MonitorBaselineRow>(
            r#"SELECT ttfb_avg_ms, ttfb_stddev_ms,
                      ttfb_hit_avg_ms, ttfb_hit_stddev_ms, ttfb_hit_sample_count,
                      ttfb_miss_avg_ms, ttfb_miss_stddev_ms, ttfb_miss_sample_count
               FROM monitor_baselines WHERE monitor_id = $1 AND region = $2 LIMIT 1"#,
        )
        .bind(payload.monitor_id)
        .bind(&payload.region)
        .fetch_optional(&state.db)
        .await
        {
            let (avg, stddev) =
                effective_baseline_for_anomaly(payload.cache_status.as_deref(), &row);
            let sigma_factor = sensitivity_to_sigma(cfg.alert_sensitivity);

            if is_ttfb_anomalous(actual_ttfb, avg, stddev, sigma_factor) {
                let stratum = if probe_is_cache_hit(payload.cache_status.as_deref()) {
                    "cached responses"
                } else if payload.cache_status.is_some() {
                    "uncached / edge-miss responses"
                } else {
                    "all responses"
                };
                let summary = format!(
                    "Significant TTFB deviation vs 7-day baseline for {} in this region ({:.0}ms typical).",
                    stratum, avg
                );
                dispatch_probe_alert(
                    &state,
                    payload.clone(),
                    "ttfb_anomaly",
                    Some(avg),
                    summary,
                    "Investigate sudden latency spikes or regional routing changes.".to_string(),
                    Some(sigma_factor),
                )
                .await;
            }
        }
    }
}

/// Aggregates probe results across regions over a 15-second window, then calls
/// `handle_incident` once with all affected regions consolidated.
///
/// For "ttfb_anomaly" alerts, `sigma_factor` is required: each region is only included
/// when its own TTFB exceeds its own 7-day baseline threshold, preventing
/// naturally-slow regions (e.g. far from origin on DYNAMIC sites) from being
/// pulled into an incident triggered by a different region.
async fn dispatch_probe_alert(
    state: &AppState,
    payload: ProbeResultPayload,
    alert_type: &'static str,
    baseline: Option<f64>,
    summary_base: String,
    action: String,
    sigma_factor: Option<f64>,
) {
    // Redis lock prevents multiple concurrent aggregation windows for the same alert
    let lock_key = format!("alert_agg_lock:{}:{}", payload.monitor_id, alert_type);
    let mut conn = match state.redis.get().await {
        Ok(c) => c,
        Err(_) => return,
    };

    use deadpool_redis::redis::AsyncCommands;
    let acquired: bool = conn.set_nx(&lock_key, "true").await.unwrap_or(false);
    if !acquired {
        return;
    }
    let _: () = conn.expire(&lock_key, 20).await.unwrap_or(());

    let state_clone = state.clone();
    let payload_clone = payload.clone();

    tokio::spawn(async move {
        // Wait for other regions to report
        tokio::time::sleep(Duration::from_secs(15)).await;

        let regions: Option<Vec<String>> = match alert_type {
            "down" => sqlx::query!(
                "SELECT DISTINCT region FROM probe_results
                 WHERE monitor_id = $1
                   AND (error IS NOT NULL OR status_code >= 500)
                   AND time > NOW() - INTERVAL '1 minute'",
                payload_clone.monitor_id
            )
            .fetch_all(&state_clone.db)
            .await
            .ok()
            .map(|rows| rows.into_iter().map(|r| r.region).collect()),

            "ttfb_anomaly" => sqlx::query_as::<_, (String,)>(
                r#"SELECT DISTINCT pr.region
                 FROM probe_results pr
                 JOIN monitor_baselines mb
                   ON mb.monitor_id = pr.monitor_id AND mb.region = pr.region
                 WHERE pr.monitor_id = $1
                   AND pr.time > NOW() - INTERVAL '1 minute'
                   AND pr.error IS NULL
                   AND pr.ttfb_ms IS NOT NULL
                   AND pr.ttfb_ms > (
                     CASE
                       WHEN pr.cache_status IN ('HIT', 'STALE', 'REVALIDATED')
                            AND COALESCE(mb.ttfb_hit_sample_count, 0) >= $3
                            AND mb.ttfb_hit_avg_ms IS NOT NULL
                       THEN GREATEST(
                         mb.ttfb_hit_avg_ms + ($2::float8 * COALESCE(mb.ttfb_hit_stddev_ms, 0.0)),
                         mb.ttfb_hit_avg_ms + 500.0
                       )
                       WHEN pr.cache_status IS NOT NULL
                            AND pr.cache_status NOT IN ('HIT', 'STALE', 'REVALIDATED')
                            AND COALESCE(mb.ttfb_miss_sample_count, 0) >= $3
                            AND mb.ttfb_miss_avg_ms IS NOT NULL
                       THEN GREATEST(
                         mb.ttfb_miss_avg_ms + ($2::float8 * COALESCE(mb.ttfb_miss_stddev_ms, 0.0)),
                         mb.ttfb_miss_avg_ms + 500.0
                       )
                       ELSE GREATEST(
                         COALESCE(mb.ttfb_avg_ms, 0.0) + ($2::float8 * COALESCE(mb.ttfb_stddev_ms, 0.0)),
                         COALESCE(mb.ttfb_avg_ms, 0.0) + 500.0
                       )
                     END
                   )"#,
            )
            .bind(payload_clone.monitor_id)
            .bind(sigma_factor.unwrap_or(3.0))
            .bind(STRATIFIED_BASELINE_MIN_SAMPLES)
            .fetch_all(&state_clone.db)
            .await
            .ok()
            .map(|rows| rows.into_iter().map(|(r,)| r).collect()),

            _ => sqlx::query!(
                "SELECT DISTINCT region FROM probe_results
                 WHERE monitor_id = $1 AND ttfb_ms > $2
                   AND time > NOW() - INTERVAL '1 minute'",
                payload_clone.monitor_id,
                baseline.unwrap_or(0.0)
            )
            .fetch_all(&state_clone.db)
            .await
            .ok()
            .map(|rows| rows.into_iter().map(|r| r.region).collect()),
        };
        let regions = regions.unwrap_or_else(|| vec![payload_clone.region.clone()]);

        let count = regions.len();
        let diagnosis = if count > 1 && alert_type == "ttfb_anomaly" {
            format!(
                "TTFB significantly above each region's 7-day average. Affected regions: {}.",
                regions.join(", ")
            )
        } else if count > 1 {
            format!("{} Affected regions: {}.", summary_base, regions.join(", "))
        } else {
            summary_base.clone()
        };

        if let Err(e) = worker::handle_incident(
            &state_clone,
            payload_clone.monitor_id,
            alert_type,
            regions,
            payload_clone.ttfb_ms,
            baseline,
            Some(diagnosis),
            Some(action),
            None,
            None,
            None,
        )
        .await
        {
            error!("detector: handle_incident failed for {}: {}", alert_type, e);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_anomalous_standard() {
        assert!(!is_ttfb_anomalous(150.0, 100.0, 20.0, 3.0));
        assert!(is_ttfb_anomalous(601.0, 100.0, 20.0, 3.0));
    }

    #[test]
    fn test_is_anomalous_high_variance() {
        assert!(!is_ttfb_anomalous(750.0, 200.0, 200.0, 3.0));
        assert!(is_ttfb_anomalous(801.0, 200.0, 200.0, 3.0));
    }

    #[test]
    fn test_is_anomalous_zero_stddev() {
        assert!(!is_ttfb_anomalous(500.0, 50.0, 0.0, 3.0));
        assert!(is_ttfb_anomalous(551.0, 50.0, 0.0, 3.0));
    }

    #[test]
    fn test_sensitivity_to_sigma() {
        assert_eq!(sensitivity_to_sigma(1), 5.0);
        assert_eq!(sensitivity_to_sigma(2), 3.0);
        assert_eq!(sensitivity_to_sigma(3), 2.0);
        assert_eq!(sensitivity_to_sigma(99), 3.0);
    }

    #[test]
    fn test_is_anomalous_500ms_floor() {
        // Fast site: mean 10ms — floor dominates (10 + 500 = 510ms)
        assert!(!is_ttfb_anomalous(400.0, 10.0, 5.0, 3.0));
        assert!(is_ttfb_anomalous(511.0, 10.0, 5.0, 3.0));
    }

    #[test]
    fn effective_baseline_uses_miss_stratum_when_miss_probe() {
        let mb = MonitorBaselineRow {
            ttfb_avg_ms: Some(40.0),
            ttfb_stddev_ms: Some(10.0),
            ttfb_hit_avg_ms: Some(15.0),
            ttfb_hit_stddev_ms: Some(2.0),
            ttfb_hit_sample_count: Some(5000),
            ttfb_miss_avg_ms: Some(380.0),
            ttfb_miss_stddev_ms: Some(40.0),
            ttfb_miss_sample_count: Some(100),
        };
        let (avg, stddev) = effective_baseline_for_anomaly(Some("MISS"), &mb);
        assert_eq!(avg, 380.0);
        assert_eq!(stddev, 40.0);
    }

    #[test]
    fn effective_baseline_uses_hit_stratum_when_hit_probe() {
        let mb = MonitorBaselineRow {
            ttfb_avg_ms: Some(200.0),
            ttfb_stddev_ms: Some(50.0),
            ttfb_hit_avg_ms: Some(25.0),
            ttfb_hit_stddev_ms: Some(5.0),
            ttfb_hit_sample_count: Some(100),
            ttfb_miss_avg_ms: Some(800.0),
            ttfb_miss_stddev_ms: Some(20.0),
            ttfb_miss_sample_count: Some(50),
        };
        let (avg, stddev) = effective_baseline_for_anomaly(Some("HIT"), &mb);
        assert_eq!(avg, 25.0);
        assert_eq!(stddev, 5.0);
    }

    #[test]
    fn effective_baseline_falls_back_when_insufficient_stratum_samples() {
        let mb = MonitorBaselineRow {
            ttfb_avg_ms: Some(90.0),
            ttfb_stddev_ms: Some(15.0),
            ttfb_hit_avg_ms: Some(20.0),
            ttfb_hit_stddev_ms: Some(1.0),
            ttfb_hit_sample_count: Some(10), // < STRATIFIED_BASELINE_MIN_SAMPLES
            ttfb_miss_avg_ms: Some(400.0),
            ttfb_miss_stddev_ms: Some(30.0),
            ttfb_miss_sample_count: Some(10),
        };
        let (avg, _) = effective_baseline_for_anomaly(Some("HIT"), &mb);
        assert_eq!(avg, 90.0);
        let (avg2, _) = effective_baseline_for_anomaly(Some("MISS"), &mb);
        assert_eq!(avg2, 90.0);
    }

    #[test]
    fn effective_baseline_null_cache_status_uses_combined() {
        let mb = MonitorBaselineRow {
            ttfb_avg_ms: Some(120.0),
            ttfb_stddev_ms: Some(20.0),
            ttfb_hit_avg_ms: Some(20.0),
            ttfb_hit_stddev_ms: Some(2.0),
            ttfb_hit_sample_count: Some(5000),
            ttfb_miss_avg_ms: Some(400.0),
            ttfb_miss_stddev_ms: Some(30.0),
            ttfb_miss_sample_count: Some(5000),
        };
        let (avg, _) = effective_baseline_for_anomaly(None, &mb);
        assert_eq!(avg, 120.0);
    }
}
