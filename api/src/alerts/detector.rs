use crate::{
    alerts::worker,
    models::probe_result::ProbeResultPayload,
    AppState,
};
use std::time::Duration;
use tracing::error;

pub fn is_anomalous(actual_ttfb: f64, avg: f64, stddev: f64, sigma_factor: f64) -> bool {
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
    alert_anomaly_enabled: bool,
}

async fn fetch_monitor_alert_config(state: &AppState, monitor_id: uuid::Uuid) -> Option<MonitorAlertConfig> {
    sqlx::query_as::<_, MonitorAlertConfig>(
        r#"
        SELECT alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity,
               alert_down_enabled, alert_ttfb_enabled, alert_anomaly_enabled,
               alert_trend_cooldown_minutes
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

pub async fn check_for_anomalies(state: AppState, payload: ProbeResultPayload) {
    let cfg = match fetch_monitor_alert_config(&state, payload.monitor_id).await {
        Some(c) => c,
        None => {
            error!("Monitor config not found for {}", payload.monitor_id);
            return;
        }
    };

    let is_hit = payload
        .cache_status
        .as_deref()
        .map(|s| s == "HIT" || s == "STALE" || s == "REVALIDATED")
        .unwrap_or(false);
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
        )
        .await;
        return;
    }

    if ttfb_over_threshold && cfg.alert_ttfb_enabled {
        let consecutive_limit = match cfg.alert_sensitivity {
            1 => 3,
            2 => 2,
            _ => 1,
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
                "ttfb_threshold",
                Some(effective_threshold),
                summary,
                "Investigate origin response time and CDN routing.".to_string(),
            )
            .await;
        }
        return;
    }

    if let (Some(actual_ttfb), true) = (payload.ttfb_ms, cfg.alert_anomaly_enabled) {
        if let Ok(Some(row)) = sqlx::query!(
            "SELECT ttfb_avg_ms, ttfb_stddev_ms FROM monitor_baselines WHERE monitor_id = $1 AND region = $2 LIMIT 1",
            payload.monitor_id,
            payload.region
        )
        .fetch_optional(&state.db)
        .await
        {
            let avg = row.ttfb_avg_ms.unwrap_or(0.0);
            let stddev = row.ttfb_stddev_ms.unwrap_or(0.0);
            let sigma_factor = sensitivity_to_sigma(cfg.alert_sensitivity);

            if is_anomalous(actual_ttfb, avg, stddev, sigma_factor) {
                let summary = format!(
                    "Significant TTFB deviation detected compared to 7-day baseline ({:.0}ms).",
                    avg
                );
                dispatch_probe_alert(
                    &state,
                    payload.clone(),
                    "anomaly",
                    Some(avg),
                    summary,
                    "Investigate sudden latency spikes or regional routing changes.".to_string(),
                )
                .await;
            }
        }
    }
}

/// Aggregates probe results across regions over a 15-second window, then calls
/// `handle_incident` once with all affected regions consolidated.
async fn dispatch_probe_alert(
    state: &AppState,
    payload: ProbeResultPayload,
    alert_type: &'static str,
    baseline: Option<f64>,
    summary_base: String,
    action: String,
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

        let regions = match alert_type {
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
            .map(|rows| rows.into_iter().map(|r| r.region).collect::<Vec<_>>()),
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
            .map(|rows| rows.into_iter().map(|r| r.region).collect::<Vec<_>>()),
        }
        .unwrap_or_else(|| vec![payload_clone.region.clone()]);

        let count = regions.len();
        let diagnosis = if count > 1 {
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
        assert!(!is_anomalous(150.0, 100.0, 20.0, 3.0));
        assert!(is_anomalous(601.0, 100.0, 20.0, 3.0));
    }

    #[test]
    fn test_is_anomalous_high_variance() {
        assert!(!is_anomalous(750.0, 200.0, 200.0, 3.0));
        assert!(is_anomalous(801.0, 200.0, 200.0, 3.0));
    }

    #[test]
    fn test_is_anomalous_zero_stddev() {
        assert!(!is_anomalous(500.0, 50.0, 0.0, 3.0));
        assert!(is_anomalous(551.0, 50.0, 0.0, 3.0));
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
        assert!(!is_anomalous(400.0, 10.0, 5.0, 3.0));
        assert!(is_anomalous(511.0, 10.0, 5.0, 3.0));
    }
}
