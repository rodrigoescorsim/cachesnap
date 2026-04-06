use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde_json::json;
use uuid::Uuid;

use crate::{models::monitor::Monitor, scheduler::runner, AppState};

/// POST /api/monitors/:id/dispatch
/// Dispara probes imediatos para um monitor em todas as regiões.
/// Autenticado pelo mesmo PROBE_SECRET dos workers (chamada interna).
pub async fn handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(monitor_id): Path<Uuid>,
) -> impl IntoResponse {
    let secret = headers
        .get("x-probe-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if secret != state.config.probe_secret {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "unauthorized" }))).into_response();
    }

    let monitor = sqlx::query_as!(
        Monitor,
        r#"SELECT id as "id!", user_id as "user_id!", url as "url!", name,
                  check_interval_seconds as "check_interval_seconds!",
                  alert_threshold_ms as "alert_threshold_ms!",
                  is_active as "is_active!", created_at as "created_at!"
           FROM monitors WHERE id = $1 AND is_active = TRUE"#,
        monitor_id
    )
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

    let regions = runner::build_regions(&state);
    tokio::spawn(async move {
        runner::dispatch_probes(&state, &monitor, regions).await;
    });

    (StatusCode::ACCEPTED, Json(json!({ "ok": true, "monitor_id": monitor_id }))).into_response()
}
