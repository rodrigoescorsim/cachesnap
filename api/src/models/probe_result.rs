use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Payload enviado pelo Cloudflare Worker para o endpoint de ingest
#[derive(Debug, Deserialize, Clone)]
pub struct ProbeResultPayload {
    pub monitor_id: Uuid,
    pub region: String,
    // ---- Métricas Principais / Naturais ----
    pub ttfb_ms: Option<f64>,
    pub download_ms: Option<f64>,
    pub total_ms: Option<f64>,
    pub dns_ms: Option<f64>,
    pub tcp_ms: Option<f64>,
    pub tls_ms: Option<f64>,
    #[serde(default)]
    pub edge_ms: Option<f64>,
    #[serde(default)]
    pub origin_ms: Option<f64>,
    pub status_code: Option<i32>,
    pub cache_status: Option<String>,
    pub served_by: Option<String>,
    #[serde(default)]
    pub cdn_provider: Option<String>,
    pub server_timing: Option<String>,
    pub http_version: Option<String>,
    pub redirect_count: Option<i32>,
    pub content_length: Option<i64>,
    pub error: Option<String>,
    
    // ---- Metadados de Diagnóstico ----
    #[serde(default)]
    pub age_s: Option<i32>,
    #[serde(default)]
    pub security_headers: Option<serde_json::Value>,
    #[serde(default)]
    pub server_timing_breakdown: Option<serde_json::Value>,
    #[serde(default)]
    pub probe_version: Option<String>,
    #[serde(default)]
    pub is_manual: bool,

    // ---- Métricas de Auditoria (Bypass / Origem) ----
    #[serde(default)]
    pub bypass_ttfb_ms: Option<f64>,
    #[serde(default)]
    pub bypass_total_ms: Option<f64>,
    #[serde(default)]
    pub bypass_dns_ms: Option<f64>,
    #[serde(default)]
    pub bypass_tcp_ms: Option<f64>,
    #[serde(default)]
    pub bypass_tls_ms: Option<f64>,
    #[serde(default)]
    pub bypass_status_code: Option<i32>,
    #[serde(default)]
    pub bypass_error: Option<String>,
    #[serde(default)]
    pub bypass_served_by: Option<String>,
    #[serde(default)]
    pub bypass_cache_status: Option<String>,
    #[serde(default)]
    pub bypass_age_s: Option<i32>,
}

/// Registro persistido no TimescaleDB
#[allow(dead_code)]
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProbeResult {
    pub time: DateTime<Utc>,
    pub monitor_id: Uuid,
    pub region: String,
    pub ttfb_ms: Option<f64>,
    pub download_ms: Option<f64>,
    pub total_ms: Option<f64>,
    pub dns_ms: Option<f64>,
    pub tcp_ms: Option<f64>,
    pub tls_ms: Option<f64>,
    pub edge_ms: Option<f64>,
    pub origin_ms: Option<f64>,
    pub status_code: Option<i32>,
    pub cache_status: Option<String>,
    pub served_by: Option<String>,
    pub cdn_provider: Option<String>,
    pub server_timing: Option<String>,
    pub http_version: Option<String>,
    pub redirect_count: Option<i32>,
    pub content_length: Option<i64>,
    pub error: Option<String>,
    pub age_s: Option<i32>,
    pub security_headers: Option<serde_json::Value>,
    pub server_timing_breakdown: Option<serde_json::Value>,
    pub probe_version: Option<String>,
}
