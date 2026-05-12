use axum::{
    extract::{Json, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde_json::json;
use std::sync::Arc;

use crate::{models::probe_result::ProbeResultPayload, routes::auth, AppState};

pub async fn handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ProbeResultPayload>,
) -> impl IntoResponse {
    if let Err(e) = auth::require_probe_secret(&headers, &state.config) {
        return e;
    }

    // Trava de Segurança: Rejeitar probes antigos (ex: Cloudflare Workers fantasmas)
    let version = payload.probe_version.as_deref().unwrap_or("old");
    if version != "1.28" {
        tracing::warn!("Ingest: rejected stale probe version '{}' from region {}", version, payload.region);
        // Contar rejeição por versão como falha de ingest (visível no SLO de Ingest Success Rate)
        let region = payload.region.clone();
        let db = state.db.clone();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "INSERT INTO ops_ingest_minute_stats (time, region, success_count, fail_count, fail_reason) \
                 VALUES (NOW(), $1, 0, 1, 'version_drift')"
            )
            .bind(&region)
            .execute(&db)
            .await;
        });
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "deprecated probe version", "required": "1.28" }))).into_response();
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

    // 2. Rota de Monitoramento Natural
    // Persiste tanto probes bem-sucedidos (ttfb presente) quanto falhas (error presente).
    let mut natural_inserted = false;
    if payload.ttfb_ms.is_some() || payload.error.is_some() {
        let probe_res = sqlx::query(
            r#"
            INSERT INTO probe_results (
                time, monitor_id, region,
                ttfb_ms, download_ms, total_ms, dns_ms, tcp_ms, tls_ms, edge_ms, origin_ms,
                status_code, cache_status, served_by, cdn_provider, server_timing,
                http_version, redirect_count, content_length, error,
                age_s, security_headers, server_timing_breakdown, scheduled_at, probe_version
            ) VALUES (
                NOW(), $1, $2,
                $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15,
                $16, $17, $18, $19,
                $20, $21, $22, $23, $24
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
        .bind(payload.cdn_provider.clone())
        .bind(payload.server_timing.clone())
        .bind(payload.http_version.clone())
        .bind(payload.redirect_count)
        .bind(payload.content_length)
        .bind(payload.error.clone())
        .bind(payload.age_s)
        .bind(payload.security_headers.clone())
        .bind(payload.server_timing_breakdown.clone())
        .bind(payload.scheduled_at)
        .bind(payload.probe_version.clone())
        .execute(&state.db)
        .await;

        match probe_res {
            Ok(_) => {
                natural_inserted = true;
                // Contabilizar ingest bem-sucedido em ops_ingest_minute_stats
                let region = payload.region.clone();
                let db = state.db.clone();
                tokio::spawn(async move {
                    let _ = sqlx::query(
                        "INSERT INTO ops_ingest_minute_stats (time, region, success_count, fail_count) \
                         VALUES (date_trunc('minute', NOW()), $1, 1, 0) \
                         ON CONFLICT DO NOTHING"
                    )
                    .bind(&region)
                    .execute(&db)
                    .await;
                });
            }
            Err(e) => {
                tracing::error!("Failed to insert natural probe result: {e}");
                // Contabilizar falha de inserção
                let region = payload.region.clone();
                let db = state.db.clone();
                tokio::spawn(async move {
                    let _ = sqlx::query(
                        "INSERT INTO ops_ingest_minute_stats (time, region, success_count, fail_count, fail_reason) \
                         VALUES (date_trunc('minute', NOW()), $1, 0, 1, 'insert_failure') \
                         ON CONFLICT DO NOTHING"
                    )
                    .bind(&region)
                    .execute(&db)
                    .await;
                });
                if final_result.is_ok() {
                    final_result = Err(e);
                }
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

            // Detector de anomalias em background
            let state_clone = state.clone();
            let payload_clone = payload.clone();
            tokio::spawn(async move {
                crate::alerts::detector::check_for_anomalies(state_clone, payload_clone).await;
            });

            // Probe-triggered incident resolution: eagerly closes zombie_cache / anycast /
            // ssl_expiry incidents without waiting for the next worker cycle.
            if natural_inserted {
                let state_pr = state.clone();
                let monitor_id = payload.monitor_id;
                tokio::spawn(async move {
                    crate::alerts::worker::try_resolve_per_probe_incidents(&state_pr, monitor_id)
                        .await;
                });
            }

            // Bootstrap trigger: se monitor nunca foi avaliado e todas as regiões já responderam,
            // dispara avaliação de readiness imediatamente (fora do tick de 15min)
            if natural_inserted {
                let state_bt = state.clone();
                let monitor_id = payload.monitor_id;
                tokio::spawn(async move {
                    maybe_bootstrap_evaluate(state_bt, monitor_id).await;
                });
            }

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

/// Verifica se o monitor está em bootstrap e se todas as regiões já responderam.
/// Se sim, dispara avaliação de readiness e, se habilitado, bypass probes imediatos.
async fn maybe_bootstrap_evaluate(state: AppState, monitor_id: uuid::Uuid) {
    // 1. Verificar bootstrap (audit_readiness_updated_at IS NULL)
    let is_bootstrap = sqlx::query_scalar::<_, bool>(
        "SELECT audit_readiness_updated_at IS NULL FROM monitors WHERE id = $1",
    )
    .bind(monitor_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or(false);

    if !is_bootstrap {
        return;
    }

    // 2. Verificar se todas as regiões já responderam ao menos uma vez
    let total_regions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM regions WHERE enabled = TRUE AND lambda_url != ''",
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if total_regions == 0 {
        return;
    }

    let responded_regions: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT region) FROM probe_results WHERE monitor_id = $1",
    )
    .bind(monitor_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if responded_regions < total_regions {
        return; // Nem todas as regiões responderam ainda
    }

    // 3. Disparar avaliação de readiness
    tracing::info!("ingest: bootstrap trigger for monitor {monitor_id} ({responded_regions}/{total_regions} regions)");
    let needs_dispatch = crate::scheduler::readiness::evaluate_and_persist(&state, monitor_id).await;

    // 4. Se readiness habilitou/warmup no bootstrap: disparo imediato de bypass probe
    if needs_dispatch {
        let monitor: Option<crate::models::monitor::Monitor> = sqlx::query_as(
            r#"SELECT id, user_id, url, name,
                      check_interval_seconds, alert_threshold_ms,
                      audit_interval_seconds,
                      is_active, created_at,
                      notify_email, notify_email_enabled,
                      notify_slack_webhook, notify_slack_enabled,
                      audit_readiness_state,
                      audit_readiness_updated_at,
                      audit_readiness_consecutive_hits,
                      audit_readiness_reason,
                      audit_readiness_comparable_pairs,
                      audit_readiness_comparable_regions,
                      audit_readiness_edge_hit_ratio
               FROM monitors WHERE id = $1 AND is_active = TRUE"#,
        )
        .bind(monitor_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        if let Some(monitor) = monitor {
            let regions = Arc::new(crate::scheduler::runner::fetch_regions(&state.db).await);
            let bypass_mode = match monitor.audit_readiness_state.as_str() {
                "enabled" => crate::scheduler::runner::BypassMode::Full,
                "warmup" => crate::scheduler::runner::BypassMode::Warmup,
                _ => crate::scheduler::runner::BypassMode::Off,
            };

            if !matches!(bypass_mode, crate::scheduler::runner::BypassMode::Off) {
                tracing::info!("ingest: bootstrap immediate bypass dispatch for monitor {monitor_id} [mode={:?}]", bypass_mode as i32);
                crate::scheduler::runner::dispatch_probes(
                    &state,
                    &monitor,
                    regions,
                    bypass_mode,
                    false,
                    chrono::Utc::now(),
                )
                .await;
            }
        }
    }
}
