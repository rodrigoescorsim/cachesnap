// Scheduler: a cada intervalo configurado por monitor, dispara os probes
// nas regiões ativas chamando os Cloudflare Workers.
//
// Implementação completa vem no Dia 4 do cronograma.
// Por ora: stub para compilar e estrutura comentada.

use crate::AppState;
use crate::models::monitor::Monitor;
use tokio::time::{interval, Duration};
use deadpool_redis::redis::cmd;
use serde_json::json;
use tracing::{info, error, debug};

pub async fn start(state: AppState) {
    info!("Scheduler started — probe dispatch loop initialized");
    
    let mut ticker = interval(Duration::from_secs(10));
    
    let regions = build_regions(&state);

    loop {
        ticker.tick().await;
        
        let monitors = match sqlx::query_as!(
            Monitor,
            r#"SELECT id as "id!", user_id as "user_id!", url as "url!", name,
                      check_interval_seconds as "check_interval_seconds!",
                      alert_threshold_ms as "alert_threshold_ms!",
                      is_active as "is_active!", created_at as "created_at!",
                      notify_email, notify_email_enabled as "notify_email_enabled!",
                      notify_slack_webhook, notify_slack_enabled as "notify_slack_enabled!"
               FROM monitors WHERE is_active = TRUE"#
        )
        .fetch_all(&state.db)
        .await {
            Ok(m) => m,
            Err(e) => {
                error!("Scheduler: failed to fetch monitors: {e}");
                continue;
            }
        };

        for monitor in monitors {
            let state = state.clone();
            let regions = regions.clone();
            
            tokio::spawn(async move {
                if should_run_now(&state, &monitor).await {
                    let run_bypass = should_run_bypass(&state, &monitor).await;
                    dispatch_probes(&state, &monitor, regions, run_bypass).await;
                }
            });
        }
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

    match cmd("EVAL").arg(script).arg(1).arg(key).arg(now).arg(interval_secs).query_async::<_, i32>(&mut conn).await {
        Ok(should_run) => should_run == 1,
        Err(e) => {
            error!("Scheduler: Lua script failed for key {}: {}", key, e);
            false
        }
    }
}

async fn should_run_now(state: &AppState, monitor: &Monitor) -> bool {
    check_interval(state, &format!("last_check:{}", monitor.id), monitor.check_interval_seconds as i64).await
}

async fn should_run_bypass(state: &AppState, monitor: &Monitor) -> bool {
    check_interval(state, &format!("last_bypass:{}", monitor.id), 3600).await
}

pub fn build_regions(state: &AppState) -> Vec<(String, String)> {
    vec![
        ("sa-east".to_string(), state.config.region_sa_east.clone()),
        ("eu-west".to_string(), state.config.region_eu_west.clone()),
        ("us-east".to_string(), state.config.region_us_east.clone()),
        ("ap-east".to_string(), state.config.region_ap_east.clone()),
        ("oc".to_string(),      state.config.region_oc.clone()),
    ]
}

pub async fn dispatch_probes(state: &AppState, monitor: &Monitor, regions: Vec<(String, String)>, run_bypass: bool) {
    debug!("Dispatching probes for monitor {} ({}) | bypass={}", monitor.id, monitor.url, run_bypass);
    
    let client = state.http.clone();
    let ingest_url = format!("{}/api/ingest", state.config.api_url.trim_end_matches('/'));

    for (region_name, worker_url) in regions {
        let monitor_id = monitor.id;
        let target_url = monitor.url.clone();
        let probe_secret = state.config.probe_secret.clone();
        let worker_url = worker_url.to_string();
        let ingest_url = ingest_url.clone();
        let client = client.clone();

        tokio::spawn(async move {
            let body = json!({
                "monitor_id": monitor_id,
                "url": target_url,
                "ingest_url": ingest_url,
                "run_bypass": run_bypass
            });

            match client.post(&worker_url)
                .header("x-probe-secret", &probe_secret)
                .json(&body)
                .send()
                .await {
                Ok(resp) => {
                    if resp.status().is_success() {
                        debug!("Probe dispatched to {} for monitor {} (bypass={})", region_name, monitor_id, run_bypass);
                    } else {
                        error!("Failed to dispatch probe to {}: status {}", region_name, resp.status());
                    }
                },
                Err(e) => {
                    error!("Error dispatching probe to {}: {}", region_name, e);
                }
            }
        });
    }
}
