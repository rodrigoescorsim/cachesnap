// POST /api/monitors/:id/evaluate-readiness
// Dispara avaliação imediata de readiness (botão "Re-check Now" — Melhoria #2).
// Sujeita a cooldown de 120s por monitor via Redis.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde_json::json;
use uuid::Uuid;

use crate::{routes::auth, scheduler::readiness, AppState};

pub async fn handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(monitor_id): Path<Uuid>,
) -> impl IntoResponse {
    if let Err(e) = auth::require_probe_secret(&headers, &state.config) {
        return e;
    }

    // Verificar existência do monitor
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM monitors WHERE id = $1 AND is_active = TRUE)",
    )
    .bind(monitor_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !exists {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "monitor not found" })),
        )
            .into_response();
    }

    match readiness::manual_evaluate(&state, monitor_id).await {
        Ok(new_state) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "state": new_state })),
        )
            .into_response(),
        Err("rate_limited") => (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({ "error": "Re-check available after 2 minutes." })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}
