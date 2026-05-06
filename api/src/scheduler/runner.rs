// Scheduler: a cada segundo verifica monitores ativos e dispara probes
// com concorrência limitada (sem rajada de spawns), semáforos global/por região
// e retry com backoff em HTTP 429.

use crate::AppState;
use crate::models::monitor::Monitor;
use crate::scheduler::dispatch_limiter::PostProbeContext;
use crate::scheduler::readiness;
use deadpool_redis::redis::cmd;
use futures::stream::{self, StreamExt};
use serde_json::json;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{debug, error, info, warn};

/// Política de disparo de bypass por monitor.
#[derive(Copy, Clone)]
pub enum BypassMode {
    /// Sem probes de audit (disabled).
    Off,
    /// Probe throttled por região (warmup) — cada região tem chave Redis própria.
    Warmup,
    /// Fluxo normal de audit (enabled).
    Full,
}

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

const MONITOR_QUERY: &str = r#"
    SELECT id, user_id, url, name,
           check_interval_seconds, alert_threshold_ms,
           audit_interval_seconds,
           is_active, created_at,
           notify_email, notify_email_enabled,
           notify_slack_webhook, notify_slack_enabled,
           audit_readiness_state,
           audit_readiness_updated_at,
           audit_readiness_consecutive_hits,
           audit_readiness_reason,
           audit_readiness_comparable_pairs,
           audit_readiness_comparable_regions,
           audit_readiness_edge_hit_ratio
    FROM monitors WHERE is_active = TRUE
"#;

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

        // Avaliação periódica de readiness a cada 15 min
        if tick_count.is_multiple_of(900) {
            let state_r = state.clone();
            tokio::spawn(async move {
                run_readiness_tick(&state_r).await;
            });
        }

        let monitors: Vec<Monitor> = match sqlx::query_as(MONITOR_QUERY)
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
                    // Captura o timestamp de agendamento no momento exato em que
                    // o Scheduler decide disparar o probe. Esse valor é passado
                    // para a Lambda e repassado ao ingest, permitindo calcular
                    // o atraso real de execução vs. agendamento (SLO P50).
                    let scheduled_at = chrono::Utc::now();
                    let bypass_mode = get_bypass_mode(&state, &monitor).await;
                    if matches!(bypass_mode, BypassMode::Full | BypassMode::Warmup) {
                        info!(
                            "Scheduler: bypass probe for monitor {} ({}) [mode={}]",
                            monitor.id,
                            monitor.url,
                            match bypass_mode {
                                BypassMode::Full => "full",
                                BypassMode::Warmup => "warmup",
                                BypassMode::Off => "off",
                            }
                        );
                    }
                    dispatch_probes(&state, &monitor, regions, bypass_mode, false, scheduled_at).await;
                }
            }
        }))
        .buffer_unordered(max_mon)
        .collect::<()>()
        .await;
    }
}

async fn run_readiness_tick(state: &AppState) {
    let ids: Vec<uuid::Uuid> = match sqlx::query_scalar(
        "SELECT id FROM monitors WHERE is_active = TRUE",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            error!("readiness tick: failed to fetch monitor ids: {e}");
            return;
        }
    };

    for monitor_id in ids {
        let state_clone = state.clone();
        tokio::spawn(async move {
            readiness::evaluate_and_persist(&state_clone, monitor_id).await;
        });
    }
}

pub(crate) async fn check_interval(state: &AppState, key: &str, interval_secs: i64) -> bool {
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

/// Determina a política de bypass baseado no estado de readiness persistido.
async fn get_bypass_mode(state: &AppState, monitor: &Monitor) -> BypassMode {
    match monitor.audit_readiness_state.as_str() {
        "disabled" => BypassMode::Off,
        "warmup" => BypassMode::Warmup,
        "enabled" => {
            let interval = monitor.audit_interval_seconds.unwrap_or(3600) as i64;
            if check_interval(state, &format!("last_bypass:{}", monitor.id), interval).await {
                BypassMode::Full
            } else {
                BypassMode::Off
            }
        }
        _ => BypassMode::Off,
    }
}

pub async fn dispatch_probes(
    state: &AppState,
    monitor: &Monitor,
    regions: Arc<Vec<(String, String)>>,
    bypass_mode: BypassMode,
    is_manual: bool,
    scheduled_at: chrono::DateTime<chrono::Utc>,
) {
    let bypass_label = match &bypass_mode {
        BypassMode::Off => "off",
        BypassMode::Warmup => "warmup",
        BypassMode::Full => "full",
    };
    debug!(
        "Dispatching probes for monitor {} ({}) | bypass={} | manual={}",
        monitor.id, monitor.url, bypass_label, is_manual
    );

    let client = state.http.clone();
    let ingest_url = format!("{}/api/ingest", state.config.api_url.trim_end_matches('/'));
    let probe_secret = state.config.probe_secret.clone();
    let monitor_id = monitor.id;
    let target_url = monitor.url.clone();
    let limits = state.probe_limits.clone();
    let audit_interval = monitor.audit_interval_seconds.unwrap_or(3600) as i64;

    let parallel = state
        .config
        .probe_dispatch
        .max_regions_parallel_per_monitor
        .max(1);

    // Pré-calcular decisão de bypass por região para o modo warmup
    // (Redis check serial antes da rajada paralela de HTTP)
    let warmup_secs = (audit_interval * 2).max(7200);
    let bypass_per_region: Vec<bool> = match bypass_mode {
        BypassMode::Off => regions.iter().map(|_| false).collect(),
        BypassMode::Full => regions.iter().map(|_| true).collect(),
        BypassMode::Warmup => {
            let mut decisions = Vec::with_capacity(regions.len());
            for (region_name, _) in regions.iter() {
                let key = format!("last_warmup_probe:{}:{}", monitor_id, region_name);
                decisions.push(check_interval(state, &key, warmup_secs).await);
            }
            decisions
        }
    };

    stream::iter(
        regions
            .iter()
            .cloned()
            .zip(bypass_per_region.into_iter())
            .map(|((region_name, worker_url), run_bypass)| {
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
                        "is_manual": is_manual,
                        "scheduled_at": scheduled_at.to_rfc3339(),
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
            }),
    )
    .buffer_unordered(parallel)
    .collect::<()>()
    .await;
}
