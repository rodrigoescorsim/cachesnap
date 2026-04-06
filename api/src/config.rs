use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub port: u16,
    pub probe_secret: String,
    pub resend_api_key: Option<String>,
    pub slack_webhook_url: Option<String>,
    pub app_url: String,
    pub api_url: String, // URL pública da API (para os workers)
    pub region_sa_east: String,
    pub region_eu_west: String,
    pub region_us_east: String,
    pub region_ap_east: String,
    pub region_oc: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: required("DATABASE_URL")?,
            redis_url: required("REDIS_URL")?,
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3001".to_string())
                .parse()
                .context("PORT must be a valid number")?,
            probe_secret: required("PROBE_SECRET")?,
            resend_api_key: optional("RESEND_API_KEY"),
            slack_webhook_url: optional("SLACK_WEBHOOK_URL"),
            app_url: std::env::var("APP_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            api_url: std::env::var("API_URL")
                .unwrap_or_else(|_| "http://localhost:3001".to_string()),
            region_sa_east: std::env::var("REGION_SA_EAST").unwrap_or_else(|_| "https://hoplens-probe-sa-east.rodrigoescorsim.workers.dev".to_string()),
            region_eu_west: std::env::var("REGION_EU_WEST").unwrap_or_else(|_| "https://hoplens-probe-eu-west.rodrigoescorsim.workers.dev".to_string()),
            region_us_east: std::env::var("REGION_US_EAST").unwrap_or_else(|_| "https://hoplens-probe-us-east.rodrigoescorsim.workers.dev".to_string()),
            region_ap_east: std::env::var("REGION_AP_EAST").unwrap_or_else(|_| "https://hoplens-probe-ap-east.rodrigoescorsim.workers.dev".to_string()),
            region_oc:      std::env::var("REGION_OC").unwrap_or_else(|_| "https://hoplens-probe-oc.rodrigoescorsim.workers.dev".to_string()),
        })
    }
}

fn required(key: &str) -> Result<String> {
    std::env::var(key).with_context(|| format!("Missing required env var: {key}"))
}

fn optional(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}
