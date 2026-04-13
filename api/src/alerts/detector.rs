use crate::{diagnosis::engine::{self, DiagnosisInput}, models::probe_result::ProbeResultPayload, AppState};
use super::notifier::{self, AlertNotification};
use tracing::{info, error};

pub fn is_anomalous(actual_ttfb: f64, avg: f64, stddev: f64) -> bool {
    // Anomalia estatística: se TTFB é > média + (3 * desvio padrão)
    // Exigimos também um mínimo de 500ms mais lento que a média,
    // para não gerar ruído em sites ultrarrápidos (ex: média 20ms, vai a 40ms -> irrelevante).
    let threshold = f64::max(avg + (3.0 * stddev), avg + 500.0);
    actual_ttfb > threshold
}

/// Returns true if a recent alert of this type already exists for the monitor+region
/// (prevents flooding the alerts table for persistent conditions like anycast routing).
async fn recent_alert_exists(state: &AppState, monitor_id: uuid::Uuid, region: &str, alert_type: &str) -> bool {
    match sqlx::query_scalar!(
        r#"
        SELECT id FROM alerts
        WHERE monitor_id = $1
          AND region = $2
          AND alert_type = $3
          AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
        "#,
        monitor_id,
        region,
        alert_type,
    )
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(_)) => true,
        _ => false,
    }
}

pub async fn check_for_anomalies(state: AppState, payload: ProbeResultPayload) {
    // 1. Checar se é um erro claro ou downtime (ex: timeout na request ou status 500+)
    let is_down = payload.error.is_some() || payload.status_code.map(|s| s >= 500).unwrap_or(false);

    if is_down {
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
                monitor_id, region, alert_type, metric, actual_ms, diagnosis, action, estimated_gain_ms
            ) VALUES (
                $1, $2, 'down', 'uptime', $3, $4, $5, $6
            ) RETURNING id
            "#,
            payload.monitor_id,
            payload.region,
            payload.total_ms,
            diagnosis.summary,
            diagnosis.action,
            diagnosis.estimated_gain_ms
        )
        .fetch_one(&state.db)
        .await;

        match insert_res {
            Ok(alert_id) => {
                tokio::spawn(notifier::notify(state, AlertNotification {
                    alert_id,
                    monitor_id: payload.monitor_id,
                    alert_type: "down".to_string(),
                    region: payload.region.clone(),
                    diagnosis: Some(diagnosis.summary),
                    action: Some(diagnosis.action),
                    actual_ms: payload.total_ms,
                    baseline_ms: None,
                    deviation_factor: None,
                }));
            }
            Err(e) => error!("Failed to register DOWN alert: {}", e),
        }
        return;
    }

    // 2. Se está UP, checar baselines para anomalias estatísticas
    if let Some(actual_ttfb) = payload.ttfb_ms {
        let baseline = sqlx::query!(
            r#"
            SELECT ttfb_avg_ms, ttfb_stddev_ms
            FROM monitor_baselines
            WHERE monitor_id = $1 AND region = $2
            "#,
            payload.monitor_id,
            payload.region
        )
        .fetch_optional(&state.db)
        .await;

        match baseline {
            Ok(Some(b)) => {
                let avg = b.ttfb_avg_ms.unwrap_or(0.0);
                let stddev = b.ttfb_stddev_ms.unwrap_or(0.0);

                if is_anomalous(actual_ttfb, avg, stddev) {
                    let deviation_factor = if avg > 0.0 { actual_ttfb / avg } else { 0.0 };

                    let diag = engine::diagnose(&DiagnosisInput {
                        ttfb_ms: payload.ttfb_ms,
                        cache_status: payload.cache_status.clone(),
                        baseline_ttfb_ms: Some(avg),
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

    // 3. Anycast routing audit — at most once per 24h per monitor+region
    if let Some(ref served_by) = payload.served_by {
        // Use the dedicated helper instead of going through the full diagnose() pipeline
        let is_anycast_mismatch = engine::detect_anycast_mismatch(served_by, &payload.region).is_some();

        if is_anycast_mismatch {
            // Build the human-readable diagnosis for the alert record
            let anycast_diag = engine::diagnose(&DiagnosisInput {
                ttfb_ms: payload.ttfb_ms,
                cache_status: None,
                baseline_ttfb_ms: None,
                redirect_count: None,
                http_version: None,
                region: payload.region.clone(),
                error: None,
                served_by: Some(served_by.clone()),
                age_s: None,
            });

            if !recent_alert_exists(&state, payload.monitor_id, &payload.region, "anycast").await {
                let insert_res = sqlx::query_scalar!(
                    r#"
                    INSERT INTO alerts (
                        monitor_id, region, alert_type, metric, diagnosis, action, estimated_gain_ms
                    ) VALUES (
                        $1, $2, 'anycast', 'routing', $3, $4, $5
                    ) RETURNING id
                    "#,
                    payload.monitor_id,
                    payload.region,
                    anycast_diag.summary,
                    anycast_diag.action,
                    anycast_diag.estimated_gain_ms,
                )
                .fetch_one(&state.db)
                .await;

                match insert_res {
                    Ok(alert_id) => {
                        info!(
                            "Anycast routing mismatch for monitor {} in region {}: {}",
                            payload.monitor_id, payload.region, anycast_diag.summary
                        );
                        tokio::spawn(notifier::notify(state.clone(), AlertNotification {
                            alert_id,
                            monitor_id: payload.monitor_id,
                            alert_type: "anycast".to_string(),
                            region: payload.region.clone(),
                            diagnosis: Some(anycast_diag.summary),
                            action: Some(anycast_diag.action),
                            actual_ms: None,
                            baseline_ms: None,
                            deviation_factor: None,
                        }));
                    }
                    Err(e) => error!("Failed to register ANYCAST alert: {}", e),
                }
            }
        }
    }

    // 4. Zombie cache audit — at most once per 24h per monitor+region
    if let Some(age) = payload.age_s {
        if age > 86_400 {
            if !recent_alert_exists(&state, payload.monitor_id, &payload.region, "zombie_cache").await {
                let zombie_diag = engine::diagnose(&DiagnosisInput {
                    ttfb_ms: payload.ttfb_ms,
                    cache_status: payload.cache_status.clone(),
                    baseline_ttfb_ms: None,
                    redirect_count: None,
                    http_version: None,
                    region: payload.region.clone(),
                    error: None,
                    served_by: None,
                    age_s: Some(age),
                });

                let insert_res = sqlx::query_scalar!(
                    r#"
                    INSERT INTO alerts (
                        monitor_id, region, alert_type, metric, actual_ms, diagnosis, action, estimated_gain_ms
                    ) VALUES (
                        $1, $2, 'zombie_cache', 'age_s', $3, $4, $5, $6
                    ) RETURNING id
                    "#,
                    payload.monitor_id,
                    payload.region,
                    age as f64,
                    zombie_diag.summary,
                    zombie_diag.action,
                    zombie_diag.estimated_gain_ms,
                )
                .fetch_one(&state.db)
                .await;

                match insert_res {
                    Ok(alert_id) => {
                        info!(
                            "Zombie cache detected for monitor {} in region {}: Age={}s",
                            payload.monitor_id, payload.region, age
                        );
                        tokio::spawn(notifier::notify(state.clone(), AlertNotification {
                            alert_id,
                            monitor_id: payload.monitor_id,
                            alert_type: "zombie_cache".to_string(),
                            region: payload.region.clone(),
                            diagnosis: Some(zombie_diag.summary),
                            action: Some(zombie_diag.action),
                            actual_ms: Some(age as f64),
                            baseline_ms: None,
                            deviation_factor: None,
                        }));
                    }
                    Err(e) => error!("Failed to register ZOMBIE_CACHE alert: {}", e),
                }
            }
        }
    }

    // 5. SSL Expiry audit — at most once per 24h per monitor+region
    if let Some(sec) = &payload.security_headers {
        if let Some(ssl) = sec.get("ssl") {
            if let Some(days_val) = ssl.get("days_remaining") {
                if let Some(days) = days_val.as_i64() {
                    if days < 15 {
                        if !recent_alert_exists(&state, payload.monitor_id, &payload.region, "ssl_expiry").await {
                            let diag = crate::diagnosis::engine::Diagnosis {
                                severity: "critical".into(),
                                cause: format!("SSL Certificate will expire in {} days.", days),
                                action: "Renew your SSL certificate immediately to prevent site downtime and security warnings.".into(),
                                summary: format!("SSL Certificate expiring in {} days", days),
                                estimated_gain_ms: None,
                            };
                            
                            let insert_res = sqlx::query_scalar!(
                                r#"
                                INSERT INTO alerts (
                                    monitor_id, region, alert_type, metric, actual_ms, diagnosis, action, estimated_gain_ms
                                ) VALUES (
                                    $1, $2, 'ssl_expiry', 'days_remaining', $3, $4, $5, $6
                                ) RETURNING id
                                "#,
                                payload.monitor_id,
                                payload.region,
                                days as f64,
                                diag.summary,
                                diag.action,
                                diag.estimated_gain_ms,
                            )
                            .fetch_one(&state.db)
                            .await;

                            match insert_res {
                                Ok(alert_id) => {
                                    info!(
                                        "SSL expiry detected for monitor {} in region {}: {} days remaining",
                                        payload.monitor_id, payload.region, days
                                    );
                                    tokio::spawn(notifier::notify(state.clone(), AlertNotification {
                                        alert_id,
                                        monitor_id: payload.monitor_id,
                                        alert_type: "ssl_expiry".to_string(),
                                        region: payload.region.clone(),
                                        diagnosis: Some(diag.summary),
                                        action: Some(diag.action),
                                        actual_ms: Some(days as f64),
                                        baseline_ms: None,
                                        deviation_factor: None,
                                    }));
                                }
                                Err(e) => error!("Failed to register SSL_EXPIRY alert: {}", e),
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_anomalous_standard() {
        // Média 100, Stddev 20. 3-sigma seria 160. Média + 500 = 600. Max(160, 600) = 600.
        assert!(!is_anomalous(150.0, 100.0, 20.0));
        assert!(is_anomalous(601.0, 100.0, 20.0));
    }

    #[test]
    fn test_is_anomalous_high_variance() {
        // Média 200, Stddev 200. 3-sigma = 200 + 600 = 800. Média + 500 = 700. Max(800, 700) = 800.
        assert!(!is_anomalous(750.0, 200.0, 200.0));
        assert!(is_anomalous(801.0, 200.0, 200.0));
    }

    #[test]
    fn test_is_anomalous_zero_stddev() {
        // Média 50, Stddev 0. Média + 500 = 550.
        assert!(!is_anomalous(500.0, 50.0, 0.0));
        assert!(is_anomalous(551.0, 50.0, 0.0));
    }
}
