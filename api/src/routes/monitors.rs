use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;
use serde_json::json;
use uuid::Uuid;

use crate::{routes::auth, AppState};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ActiveMonitor {
    pub id: Uuid,
    pub url: String,
}

/// GET /api/monitors/active
/// Chamado pelo CF Worker em modo scheduled para obter a lista de monitors ativos.
/// Auth: x-probe-secret header (mesmo secret usado pelo ingest).
pub async fn list_active(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(e) = auth::require_probe_secret(&headers, &state.config) {
        return e;
    }

    let result = sqlx::query_as!(
        ActiveMonitor,
        r#"SELECT id as "id!", url as "url!" FROM monitors WHERE is_active = TRUE ORDER BY created_at"#
    )
    .fetch_all(&state.db)
    .await;

    match result {
        Ok(monitors) => (StatusCode::OK, Json(json!({ "monitors": monitors }))).into_response(),
        Err(e) => {
            tracing::error!("Failed to fetch active monitors: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to fetch monitors" })),
            )
                .into_response()
        }
    }
}
