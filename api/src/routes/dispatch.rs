use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::{models::monitor::Monitor, routes::auth, scheduler::runner, AppState};

#[derive(serde::Deserialize)]
pub struct DispatchRequest {
    pub bypass: Option<bool>,
    pub is_manual: Option<bool>,
}

/// POST /api/monitors/:id/dispatch
/// Dispara probes imediatos para um monitor em todas as regiões.
/// Autenticado pelo mesmo PROBE_SECRET dos workers (chamada interna).
pub async fn handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(monitor_id): Path<Uuid>,
    payload: Option<Json<DispatchRequest>>,
) -> impl IntoResponse {
    let payload = payload.map(|p| p.0).unwrap_or(DispatchRequest { bypass: None, is_manual: None });
    if let Err(e) = auth::require_probe_secret(&headers, &state.config) {
        return e;
    }

    let monitor: Result<Option<Monitor>, _> = sqlx::query_as(
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
    .await;

    let monitor = match monitor {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "monitor not found" }))).into_response(),
        Err(e) => {
            tracing::error!("dispatch: db error: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "db error" }))).into_response();
        }
    };

    let regions = Arc::new(runner::fetch_regions(&state.db).await);
    let run_bypass = payload.bypass.unwrap_or(false);
    let is_manual = payload.is_manual.unwrap_or(true); // Default to true if called via /dispatch API

    let bypass_mode = if run_bypass {
        runner::BypassMode::Full
    } else {
        runner::BypassMode::Off
    };
    tokio::spawn(async move {
        runner::dispatch_probes(&state, &monitor, regions, bypass_mode, is_manual, chrono::Utc::now()).await;
    });

    (StatusCode::ACCEPTED, Json(json!({ "ok": true, "monitor_id": monitor_id, "bypass": run_bypass }))).into_response()
}
