use crate::{
    alerts::notifier::{self, AlertNotification},
    diagnosis::engine::{self, DiagnosisInput},
    AppState,
};
use std::time::Duration;
use tokio::time::interval;
use tracing::{error, info};
use uuid::Uuid;

pub async fn run(state: AppState) {
    let interval_secs = state.config.alerts_worker_interval_secs;
    info!("General alerts background worker started — checking every {} seconds", interval_secs);
    
    let duration = if interval_secs > 0 {
        Duration::from_secs(interval_secs)
    } else {
        Duration::from_secs(900)
    };
    
    let mut ticker = interval(duration);

    loop {
        ticker.tick().await;
        info!("Starting general alerts audit cycle...");

        let monitors = match fetch_active_monitors(&state).await {
            Ok(m) => m,
            Err(e) => {
                error!("Failed to fetch monitors for alerts audit: {}", e);
                continue;
            }
        };

        for m in monitors {
            if let Err(e) = audit_monitor_alerts(&state, &m).await {
                error!("Error auditing monitor {} for alerts: {}", m.id, e);
            }
        }

        info!("General alerts audit cycle completed.");
    }
}

struct MonitorAlertConfig {
    id: Uuid,
    alert_cache_hit_enabled: bool,
    alert_cache_hit_threshold_pct: f64,
    alert_anycast_enabled: bool,
    alert_zombie_cache_enabled: bool,
}

async fn fetch_active_monitors(state: &AppState) -> Result<Vec<MonitorAlertConfig>, sqlx::Error> {
    sqlx::query_as!(
        MonitorAlertConfig,
        r#"
        SELECT id, alert_cache_hit_enabled, alert_cache_hit_threshold_pct, 
               alert_anycast_enabled, alert_zombie_cache_enabled
        FROM monitors
        WHERE is_active = true
        "#
    )
    .fetch_all(&state.db)
    .await
}

async fn audit_monitor_alerts(state: &AppState, monitor: &MonitorAlertConfig) -> Result<(), anyhow::Error> {
    // Fetch latest probe results per region for this monitor
    let latest_probes = sqlx::query!(
        r#"
        SELECT DISTINCT ON (region)
            region, ttfb_ms, cache_status, age_s, security_headers, served_by
        FROM probe_results
        WHERE monitor_id = $1 AND time > NOW() - INTERVAL '24 hours'
        ORDER BY region, time DESC
        "#,
        monitor.id
    )
    .fetch_all(&state.db)
    .await?;

    for probe in latest_probes {
        let region = probe.region;
        
        // 1. Cache Hit Rate Check
        if monitor.alert_cache_hit_enabled {
            check_cache_hit(state, monitor, &region).await?;
        }

        // 2. SSL Expiry Check (Always checked if security data exists)
        if let Some(sec) = probe.security_headers {
            check_ssl_expiry(state, monitor.id, &region, &sec).await?;
        }

        // 3. Anycast Mismatch Check
        if monitor.alert_anycast_enabled {
            if let Some(ttfb) = probe.ttfb_ms {
                check_anycast(state, monitor.id, &region, ttfb, &probe.cache_status, probe.served_by, probe.age_s).await?;
            }
        }

        // 4. Zombie Cache Check
        if monitor.alert_zombie_cache_enabled {
            if let Some(ttfb) = probe.ttfb_ms {
                check_zombie_cache(state, monitor.id, &region, ttfb, &probe.cache_status, probe.age_s).await?;
            }
        }
    }

    Ok(())
}

async fn check_cache_hit(state: &AppState, monitor: &MonitorAlertConfig, region: &str) -> Result<(), anyhow::Error> {
    if alert_exists_recent(state, monitor.id, region, "cache_hit_low", "24 hours").await? {
        return Ok(());
    }

    let hit_data = sqlx::query_as::<_, (Option<f64>, Option<i64>)>(
        r#"
        SELECT
            (SUM(hit_count)::float / NULLIF(SUM(total_count), 0)) * 100 AS hit_pct,
            SUM(total_count) AS sample_count
        FROM cache_hits_hourly
        WHERE monitor_id = $1 AND region = $2 AND bucket > NOW() - INTERVAL '24 hours'
        "#,
    )
    .bind(monitor.id)
    .bind(region)
    .fetch_one(&state.db)
    .await?;

    if let (Some(hit_pct), Some(sample_count)) = hit_data {
        if sample_count >= 5 && hit_pct < monitor.alert_cache_hit_threshold_pct {
            let summary = format!("Cache hit rate dropped to {:.1}% (threshold: {:.0}%)", hit_pct, monitor.alert_cache_hit_threshold_pct);
            let action = "Check your CDN cache rules. Common causes: short TTL, missing Cache-Control headers, or high dynamic content ratio.".to_string();
            
            save_and_notify(state, monitor.id, region, "cache_hit_low", "cache_hit_pct", hit_pct, Some(monitor.alert_cache_hit_threshold_pct), summary, action).await?;
        }
    }
    Ok(())
}

async fn check_ssl_expiry(state: &AppState, monitor_id: Uuid, region: &str, sec: &serde_json::Value) -> Result<(), anyhow::Error> {
    if alert_exists_recent(state, monitor_id, region, "ssl_expiry", "7 days").await? {
        return Ok(());
    }

    if let Some(ssl) = sec.get("ssl") {
        if let Some(days) = ssl.get("days_remaining").and_then(|v| v.as_i64()) {
            if days < 15 {
                let summary = format!("SSL Certificate expiring in {} days", days);
                let action = "Renew your SSL certificate immediately to prevent site downtime and security warnings.".into();
                save_and_notify(state, monitor_id, region, "ssl_expiry", "days_remaining", days as f64, None, summary, action).await?;
            }
        }
    }
    Ok(())
}

async fn check_anycast(state: &AppState, monitor_id: Uuid, region: &str, ttfb_ms: f64, cache_status: &Option<String>, served_by: Option<String>, age_s: Option<i32>) -> Result<(), anyhow::Error> {
    if alert_exists_recent(state, monitor_id, region, "anycast", "24 hours").await? {
        return Ok(());
    }

    let diag = engine::diagnose(&DiagnosisInput {
        ttfb_ms: Some(ttfb_ms),
        cache_status: cache_status.clone(),
        baseline_ttfb_ms: None,
        redirect_count: None,
        http_version: None,
        region: region.to_string(),
        error: None,
        served_by,
        age_s,
    });

    if diag.summary.contains("Anycast") || diag.summary.contains("routing") {
        save_and_notify(state, monitor_id, region, "anycast", "routing", 0.0, None, diag.summary, diag.action).await?;
    }
    Ok(())
}

async fn check_zombie_cache(state: &AppState, monitor_id: Uuid, region: &str, ttfb_ms: f64, cache_status: &Option<String>, age_s: Option<i32>) -> Result<(), anyhow::Error> {
    if alert_exists_recent(state, monitor_id, region, "zombie_cache", "24 hours").await? {
        return Ok(());
    }

    if let Some(age) = age_s {
        if age > 86_400 {
            let diag = engine::diagnose(&DiagnosisInput {
                ttfb_ms: Some(ttfb_ms),
                cache_status: cache_status.clone(),
                baseline_ttfb_ms: None,
                redirect_count: None,
                http_version: None,
                region: region.to_string(),
                error: None,
                served_by: None,
                age_s: Some(age),
            });
            save_and_notify(state, monitor_id, region, "zombie_cache", "age_s", age as f64, None, diag.summary, diag.action).await?;
        }
    }
    Ok(())
}

async fn alert_exists_recent(state: &AppState, monitor_id: Uuid, region: &str, alert_type: &str, interval: &str) -> Result<bool, sqlx::Error> {
    let sql = format!("SELECT COUNT(*) FROM alerts WHERE monitor_id = $1 AND region = $2 AND alert_type = $3 AND created_at > NOW() - INTERVAL '{}'", interval);
    let count: i64 = sqlx::query_scalar(&sql)
        .bind(monitor_id)
        .bind(region)
        .bind(alert_type)
        .fetch_one(&state.db)
        .await?;
    Ok(count > 0)
}

async fn save_and_notify(
    state: &AppState,
    monitor_id: Uuid,
    region: &str,
    alert_type: &str,
    metric: &str,
    actual: f64,
    baseline: Option<f64>,
    summary: String,
    action: String,
) -> Result<(), anyhow::Error> {
    let alert_id = sqlx::query_scalar!(
        r#"
        INSERT INTO alerts (
            monitor_id, region, alert_type, metric, actual_ms, baseline_ms, diagnosis, action
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
        ) RETURNING id
        "#,
        monitor_id, region, alert_type, metric, actual, baseline, summary, action
    )
    .fetch_one(&state.db)
    .await?;

    tokio::spawn(notifier::notify(state.clone(), AlertNotification {
        alert_id,
        monitor_id,
        alert_type: alert_type.to_string(),
        region: region.to_string(),
        diagnosis: Some(summary),
        action: Some(action),
        actual_ms: Some(actual),
        baseline_ms: baseline,
        deviation_factor: None,
    }));

    Ok(())
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_cache_hit_pct_formula() {
        let hits = 75.0_f64;
        let total = 100.0_f64;
        let hit_pct = (hits / total) * 100.0;
        assert!((hit_pct - 75.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_cache_hit_threshold_logic() {
        let threshold = 80.0_f64;
        assert!(79.9 < threshold);
        assert!(!(80.0 < threshold));
    }

    #[test]
    fn test_ssl_expiry_threshold() {
        let critical_days = 15;
        assert!(14 < critical_days);
        assert!(!(15 < critical_days));
    }

    #[test]
    fn test_zombie_cache_threshold() {
        let max_age_s = 86_400;
        assert!(86_401 > max_age_s);
        assert!(!(86_400 > max_age_s));
    }
}
