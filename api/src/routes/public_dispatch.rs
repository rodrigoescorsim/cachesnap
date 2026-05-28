use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use futures::stream::{self, StreamExt};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{routes::auth, scheduler::runner, AppState};

#[derive(Deserialize)]
pub struct PublicDispatchRequest {
    pub job_id: Uuid,
    pub url: String,
    pub regions: Option<Vec<String>>,
}

/// POST /api/public/dispatch
/// Dispatches public CDN check probes to all enabled regions (fire-and-forget).
/// Authenticated with the same PROBE_SECRET used for monitor dispatch.
pub async fn handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PublicDispatchRequest>,
) -> impl IntoResponse {
    if let Err(e) = auth::require_probe_secret(&headers, &state.config) {
        return e;
    }

    let all_regions = runner::fetch_regions(&state.db).await;

    let regions: Vec<(String, String)> = match &payload.regions {
        Some(requested) if !requested.is_empty() => all_regions
            .into_iter()
            .filter(|(id, _)| requested.contains(id))
            .collect(),
        _ => all_regions,
    };

    if regions.is_empty() {
        tracing::warn!("public_dispatch: no enabled regions for job {}", payload.job_id);
        return (StatusCode::ACCEPTED, Json(json!({ "ok": true, "regions": 0 }))).into_response();
    }

    let region_count = regions.len();
    let job_id = payload.job_id;
    let url = payload.url.clone();
    let public_ingest_url = format!(
        "{}/api/public/ingest",
        state.config.app_url.trim_end_matches('/')
    );
    let probe_secret = state.config.probe_secret.clone();
    let client = state.http.clone();

    tokio::spawn(async move {
        stream::iter(regions.into_iter().map(|(region_id, lambda_url)| {
            let client = client.clone();
            let url = url.clone();
            let ingest_url = public_ingest_url.clone();
            let secret = probe_secret.clone();

            async move {
                let body = json!({
                    "job_id": job_id,
                    "monitor_id": job_id,
                    "url": url,
                    "ingest_url": ingest_url,
                    "public": true,
                });

                match client
                    .post(&lambda_url)
                    .header("x-probe-secret", &secret)
                    .json(&body)
                    .send()
                    .await
                {
                    Ok(res) if res.status().is_success() || res.status().as_u16() == 202 => {
                        tracing::debug!(
                            "public_dispatch: dispatched region={} job={}",
                            region_id,
                            job_id
                        );
                    }
                    Ok(res) => {
                        tracing::warn!(
                            "public_dispatch: lambda returned {} for region={} job={}",
                            res.status(),
                            region_id,
                            job_id
                        );
                    }
                    Err(e) => {
                        tracing::error!(
                            "public_dispatch: failed to reach region={} job={}: {}",
                            region_id,
                            job_id,
                            e
                        );
                    }
                }
            }
        }))
        .buffer_unordered(8)
        .collect::<()>()
        .await;
    });

    (
        StatusCode::ACCEPTED,
        Json(json!({ "ok": true, "regions": region_count })),
    )
        .into_response()
}
