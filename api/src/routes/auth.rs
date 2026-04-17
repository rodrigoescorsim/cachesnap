use axum::{
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use crate::config::Config;

pub fn require_probe_secret(headers: &HeaderMap, config: &Config) -> Result<(), Response> {
    let secret = headers
        .get("x-probe-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if secret != config.probe_secret {
        return Err(
            (StatusCode::UNAUTHORIZED, Json(json!({ "error": "unauthorized" }))).into_response(),
        );
    }
    Ok(())
}
