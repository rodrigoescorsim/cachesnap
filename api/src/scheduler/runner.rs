// Scheduler: a cada segundo verifica monitores ativos e dispara probes
// com concorrência limitada (sem rajada de spawns), semáforos global/por região
// e retry com backoff em HTTP 429.

use crate::AppState;
use crate::models::monitor::Monitor;
use crate::scheduler::dispatch_limiter::PostProbeContext;
use deadpool_redis::redis::cmd;
use futures::stream::{self, StreamExt};
use serde_json::json;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{debug, error, info, warn};

pub async fn fetch_regions(db: &sqlx::PgPool) -> Vec<(String, String)> {
    match sqlx::query_as!(
        crate::models::region::Region,
        "SELECT id, lambda_url FROM regions WHERE enabled = true AND lambda_url != '' ORDER BY id"
    )
    .fetch_all(db)
    .await
    {
        Ok(rows) => {
            let regions: Vec<_> = rows.into_iter().map(|r| (r.id, r.lambda_url)).collect();
            if regions.is_empty() {
                warn!("No enabled regions with lambda_url found — probes will not be dispatched until regions are configured");
            }
            regions
        }
        Err(e) => {
            error!("Failed to fetch regions from db: {e} — no probes will be dispatched this cycle");
            vec![]
        }
    }
}

pub async fn start(state: AppState) {
    info!("Scheduler started — probe dispatch loop initialized");

    let mut ticker = interval(Duration::from_secs(1));
    let mut regions: Arc<Vec<(String, String)>> = Arc::new(fetch_regions(&state.db).await);
    let mut tick_count = 0u64;

    loop {
        ticker.tick().await;
        tick_count += 1;

        if tick_count.is_multiple_of(60) {
            regions = Arc::new(fetch_regions(&state.db).await);
        }

        let monitors = match sqlx::query_as!(
            Monitor,
            r#"SELECT id as "id!", user_id as "user_id!", url as "url!", name,
                      check_interval_seconds as "check_interval_seconds!",
                      alert_threshold_ms as "alert_threshold_ms!",
                      audit_interval_seconds,
                      is_active as "is_active!", created_at as "created_at!",
                      notify_email, notify_email_enabled as "notify_email_enabled!",
                      notify_slack_webhook, notify_slack_enabled as "notify_slack_enabled!"
               FROM monitors WHERE is_active = TRUE"#
        )
        .fetch_all(&state.db)
        .await
        {
            Ok(m) => m,
            Err(e) => {
                error!("Scheduler: failed to fetch monitors: {e}");
                continue;
            }
        };

        let max_mon = state
            .config
            .probe_dispatch
            .max_monitors_in_flight_per_tick
            .max(1);
        let state_tick = state.clone();
        let regions_tick = Arc::clone(&regions);

        stream::iter(monitors.into_iter().map(|monitor| {
            let state = state_tick.clone();
            let regions = Arc::clone(&regions_tick);
            async move {
                if should_run_now(&state, &monitor).await {
                    let run_bypass = should_run_bypass(&state, &monitor).await;
                    if run_bypass {
                        info!(
                            "Scheduler: forcing bypass probe for monitor {} ({})",
                            monitor.id, monitor.url
                        );
                    }
                    dispatch_probes(&state, &monitor, regions, run_bypass, false).await;
                }
            }
        }))
        .buffer_unordered(max_mon)
        .collect::<()>()
        .await;
    }
}

async fn check_interval(state: &AppState, key: &str, interval_secs: i64) -> bool {
    let mut conn = match state.redis.get().await {
        Ok(c) => c,
        Err(e) => {
            error!("Scheduler: failed to get redis conn: {e}");
            return false;
        }
    };

    let now = chrono::Utc::now().timestamp();

    let script = r#"
        local last_check = redis.call('GET', KEYS[1])
        local now = tonumber(ARGV[1])
        local interval = tonumber(ARGV[2])

        if not last_check or (now - tonumber(last_check)) >= interval then
            redis.call('SET', KEYS[1], now)
            return 1
        end
        return 0
    "#;

    match cmd("EVAL")
        .arg(script)
        .arg(1)
        .arg(key)
        .arg(now)
        .arg(interval_secs)
        .query_async::<_, i32>(&mut conn)
        .await
    {
        Ok(should_run) => should_run == 1,
        Err(e) => {
            error!("Scheduler: Lua script failed for key {}: {}", key, e);
            false
        }
    }
}

async fn should_run_now(state: &AppState, monitor: &Monitor) -> bool {
    check_interval(
        state,
        &format!("last_check:{}", monitor.id),
        monitor.check_interval_seconds as i64,
    )
    .await
}

async fn should_run_bypass(state: &AppState, monitor: &Monitor) -> bool {
    let interval = monitor.audit_interval_seconds.unwrap_or(3600) as i64;

    let interval_passed =
        check_interval(state, &format!("last_bypass:{}", monitor.id), interval).await;
    if interval_passed {
        return true;
    }

    let has_history = sqlx::query!(
        r#"SELECT EXISTS(SELECT 1 FROM audit_results WHERE monitor_id = $1 LIMIT 1) as "exists!""#,
        monitor.id
    )
    .fetch_one(&state.db)
    .await
    .map(|r| r.exists)
    .unwrap_or(true);

    !has_history
}

pub async fn dispatch_probes(
    state: &AppState,
    monitor: &Monitor,
    regions: Arc<Vec<(String, String)>>,
    run_bypass: bool,
    is_manual: bool,
) {
    debug!(
        "Dispatching probes for monitor {} ({}) | bypass={} | manual={}",
        monitor.id, monitor.url, run_bypass, is_manual
    );

    let client = state.http.clone();
    let ingest_url = format!("{}/api/ingest", state.config.api_url.trim_end_matches('/'));
    let probe_secret = state.config.probe_secret.clone();
    let monitor_id = monitor.id;
    let target_url = monitor.url.clone();
    let limits = state.probe_limits.clone();

    let parallel = state
        .config
        .probe_dispatch
        .max_regions_parallel_per_monitor
        .max(1);

    stream::iter(regions.iter().cloned().map(|(region_name, worker_url)| {
        let client = client.clone();
        let ingest_url = ingest_url.clone();
        let probe_secret = probe_secret.clone();
        let target_url = target_url.clone();
        let limits = limits.clone();
        let region = region_name;
        async move {
            let body = json!({
                "monitor_id": monitor_id,
                "url": target_url,
                "ingest_url": ingest_url,
                "run_bypass": run_bypass,
                "is_manual": is_manual
            });
            limits
                .post_probe_with_limits(PostProbeContext {
                    client: &client,
                    worker_url: &worker_url,
                    probe_secret: &probe_secret,
                    body: &body,
                    region_id: &region,
                    monitor_id,
                    run_bypass,
                })
                .await;
        }
    }))
    .buffer_unordered(parallel)
    .collect::<()>()
    .await;
}
