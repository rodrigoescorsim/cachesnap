use axum::{
    extract::{Json, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde_json::json;

use crate::{models::probe_result::ProbeResultPayload, AppState};

pub async fn handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ProbeResultPayload>,
) -> impl IntoResponse {
    // Validar probe secret
    let secret = headers
        .get("x-probe-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if secret != state.config.probe_secret {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "unauthorized" }))).into_response();
    }

    tracing::info!("Ingest: received result for monitor {} from region {} | bypass_ttfb: {:?}", payload.monitor_id, payload.region, payload.bypass_ttfb_ms);
    let result = sqlx::query(
        r#"
        INSERT INTO probe_results (
            time, monitor_id, region,
            ttfb_ms, download_ms, total_ms, dns_ms, tls_ms, edge_ms, origin_ms,
            status_code, cache_status, served_by, server_timing,
            http_version, redirect_count, content_length, error,
            bypass_ttfb_ms, bypass_total_ms, bypass_status_code, bypass_error,
            age_s, security_headers, server_timing_breakdown
        ) VALUES (
            NOW(), $1, $2,
            $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19, $20, $21,
            $22, $23, $24
        )
        "#,
    )
    .bind(payload.monitor_id)
    .bind(payload.region.clone())
    .bind(payload.ttfb_ms)
    .bind(payload.download_ms)
    .bind(payload.total_ms)
    .bind(payload.dns_ms)
    .bind(payload.tls_ms)
    .bind(payload.edge_ms)
    .bind(payload.origin_ms)
    .bind(payload.status_code)
    .bind(payload.cache_status.clone())
    .bind(payload.served_by.clone())
    .bind(payload.server_timing.clone())
    .bind(payload.http_version.clone())
    .bind(payload.redirect_count)
    .bind(payload.content_length)
    .bind(payload.error.clone())
    .bind(payload.bypass_ttfb_ms)
    .bind(payload.bypass_total_ms)
    .bind(payload.bypass_status_code)
    .bind(payload.bypass_error.clone())
    .bind(payload.age_s)
    .bind(payload.security_headers.clone())
    .bind(payload.server_timing_breakdown.clone())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Notificar via real-time (SSE)
            let _ = state.tx.send(payload.monitor_id.to_string());

            // Disparar o detector de anomalias em background para não bloquear
            let state_clone = state.clone();
            tokio::spawn(async move {
                crate::alerts::detector::check_for_anomalies(state_clone, payload).await;
            });
            (StatusCode::CREATED, Json(json!({ "ok": true }))).into_response()
        },
        Err(e) => {
            tracing::error!("Failed to insert probe result: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to store result" })),
            )
                .into_response()
        }
    }
}
