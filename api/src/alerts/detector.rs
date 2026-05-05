use crate::{
    diagnosis::engine::{self, DiagnosisInput},
    models::probe_result::ProbeResultPayload,
    AppState,
};
use super::notifier::{self, AlertNotification};
use tracing::{info, error};

const DOWN_COOLDOWN_MINUTES: i32 = 30;
const ANOMALY_COOLDOWN_MINUTES: i32 = 30;
const TTFB_THRESHOLD_COOLDOWN_MINUTES: i32 = 30;

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
            alert_anomaly_enabled
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

    // 1. Checar se é um erro claro (downtime real)
    let is_hit = payload.cache_status.as_deref().map(|s| s == "HIT" || s == "STALE" || s == "REVALIDATED").unwrap_or(false);
    let effective_threshold = if is_hit { cfg.alert_threshold_hit_ms as f64 } else { cfg.alert_threshold_ms as f64 };

    let ttfb_over_threshold = payload.ttfb_ms
        .map(|t| t > effective_threshold)
        .unwrap_or(false);
    let is_down = payload.status_code.map(|s| s >= 500).unwrap_or(false);

    if is_down && cfg.alert_down_enabled {
        let down_exists = alert_exists_recent_minutes(
            &state,
            payload.monitor_id,
            &payload.region,
            "down",
            DOWN_COOLDOWN_MINUTES,
        ).await.unwrap_or(false);
        if down_exists {
            return;
        }

        let diagnosis = engine::diagnose(&DiagnosisInput {
            ttfb_ms: payload.ttfb_ms,
            cache_status: payload.cache_status.clone(),
            baseline_ttfb_ms: None,
            redirect_count: payload.redirect_count,
            http_version: payload.http_version.clone(),
            region: payload.region.clone(),
            error: payload.error.clone(),
            served_by: payload.served_by.clone(),
            age_s: payload.age_s,
        });

        let insert_res = sqlx::query_scalar!(
            r#"
            INSERT INTO alerts (
                monitor_id, region, alert_type, metric, actual_ms, diagnosis, action
            ) VALUES (
                $1, $2, 'down', 'uptime', $3, $4, $5
            ) RETURNING id
            "#,
            payload.monitor_id,
            payload.region,
            payload.ttfb_ms,
            diagnosis.summary,
            diagnosis.action,
        )
        .fetch_one(&state.db)
        .await;

        match insert_res {
            Ok(alert_id) => {
                info!(
                    "Monitor {} is DOWN in region {}: {}",
                    payload.monitor_id, payload.region, diagnosis.summary
                );
                tokio::spawn(notifier::notify(state.clone(), AlertNotification {
                    alert_id,
                    monitor_id: payload.monitor_id,
                    alert_type: "down".to_string(),
                    region: payload.region.clone(),
                    diagnosis: Some(diagnosis.summary),
                    action: Some(diagnosis.action),
                    actual_ms: payload.ttfb_ms,
                    baseline_ms: Some(effective_threshold),
                    deviation_factor: None,
                    delta_pct: None,
                    comparator: None,
                }));
            }
            Err(e) => error!("Failed to register DOWN alert: {}", e),
        }
        return; // Se está fora do ar, não checamos anomalias de TTFB
    }

    // 2. Breach de limite fixo de TTFB (não é downtime)
    if ttfb_over_threshold && cfg.alert_ttfb_enabled {
        // Sensitivity logic: require consecutive breaches
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
            consecutive_limit
        ).await;

        if breach_count < consecutive_limit {
            return; // Not consistent enough yet
        }

        let threshold_exists = alert_exists_recent_minutes(
            &state,
            payload.monitor_id,
            &payload.region,
            "ttfb_threshold",
            TTFB_THRESHOLD_COOLDOWN_MINUTES,
        ).await.unwrap_or(false);
        if threshold_exists {
            return;
        }

        if let Some(actual_ttfb) = payload.ttfb_ms {
            let hit_miss_label = if is_hit { "Cache HIT" } else { "Cache MISS" };
            let summary = format!(
                "{} TTFB {:.0}ms exceeded your limit ({:.0}ms) in {}.",
                hit_miss_label, actual_ttfb, effective_threshold, payload.region
            );
            let action = if is_hit {
                "Investigate CDN edge performance or large header sizes for this region.".to_string()
            } else {
                "Investigate origin response time, regional routing, and cache rules for this region.".to_string()
            };

            let insert_res = sqlx::query_scalar!(
                r#"
                INSERT INTO alerts (
                    monitor_id, region, alert_type, metric, baseline_ms, actual_ms, diagnosis, action
                ) VALUES (
                    $1, $2, 'ttfb_threshold', 'ttfb_ms', $3, $4, $5, $6
                ) RETURNING id
                "#,
                payload.monitor_id,
                payload.region,
                effective_threshold,
                actual_ttfb,
                summary,
                action,
            )
            .fetch_one(&state.db)
            .await;

            match insert_res {
                Ok(alert_id) => {
                    info!(
                        "TTFB threshold breach for monitor {} in region {}: {:.0}ms > {:.0}ms ({})",
                        payload.monitor_id,
                        payload.region,
                        actual_ttfb,
                        effective_threshold,
                        hit_miss_label
                    );
                    tokio::spawn(notifier::notify(state.clone(), AlertNotification {
                        alert_id,
                        monitor_id: payload.monitor_id,
                        alert_type: "ttfb_threshold".to_string(),
                        region: payload.region.clone(),
                        diagnosis: Some(summary),
                        action: Some(action),
                        actual_ms: Some(actual_ttfb),
                        baseline_ms: Some(effective_threshold),
                        deviation_factor: None,
                        delta_pct: None,
                        comparator: None,
                    }));
                }
                Err(e) => error!("Failed to register TTFB threshold alert: {}", e),
            }
        }
        return;
    }

    // 2. Anomalia de TTFB (comparação com baseline de 7 dias)
    if let Some(actual_ttfb) = payload.ttfb_ms {
    if cfg.alert_anomaly_enabled {
        let anomaly_exists = alert_exists_recent_minutes(
            &state,
            payload.monitor_id,
            &payload.region,
            "anomaly",
            ANOMALY_COOLDOWN_MINUTES,
        ).await.unwrap_or(false);
        if anomaly_exists {
            return;
        }

        let baseline = sqlx::query!(
            r#"
            SELECT ttfb_avg_ms, ttfb_stddev_ms
            FROM monitor_baselines
            WHERE monitor_id = $1 AND region = $2
            LIMIT 1
            "#,
            payload.monitor_id,
            payload.region
        )
        .fetch_optional(&state.db)
        .await;

        match baseline {
            Ok(Some(row)) => {
                let avg = row.ttfb_avg_ms.unwrap_or(0.0);
                let stddev = row.ttfb_stddev_ms.unwrap_or(0.0);
                let sigma_factor = sensitivity_to_sigma(cfg.alert_sensitivity);

                if is_anomalous(actual_ttfb, avg, stddev, sigma_factor) {
                    let deviation_factor = if stddev > 0.0 {
                        (actual_ttfb - avg) / stddev
                    } else {
                        0.0
                    };

                    let diag = engine::diagnose(&DiagnosisInput {
                        ttfb_ms: Some(actual_ttfb),
                        cache_status: payload.cache_status.clone(),
                        baseline_ttfb_ms: Some(avg),
                        redirect_count: payload.redirect_count,
                        http_version: payload.http_version.clone(),
                        region: payload.region.clone(),
                        error: None,
                        served_by: payload.served_by.clone(),
                        age_s: payload.age_s,
                    });

                    let insert_res = sqlx::query_scalar!(
                        r#"
                        INSERT INTO alerts (
                            monitor_id, region, alert_type, metric, baseline_ms, actual_ms,
                            deviation_factor, diagnosis, action, estimated_gain_ms
                        ) VALUES (
                            $1, $2, 'anomaly', 'ttfb_ms', $3, $4, $5, $6, $7, $8
                        ) RETURNING id
                        "#,
                        payload.monitor_id,
                        payload.region,
                        avg,
                        actual_ttfb,
                        deviation_factor,
                        diag.summary,
                        diag.action,
                        diag.estimated_gain_ms
                    )
                    .fetch_one(&state.db)
                    .await;

                    match insert_res {
                        Ok(alert_id) => {
                            info!(
                                "Anomaly detected for monitor {} in region {}: baseline {}ms, actual {}ms",
                                payload.monitor_id, payload.region, avg, actual_ttfb
                            );
                            tokio::spawn(notifier::notify(state.clone(), AlertNotification {
                                alert_id,
                                monitor_id: payload.monitor_id,
                                alert_type: "anomaly".to_string(),
                                region: payload.region.clone(),
                                diagnosis: Some(diag.summary),
                                action: Some(diag.action),
                                actual_ms: Some(actual_ttfb),
                                baseline_ms: Some(avg),
                                deviation_factor: Some(deviation_factor),
                                delta_pct: None,
                                comparator: None,
                            }));
                        }
                        Err(e) => error!("Failed to register ANOMALY alert: {}", e),
                    }
                }
            }
            Ok(None) => {
                // Sem baseline ainda, apenas ingere silenciosamente
            }
            Err(e) => {
                error!("Failed to fetch baseline for anomaly detection: {}", e);
            }
        }
    }
    } // end alert_anomaly_enabled
}

async fn alert_exists_recent_minutes(
    state: &AppState,
    monitor_id: uuid::Uuid,
    region: &str,
    alert_type: &str,
    cooldown_minutes: i32,
) -> Result<bool, sqlx::Error> {
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM alerts
        WHERE monitor_id = $1
          AND region = $2
          AND alert_type = $3
          AND created_at > NOW() - ($4 * INTERVAL '1 minute')
        "#,
    )
    .bind(monitor_id)
    .bind(region)
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
