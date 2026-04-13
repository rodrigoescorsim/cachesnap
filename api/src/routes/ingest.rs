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

    // Trava de Segurança: Rejeitar probes antigos (ex: Cloudflare Workers fantasmas)
    let version = payload.probe_version.as_deref().unwrap_or("old");
    if version != "1.22" {
        tracing::warn!("Ingest: rejected stale probe version '{}' from region {}", version, payload.region);
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "deprecated probe version", "required": "1.22" }))).into_response();
    }

    tracing::info!("Ingest: received result for monitor {} from region {} | bypass_ttfb: {:?}", payload.monitor_id, payload.region, payload.bypass_ttfb_ms);
    
    let mut final_result = Ok(());

    // 1. Rota de Auditoria (Bypass / Infraestrutura)
    if payload.bypass_ttfb_ms.is_some() {
        let audit_res = sqlx::query(
            r#"
            INSERT INTO audit_results (
                time, monitor_id, region,
                origin_ttfb_ms, origin_total_ms, edge_ttfb_ms, edge_total_ms,
                origin_dns_ms, origin_tcp_ms, origin_tls_ms,
                edge_dns_ms, edge_tcp_ms, edge_tls_ms,
                origin_status_code, origin_error, origin_served_by,
                edge_status_code, edge_cache_status, edge_served_by,
                content_length, is_manual, probe_version, server_timing_breakdown,
                origin_cache_status, origin_age_s
            ) VALUES (
                NOW(), $1, $2,
                $3, $4, $5, $6,
                $7, $8, $9,
                $10, $11, $12,
                $13, $14, $15,
                $16, $17, $18,
                $19, $20, $21, $22,
                $23, $24
            )
            "#,
        )
        .bind(payload.monitor_id)
        .bind(payload.region.clone())
        .bind(payload.bypass_ttfb_ms)
        .bind(payload.bypass_total_ms)
        .bind(payload.ttfb_ms)
        .bind(payload.total_ms)
        .bind(payload.bypass_dns_ms)
        .bind(payload.bypass_tcp_ms)
        .bind(payload.bypass_tls_ms)
        .bind(payload.dns_ms)
        .bind(payload.tcp_ms)
        .bind(payload.tls_ms)
        .bind(payload.bypass_status_code)
        .bind(payload.bypass_error.clone())
        .bind(payload.bypass_served_by.clone())
        .bind(payload.status_code)
        .bind(payload.cache_status.clone())
        .bind(payload.served_by.clone())
        .bind(payload.content_length)
        .bind(payload.is_manual)
        .bind(payload.probe_version.clone())
        .bind(payload.server_timing_breakdown.clone())
        .bind(payload.bypass_cache_status.clone())
        .bind(payload.bypass_age_s)
        .execute(&state.db)
        .await;

        if let Err(e) = audit_res {
            tracing::error!("Failed to insert audit result: {e}");
            final_result = Err(e);
        }
    }

    // 2. Rota de Monitoramento Natural (Pureza estatística)
    // Se for um probe de bypass, inserimos na probe_results apenas se tivermos dados válidos de ttfb
    // E, idealmente, se não for redundante. Mas para o primeiro dispatch, queremos tudo.
    if payload.ttfb_ms.is_some() {
        let probe_res = sqlx::query(
            r#"
            INSERT INTO probe_results (
                time, monitor_id, region,
                ttfb_ms, download_ms, total_ms, dns_ms, tcp_ms, tls_ms, edge_ms, origin_ms,
                status_code, cache_status, served_by, server_timing,
                http_version, redirect_count, content_length, error,
                age_s, security_headers, server_timing_breakdown, probe_version
            ) VALUES (
                NOW(), $1, $2,
                $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14,
                $15, $16, $17, $18,
                $19, $20, $21, $22
            )
            "#,
        )
        .bind(payload.monitor_id)
        .bind(payload.region.clone())
        .bind(payload.ttfb_ms)
        .bind(payload.download_ms)
        .bind(payload.total_ms)
        .bind(payload.dns_ms)
        .bind(payload.tcp_ms)
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
        .bind(payload.age_s)
        .bind(payload.security_headers.clone())
        .bind(payload.server_timing_breakdown.clone())
        .bind(payload.probe_version.clone())
        .execute(&state.db)
        .await;

        if let Err(e) = probe_res {
            // Se for erro de monitoramento natural, logamos.
            tracing::error!("Failed to insert natural probe result: {e}");
            if final_result.is_ok() {
                final_result = Err(e);
            }
        }
    }

    match final_result {
        Ok(_) => {
            // Notificar via real-time (SSE) com isolamento por usuário
            let db = state.db.clone();
            let monitor_id = payload.monitor_id;
            let tx = state.tx.clone();
            
            tokio::spawn(async move {
                let user_result = sqlx::query!("SELECT user_id FROM monitors WHERE id = $1", monitor_id)
                    .fetch_optional(&db)
                    .await;
                
                if let Ok(Some(row)) = user_result {
                    let msg = serde_json::json!({
                        "u": row.user_id,
                        "m": monitor_id
                    }).to_string();
                    let _ = tx.send(msg);
                }
            });

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
