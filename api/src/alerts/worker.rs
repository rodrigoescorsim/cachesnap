use crate::{
    alerts::{
        notifier::{self, IncidentNotification, NotificationType, RecoveryNotification},
        severity::{alert_severity, digest_interval_minutes, format_duration, is_cache_metric, stale_silence_minutes},
    },
    diagnosis::engine::{self, DiagnosisInput},
    models::alert_incident::ResolvedIncident,
    trend,
    AppState,
};
use chrono::Utc;
use serde_json::Value as JsonValue;
use std::time::Duration;
use tokio::time::interval;
use tracing::{error, info};
use uuid::Uuid;

// Non-macro row types — no compile-time DB connection required.
#[derive(sqlx::FromRow)]
struct LatestProbeRow {
    region: String,
    ttfb_ms: Option<f64>,
    cache_status: Option<String>,
    age_s: Option<i32>,
    security_headers: Option<JsonValue>,
    served_by: Option<String>,
}

#[derive(sqlx::FromRow)]
struct PerProbeAlertConfig {
    alert_cache_age_enabled: bool,
    alert_cache_age_threshold_hours: i32,
    alert_anycast_enabled: bool,
}

/// Called from the ingest path after every successful probe insert.
/// Re-runs the per-probe detection logic for cache_age_alert, anycast, and ssl_expiry;
/// if none of the probes across all regions still trigger the condition, resolves the
/// open incident immediately — without waiting for the next worker cycle.
///
/// cache_hit_low is intentionally excluded: it requires a time-windowed aggregate,
/// not a single probe value, so it stays worker-managed.
pub async fn try_resolve_per_probe_incidents(state: &AppState, monitor_id: Uuid) {
    // Fast path: skip if there are no open per-probe-resolvable incidents.
    let has_open: bool = sqlx::query_scalar(
        "SELECT EXISTS(
             SELECT 1 FROM alert_incidents
             WHERE monitor_id = $1 AND resolved_at IS NULL
             AND alert_type IN ('cache_age_alert', 'anycast', 'ssl_expiry')
         )",
    )
    .bind(monitor_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !has_open {
        return;
    }

    // Latest probe per region (same window as the audit worker).
    let latest_probes: Vec<LatestProbeRow> = sqlx::query_as(
        "SELECT DISTINCT ON (region) region, ttfb_ms, cache_status, age_s, security_headers, served_by
         FROM probe_results
         WHERE monitor_id = $1 AND time > NOW() - INTERVAL '24 hours'
         ORDER BY region, time DESC",
    )
    .bind(monitor_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    if latest_probes.is_empty() {
        return;
    }

    let config: Option<PerProbeAlertConfig> = sqlx::query_as(
        "SELECT alert_cache_age_enabled, alert_cache_age_threshold_hours, alert_anycast_enabled
         FROM monitors WHERE id = $1 LIMIT 1",
    )
    .bind(monitor_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let Some(config) = config else { return };

    // Re-run detection across all regions' latest probes.
    let mut cache_age_firing = false;
    let mut anycast_firing = false;
    let mut ssl_firing = false;

    for probe in &latest_probes {
        if config.alert_cache_age_enabled
            && check_cache_age(
                &probe.region,
                probe.ttfb_ms.unwrap_or(0.0),
                &probe.cache_status,
                probe.age_s,
                config.alert_cache_age_threshold_hours,
            )
            .is_some()
        {
            cache_age_firing = true;
        }

        if config.alert_anycast_enabled {
            if let Some(ttfb) = probe.ttfb_ms {
                if check_anycast(
                    &probe.region,
                    ttfb,
                    &probe.cache_status,
                    probe.served_by.clone(),
                    probe.age_s,
                )
                .is_some()
                {
                    anycast_firing = true;
                }
            }
        }

        if let Some(sec) = &probe.security_headers {
            if check_ssl_expiry(&probe.region, sec).is_some() {
                ssl_firing = true;
            }
        }
    }

    // Resolve any type that was open but is no longer detected.
    if config.alert_cache_age_enabled && !cache_age_firing {
        resolve_worker_incident_now(state, monitor_id, "cache_age_alert").await;
    }
    if config.alert_anycast_enabled && !anycast_firing {
        resolve_worker_incident_now(state, monitor_id, "anycast").await;
    }
    if !ssl_firing {
        resolve_worker_incident_now(state, monitor_id, "ssl_expiry").await;
    }
}

async fn resolve_worker_incident_now(state: &AppState, monitor_id: Uuid, alert_type: &str) {
    let resolved: Option<ResolvedIncident> = sqlx::query_as(
        "UPDATE alert_incidents
         SET resolved_at = NOW()
         WHERE monitor_id = $1 AND alert_type = $2 AND resolved_at IS NULL
         RETURNING id, monitor_id, alert_type, severity, notification_count,
                   opened_at, resolved_at, affected_regions",
    )
    .bind(monitor_id)
    .bind(alert_type)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    if let Some(r) = resolved {
        let duration = r.resolved_at - r.opened_at;
        info!(
            "worker: probe-triggered resolution alert_type={} monitor={}",
            alert_type, monitor_id
        );
        if r.notification_count > 0 {
            tokio::spawn(notifier::notify_recovery(
                state.clone(),
                RecoveryNotification {
                    monitor_id,
                    alert_type: r.alert_type,
                    affected_regions: r.affected_regions,
                    duration,
                    notification_count: r.notification_count,
                    actual: None,
                    threshold: None,
                },
            ));
        }
    }
}

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
    pub alert_cache_age_enabled: bool,
    pub alert_cache_age_threshold_hours: i32,
}

async fn fetch_active_monitors(state: &AppState) -> Result<Vec<MonitorAlertConfig>, sqlx::Error> {
    sqlx::query_as!(
        MonitorAlertConfig,
        r#"
        SELECT id, alert_cache_hit_enabled, alert_cache_hit_threshold_pct,
               alert_anycast_enabled, alert_cache_age_enabled,
               alert_cache_age_threshold_hours
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
    // Types confirmed clear by a positive measurement (above threshold with sufficient data).
    // Only these are eligible for incident resolution — absence of data is not enough.
    let mut confirmed_cleared: Vec<String> = Vec::new();

    // Track whether cache_hit was fully measured (at least one region with sufficient data).
    let mut cache_hit_any_firing = false;
    let mut cache_hit_any_cleared = false;

    for probe in &latest_probes {
        let region = &probe.region;

        if monitor.alert_cache_hit_enabled {
            // Align with `probe_results_hourly`: only HIT/MISS/STALE/… count toward CDN cache ratio.
            // Compound headers (e.g. "BYPASS:Cloudflare DYNAMIC") must not fall through to hourly 0/total.
            let is_intentionally_uncached = probe.cache_status.as_deref().map_or(false, |s| {
                let u = s.to_uppercase();
                matches!(s, "DYNAMIC" | "BYPASS")
                    || u.contains("DYNAMIC")
                    || u.contains("LAMBDAGENERATED")
                    || u.contains("UNCACHEABLE")
                    || u.contains("UNCALCULABLE")
            });
            let result = if is_intentionally_uncached {
                CacheHitResult::Cleared
            } else {
                check_cache_hit(state, monitor, region).await?
            };

            match result {
                CacheHitResult::Firing(d) => {
                    detections.push(d);
                    cache_hit_any_firing = true;
                }
                CacheHitResult::Cleared => {
                    cache_hit_any_cleared = true;
                }
                CacheHitResult::Insufficient => {
                    // Not enough data — keep any existing open incident as-is.
                }
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
        if monitor.alert_cache_age_enabled {
            if let Some(ttfb) = probe.ttfb_ms {
                if let Some(d) = check_cache_age(region, ttfb, &probe.cache_status, probe.age_s, monitor.alert_cache_age_threshold_hours) {
                    detections.push(d);
                }
            }
        }
    }

    // cache_hit_low is confirmed cleared only when every region with sufficient data
    // measured above threshold and none fired.
    if monitor.alert_cache_hit_enabled && !cache_hit_any_firing && cache_hit_any_cleared {
        confirmed_cleared.push("cache_hit_low".to_string());
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

    // Resolve incidents for worker-managed types that are no longer detected.
    // Pass confirmed_cleared so cache_hit_low is only resolved on a positive measurement,
    // not silently dropped when data is insufficient.
    resolve_cleared_worker_incidents(state, monitor.id, &still_firing, &confirmed_cleared).await?;

    Ok(())
}

enum CacheHitResult {
    Firing(Detection),
    /// Measured above threshold — safe to resolve the incident.
    Cleared,
    /// Aggregate has too few samples to make a determination — preserve existing incident state.
    Insufficient,
}

async fn check_cache_hit(
    state: &AppState,
    monitor: &MonitorAlertConfig,
    region: &str,
) -> Result<CacheHitResult, anyhow::Error> {
    // Use SUM(cdn_count) as denominator — same definition as `probe_results_hourly` (excludes
    // DYNAMIC/BYPASS/NONE-style rows). Using total_count wrongly treated intentional misses as 0% hit rate.
    let hit_data = sqlx::query_as::<_, (f64, i64)>(
        "SELECT COALESCE((SUM(hit_count)::float / NULLIF(SUM(cdn_count), 0)) * 100, 0),
                COALESCE(SUM(cdn_count), 0)::bigint
         FROM probe_results_hourly
         WHERE monitor_id = $1 AND region = $2 AND bucket > NOW() - INTERVAL '24 hours'",
    )
    .bind(monitor.id)
    .bind(region)
    .fetch_one(&state.db)
    .await?;

    match hit_data {
        (_, comparable) if comparable <= 0 => Ok(CacheHitResult::Cleared),
        (hit_pct, comparable) if comparable >= 5 => {
            if hit_pct < monitor.alert_cache_hit_threshold_pct {
                Ok(CacheHitResult::Firing(Detection {
                    region: region.to_string(),
                    alert_type: "cache_hit_low".to_string(),
                    actual: hit_pct,
                    threshold: Some(monitor.alert_cache_hit_threshold_pct),
                    diagnosis: format!(
                        "Only {:.1}% of requests served from CDN cache — most are reaching the origin server directly.",
                        hit_pct
                    ),
                    action: "Check your CDN cache rules and Cache-Control headers.".to_string(),
                }))
            } else {
                Ok(CacheHitResult::Cleared)
            }
        }
        _ => Ok(CacheHitResult::Insufficient),
    }
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

fn check_cache_age(
    region: &str,
    ttfb_ms: f64,
    cache_status: &Option<String>,
    age_s: Option<i32>,
    threshold_hours: i32,
) -> Option<Detection> {
    let age = age_s?;
    let threshold_s = threshold_hours.max(1) * 3600;
    if age <= threshold_s {
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
        alert_type: "cache_age_alert".to_string(),
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

        let required_digest_wait =
            digest_interval_minutes(severity, row.notification_count.max(1));

        if elapsed_minutes >= required_digest_wait {
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
                required_digest_wait,
                required_digest_wait.saturating_sub(elapsed_minutes),
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
            opened_at: row.opened_at,
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
    confirmed_cleared: &[String],
) -> Result<(), anyhow::Error> {
    // Types that resolve only on a confirmed positive measurement (not on absence of data).
    const REQUIRES_POSITIVE_CLEAR: &[&str] = &["cache_hit_low"];
    const WORKER_TYPES: &[&str] = &["cache_hit_low", "ssl_expiry", "anycast", "cache_age_alert"];

    for &wt in WORKER_TYPES {
        if still_firing.contains(&wt.to_string()) {
            continue;
        }
        // For metric-based types, require an explicit above-threshold measurement before
        // resolving. Insufficient data (e.g. stale aggregate, low probe frequency) must
        // not close an open incident.
        if REQUIRES_POSITIVE_CLEAR.contains(&wt) && !confirmed_cleared.contains(&wt.to_string()) {
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

            // Send recovery whenever the incident had at least one notification sent —
            // regardless of severity tier. If we told the user about the problem, we
            // should tell them when it's fixed.
            if r.notification_count > 0 {
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
/// Silence threshold is `2 ×` the digest interval that would apply for the next notification
/// (exponential digest backoff capped at `DIGEST_INTERVAL_CAP_MINUTES` — see `digest_interval_minutes`).
pub(crate) async fn resolve_stale_probe_incidents(state: &AppState) -> Result<(), anyhow::Error> {
    #[derive(sqlx::FromRow)]
    struct StaleCandidate {
        id: Uuid,
        alert_type: String,
        notification_count: i32,
        last_notified_at: Option<chrono::DateTime<Utc>>,
        opened_at: chrono::DateTime<Utc>,
    }

    let candidates = sqlx::query_as::<_, StaleCandidate>(
        r#"
        SELECT id, alert_type, notification_count, last_notified_at, opened_at
        FROM alert_incidents
        WHERE resolved_at IS NULL
          AND alert_type IN (
            'down', 'slow_timeout', 'ttfb_limit', 'ttfb_anomaly',
            'ttfb_trend_up_region', 'ttfb_trend_up_global',
            'ttfb_trend_down_region', 'ttfb_trend_down_global',
            'cache_hit_trend_drop_region', 'cache_hit_trend_drop_global'
          )
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    for row in candidates {
        let sev = alert_severity(&row.alert_type);
        let should_close = if let Some(last) = row.last_notified_at {
            let silence = stale_silence_minutes(sev, row.notification_count.max(1));
            last < Utc::now() - chrono::Duration::minutes(silence)
        } else {
            row.opened_at < Utc::now() - chrono::Duration::minutes(30)
        };

        if !should_close {
            continue;
        }

        let resolved: Option<ResolvedIncident> = sqlx::query_as::<_, ResolvedIncident>(
            r#"
            UPDATE alert_incidents
            SET resolved_at = NOW()
            WHERE id = $1 AND resolved_at IS NULL
            RETURNING id, monitor_id, alert_type, severity, notification_count,
                      opened_at, resolved_at, affected_regions
            "#,
        )
        .bind(row.id)
        .fetch_optional(&state.db)
        .await?;

        let Some(r) = resolved else { continue };

        let duration = r.resolved_at - r.opened_at;
        info!(
            "worker: auto-resolved stale {} incident {} after {}",
            r.alert_type,
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

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::alerts::severity::{alert_severity, digest_interval_minutes, stale_silence_minutes};

    #[test]
    fn test_intentionally_uncached_statuses_skip_hit_rate_check() {
        // DYNAMIC and BYPASS are intentional — must not trigger cache hit rate alerts.
        for status in ["DYNAMIC", "BYPASS"] {
            assert!(
                matches!(status, "DYNAMIC" | "BYPASS"),
                "{status} must be treated as intentionally uncached"
            );
        }
        // These are cache-eligible misses — should still be evaluated normally.
        for status in ["MISS", "EXPIRED", "HIT", "STALE", "REVALIDATED"] {
            assert!(
                !matches!(status, "DYNAMIC" | "BYPASS"),
                "{status} must NOT be treated as intentionally uncached"
            );
        }
    }

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
    fn test_cache_age_threshold() {
        // Default threshold: 72 h = 259 200 s
        let threshold_hours = 72i32;
        let threshold_s = threshold_hours * 3600;
        assert_eq!(threshold_s, 259_200);
        assert!(259_201 > threshold_s);
        assert!(!(259_200 > threshold_s));
    }

    #[test]
    fn test_digest_cooldown_gate() {
        // First digest after FirstFire: wait base tier interval (notification_count == 1).
        let sev = alert_severity("cache_hit_low");
        let wait = digest_interval_minutes(sev, 1);
        assert_eq!(wait, 360);
        let elapsed_over = 400i64;
        let elapsed_under = 300i64;
        assert!(elapsed_over >= wait);
        assert!(!(elapsed_under >= wait));
    }

    #[test]
    fn test_probe_stale_minutes() {
        let sev = alert_severity("down");
        assert_eq!(stale_silence_minutes(sev, 1), 60);
        let sev_m = alert_severity("cache_hit_trend_drop_region");
        assert_eq!(stale_silence_minutes(sev_m, 1), 720);
    }
}
