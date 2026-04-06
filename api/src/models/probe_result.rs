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
    pub status_code: Option<i32>,
    pub cache_status: Option<String>, // CF-Cache-Status, X-Vercel-Cache, etc.
    pub served_by: Option<String>,    // CF-Ray, X-Served-By
    pub server_timing: Option<String>, // header bruto para parsing posterior
    pub http_version: Option<String>,
    pub redirect_count: Option<i32>,
    pub content_length: Option<i64>,
    pub error: Option<String>,
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
    pub status_code: Option<i32>,
    pub cache_status: Option<String>,
    pub served_by: Option<String>,
    pub server_timing: Option<String>,
    pub http_version: Option<String>,
    pub redirect_count: Option<i32>,
    pub content_length: Option<i64>,
    pub error: Option<String>,
}
