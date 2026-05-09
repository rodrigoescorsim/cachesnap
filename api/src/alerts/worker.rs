use crate::{
    alerts::{
        notifier::{self, IncidentNotification, NotificationType, RecoveryNotification},
        severity::{alert_severity, format_duration, is_cache_metric},
    },
    diagnosis::engine::{self, DiagnosisInput},
    models::alert_incident::ResolvedIncident,
    trend,
    AppState,
};
use chrono::Utc;
use std::time::Duration;
use tokio::time::interval;
use tracing::{error, info};
use uuid::Uuid;

pub async fn run(state: AppState) {
    let interval_secs = state.config.alerts_worker_interval_secs;
    info!(
        "General alerts worker started — checking every {} seconds",
        interval_secs
    );

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

        if let Err(e) = resolve_stale_probe_incidents(&state).await {
            error!("Failed to resolve stale probe incidents: {}", e);
        }

        info!("General alerts audit cycle completed.");

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
    actual: f64,
    threshold: Option<f64>,
    diagnosis: String,
    action: String,
}

pub async fn audit_monitor_alerts(
    state: &AppState,
    monitor: &MonitorAlertConfig,
) -> Result<(), anyhow::Error> {
    let latest_probes = sqlx::query!(
        "SELECT DISTINCT ON (region) region, ttfb_ms, cache_status, age_s, security_headers, served_by
         FROM probe_results WHERE monitor_id = $1 AND time > NOW() - INTERVAL '24 hours'
         ORDER BY region, time DESC",
        monitor.id
    )
    .fetch_all(&state.db)
    .await?;

    if latest_probes.is_empty() {
        return Ok(());
    }

    let mut detections: Vec<Detection> = Vec::new();

    for probe in &latest_probes {
        let region = &probe.region;

        if monitor.alert_cache_hit_enabled {
            if let Some(d) = check_cache_hit(state, monitor, region).await? {
                detections.push(d);
            }
        }
        if let Some(sec) = &probe.security_headers {
            if let Some(d) = check_ssl_expiry(region, sec) {
                detections.push(d);
            }
        }
        if monitor.alert_anycast_enabled {
            if let Some(ttfb) = probe.ttfb_ms {
                if let Some(d) =
                    check_anycast(region, ttfb, &probe.cache_status, probe.served_by.clone(), probe.age_s)
                {
                    detections.push(d);
                }
            }
        }
        if monitor.alert_zombie_cache_enabled {
            if let Some(ttfb) = probe.ttfb_ms {
                if let Some(d) = check_zombie_cache(region, ttfb, &probe.cache_status, probe.age_s) {
                    detections.push(d);
                }
            }
        }
    }

    // Group detections by alert_type — one incident per type, with all affected regions
    use std::collections::HashMap;
    let mut grouped: HashMap<String, Vec<Detection>> = HashMap::new();
    for d in detections {
        grouped.entry(d.alert_type.clone()).or_default().push(d);
    }

    let still_firing: Vec<String> = grouped.keys().cloned().collect();

    for (alert_type, group) in &grouped {
        let regions: Vec<String> = group.iter().map(|d| d.region.clone()).collect();
        let first = &group[0];
        handle_incident(
            state,
            monitor.id,
            alert_type,
            regions,
            Some(first.actual),
            first.threshold,
            Some(first.diagnosis.clone()),
            Some(first.action.clone()),
            None,
            None,
            None,
        )
        .await?;
    }

    // Resolve incidents for worker-managed types that are no longer detected
    resolve_cleared_worker_incidents(state, monitor.id, &still_firing).await?;

    Ok(())
}

async fn check_cache_hit(
    state: &AppState,
    monitor: &MonitorAlertConfig,
    region: &str,
) -> Result<Option<Detection>, anyhow::Error> {
    let hit_data = sqlx::query_as::<_, (Option<f64>, Option<i64>, Option<i64>)>(
        "SELECT (SUM(hit_count)::float / NULLIF(SUM(cdn_count), 0)) * 100,
                SUM(total_count)::bigint, SUM(cdn_count)::bigint
         FROM probe_results_hourly
         WHERE monitor_id = $1 AND region = $2 AND bucket > NOW() - INTERVAL '24 hours'",
    )
    .bind(monitor.id)
    .bind(region)
    .fetch_one(&state.db)
    .await?;

    if let (Some(hit_pct), Some(sample_count), Some(cdn_sample_count)) = hit_data {
        if cdn_sample_count > 0
            && sample_count >= 5
            && hit_pct < monitor.alert_cache_hit_threshold_pct
        {
            return Ok(Some(Detection {
                region: region.to_string(),
                alert_type: "cache_hit_low".to_string(),
                actual: hit_pct,
                threshold: Some(monitor.alert_cache_hit_threshold_pct),
                diagnosis: format!(
                    "Cache hit rate dropped to {:.1}% (threshold: {:.0}%)",
                    hit_pct, monitor.alert_cache_hit_threshold_pct
                ),
                action: "Check your CDN cache rules and Cache-Control headers.".to_string(),
            }));
        }
    }
    Ok(None)
}

fn check_ssl_expiry(region: &str, sec: &serde_json::Value) -> Option<Detection> {
    let days = sec
        .get("ssl")
        .and_then(|s| s.get("days_remaining"))
        .and_then(|v| v.as_i64())?;
    if days < 15 {
        Some(Detection {
            region: region.to_string(),
            alert_type: "ssl_expiry".to_string(),
            actual: days as f64,
            threshold: Some(15.0),
            diagnosis: format!("SSL Certificate expiring in {} days", days),
            action: "Renew your SSL certificate immediately.".to_string(),
        })
    } else {
        None
    }
}

fn check_anycast(
    region: &str,
    ttfb_ms: f64,
    cache_status: &Option<String>,
    served_by: Option<String>,
    age_s: Option<i32>,
) -> Option<Detection> {
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
        Some(Detection {
            region: region.to_string(),
            alert_type: "anycast".to_string(),
            actual: 0.0,
            threshold: None,
            diagnosis: diag.summary,
            action: diag.action,
        })
    } else {
        None
    }
}

fn check_zombie_cache(
    region: &str,
    ttfb_ms: f64,
    cache_status: &Option<String>,
    age_s: Option<i32>,
) -> Option<Detection> {
    let age = age_s?;
    if age <= 86_400 {
        return None;
    }
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
    Some(Detection {
        region: region.to_string(),
        alert_type: "zombie_cache".to_string(),
        actual: age as f64,
        threshold: None,
        diagnosis: diag.summary,
        action: diag.action,
    })
}

/// Central incident state machine.
///
/// UPSERTs the incident row, decides the notification type (FirstFire / Digest / skip),
/// records the event in the `alerts` history table, and spawns the notification.
pub async fn handle_incident(
    state: &AppState,
    monitor_id: Uuid,
    alert_type: &str,
    affected_regions: Vec<String>,
    actual: Option<f64>,
    threshold: Option<f64>,
    diagnosis: Option<String>,
    action: Option<String>,
    delta_pct: Option<f64>,
    comparator: Option<String>,
    deviation_factor: Option<f64>,
) -> Result<(), anyhow::Error> {
    let severity = alert_severity(alert_type);
    let cooldown_minutes = severity.repeat_cooldown_minutes();

    #[derive(sqlx::FromRow)]
    struct UpsertResult {
        id: Uuid,
        notification_count: i32,
        last_notified_at: Option<chrono::DateTime<Utc>>,
        snoozed_until: Option<chrono::DateTime<Utc>>,
        opened_at: chrono::DateTime<Utc>,
        is_new: bool,
    }

    // UPSERT: insert new incident or update existing open one.
    // xmax = 0 is true for freshly inserted rows, non-zero after UPDATE.
    let row = sqlx::query_as::<_, UpsertResult>(
        r#"
        INSERT INTO alert_incidents
            (monitor_id, alert_type, severity, affected_regions, last_actual, last_threshold)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (monitor_id, alert_type) WHERE resolved_at IS NULL
        DO UPDATE SET
            affected_regions  = EXCLUDED.affected_regions,
            last_actual       = EXCLUDED.last_actual,
            last_threshold    = EXCLUDED.last_threshold
        RETURNING
            id, notification_count, last_notified_at, snoozed_until, opened_at,
            (xmax = 0)::bool AS is_new
        "#,
    )
    .bind(monitor_id)
    .bind(alert_type)
    .bind(severity.as_str())
    .bind(&affected_regions)
    .bind(actual)
    .bind(threshold)
    .fetch_one(&state.db)
    .await?;

    // --- Notification gate ---
    let notif_type = if row.is_new {
        NotificationType::FirstFire
    } else {
        if row.snoozed_until.map_or(false, |t| t > Utc::now()) {
            info!(
                "incident_decision: monitor_id={} alert_type={} incident_id={} \
                 decision=skip reason=snoozed snoozed_until={}",
                monitor_id,
                alert_type,
                row.id,
                row.snoozed_until.unwrap()
            );
            return Ok(());
        }
        let elapsed_minutes = row
            .last_notified_at
            .map(|t| (Utc::now() - t).num_minutes())
            .unwrap_or(i64::MAX);

        if elapsed_minutes >= cooldown_minutes {
            NotificationType::Digest
        } else {
            info!(
                "incident_decision: monitor_id={} alert_type={} incident_id={} \
                 decision=skip reason=cooldown_active last_notified={} \
                 elapsed_min={} cooldown_min={} remaining_min={}",
                monitor_id,
                alert_type,
                row.id,
                row.last_notified_at
                    .map(|t| t.to_rfc3339())
                    .unwrap_or_else(|| "none".to_string()),
                elapsed_minutes,
                cooldown_minutes,
                cooldown_minutes.saturating_sub(elapsed_minutes),
            );
            return Ok(());
        }
    };

    let region_label = if affected_regions.len() > 1 {
        "Multiple".to_string()
    } else {
        affected_regions
            .first()
            .cloned()
            .unwrap_or_else(|| "unknown".to_string())
    };

    let metric = if is_cache_metric(alert_type) {
        "cache_hit_pct"
    } else {
        "ttfb_ms"
    };
    let diag_text = diagnosis.as_deref().unwrap_or("");
    let action_text = action.as_deref().unwrap_or("");

    // Insert alert history record (dynamic query — schema added by migration 037)
    let alert_record_id = sqlx::query_scalar::<_, uuid::Uuid>(
        r#"
        INSERT INTO alerts
            (monitor_id, region, alert_type, metric, actual_ms, baseline_ms,
             diagnosis, action, incident_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
        "#,
    )
    .bind(monitor_id)
    .bind(&region_label)
    .bind(alert_type)
    .bind(metric)
    .bind(actual)
    .bind(threshold)
    .bind(diag_text)
    .bind(action_text)
    .bind(row.id)
    .fetch_one(&state.db)
    .await?;

    // Update incident counters (dynamic query — schema added by migration 036)
    sqlx::query(
        "UPDATE alert_incidents
         SET last_notified_at = NOW(), notification_count = notification_count + 1
         WHERE id = $1",
    )
    .bind(row.id)
    .execute(&state.db)
    .await?;

    let duration = Utc::now() - row.opened_at;

    tokio::spawn(notifier::notify_incident(
        state.clone(),
        IncidentNotification {
            incident_id: row.id,
            alert_record_id,
            monitor_id,
            alert_type: alert_type.to_string(),
            affected_regions,
            notification_type: notif_type,
            actual,
            threshold,
            duration,
            notification_count: row.notification_count,
            delta_pct,
            comparator,
            deviation_factor,
            diagnosis,
            action,
        },
    ));

    info!(
        "worker: incident {} monitor={} type={} notif_type={}",
        row.id,
        monitor_id,
        alert_type,
        notif_type.as_str()
    );

    Ok(())
}

/// Close open incidents for worker-managed alert types that are no longer detected
/// in the current audit cycle. Only runs when there is probe data for the monitor.
async fn resolve_cleared_worker_incidents(
    state: &AppState,
    monitor_id: Uuid,
    still_firing: &[String],
) -> Result<(), anyhow::Error> {
    const WORKER_TYPES: &[&str] = &["cache_hit_low", "ssl_expiry", "anycast", "zombie_cache"];

    for &wt in WORKER_TYPES {
        if still_firing.contains(&wt.to_string()) {
            continue;
        }

        let resolved = sqlx::query_as::<_, ResolvedIncident>(
            r#"
            UPDATE alert_incidents
            SET resolved_at = NOW()
            WHERE monitor_id = $1 AND alert_type = $2 AND resolved_at IS NULL
            RETURNING id, monitor_id, alert_type, severity, notification_count,
                      opened_at, resolved_at, affected_regions
            "#,
        )
        .bind(monitor_id)
        .bind(wt)
        .fetch_optional(&state.db)
        .await?;

        if let Some(r) = resolved {
            let duration = r.resolved_at - r.opened_at;
            info!(
                "worker: resolved {} incident monitor={} after {}",
                wt,
                monitor_id,
                format_duration(&duration)
            );

            let sev = alert_severity(&r.alert_type);
            if sev.sends_recovery() && r.notification_count > 0 {
                tokio::spawn(notifier::notify_recovery(
                    state.clone(),
                    RecoveryNotification {
                        monitor_id,
                        alert_type: r.alert_type.clone(),
                        affected_regions: r.affected_regions.clone(),
                        duration,
                        notification_count: r.notification_count,
                        actual: None,
                        threshold: None,
                    },
                ));
            }
        }
    }

    Ok(())
}

/// Auto-close probe/trend incidents with no recent activity.
/// Uses 2× the repeat cooldown as the staleness window.
pub(crate) async fn resolve_stale_probe_incidents(state: &AppState) -> Result<(), anyhow::Error> {
    const PROBE_TYPES: &[&str] = &[
        "down",
        "ttfb_threshold",
        "anomaly",
        "ttfb_trend_up_region",
        "ttfb_trend_up_global",
        "ttfb_trend_down_region",
        "ttfb_trend_down_global",
        "cache_hit_trend_drop_region",
        "cache_hit_trend_drop_global",
    ];

    for &pt in PROBE_TYPES {
        let sev = alert_severity(pt);
        let stale_minutes = (sev.repeat_cooldown_minutes() * 2) as i32;

        let resolved_rows = sqlx::query_as::<_, ResolvedIncident>(
            r#"
            UPDATE alert_incidents
            SET resolved_at = NOW()
            WHERE alert_type = $1
              AND resolved_at IS NULL
              AND (
                  last_notified_at < NOW() - ($2::int * INTERVAL '1 minute')
                  OR (last_notified_at IS NULL AND opened_at < NOW() - INTERVAL '30 minutes')
              )
            RETURNING id, monitor_id, alert_type, severity, notification_count,
                      opened_at, resolved_at, affected_regions
            "#,
        )
        .bind(pt)
        .bind(stale_minutes)
        .fetch_all(&state.db)
        .await?;

        for r in resolved_rows {
            let duration = r.resolved_at - r.opened_at;
            info!(
                "worker: auto-resolved stale {} incident {} after {}",
                pt,
                r.id,
                format_duration(&duration)
            );

            let severity = alert_severity(&r.alert_type);
            if severity.sends_recovery() && r.notification_count > 0 {
                tokio::spawn(notifier::notify_recovery(
                    state.clone(),
                    RecoveryNotification {
                        monitor_id: r.monitor_id,
                        alert_type: r.alert_type.clone(),
                        affected_regions: r.affected_regions.clone(),
                        duration,
                        notification_count: r.notification_count,
                        actual: None,
                        threshold: None,
                    },
                ));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::alerts::severity::alert_severity;

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
        let critical_days = 15i64;
        assert!(14 < critical_days);
        assert!(!(15 < critical_days));
    }

    #[test]
    fn test_zombie_cache_threshold() {
        let max_age_s = 86_400i32;
        assert!(86_401 > max_age_s);
        assert!(!(86_400 > max_age_s));
    }

    #[test]
    fn test_digest_cooldown_gate() {
        // Simulate: elapsed >= cooldown → notify
        let cooldown_minutes = alert_severity("cache_hit_low").repeat_cooldown_minutes();
        assert_eq!(cooldown_minutes, 480);
        let elapsed_over = 500i64;
        let elapsed_under = 400i64;
        assert!(elapsed_over >= cooldown_minutes);
        assert!(!(elapsed_under >= cooldown_minutes));
    }

    #[test]
    fn test_probe_stale_minutes() {
        // critical: 60 × 2 = 120 min stale window
        let sev = alert_severity("down");
        assert_eq!(sev.repeat_cooldown_minutes() * 2, 120);
        // medium: 480 × 2 = 960 min
        let sev_m = alert_severity("cache_hit_trend_drop_region");
        assert_eq!(sev_m.repeat_cooldown_minutes() * 2, 960);
    }
}
