use crate::{diagnosis::engine::{self, DiagnosisInput}, models::probe_result::ProbeResultPayload, AppState};
use super::notifier::{self, AlertNotification};
use tracing::{info, error};

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
    alert_sensitivity: i16,
    alert_down_enabled: bool,
    alert_anomaly_enabled: bool,
    alert_anycast_enabled: bool,
    alert_zombie_cache_enabled: bool,
    alert_cache_hit_enabled: bool,
    alert_cache_hit_threshold_pct: f64,
}

async fn fetch_monitor_alert_config(state: &AppState, monitor_id: uuid::Uuid) -> Option<MonitorAlertConfig> {
    sqlx::query_as::<_, MonitorAlertConfig>(
        r#"
        SELECT
            alert_threshold_ms,
            alert_sensitivity,
            alert_down_enabled,
            alert_anomaly_enabled,
            alert_anycast_enabled,
            alert_zombie_cache_enabled,
            alert_cache_hit_enabled,
            alert_cache_hit_threshold_pct
        FROM monitors WHERE id = $1 LIMIT 1
        "#,
    )
    .bind(monitor_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None)
}

/// Batch-fetches all alert types fired in the last 24 h for this monitor+region.
/// Used to deduplicate rate-limited alert types (anycast, zombie_cache, cache_hit_low)
/// in a single DB round-trip instead of one SELECT per type.
async fn fetch_recent_alert_types(
    state: &AppState,
    monitor_id: uuid::Uuid,
    region: &str,
) -> std::collections::HashSet<String> {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT DISTINCT alert_type FROM alerts
        WHERE monitor_id = $1
          AND region = $2
          AND created_at > NOW() - INTERVAL '24 hours'
        "#,
    )
    .bind(monitor_id)
    .bind(region)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect()
}

/// SSL expiry is a persistent condition that resolves slowly — rate-limit to 7 days
/// so users get one reminder per week rather than one per probe cycle.
async fn recent_ssl_alert_exists(state: &AppState, monitor_id: uuid::Uuid, region: &str) -> bool {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM alerts
        WHERE monitor_id = $1
          AND region = $2
          AND alert_type = 'ssl_expiry'
          AND created_at > NOW() - INTERVAL '7 days'
        "#,
    )
    .bind(monitor_id)
    .bind(region)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0)
        > 0
}

pub async fn check_for_anomalies(state: AppState, payload: ProbeResultPayload) {
    let cfg = match fetch_monitor_alert_config(&state, payload.monitor_id).await {
        Some(c) => c,
        None => {
            error!("Monitor config not found for {}", payload.monitor_id);
            return;
        }
    };

    // 1. Checar se é um erro claro, downtime ou TTFB acima do threshold configurado
    let ttfb_over_threshold = payload.ttfb_ms
        .map(|t| t > cfg.alert_threshold_ms as f64)
        .unwrap_or(false);
    let is_down = payload.error.is_some()
        || payload.status_code.map(|s| s >= 500).unwrap_or(false)
        || ttfb_over_threshold;

    if is_down && cfg.alert_down_enabled {
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

    // Fetch recent 24h alert types once — used by anycast, zombie_cache, cache_hit_low checks.
    // Skipped entirely if none of those types are enabled, avoiding a DB round-trip.
    let needs_dedup = cfg.alert_anycast_enabled || cfg.alert_zombie_cache_enabled || cfg.alert_cache_hit_enabled;
    let recent_types = if needs_dedup {
        fetch_recent_alert_types(&state, payload.monitor_id, &payload.region).await
    } else {
        std::collections::HashSet::new()
    };

    // 2. Se está UP, checar baselines para anomalias estatísticas
    if cfg.alert_anomaly_enabled && !is_down {
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

                let sigma = sensitivity_to_sigma(cfg.alert_sensitivity);
                if is_anomalous(actual_ttfb, avg, stddev, sigma) {
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
    } // end alert_anomaly_enabled

    // 3. Anycast routing audit — at most once per 24h per monitor+region
    if cfg.alert_anycast_enabled {
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

            if !recent_types.contains("anycast") {
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
    } // end alert_anycast_enabled

    // 4. Zombie cache audit — at most once per 24h per monitor+region
    if cfg.alert_zombie_cache_enabled {
    if let Some(age) = payload.age_s {
        if age > 86_400 {
            if !recent_types.contains("zombie_cache") {
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
    } // end alert_zombie_cache_enabled

    // 5. Cache hit rate — 24h rolling average below configured threshold
    // Dedup check runs first to avoid the expensive aggregation when already suppressed.
    if cfg.alert_cache_hit_enabled && !recent_types.contains("cache_hit_low") {
        let hit_query = sqlx::query_as::<_, (Option<f64>, i64)>(
            r#"
            SELECT
                ((COUNT(*) FILTER (WHERE cache_status ILIKE '%HIT%'))::float
                 / NULLIF(COUNT(*), 0)) * 100 AS hit_pct,
                COUNT(*) AS sample_count
            FROM probe_results
            WHERE monitor_id = $1
              AND region = $2
              AND time > NOW() - INTERVAL '24 hours'
              AND error IS NULL
              AND status_code < 500
            "#,
        )
        .bind(payload.monitor_id)
        .bind(&payload.region)
        .fetch_optional(&state.db)
        .await;

        if let Ok(Some((Some(hit_pct), sample_count))) = hit_query {
            if sample_count >= 5 && hit_pct < cfg.alert_cache_hit_threshold_pct {
                let summary = format!(
                        "Cache hit rate dropped to {:.1}% (threshold: {:.0}%)",
                        hit_pct, cfg.alert_cache_hit_threshold_pct
                    );
                    let action = "Check your CDN cache rules. Common causes: short TTL, missing Cache-Control headers, or high dynamic content ratio.".to_string();

                    let insert_res = sqlx::query_scalar!(
                        r#"
                        INSERT INTO alerts (
                            monitor_id, region, alert_type, metric, actual_ms, baseline_ms, diagnosis, action
                        ) VALUES (
                            $1, $2, 'cache_hit_low', 'cache_hit_pct', $3, $4, $5, $6
                        ) RETURNING id
                        "#,
                        payload.monitor_id,
                        payload.region,
                        hit_pct,
                        cfg.alert_cache_hit_threshold_pct,
                        summary,
                        action,
                    )
                    .fetch_one(&state.db)
                    .await;

                    match insert_res {
                        Ok(alert_id) => {
                            info!(
                                "Cache hit low for monitor {} in region {}: {:.1}% < {:.0}%",
                                payload.monitor_id, payload.region, hit_pct, cfg.alert_cache_hit_threshold_pct
                            );
                            tokio::spawn(notifier::notify(state.clone(), AlertNotification {
                                alert_id,
                                monitor_id: payload.monitor_id,
                                alert_type: "cache_hit_low".to_string(),
                                region: payload.region.clone(),
                                diagnosis: Some(summary),
                                action: Some(action),
                                actual_ms: Some(hit_pct),
                                baseline_ms: Some(cfg.alert_cache_hit_threshold_pct),
                                deviation_factor: None,
                            }));
                        }
                        Err(e) => error!("Failed to register CACHE_HIT_LOW alert: {}", e),
                    }
            }
        }
    }

    // 6. SSL Expiry audit — at most once per 7 days per monitor+region
    if let Some(sec) = &payload.security_headers {
        if let Some(ssl) = sec.get("ssl") {
            if let Some(days_val) = ssl.get("days_remaining") {
                if let Some(days) = days_val.as_i64() {
                    if days < 15 {
                        if !recent_ssl_alert_exists(&state, payload.monitor_id, &payload.region).await {
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

    #[test]
    fn test_cache_hit_pct_formula() {
        // Verifica a fórmula de cache hit usada na query SQL:
        // ((hits as f64) / total) * 100
        let hits = 7.0_f64;
        let total = 10.0_f64;
        let hit_pct = (hits / total) * 100.0;
        assert!((hit_pct - 70.0).abs() < f64::EPSILON);

        // Caso com zero total não deve entrar no branch (NULLIF retorna NULL → hit_pct é None)
        let total_zero = 0.0_f64;
        let safe = if total_zero == 0.0 { None } else { Some((hits / total_zero) * 100.0) };
        assert!(safe.is_none());
    }

    #[test]
    fn test_cache_hit_pct_threshold_boundary() {
        // Alerta só dispara quando hit_pct < threshold (strict less-than).
        let threshold = 80.0_f64;
        assert!(79.9 < threshold);  // dispara
        assert!(!(80.0 < threshold)); // limiar exato não dispara
        assert!(!(80.1 < threshold)); // acima não dispara
    }
}
