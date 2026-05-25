use anyhow::{Context, Result};
use tracing::warn;

/// Limites de concorrência e retry para `POST` aos workers de probe (scheduler + dispatch manual).
#[derive(Debug, Clone)]
pub struct ProbeDispatchConfig {
    /// Máximo de probes HTTP em voo em todo o processo.
    pub max_in_flight_global: usize,
    /// Máximo por `region_id` (cada URL de worker).
    pub max_in_flight_per_region: usize,
    /// Regiões em paralelo por monitor (dentro de um único `dispatch_probes`).
    pub max_regions_parallel_per_monitor: usize,
    /// Monitores processados em paralelo por tick do scheduler (evita N spawns por segundo).
    pub max_monitors_in_flight_per_tick: usize,
    /// Tentativas HTTP por região (inclui a primeira); em 429 faz-se backoff e repete.
    pub retry_429_max_attempts: u32,
    pub retry_429_base_delay_ms: u64,
    pub retry_429_max_delay_ms: u64,
    /// Tempo máximo à espera de um permit do semáforo antes de desistir desta região neste ciclo.
    pub acquire_timeout_secs: u64,
}

impl ProbeDispatchConfig {
    pub fn from_env() -> Self {
        let mut c = Self {
            // Default ≥ monitores_paralelos × regiões_paralelas (16×3) para evitar fila artificial no semáforo global.
            max_in_flight_global: env_usize("PROBE_DISPATCH_MAX_GLOBAL", 64),
            max_in_flight_per_region: env_usize("PROBE_DISPATCH_MAX_PER_REGION", 3),
            max_regions_parallel_per_monitor: env_usize(
                "PROBE_DISPATCH_REGION_PARALLEL",
                3,
            ),
            max_monitors_in_flight_per_tick: env_usize(
                "PROBE_SCHEDULER_MAX_MONITORS_PARALLEL",
                16,
            ),
            retry_429_max_attempts: env_u32("PROBE_DISPATCH_429_MAX_ATTEMPTS", 5),
            retry_429_base_delay_ms: env_u64("PROBE_DISPATCH_429_BASE_MS", 120),
            retry_429_max_delay_ms: env_u64("PROBE_DISPATCH_429_MAX_MS", 5_000),
            acquire_timeout_secs: env_u64("PROBE_DISPATCH_ACQUIRE_TIMEOUT_SECS", 18),
        };
        c.sanitize();
        c
    }

    /// Garante invariantes mínimas (evita configuração incoerente por env).
    fn sanitize(&mut self) {
        if self.max_in_flight_global < self.max_in_flight_per_region {
            warn!(
                global = self.max_in_flight_global,
                per_region = self.max_in_flight_per_region,
                "PROBE_DISPATCH: max_global < max_per_region — elevando max_global ao valor por região"
            );
            self.max_in_flight_global = self.max_in_flight_per_region;
        }
        let burst = self
            .max_monitors_in_flight_per_tick
            .saturating_mul(self.max_regions_parallel_per_monitor);
        if burst > self.max_in_flight_global {
            warn!(
                burst,
                global = self.max_in_flight_global,
                "PROBE_DISPATCH: monitores_paralelos × regiões_paralelas > max_global — haverá contenção no semáforo global (esperado); aumente PROBE_DISPATCH_MAX_GLOBAL se os 429 persistirem"
            );
        }
    }
}

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|&n| n > 0)
        .unwrap_or(default)
}

fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|&n| n > 0)
        .unwrap_or(default)
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|&n| n > 0)
        .unwrap_or(default)
}

/// `0` desativa o comportamento documentado (ex.: throttle desligado).
fn env_u64_allow_zero(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub port: u16,
    pub probe_secret: String,
    pub resend_api_key: Option<String>,
    pub alert_from_email: String,
    pub slack_webhook_url: Option<String>,
    pub app_url: String,
    pub api_url: String,
    pub probe_dispatch: ProbeDispatchConfig,
    /// Intervalo entre ciclos do worker de auditoria de alertas (Cache Hit, SSL, Anycast, etc).
    pub alerts_worker_interval_secs: u64,
    /// Secret for signing one-click snooze tokens embedded in alert emails.
    /// Falls back to probe_secret if not set (still secure, but rotating is cleaner).
    pub alert_snooze_secret: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: required("DATABASE_URL")?,
            redis_url: required("REDIS_URL")?,
            port: std::env::var("PORT")
                .or_else(|_| std::env::var("API_PORT"))
                .unwrap_or_else(|_| "3001".to_string())
                .parse()
                .context("PORT (or API_PORT) must be a valid number")?,
            probe_secret: required("PROBE_SECRET")?,
            resend_api_key: optional("RESEND_API_KEY"),
            alert_from_email: std::env::var("ALERT_FROM_EMAIL")
                .unwrap_or_else(|_| "CacheSnap <alerts@cachesnap.com>".to_string()),
            slack_webhook_url: optional("SLACK_WEBHOOK_URL"),
            app_url: std::env::var("APP_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            api_url: {
                let url = std::env::var("API_URL")
                    .unwrap_or_else(|_| "http://localhost:3001".to_string());
                if is_loopback_url(&url) {
                    warn!(
                        url = %url,
                        "API_URL is a loopback address — Lambda workers cannot reach this ingest endpoint. \
                         Set API_URL to a public URL (e.g. a Cloudflare tunnel) before starting the API in dev."
                    );
                }
                url
            },
            probe_dispatch: ProbeDispatchConfig::from_env(),
            alerts_worker_interval_secs: {
                let secs = env_u64_allow_zero("ALERTS_WORKER_INTERVAL_SECS", 900);
                if secs > 0 && secs < 300 {
                    warn!(
                        secs,
                        "ALERTS_WORKER_INTERVAL_SECS is very low — alert cooldowns may not work correctly. Minimum recommended: 300s"
                    );
                }
                secs
            },
            alert_snooze_secret: std::env::var("ALERT_SNOOZE_SECRET")
                .ok()
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| {
                    warn!("ALERT_SNOOZE_SECRET not set — falling back to PROBE_SECRET for snooze token signing");
                    std::env::var("PROBE_SECRET").unwrap_or_else(|_| "changeme".to_string())
                }),
        })
    }
}

fn required(key: &str) -> Result<String> {
    std::env::var(key).with_context(|| format!("Missing required env var: {key}"))
}

fn optional(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

/// Returns true if the URL host is a loopback address (localhost, 127.x.x.x, ::1).
/// Used to warn when API_URL would be unreachable from Lambda workers running in AWS.
pub fn is_loopback_url(url: &str) -> bool {
    let host = url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    matches!(host, "localhost" | "127.0.0.1")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_loopback_url_detects_localhost() {
        assert!(is_loopback_url("http://localhost:3001"));
        assert!(is_loopback_url("http://localhost:3001/api/ingest"));
        assert!(is_loopback_url("http://127.0.0.1:3001"));
        assert!(is_loopback_url("https://127.0.0.1"));
        assert!(is_loopback_url("https://127.0.0.1/ingest"));
    }

    #[test]
    fn is_loopback_url_passes_public_urls() {
        assert!(!is_loopback_url("https://abc.trycloudflare.com"));
        assert!(!is_loopback_url("https://api.cachesnap.com"));
        assert!(!is_loopback_url("http://192.168.1.100:3001"));
    }

    #[test]
    fn api_url_default_is_loopback() {
        // Confirms the default triggers the warning — regression guard for the bug
        // where probes silently stopped because API_URL fell back to localhost and
        // AWS Lambda workers cannot reach loopback addresses.
        let default = "http://localhost:3001";
        assert!(
            is_loopback_url(default),
            "default API_URL must be flagged as loopback so the startup warning fires"
        );
    }
}
