//! Limita pressão sobre os workers de probe: semáforo global + por região,
//! retry com backoff em HTTP 429, e timeouts de aquisição para não reter slots indefinidamente.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use reqwest::{Response, StatusCode};
use serde_json::Value;
use tokio::sync::{OwnedSemaphorePermit, RwLock, Semaphore};
use tokio::time::timeout;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::config::ProbeDispatchConfig;

/// Argumentos para um único `POST` de probe (evita funções com demasiados parâmetros).
pub struct PostProbeContext<'a> {
    pub client: &'a reqwest::Client,
    pub worker_url: &'a str,
    pub probe_secret: &'a str,
    pub body: &'a Value,
    pub region_id: &'a str,
    pub monitor_id: Uuid,
    pub run_bypass: bool,
}

/// Jitter determinístico (sem `rand`) para espalhar picos no mesmo tick.
fn dispatch_jitter(monitor_id: Uuid, region_id: &str) -> Duration {
    let mut h: u32 = (monitor_id.as_u128() & 0xffff_ffff) as u32;
    for b in region_id.bytes() {
        h = h.wrapping_mul(31).wrapping_add(b as u32);
    }
    Duration::from_millis((h % 72) as u64)
}

pub struct ProbeDispatchLimits {
    global: Arc<Semaphore>,
    per_region: RwLock<HashMap<String, Arc<Semaphore>>>,
    cfg: Arc<ProbeDispatchConfig>,
}

impl ProbeDispatchLimits {
    pub fn new(cfg: Arc<ProbeDispatchConfig>) -> Self {
        Self {
            global: Arc::new(Semaphore::new(cfg.max_in_flight_global)),
            per_region: RwLock::new(HashMap::new()),
            cfg,
        }
    }

    async fn region_semaphore(&self, region_id: &str) -> Arc<Semaphore> {
        {
            let map = self.per_region.read().await;
            if let Some(s) = map.get(region_id) {
                return Arc::clone(s);
            }
        }
        let mut map = self.per_region.write().await;
        map.entry(region_id.to_string())
            .or_insert_with(|| Arc::new(Semaphore::new(self.cfg.max_in_flight_per_region)))
            .clone()
    }

    /// `POST` ao worker com limites + retry em 429. Liberta semáforos entre tentativas e antes do sleep.
    pub async fn post_probe_with_limits(&self, ctx: PostProbeContext<'_>) {
        tokio::time::sleep(dispatch_jitter(ctx.monitor_id, ctx.region_id)).await;

        let max_attempts = self.cfg.retry_429_max_attempts.max(1);
        let acquire_wait = Duration::from_secs(self.cfg.acquire_timeout_secs.max(1));

        for attempt in 0..max_attempts {
            let global_permit = match acquire_with_timeout(&self.global, acquire_wait).await {
                Ok(p) => p,
                Err(_) => {
                    warn!(
                        region = %ctx.region_id,
                        monitor_id = %ctx.monitor_id,
                        "probe dispatch: global semaphore acquire timed out — skipping this region for this cycle"
                    );
                    return;
                }
            };

            let rsem = self.region_semaphore(ctx.region_id).await;
            let region_permit = match acquire_with_timeout(&rsem, acquire_wait).await {
                Ok(p) => p,
                Err(_) => {
                    warn!(
                        region = %ctx.region_id,
                        monitor_id = %ctx.monitor_id,
                        "probe dispatch: per-region semaphore acquire timed out — skipping this region for this cycle"
                    );
                    drop(global_permit);
                    return;
                }
            };

            let resp = match ctx
                .client
                .post(ctx.worker_url)
                .header("x-probe-secret", ctx.probe_secret)
                .json(ctx.body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    warn!(
                        region = %ctx.region_id,
                        monitor_id = %ctx.monitor_id,
                        error = %e,
                        "probe dispatch: HTTP error"
                    );
                    drop((region_permit, global_permit));
                    return;
                }
            };

            let status = resp.status();
            if status.is_success() {
                debug!(
                    region = %ctx.region_id,
                    monitor_id = %ctx.monitor_id,
                    bypass = ctx.run_bypass,
                    "Probe dispatched"
                );
                drop((region_permit, global_permit));
                return;
            }

            drop((region_permit, global_permit));

            if status == StatusCode::TOO_MANY_REQUESTS && attempt + 1 < max_attempts {
                let delay = retry_delay_after_429(&resp, attempt, &self.cfg);
                debug!(
                    region = %ctx.region_id,
                    monitor_id = %ctx.monitor_id,
                    attempt = attempt + 1,
                    ?delay,
                    "probe dispatch: 429 — backing off before retry"
                );
                drop(resp);
                tokio::time::sleep(delay).await;
                continue;
            }

            if status == StatusCode::TOO_MANY_REQUESTS {
                warn!(
                    region = %ctx.region_id,
                    monitor_id = %ctx.monitor_id,
                    attempts = max_attempts,
                    "probe dispatch: 429 — retries exhausted"
                );
            } else {
                warn!(
                    region = %ctx.region_id,
                    monitor_id = %ctx.monitor_id,
                    %status,
                    "probe dispatch: non-success status"
                );
            }
            return;
        }
    }
}

async fn acquire_with_timeout(
    sem: &Arc<Semaphore>,
    wait: Duration,
) -> Result<OwnedSemaphorePermit, ()> {
    timeout(wait, sem.clone().acquire_owned())
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}

fn retry_delay_after_429(resp: &Response, attempt: u32, cfg: &ProbeDispatchConfig) -> Duration {
    if let Some(secs) = parse_retry_after_seconds(resp.headers()) {
        let cap_secs = (cfg.retry_429_max_delay_ms / 1000).max(1);
        return Duration::from_secs(secs.min(cap_secs).max(1));
    }
    Duration::from_millis(exponential_backoff_millis(attempt, cfg))
}

/// Backoff exponencial em milissegundos (429 sem cabeçalho `Retry-After`).
pub(crate) fn exponential_backoff_millis(attempt: u32, cfg: &ProbeDispatchConfig) -> u64 {
    let base = cfg.retry_429_base_delay_ms.max(50);
    base.saturating_mul(2u64.saturating_pow(attempt))
        .min(cfg.retry_429_max_delay_ms.max(base))
}

fn parse_retry_after_seconds(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    let h = headers.get(reqwest::header::RETRY_AFTER)?;
    let s = h.to_str().ok()?;
    if let Ok(secs) = s.parse::<u64>() {
        return Some(secs.min(120));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, RETRY_AFTER};

    #[test]
    fn exponential_backoff_respects_ceiling() {
        let cfg = ProbeDispatchConfig {
            max_in_flight_global: 8,
            max_in_flight_per_region: 2,
            max_regions_parallel_per_monitor: 2,
            max_monitors_in_flight_per_tick: 4,
            retry_429_max_attempts: 5,
            retry_429_base_delay_ms: 100,
            retry_429_max_delay_ms: 250,
            acquire_timeout_secs: 5,
        };
        assert_eq!(exponential_backoff_millis(0, &cfg), 100);
        assert_eq!(exponential_backoff_millis(1, &cfg), 200);
        assert_eq!(exponential_backoff_millis(2, &cfg), 250);
        assert_eq!(exponential_backoff_millis(10, &cfg), 250);
    }

    #[test]
    fn parse_retry_after_numeric() {
        let mut h = HeaderMap::new();
        h.insert(RETRY_AFTER, "7".parse().unwrap());
        assert_eq!(parse_retry_after_seconds(&h), Some(7));
    }

    #[test]
    fn parse_retry_after_caps_at_120() {
        let mut h = HeaderMap::new();
        h.insert(RETRY_AFTER, "999".parse().unwrap());
        assert_eq!(parse_retry_after_seconds(&h), Some(120));
    }

    #[test]
    fn jitter_is_bounded_under_72ms() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        for region in ["sa-east", "eu-west", "ap-south"] {
            let d = dispatch_jitter(id, region);
            assert!(
                d.as_millis() < 72,
                "jitter {:?} for {}",
                d,
                region
            );
        }
    }
}
