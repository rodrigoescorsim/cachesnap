use axum::{http::StatusCode, response::Json};
use serde_json::{json, Value};

pub async fn handler() -> (StatusCode, Json<Value>) {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}
