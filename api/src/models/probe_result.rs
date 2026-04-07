use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Payload enviado pelo Cloudflare Worker para o endpoint de ingest
#[derive(Debug, Deserialize)]
pub struct ProbeResultPayload {
    pub monitor_id: Uuid,
    pub region: String,
    pub ttfb_ms: Option<f64>,
    pub download_ms: Option<f64>,
    pub total_ms: Option<f64>,
    pub dns_ms: Option<f64>,    // null no Phase 1 (CF Workers), preenchido pelos Node.js probes
    pub tls_ms: Option<f64>,    // null no Phase 1 (CF Workers), preenchido pelos Node.js probes
    #[serde(default)]
    pub edge_ms: Option<f64>,   // parseado do Server-Timing pelo CF Worker
    #[serde(default)]
    pub origin_ms: Option<f64>, // parseado do Server-Timing pelo CF Worker
    pub status_code: Option<i32>,
    pub cache_status: Option<String>, // CF-Cache-Status, X-Vercel-Cache, etc.
    pub served_by: Option<String>,    // CF-Ray, X-Served-By
    pub server_timing: Option<String>, // header bruto para parsing posterior
    pub http_version: Option<String>,
    pub redirect_count: Option<i32>,
    pub content_length: Option<i64>,
    pub error: Option<String>,
    #[serde(default)]
    pub age_s: Option<i32>,                              // Age response header (zombie cache detection)
    #[serde(default)]
    pub security_headers: Option<serde_json::Value>,     // {hsts, csp, x_frame_options, x_content_type, referrer_policy, score}
    #[serde(default)]
    pub server_timing_breakdown: Option<serde_json::Value>, // {metric_name: dur_ms, ...}
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
    pub tls_ms: Option<f64>,
    pub edge_ms: Option<f64>,
    pub origin_ms: Option<f64>,
    pub status_code: Option<i32>,
    pub cache_status: Option<String>,
    pub served_by: Option<String>,
    pub server_timing: Option<String>,
    pub http_version: Option<String>,
    pub redirect_count: Option<i32>,
    pub content_length: Option<i64>,
    pub error: Option<String>,
    pub age_s: Option<i32>,
    pub security_headers: Option<serde_json::Value>,
    pub server_timing_breakdown: Option<serde_json::Value>,
}
