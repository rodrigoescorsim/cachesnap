use crate::{
    models::probe_result::ProbeResultPayload,
    AppState,
};
use std::time::Duration;
use super::notifier::{self, AlertNotification};
use tracing::error;

const DOWN_COOLDOWN_MINUTES: i32 = 30;
const DEFAULT_COOLDOWN_MINUTES: i32 = 60;

pub fn is_anomalous(actual_ttfb: f64, avg: f64, stddev: f64, sigma_factor: f64) -> bool {
    // Anomalia estatística: TTFB > avg + (sigma_factor * stddev), com piso de +500ms
    // para evitar ruído em sites ultrarrápidos (ex: média 20ms subindo para 40ms).
    let threshold = f64::max(avg + (sigma_factor * stddev), avg + 500.0);
    actual_ttfb > threshold
}

fn sensitivity_to_sigma(sensitivity: i16) -> f64 {
    match sensitivity {
        1 => 5.0, // Low — apenas outliers extremos
        3 => 2.0, // High — detecta desvios menores
        _ => 3.0, // Medium (padrão)
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
        SELECT
            alert_threshold_ms,
            alert_threshold_hit_ms,
            alert_sensitivity,
            alert_down_enabled,
            alert_ttfb_enabled,
            alert_anomaly_enabled,
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
    if limit <= 1 { return 1; }

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

    let is_hit = payload.cache_status.as_deref().map(|s| s == "HIT" || s == "STALE" || s == "REVALIDATED").unwrap_or(false);
    let effective_threshold = if is_hit { cfg.alert_threshold_hit_ms as f64 } else { cfg.alert_threshold_ms as f64 };
    let ttfb_over_threshold = payload.ttfb_ms.map(|t| t > effective_threshold).unwrap_or(false);
    let is_down = payload.error.is_some() || payload.status_code.map(|s| s >= 500).unwrap_or(false);

    // 1. Downtime detection
    if is_down && cfg.alert_down_enabled {
        handle_aggregated_alert(&state, payload.clone(), "down", "uptime".to_string(), None, "Site unreachable or failing in multiple regions.".to_string()).await;
        return;
    }

    // 2. Fixed TTFB Threshold breach
    if ttfb_over_threshold && cfg.alert_ttfb_enabled {
        let consecutive_limit = match cfg.alert_sensitivity {
            1 => 3, 2 => 2, _ => 1,
        };
        let breach_count = count_consecutive_breaches(&state, payload.monitor_id, &payload.region, effective_threshold, consecutive_limit).await;
        
        if breach_count >= consecutive_limit {
            let hit_miss_label = if is_hit { "Cache HIT" } else { "Cache MISS" };
            let summary = format!("{} TTFB exceeded your limit ({:.0}ms).", hit_miss_label, effective_threshold);
            handle_aggregated_alert(&state, payload.clone(), "ttfb_threshold", "ttfb_ms".to_string(), Some(effective_threshold), summary).await;
        }
        return;
    }

    // 3. Statistical Anomaly Detection
    if let (Some(actual_ttfb), true) = (payload.ttfb_ms, cfg.alert_anomaly_enabled) {
        if let Ok(Some(row)) = sqlx::query!(
            "SELECT ttfb_avg_ms, ttfb_stddev_ms FROM monitor_baselines WHERE monitor_id = $1 AND region = $2 LIMIT 1",
            payload.monitor_id, payload.region
        ).fetch_optional(&state.db).await {
            let avg = row.ttfb_avg_ms.unwrap_or(0.0);
            let stddev = row.ttfb_stddev_ms.unwrap_or(0.0);
            let sigma_factor = sensitivity_to_sigma(cfg.alert_sensitivity);

            if is_anomalous(actual_ttfb, avg, stddev, sigma_factor) {
                let summary = format!("Significant TTFB deviation detected compared to 7-day baseline ({:.0}ms).", avg);
                handle_aggregated_alert(&state, payload.clone(), "anomaly", "ttfb_ms".to_string(), Some(avg), summary).await;
            }
        }
    }
}

/// Helper genérico para agrupar alertas regionais em um único evento consolidado.
async fn handle_aggregated_alert(
    state: &AppState,
    payload: ProbeResultPayload,
    alert_type: &'static str,
    metric: String,
    baseline: Option<f64>,
    summary_base: String,
) {
    // 1. Check if an alert was ALREADY persisted in the last 2 minutes (cooldown)
    let exists = alert_exists_any_region_recent(state, payload.monitor_id, alert_type, 2).await.unwrap_or(false);
    if exists { return; }

    // 2. Try to acquire a Redis lock for the 15s aggregation window
    let lock_key = format!("alert_agg_lock:{}:{}", payload.monitor_id, alert_type);
    let mut conn = match state.redis.get().await {
        Ok(c) => c,
        Err(_) => return, // Fail safe: if redis is down, we might get duplicates but system stays up
    };

    use deadpool_redis::redis::AsyncCommands;
    let acquired: bool = conn.set_nx(&lock_key, "true").await.unwrap_or(false);
    if !acquired {
        // Someone else is already aggregating for this monitor/type
        return;
    }
    let _: () = conn.expire(&lock_key, 20).await.unwrap_or(()); // 20s lock for a 15s window

    let state_clone = state.clone();
    let payload_clone = payload.clone();
    
    tokio::spawn(async move {
        // Janela de agrupamento: aguarda outras regiões reportarem
        tokio::time::sleep(Duration::from_secs(15)).await;

        // Busca todas as regiões que dispararam este tipo de alerta recentemente
        // Para 'down', checamos erros. Para outros, checamos a tabela de probe_results recente.
        let regions = match alert_type {
            "down" => {
                sqlx::query!("SELECT DISTINCT region FROM probe_results WHERE monitor_id = $1 AND (error IS NOT NULL OR status_code >= 500) AND time > NOW() - INTERVAL '1 minute'", payload_clone.monitor_id)
                    .fetch_all(&state_clone.db).await.ok()
                    .map(|rows| rows.into_iter().map(|r| r.region).collect::<Vec<String>>())
            },
            _ => {
                sqlx::query!("SELECT DISTINCT region FROM probe_results WHERE monitor_id = $1 AND ttfb_ms > $2 AND time > NOW() - INTERVAL '1 minute'", 
                    payload_clone.monitor_id, baseline.unwrap_or(0.0))
                    .fetch_all(&state_clone.db).await.ok()
                    .map(|rows| rows.into_iter().map(|r| r.region).collect::<Vec<String>>())
            }
        }.unwrap_or_else(|| vec![payload_clone.region.clone()]);

        let count = regions.len();
        let final_region = if count > 1 { "Multiple".to_string() } else { payload_clone.region.clone() };
        
        let diagnosis = if count > 1 {
            format!("{} Affected regions: {}.", summary_base, regions.join(", "))
        } else {
            format!("{} Affected region: {}.", summary_base, payload_clone.region)
        };

        let action = match alert_type {
            "down" => "Check server status and regional network connectivity.",
            "anomaly" => "Investigate sudden latency spikes or regional routing changes.",
            _ => "Check origin response times and CDN cache efficiency.",
        }.to_string();

        let insert_res = sqlx::query_scalar!(
            "INSERT INTO alerts (monitor_id, region, alert_type, metric, actual_ms, baseline_ms, diagnosis, action) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
            payload_clone.monitor_id, final_region, alert_type, metric, payload_clone.ttfb_ms, baseline, diagnosis, action
        ).fetch_one(&state_clone.db).await;

        if let Ok(alert_id) = insert_res {
            let _ = notifier::notify(state_clone, AlertNotification {
                alert_id,
                monitor_id: payload_clone.monitor_id,
                alert_type: alert_type.to_string(),
                region: final_region,
                diagnosis: Some(diagnosis),
                action: Some(action),
                actual_ms: payload_clone.ttfb_ms,
                baseline_ms: baseline,
                deviation_factor: None,
                delta_pct: None,
                comparator: None,
            }).await;
        }
    });
}

async fn alert_exists_any_region_recent(
    state: &AppState,
    monitor_id: uuid::Uuid,
    alert_type: &str,
    cooldown_minutes: i32,
) -> Result<bool, sqlx::Error> {
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM alerts
        WHERE monitor_id = $1
          AND alert_type = $2
          AND created_at > NOW() - ($3 * INTERVAL '1 minute')
        "#,
    )
    .bind(monitor_id)
    .bind(alert_type)
    .bind(cooldown_minutes)
    .fetch_one(&state.db)
    .await?;
    Ok(count > 0)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_anomalous_standard() {
        // Média 100, Stddev 20. 3-sigma = 160. Média + 500 = 600. Max(160, 600) = 600.
        assert!(!is_anomalous(150.0, 100.0, 20.0, 3.0));
        assert!(is_anomalous(601.0, 100.0, 20.0, 3.0));
    }

    #[test]
    fn test_is_anomalous_high_variance() {
        // Média 200, Stddev 200. 3-sigma = 800. Média + 500 = 700. Max(800, 700) = 800.
        assert!(!is_anomalous(750.0, 200.0, 200.0, 3.0));
        assert!(is_anomalous(801.0, 200.0, 200.0, 3.0));
    }

    #[test]
    fn test_is_anomalous_zero_stddev() {
        // Média 50, Stddev 0. Média + 500 = 550.
        assert!(!is_anomalous(500.0, 50.0, 0.0, 3.0));
        assert!(is_anomalous(551.0, 50.0, 0.0, 3.0));
    }

    #[test]
    fn test_sensitivity_to_sigma() {
        assert_eq!(sensitivity_to_sigma(1), 5.0);
        assert_eq!(sensitivity_to_sigma(2), 3.0);
        assert_eq!(sensitivity_to_sigma(3), 2.0);
        assert_eq!(sensitivity_to_sigma(99), 3.0); // fallback
    }

    #[test]
    fn test_is_anomalous_high_sensitivity() {
        // High sensitivity (2σ): média 100, stddev 100 → threshold max(300, 600) = 600.
        assert!(!is_anomalous(500.0, 100.0, 100.0, 2.0));
        assert!(is_anomalous(601.0, 100.0, 100.0, 2.0));
    }

    #[test]
    fn test_is_anomalous_low_sensitivity() {
        // Low sensitivity (5σ): média 100, stddev 100 → threshold max(600, 600) = 600.
        // High stddev case: média 100, stddev 200 → threshold max(1100, 600) = 1100.
        assert!(!is_anomalous(1000.0, 100.0, 200.0, 5.0));
        assert!(is_anomalous(1101.0, 100.0, 200.0, 5.0));
    }

    #[test]
    fn test_is_anomalous_500ms_floor_dominates() {
        // Fast site: média 10ms, stddev 5ms → 3σ = 10+15 = 25ms, piso = 10+500 = 510ms.
        // Floor garante que sites ultrarrápidos não gerem ruído por variações mínimas.
        assert!(!is_anomalous(400.0, 10.0, 5.0, 3.0)); // abaixo do piso
        assert!(is_anomalous(511.0, 10.0, 5.0, 3.0));  // acima do piso
    }
}
