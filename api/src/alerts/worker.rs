use crate::{
    alerts::notifier::{self, AlertNotification},
    diagnosis::engine::{self, DiagnosisInput},
    trend,
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

        // Trend alerts: run detector after general audit
        if let Err(e) = trend::detector::run_cycle(&state).await {
            error!("Trend detector cycle error: {}", e);
        }
    }
}

pub struct MonitorAlertConfig {
    pub id: Uuid,
    pub alert_cache_hit_enabled: bool,
    pub alert_cache_hit_threshold_pct: f64,
    pub alert_anycast_enabled: bool,
    pub alert_zombie_cache_enabled: bool,
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

#[derive(Debug, Clone)]
struct Detection {
    region: String,
    alert_type: String,
    metric: String,
    actual: f64,
    baseline: Option<f64>,
    summary: String,
    action: String,
}

pub async fn audit_monitor_alerts(state: &AppState, monitor: &MonitorAlertConfig) -> Result<(), anyhow::Error> {
    let latest_probes = sqlx::query!(
        "SELECT DISTINCT ON (region) region, ttfb_ms, cache_status, age_s, security_headers, served_by
         FROM probe_results WHERE monitor_id = $1 AND time > NOW() - INTERVAL '24 hours'
         ORDER BY region, time DESC",
        monitor.id
    ).fetch_all(&state.db).await?;

    let mut detections: Vec<Detection> = Vec::new();

    for probe in latest_probes {
        let region = probe.region;
        
        if monitor.alert_cache_hit_enabled {
            if let Some(d) = check_cache_hit(state, monitor, &region).await? {
                detections.push(d);
            }
        }
        if let Some(sec) = probe.security_headers {
            if let Some(d) = check_ssl_expiry(state, monitor.id, &region, &sec).await? {
                detections.push(d);
            }
        }
        if monitor.alert_anycast_enabled {
            if let Some(ttfb) = probe.ttfb_ms {
                if let Some(d) = check_anycast(state, monitor.id, &region, ttfb, &probe.cache_status, probe.served_by, probe.age_s).await? {
                    detections.push(d);
                }
            }
        }
        if monitor.alert_zombie_cache_enabled {
            if let Some(ttfb) = probe.ttfb_ms {
                if let Some(d) = check_zombie_cache(state, monitor.id, &region, ttfb, &probe.cache_status, probe.age_s).await? {
                    detections.push(d);
                }
            }
        }
    }

    // Agrupamento de detecções por tipo de alerta
    use std::collections::HashMap;
    let mut grouped: HashMap<String, Vec<Detection>> = HashMap::new();
    for d in detections {
        grouped.entry(d.alert_type.clone()).or_default().push(d);
    }

    for (alert_type, group) in grouped {
        save_and_notify_aggregated(state, monitor.id, &alert_type, group).await?;
    }

    Ok(())
}

async fn check_cache_hit(state: &AppState, monitor: &MonitorAlertConfig, region: &str) -> Result<Option<Detection>, anyhow::Error> {
    if alert_exists_recent(state, monitor.id, region, "cache_hit_low", "24 hours").await? {
        return Ok(None);
    }

    let hit_data = sqlx::query_as::<_, (Option<f64>, Option<i64>, Option<i64>)>(
        "SELECT (SUM(hit_count)::float / NULLIF(SUM(cdn_count), 0)) * 100 AS hit_pct, SUM(total_count)::bigint, SUM(cdn_count)::bigint
         FROM probe_results_hourly WHERE monitor_id = $1 AND region = $2 AND bucket > NOW() - INTERVAL '24 hours'",
    ).bind(monitor.id).bind(region).fetch_one(&state.db).await?;

    if let (Some(hit_pct), Some(sample_count), Some(cdn_sample_count)) = hit_data {
        if cdn_sample_count > 0 && sample_count >= 5 && hit_pct < monitor.alert_cache_hit_threshold_pct {
            return Ok(Some(Detection {
                region: region.to_string(),
                alert_type: "cache_hit_low".to_string(),
                metric: "cache_hit_pct".to_string(),
                actual: hit_pct,
                baseline: Some(monitor.alert_cache_hit_threshold_pct),
                summary: format!("Cache hit rate dropped to {:.1}%", hit_pct),
                action: "Check your CDN cache rules and Cache-Control headers.".to_string(),
            }));
        }
    }
    Ok(None)
}

async fn check_ssl_expiry(state: &AppState, monitor_id: Uuid, region: &str, sec: &serde_json::Value) -> Result<Option<Detection>, anyhow::Error> {
    if alert_exists_recent(state, monitor_id, region, "ssl_expiry", "7 days").await? {
        return Ok(None);
    }
    if let Some(days) = sec.get("ssl").and_then(|ssl| ssl.get("days_remaining")).and_then(|v| v.as_i64()) {
        if days < 15 {
            return Ok(Some(Detection {
                region: region.to_string(),
                alert_type: "ssl_expiry".to_string(),
                metric: "days_remaining".to_string(),
                actual: days as f64,
                baseline: None,
                summary: format!("SSL Certificate expiring in {} days", days),
                action: "Renew your SSL certificate immediately.".into(),
            }));
        }
    }
    Ok(None)
}

async fn check_anycast(state: &AppState, monitor_id: Uuid, region: &str, ttfb_ms: f64, cache_status: &Option<String>, served_by: Option<String>, age_s: Option<i32>) -> Result<Option<Detection>, anyhow::Error> {
    if alert_exists_recent(state, monitor_id, region, "anycast", "24 hours").await? {
        return Ok(None);
    }
    let diag = engine::diagnose(&DiagnosisInput { ttfb_ms: Some(ttfb_ms), cache_status: cache_status.clone(), baseline_ttfb_ms: None, redirect_count: None, http_version: None, region: region.to_string(), error: None, served_by, age_s });
    if diag.summary.contains("Anycast") || diag.summary.contains("routing") {
        return Ok(Some(Detection {
            region: region.to_string(),
            alert_type: "anycast".to_string(),
            metric: "routing".to_string(),
            actual: 0.0,
            baseline: None,
            summary: diag.summary,
            action: diag.action,
        }));
    }
    Ok(None)
}

async fn check_zombie_cache(state: &AppState, monitor_id: Uuid, region: &str, ttfb_ms: f64, cache_status: &Option<String>, age_s: Option<i32>) -> Result<Option<Detection>, anyhow::Error> {
    if alert_exists_recent(state, monitor_id, region, "zombie_cache", "24 hours").await? {
        return Ok(None);
    }
    if let Some(age) = age_s {
        if age > 86_400 {
            let diag = engine::diagnose(&DiagnosisInput { ttfb_ms: Some(ttfb_ms), cache_status: cache_status.clone(), baseline_ttfb_ms: None, redirect_count: None, http_version: None, region: region.to_string(), error: None, served_by: None, age_s: Some(age) });
            return Ok(Some(Detection {
                region: region.to_string(),
                alert_type: "zombie_cache".to_string(),
                metric: "age_s".to_string(),
                actual: age as f64,
                baseline: None,
                summary: diag.summary,
                action: diag.action,
            }));
        }
    }
    Ok(None)
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

async fn save_and_notify_aggregated(
    state: &AppState,
    monitor_id: Uuid,
    alert_type: &str,
    detections: Vec<Detection>,
) -> Result<(), anyhow::Error> {
    if detections.is_empty() { return Ok(()); }

    let count = detections.len();
    let regions = detections.iter().map(|d| d.region.as_str()).collect::<Vec<&str>>().join(", ");
    let first = &detections[0];
    
    let final_region = if count > 1 { "Multiple".to_string() } else { first.region.clone() };
    let diagnosis = if count > 1 {
        format!("{} Affected regions: {}.", first.summary, regions)
    } else {
        first.summary.clone()
    };

    let alert_id = sqlx::query_scalar!(
        "INSERT INTO alerts (monitor_id, region, alert_type, metric, actual_ms, baseline_ms, diagnosis, action) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        monitor_id, final_region, alert_type, first.metric, first.actual, first.baseline, diagnosis, first.action
    )
    .fetch_one(&state.db)
    .await?;

    tokio::spawn(notifier::notify(state.clone(), AlertNotification {
        alert_id,
        monitor_id,
        alert_type: alert_type.to_string(),
        region: final_region,
        diagnosis: Some(diagnosis),
        action: Some(first.action.clone()),
        actual_ms: Some(first.actual),
        baseline_ms: first.baseline,
        deviation_factor: None,
        delta_pct: None,
        comparator: None,
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
