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

    // Persistir no TimescaleDB
    let result = sqlx::query!(
        r#"
        INSERT INTO probe_results (
            time, monitor_id, region,
            ttfb_ms, download_ms, total_ms, dns_ms, tls_ms, edge_ms, origin_ms,
            status_code, cache_status, served_by, server_timing,
            http_version, redirect_count, content_length, error
        ) VALUES (
            NOW(), $1, $2,
            $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, $16, $17
        )
        "#,
        payload.monitor_id,
        payload.region,
        payload.ttfb_ms,
        payload.download_ms,
        payload.total_ms,
        payload.dns_ms,
        payload.tls_ms,
        payload.edge_ms,
        payload.origin_ms,
        payload.status_code,
        payload.cache_status,
        payload.served_by,
        payload.server_timing,
        payload.http_version,
        payload.redirect_count,
        payload.content_length,
        payload.error,
    )
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
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
