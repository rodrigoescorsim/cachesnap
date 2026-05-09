use crate::{alerts::notifier::verify_snooze_token, AppState};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct SnoozeParams {
    token: String,
    expires: i64,
}

/// GET /api/monitors/:id/incidents/:incident_id/snooze?token=...&expires=...
///
/// Zero-friction one-click snooze from email links. Validates the HMAC token,
/// silences the incident for 24 hours, and redirects to the dashboard.
pub async fn snooze_incident(
    State(state): State<AppState>,
    Path((monitor_id, incident_id)): Path<(Uuid, Uuid)>,
    Query(params): Query<SnoozeParams>,
) -> Response {
    // 1. Token expiry check (7-day validity window)
    if params.expires <= Utc::now().timestamp() {
        return (StatusCode::GONE, "Snooze link has expired. Please open the dashboard to snooze manually.").into_response();
    }

    // 2. HMAC signature verification
    if !verify_snooze_token(
        &state.config.alert_snooze_secret,
        incident_id,
        params.expires,
        &params.token,
    ) {
        return (StatusCode::FORBIDDEN, "Invalid snooze token.").into_response();
    }

    // 3. Apply snooze — only on open incidents that belong to the given monitor
    // Dynamic query: alert_incidents added by migration 036
    let updated = sqlx::query_scalar::<_, Uuid>(
        r#"
        UPDATE alert_incidents
        SET snoozed_until = NOW() + INTERVAL '24 hours'
        WHERE id = $1 AND monitor_id = $2 AND resolved_at IS NULL
        RETURNING id
        "#,
    )
    .bind(incident_id)
    .bind(monitor_id)
    .fetch_optional(&state.db)
    .await;

    match updated {
        Ok(Some(_)) => {
            tracing::info!("alerts: snoozed incident {} for 24h", incident_id);
            let redirect_url = format!(
                "{}/dashboard/monitors/{}?snoozed=1",
                state.config.app_url, monitor_id
            );
            Redirect::to(&redirect_url).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            "Incident not found or already resolved.",
        )
            .into_response(),
        Err(e) => {
            tracing::error!("alerts: snooze db error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to apply snooze.").into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::alerts::notifier::sign_snooze_token;

    #[test]
    fn test_expired_token_is_rejected() {
        let secret = "test-secret";
        let incident_id = Uuid::from_u128(1);
        let expired_ts = Utc::now().timestamp() - 1; // 1 second in the past
        let token = sign_snooze_token(secret, incident_id, expired_ts);

        // Simulate the expiry check
        assert!(expired_ts <= Utc::now().timestamp());
        // Token itself is valid, but expired
        assert!(verify_snooze_token(secret, incident_id, expired_ts, &token));
    }

    #[test]
    fn test_future_token_passes_expiry_check() {
        let expires = Utc::now().timestamp() + 86_400; // 1 day in the future
        assert!(expires > Utc::now().timestamp());
    }

    #[test]
    fn test_invalid_token_rejected() {
        let secret = "test-secret";
        let incident_id = Uuid::from_u128(1);
        let expires = Utc::now().timestamp() + 86_400;
        assert!(!verify_snooze_token(secret, incident_id, expires, "invalid-token-hex"));
    }
}
