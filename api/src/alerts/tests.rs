use crate::{
    alerts::detector::check_for_anomalies,
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

#[tokio::test]
async fn test_downtime_aggregation_logic() {
    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();

    let user_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)"
    )
    .bind(user_id)
    .bind(format!("test-{}@cachesnap.com", user_id))
    .bind("hash")
    .execute(&state.db).await.unwrap();

    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_down_enabled, alert_threshold_ms, alert_threshold_hit_ms) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
    )
    .bind(monitor_id)
    .bind(user_id)
    .bind("http://test-aggregation.com")
    .bind("Test Aggregation")
    .bind(true)
    .bind(true)
    .bind(1000)
    .bind(500)
    .execute(&state.db).await.unwrap();

    let regions = vec!["us-east", "eu-west", "sa-east"];
    for region in regions {
        let mut payload = create_test_payload(monitor_id, region);
        payload.status_code = Some(503);
        payload.error = Some("Service Unavailable".to_string());
        check_for_anomalies(state.clone(), payload).await;
    }

    tokio::time::sleep(Duration::from_secs(18)).await;

    let alert_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alerts WHERE monitor_id = $1 AND alert_type = 'down'"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();

    assert_eq!(alert_count, 1, "Deveria ter apenas 1 alerta consolidado");

    sqlx::query("DELETE FROM alerts WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.unwrap();
    sqlx::query("DELETE FROM monitors WHERE id = $1").bind(monitor_id).execute(&state.db).await.unwrap();
    sqlx::query("DELETE FROM users WHERE id = $1").bind(user_id).execute(&state.db).await.unwrap();
}

#[tokio::test]
async fn test_ttfb_threshold_aggregation() {
    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();

    let user_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)"
    )
    .bind(user_id)
    .bind(format!("test-{}@cachesnap.com", user_id))
    .bind("hash")
    .execute(&state.db).await.unwrap();

    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_ttfb_enabled, alert_threshold_ms, alert_threshold_hit_ms, alert_sensitivity) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    )
    .bind(monitor_id)
    .bind(user_id)
    .bind("http://test-ttfb.com")
    .bind("Test TTFB")
    .bind(true)
    .bind(true)
    .bind(500)
    .bind(500)
    .bind(3)
    .execute(&state.db).await.unwrap();

    let regions = vec!["us-west", "ap-south"];
    for region in regions {
        let mut payload = create_test_payload(monitor_id, region);
        payload.ttfb_ms = Some(1200.0);
        payload.status_code = Some(200);
        payload.cache_status = Some("MISS".to_string());
        check_for_anomalies(state.clone(), payload).await;
    }

    tokio::time::sleep(Duration::from_secs(18)).await;

    let alert_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM alerts WHERE monitor_id = $1 AND alert_type = 'ttfb_threshold'"
    )
    .bind(monitor_id)
    .fetch_one(&state.db).await.unwrap();

    sqlx::query("DELETE FROM alerts WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.unwrap();
    sqlx::query("DELETE FROM monitors WHERE id = $1").bind(monitor_id).execute(&state.db).await.unwrap();
    sqlx::query("DELETE FROM users WHERE id = $1").bind(user_id).execute(&state.db).await.unwrap();
}

#[tokio::test]
async fn test_worker_cache_hit_aggregation() {
    use crate::alerts::worker::{audit_monitor_alerts, MonitorAlertConfig};

    let state = get_test_state().await;
    let monitor_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)").bind(user_id).bind(format!("worker-{}@test.com", user_id)).bind("hash").execute(&state.db).await.unwrap();
    
    // Monitor com alerta de Cache Hit ativado (threshold 90%)
    sqlx::query(
        "INSERT INTO monitors (id, user_id, url, name, is_active, alert_cache_hit_enabled, alert_cache_hit_threshold_pct) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(monitor_id).bind(user_id).bind("http://worker-test.com").bind("Worker Test").bind(true).bind(true).bind(90.0)
    .execute(&state.db).await.unwrap();

    // Simular dados de cache baixo (50%) em 2 regiões
    let regions = vec!["us-east", "eu-west"];
    for region in regions {
        // Inserir 10 registros (5 HIT, 5 MISS) para gerar 50% de hit rate
        for i in 0..10 {
            let status = if i < 5 { "HIT" } else { "MISS" };
            sqlx::query(
                "INSERT INTO probe_results (time, monitor_id, region, ttfb_ms, cache_status, status_code) 
                 VALUES (NOW() - INTERVAL '5 minutes', $1, $2, 100.0, $3, 200)"
            ).bind(monitor_id).bind(region).bind(status).execute(&state.db).await.unwrap();
        }
    }

    // Forçar atualização da view materializada do TimescaleDB
    sqlx::query("CALL refresh_continuous_aggregate('probe_results_hourly', NULL, NULL)")
        .execute(&state.db).await.ok(); // ok() pois pode falhar se não houver dados suficientes, mas seguimos

    let cfg = MonitorAlertConfig {
        id: monitor_id,
        alert_cache_hit_enabled: true,
        alert_cache_hit_threshold_pct: 90.0,
        alert_anycast_enabled: false,
        alert_zombie_cache_enabled: false,
    };

    // Rodar auditoria
    audit_monitor_alerts(&state, &cfg).await.unwrap();

    // Verificar se gerou apenas 1 alerta de cache_hit_low marcado como Multiple
    let (count, region): (i64, String) = sqlx::query_as(
        "SELECT COUNT(*), region FROM alerts WHERE monitor_id = $1 AND alert_type = 'cache_hit_low' GROUP BY region"
    ).bind(monitor_id).fetch_one(&state.db).await.unwrap();

    assert_eq!(count, 1);
    assert_eq!(region, "Multiple");

    sqlx::query("DELETE FROM alerts WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.unwrap();
    sqlx::query("DELETE FROM probe_results WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.unwrap();
    sqlx::query("DELETE FROM probe_results_hourly WHERE monitor_id = $1").bind(monitor_id).execute(&state.db).await.unwrap();
    sqlx::query("DELETE FROM monitors WHERE id = $1").bind(monitor_id).execute(&state.db).await.unwrap();
    sqlx::query("DELETE FROM users WHERE id = $1").bind(user_id).execute(&state.db).await.unwrap();
}
