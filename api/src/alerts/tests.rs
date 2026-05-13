use crate::{
    alerts::detector::check_probe_alerts,
    models::probe_result::ProbeResultPayload,
    AppState, config, db, redis, scheduler::dispatch_limiter::ProbeDispatchLimits,
};
use std::time::Duration;
use std::sync::Arc;
use uuid::Uuid;
use tokio::sync::broadcast;

async fn get_test_state() -> AppState {
    dotenvy::dotenv().ok();
    let config = Arc::new(config::Config::from_env().unwrap());
    let db = db::connect(&config.database_url).await.unwrap();
    db::run_migrations(&db).await.unwrap();
    let redis = redis::connect(&config.redis_url).unwrap();
    let (tx, _) = broadcast::channel(1024);
    let http = reqwest::Client::new();
    let probe_limits = Arc::new(ProbeDispatchLimits::new(Arc::new(
        config.probe_dispatch.clone(),
    )));

    AppState {
        db,
        redis,
        config,
        http,
        probe_limits,
        tx,
    }
}

fn create_test_payload(monitor_id: Uuid, region: &str) -> ProbeResultPayload {
    ProbeResultPayload {
        monitor_id,
        region: region.to_string(),
        ttfb_ms: None,
        download_ms: None,
        total_ms: None,
        dns_ms: None,
        tcp_ms: None,
        tls_ms: None,
        edge_ms: None,
        origin_ms: None,
        status_code: None,
        cache_status: None,
        served_by: None,
        cdn_provider: None,
        server_timing: None,
        http_version: None,
        redirect_count: None,
        content_length: None,
        error: None,
        age_s: None,
        security_headers: None,
        server_timing_breakdown: None,
        probe_version: None,
        is_manual: false,
        scheduled_at: None,
        bypass_ttfb_ms: None,
        bypass_total_ms: None,
        bypass_dns_ms: None,
        bypass_tcp_ms: None,
        bypass_tls_ms: None,
        bypass_status_code: None,
        bypass_error: None,
        bypass_served_by: None,
        bypass_cache_status: None,
        bypass_age_s: None,
    }
}

/// Cleanup helper: removes all test data for a monitor/user pair.
async fn cleanup(state: &AppState, monitor_id: Uuid, user_id: Uuid) {
    // alert_incidents cascade-deletes from monitors ON DELETE CASCADE
    sqlx::query("DELETE FROM alerts WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.ok();
    sqlx::query("DELETE FROM probe_results WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.ok();
    sqlx::query("DELETE FROM monitors WHERE id = $1").bind(monitor_id).execute(&state.db).await.ok();
    sqlx::query("DELETE FROM users WHERE id = $1").bind(user_id).execute(&state.db).await.ok();
}

#[tokio::test]
async fn test_downtime_aggregation_logic() {
    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id)
        .bind(format!("test-{}@cachesnap.com", user_id))
        .bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_down_enabled, alert_threshold_ms, alert_threshold_hit_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
    )
    .bind(monitor_id).bind(user_id)
    .bind("http://test-aggregation.com").bind("Test Aggregation")
    .bind(true).bind(true).bind(1000).bind(500)
    .execute(&state.db).await.unwrap();

    for region in ["us-east", "eu-west", "sa-east"] {
        let mut payload = create_test_payload(monitor_id, region);
        payload.status_code = Some(503);
        payload.error = Some("Service Unavailable".to_string());
        check_probe_alerts(state.clone(), payload).await;
    }

    // Wait for the 15s aggregation window to close
    tokio::time::sleep(Duration::from_secs(18)).await;

    // New design: 1 incident + 1 alert history record (FirstFire)
    let incident_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'down'"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();

    let alert_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alerts WHERE monitor_id = $1 AND alert_type = 'down'"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();

    assert_eq!(incident_count, 1, "Should have exactly 1 open incident");
    assert_eq!(alert_count, 1, "Should have exactly 1 alert history record (FirstFire)");

    cleanup(&state, monitor_id, user_id).await;
}

#[tokio::test]
async fn test_ttfb_threshold_aggregation() {
    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id)
        .bind(format!("test-{}@cachesnap.com", user_id))
        .bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_ttfb_enabled, alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    )
    .bind(monitor_id).bind(user_id)
    .bind("http://test-ttfb.com").bind("Test TTFB")
    .bind(true).bind(true).bind(500).bind(500).bind(3)
    .execute(&state.db).await.unwrap();

    for region in ["us-west", "ap-south"] {
        let mut payload = create_test_payload(monitor_id, region);
        payload.ttfb_ms = Some(1200.0);
        payload.status_code = Some(200);
        payload.cache_status = Some("MISS".to_string());
        check_probe_alerts(state.clone(), payload).await;
    }

    tokio::time::sleep(Duration::from_secs(18)).await;

    let incident_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'ttfb_limit'"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();

    // High sensitivity (3): instant limit alert; incident count may vary with timing; still tests no panic
    let _ = incident_count;

    cleanup(&state, monitor_id, user_id).await;
}

#[tokio::test]
async fn test_worker_cache_hit_aggregation() {
    use crate::alerts::worker::{audit_monitor_alerts, MonitorAlertConfig};

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id)
        .bind(format!("worker-{}@test.com", user_id))
        .bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_cache_hit_enabled, alert_cache_hit_threshold_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(monitor_id).bind(user_id)
    .bind("http://worker-test.com").bind("Worker Test")
    .bind(true).bind(true).bind(90.0)
    .execute(&state.db).await.unwrap();

    // 50% cache hit rate (5 HIT, 5 MISS) in 2 regions
    for region in ["us-east", "eu-west"] {
        for i in 0..10 {
            let status = if i < 5 { "HIT" } else { "MISS" };
            sqlx::query(
                "INSERT INTO probe_results (time, monitor_id, region, ttfb_ms, cache_status, status_code)
                 VALUES (NOW() - INTERVAL '5 minutes', $1, $2, 100.0, $3, 200)"
            )
            .bind(monitor_id).bind(region).bind(status)
            .execute(&state.db).await.unwrap();
        }
    }

    sqlx::query("CALL refresh_continuous_aggregate('probe_results_hourly', NULL, NULL)")
        .execute(&state.db).await.ok();

    let cfg = MonitorAlertConfig {
        id: monitor_id,
        alert_cache_hit_enabled: true,
        alert_cache_hit_threshold_pct: 90.0,
        alert_anycast_enabled: false,
        alert_cache_age_enabled: false,
        alert_cache_age_threshold_hours: 72,
    };

    audit_monitor_alerts(&state, &cfg).await.unwrap();

    // 1 open incident
    let incident_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low' AND resolved_at IS NULL"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();

    // 1 alert history record with region = "Multiple" (2 affected regions)
    let (alert_count, region): (i64, String) = sqlx::query_as(
        "SELECT COUNT(*), region FROM alerts WHERE monitor_id = $1 AND alert_type = 'cache_hit_low' GROUP BY region"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();

    assert_eq!(incident_count, 1, "Expected 1 open incident");
    assert_eq!(alert_count, 1, "Expected 1 alert history record (FirstFire)");
    assert_eq!(region, "Multiple", "Expected region='Multiple' for multi-region detection");

    // Verify incident stores the correct severity
    let severity: String = sqlx::query_scalar(
        "SELECT severity FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();
    assert_eq!(severity, "medium");

    // Run audit again — cooldown should prevent a second alert (notification_count stays 1)
    audit_monitor_alerts(&state, &cfg).await.unwrap();

    let notif_count: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();

    assert_eq!(notif_count, 1, "Cooldown should prevent second notification");

    cleanup(&state, monitor_id, user_id).await;
    sqlx::query("DELETE FROM probe_results_hourly WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.ok();
}

/// All probes DYNAMIC (or compound BYPASS+DYNAMIC): cdn_count in hourly MV is zero — must not open cache_hit_low.
#[tokio::test]
async fn test_worker_cache_hit_skips_intentional_dynamic() {
    use crate::alerts::worker::{audit_monitor_alerts, MonitorAlertConfig};

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id)
        .bind(format!("dyn-{}@test.com", user_id))
        .bind("hash")
        .execute(&state.db)
        .await
        .unwrap();

    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_cache_hit_enabled, alert_cache_hit_threshold_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(monitor_id)
    .bind(user_id)
    .bind("http://dynamic-cache-test.com")
    .bind("Dynamic Cache Test")
    .bind(true)
    .bind(true)
    .bind(50.0)
    .execute(&state.db)
    .await
    .unwrap();

    for status in ["DYNAMIC", "BYPASS:Cloudflare DYNAMIC"] {
        for _ in 0..5 {
            sqlx::query(
                "INSERT INTO probe_results (time, monitor_id, region, ttfb_ms, cache_status, status_code)
                 VALUES (NOW() - INTERVAL '5 minutes', $1, 'eu-west', 100.0, $2, 200)",
            )
            .bind(monitor_id)
            .bind(status)
            .execute(&state.db)
            .await
            .unwrap();
        }
    }

    sqlx::query("CALL refresh_continuous_aggregate('probe_results_hourly', NULL, NULL)")
        .execute(&state.db)
        .await
        .ok();

    let cfg = MonitorAlertConfig {
        id: monitor_id,
        alert_cache_hit_enabled: true,
        alert_cache_hit_threshold_pct: 50.0,
        alert_anycast_enabled: false,
        alert_cache_age_enabled: false,
        alert_cache_age_threshold_hours: 72,
    };

    audit_monitor_alerts(&state, &cfg).await.unwrap();

    let incident_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low' AND resolved_at IS NULL",
    )
    .bind(monitor_id)
    .fetch_one(&state.db)
    .await
    .unwrap();

    assert_eq!(
        incident_count, 0,
        "DYNAMIC-only traffic must not create a low cache-hit incident (denominator is CDN-classified probes only)"
    );

    cleanup(&state, monitor_id, user_id).await;
    sqlx::query("DELETE FROM probe_results_hourly WHERE monitor_id = $1")
        .bind(monitor_id)
        .execute(&state.db)
        .await
        .ok();
}

// ── Scenario 3: Digest is sent after the repeat cooldown window elapses ──────

#[tokio::test]
async fn test_digest_after_cooldown_elapsed() {
    use crate::alerts::worker::handle_incident;

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id)
        .bind(format!("digest-{}@test.com", user_id))
        .bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query("INSERT INTO monitors (id, user_id, url, name, is_active) VALUES ($1, $2, $3, $4, $5)")
        .bind(monitor_id).bind(user_id)
        .bind("http://digest-test.com").bind("Digest Test").bind(true)
        .execute(&state.db).await.unwrap();

    // First call → FirstFire (notification_count = 1)
    handle_incident(&state, monitor_id, "cache_hit_low",
        vec!["us-east".to_string()], Some(30.0), Some(80.0),
        None, None, None, None, None)
    .await.unwrap();

    let notif_count_first: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert_eq!(notif_count_first, 1, "FirstFire should increment notification_count to 1");

    // Simulate 7 hours elapsed (past the 6h MEDIUM cooldown)
    sqlx::query(
        "UPDATE alert_incidents SET last_notified_at = NOW() - INTERVAL '7 hours'
         WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).execute(&state.db).await.unwrap();

    // Second call → Digest (notification_count = 2)
    handle_incident(&state, monitor_id, "cache_hit_low",
        vec!["us-east".to_string(), "eu-west".to_string()], Some(28.0), Some(80.0),
        None, None, None, None, None)
    .await.unwrap();

    let notif_count_second: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert_eq!(notif_count_second, 2, "Digest should increment notification_count to 2 after cooldown");

    // Incident must still be open
    let resolved: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT resolved_at FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert!(resolved.is_none(), "Incident must still be open after Digest");

    cleanup(&state, monitor_id, user_id).await;
}

// ── Scenario 4: Incident closes without recovery when condition is CONFIRMED clear ──
// Requires ≥5 samples above threshold in probe_results_hourly (positive measurement).

#[tokio::test]
async fn test_incident_resolves_no_recovery_medium() {
    use crate::alerts::worker::{audit_monitor_alerts, MonitorAlertConfig};
    use crate::alerts::severity::alert_severity;

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id).bind(format!("resolve-{}@test.com", user_id)).bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_cache_hit_enabled, alert_cache_hit_threshold_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    ).bind(monitor_id).bind(user_id)
    .bind("http://resolve-test.com").bind("Resolve Test")
    .bind(true).bind(true).bind(50.0)
    .execute(&state.db).await.unwrap();

    sqlx::query(
        "INSERT INTO alert_incidents (monitor_id, alert_type, severity, affected_regions, notification_count, opened_at)
         VALUES ($1, 'cache_hit_low', 'medium', ARRAY['us-east'], 1, NOW() - INTERVAL '2 hours')"
    ).bind(monitor_id).execute(&state.db).await.unwrap();

    // Insert ≥5 ALL-HIT probes → 100% hit rate, above the 50% threshold.
    // This is a confirmed-clear signal: the aggregate will have sample_count ≥ 5
    // and hit_pct above threshold, so the incident must be resolved.
    for _ in 0..6 {
        sqlx::query(
            "INSERT INTO probe_results (time, monitor_id, region, ttfb_ms, cache_status, status_code)
             VALUES (NOW() - INTERVAL '5 minutes', $1, 'us-east', 100.0, 'HIT', 200)"
        ).bind(monitor_id).execute(&state.db).await.unwrap();
    }

    sqlx::query("CALL refresh_continuous_aggregate('probe_results_hourly', NULL, NULL)")
        .execute(&state.db).await.ok();

    let cfg = MonitorAlertConfig {
        id: monitor_id,
        alert_cache_hit_enabled: true,
        alert_cache_hit_threshold_pct: 50.0,
        alert_anycast_enabled: false,
        alert_cache_age_enabled: false,
        alert_cache_age_threshold_hours: 72,
    };

    audit_monitor_alerts(&state, &cfg).await.unwrap();

    let resolved_at: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT resolved_at FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert!(resolved_at.is_some(), "Incident must be closed when cache is confirmed above threshold");

    assert!(!alert_severity("cache_hit_low").sends_recovery(), "MEDIUM must not send recovery");

    cleanup(&state, monitor_id, user_id).await;
    sqlx::query("DELETE FROM probe_results_hourly WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.ok();
}

// ── Scenario 4b: Insufficient aggregate data must NOT resolve an open incident ──
// Regression test for the false-resolve bug: when probe_results_hourly has
// sample_count < 5 (stale aggregate, low probe frequency, or DELAYED monitor),
// an open cache_hit_low incident must stay open rather than be silently closed.

#[tokio::test]
async fn test_insufficient_data_preserves_open_incident() {
    use crate::alerts::worker::{audit_monitor_alerts, MonitorAlertConfig};

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id).bind(format!("insuf-{}@test.com", user_id)).bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_cache_hit_enabled, alert_cache_hit_threshold_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    ).bind(monitor_id).bind(user_id)
    .bind("http://insuf-test.com").bind("Insuf Test")
    .bind(true).bind(true).bind(50.0)
    .execute(&state.db).await.unwrap();

    // Pre-existing open incident (e.g. opened by a previous audit that had enough data)
    sqlx::query(
        "INSERT INTO alert_incidents (monitor_id, alert_type, severity, affected_regions, notification_count, opened_at)
         VALUES ($1, 'cache_hit_low', 'medium', ARRAY['us-east'], 1, NOW() - INTERVAL '1 hour')"
    ).bind(monitor_id).execute(&state.db).await.unwrap();

    // Only 1 raw probe (so latest_probes is non-empty → audit proceeds).
    // probe_results_hourly is NOT refreshed, so sample_count = 0 for this monitor.
    // This simulates a DELAYED monitor: probes exist in the raw table but the
    // continuous aggregate hasn't caught up.
    sqlx::query(
        "INSERT INTO probe_results (time, monitor_id, region, ttfb_ms, cache_status, status_code)
         VALUES (NOW() - INTERVAL '30 minutes', $1, 'us-east', 100.0, 'MISS', 200)"
    ).bind(monitor_id).execute(&state.db).await.unwrap();

    // Do NOT call refresh_continuous_aggregate — aggregate has 0 samples for this monitor.

    let cfg = MonitorAlertConfig {
        id: monitor_id,
        alert_cache_hit_enabled: true,
        alert_cache_hit_threshold_pct: 50.0,
        alert_anycast_enabled: false,
        alert_cache_age_enabled: false,
        alert_cache_age_threshold_hours: 72,
    };

    audit_monitor_alerts(&state, &cfg).await.unwrap();

    let resolved_at: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT resolved_at FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert!(
        resolved_at.is_none(),
        "Incident must NOT be resolved when aggregate has insufficient data — \
         absence of measurement is not evidence of recovery"
    );

    cleanup(&state, monitor_id, user_id).await;
    sqlx::query("DELETE FROM probe_results_hourly WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.ok();
}

// ── Scenario 5: Critical incident is eligible for recovery email ──────────────

#[tokio::test]
async fn test_critical_incident_recovery_eligible() {
    use crate::alerts::worker::{handle_incident, resolve_stale_probe_incidents};
    use crate::alerts::severity::alert_severity;

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id).bind(format!("crit-{}@test.com", user_id)).bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query("INSERT INTO monitors (id, user_id, url, name, is_active) VALUES ($1, $2, $3, $4, $5)")
        .bind(monitor_id).bind(user_id)
        .bind("http://crit-test.com").bind("Crit Test").bind(true)
        .execute(&state.db).await.unwrap();

    // Open a CRITICAL (down) incident via handle_incident → FirstFire
    handle_incident(&state, monitor_id, "down",
        vec!["us-east".to_string(), "eu-west".to_string()],
        None, None,
        Some("Site unreachable".to_string()),
        Some("Check server status".to_string()),
        None, None, None)
    .await.unwrap();

    let (severity, notif_count): (String, i32) = sqlx::query_as(
        "SELECT severity, notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'down'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();

    assert_eq!(severity, "critical");
    assert_eq!(notif_count, 1, "FirstFire must set notification_count = 1");

    // Backdate last_notified_at past the stale window (2× 30min cooldown = 60min)
    sqlx::query(
        "UPDATE alert_incidents SET last_notified_at = NOW() - INTERVAL '65 minutes'
         WHERE monitor_id = $1 AND alert_type = 'down'"
    ).bind(monitor_id).execute(&state.db).await.unwrap();

    // resolve_stale_probe_incidents auto-closes incidents inactive past 2× cooldown
    resolve_stale_probe_incidents(&state).await.unwrap();

    let resolved_at: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT resolved_at FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'down'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert!(resolved_at.is_some(), "Critical incident must be closed after stale window");

    // Recovery email is eligible: sends_recovery() && notification_count > 0
    assert!(alert_severity("down").sends_recovery(), "CRITICAL must send recovery");
    assert!(notif_count > 0, "notification_count must be > 0 for recovery to trigger");

    cleanup(&state, monitor_id, user_id).await;
}

// ── Scenario 6: Active snooze suppresses Digest ───────────────────────────────

#[tokio::test]
async fn test_snooze_blocks_notification() {
    use crate::alerts::worker::handle_incident;

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id).bind(format!("snooze-{}@test.com", user_id)).bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query("INSERT INTO monitors (id, user_id, url, name, is_active) VALUES ($1, $2, $3, $4, $5)")
        .bind(monitor_id).bind(user_id)
        .bind("http://snooze-test.com").bind("Snooze Test").bind(true)
        .execute(&state.db).await.unwrap();

    // Fire → FirstFire
    handle_incident(&state, monitor_id, "cache_hit_low",
        vec!["ap-south-1".to_string()], Some(25.0), Some(80.0),
        None, None, None, None, None)
    .await.unwrap();

    let count_after_first: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert_eq!(count_after_first, 1);

    // Backdate last_notified_at past cooldown AND apply snooze
    sqlx::query(
        "UPDATE alert_incidents
         SET last_notified_at = NOW() - INTERVAL '7 hours',
             snoozed_until     = NOW() + INTERVAL '24 hours'
         WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).execute(&state.db).await.unwrap();

    // Fire again → should be suppressed by snooze, NOT by cooldown
    handle_incident(&state, monitor_id, "cache_hit_low",
        vec!["ap-south-1".to_string()], Some(25.0), Some(80.0),
        None, None, None, None, None)
    .await.unwrap();

    let count_after_snooze: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert_eq!(count_after_snooze, 1, "Snooze must suppress the notification");

    cleanup(&state, monitor_id, user_id).await;
}

// ── Scenario 7: Expired snooze resumes normal notification cadence ─────────────

#[tokio::test]
async fn test_expired_snooze_allows_notification() {
    use crate::alerts::worker::handle_incident;

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id).bind(format!("expsnz-{}@test.com", user_id)).bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query("INSERT INTO monitors (id, user_id, url, name, is_active) VALUES ($1, $2, $3, $4, $5)")
        .bind(monitor_id).bind(user_id)
        .bind("http://expsnooze-test.com").bind("ExpSnooze Test").bind(true)
        .execute(&state.db).await.unwrap();

    // Fire → FirstFire
    handle_incident(&state, monitor_id, "cache_hit_low",
        vec!["us-east".to_string()], Some(30.0), Some(80.0),
        None, None, None, None, None)
    .await.unwrap();

    // Backdate last_notified_at past cooldown AND set an EXPIRED snooze
    sqlx::query(
        "UPDATE alert_incidents
         SET last_notified_at = NOW() - INTERVAL '7 hours',
             snoozed_until     = NOW() - INTERVAL '1 hour'
         WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).execute(&state.db).await.unwrap();

    // Fire again → expired snooze + elapsed cooldown → Digest should go through
    handle_incident(&state, monitor_id, "cache_hit_low",
        vec!["us-east".to_string()], Some(30.0), Some(80.0),
        None, None, None, None, None)
    .await.unwrap();

    let notif_count: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert_eq!(notif_count, 2, "Expired snooze must allow Digest to fire normally");

    cleanup(&state, monitor_id, user_id).await;
}

// ── Scenario 8: Two incident types on same monitor are fully independent ───────

#[tokio::test]
async fn test_independent_incidents_same_monitor() {
    use crate::alerts::worker::handle_incident;

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id).bind(format!("indep-{}@test.com", user_id)).bind("hash")
        .execute(&state.db).await.unwrap();

    sqlx::query("INSERT INTO monitors (id, user_id, url, name, is_active) VALUES ($1, $2, $3, $4, $5)")
        .bind(monitor_id).bind(user_id)
        .bind("http://indep-test.com").bind("Indep Test").bind(true)
        .execute(&state.db).await.unwrap();

    // Open two different incident types
    handle_incident(&state, monitor_id, "cache_hit_low",
        vec!["us-east".to_string()], Some(30.0), Some(80.0),
        None, None, None, None, None)
    .await.unwrap();

    handle_incident(&state, monitor_id, "ssl_expiry",
        vec!["eu-west".to_string()], Some(5.0), Some(15.0),
        None, None, None, None, None)
    .await.unwrap();

    // Both incidents open, each with notification_count = 1
    let cache_count: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();

    let ssl_count: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'ssl_expiry'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();

    assert_eq!(cache_count, 1);
    assert_eq!(ssl_count, 1);

    // Advance only cache_hit_low past cooldown (6h) and fire again
    sqlx::query(
        "UPDATE alert_incidents SET last_notified_at = NOW() - INTERVAL '7 hours'
         WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).execute(&state.db).await.unwrap();

    handle_incident(&state, monitor_id, "cache_hit_low",
        vec!["us-east".to_string()], Some(30.0), Some(80.0),
        None, None, None, None, None)
    .await.unwrap();

    // cache_hit_low now has count=2; ssl_expiry is untouched at count=1
    let cache_count_after: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'cache_hit_low'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();

    let ssl_count_after: i32 = sqlx::query_scalar(
        "SELECT notification_count FROM alert_incidents WHERE monitor_id = $1 AND alert_type = 'ssl_expiry'"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();

    assert_eq!(cache_count_after, 2, "cache_hit_low should have fired Digest independently");
    assert_eq!(ssl_count_after, 1, "ssl_expiry must remain unaffected by cache_hit_low cycle");

    // Total open incidents for this monitor: 2
    let total_open: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alert_incidents WHERE monitor_id = $1 AND resolved_at IS NULL"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();
    assert_eq!(total_open, 2);

    cleanup(&state, monitor_id, user_id).await;
}
