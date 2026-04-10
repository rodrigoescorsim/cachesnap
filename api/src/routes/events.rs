use ax_sse::{Event, Sse};
use axum::{extract::{State, Query}, response::sse as ax_sse};
use futures::stream::{Stream, StreamExt};
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;
use crate::AppState;

#[derive(Deserialize)]
pub struct Params {
    user_id: String,
}

#[derive(Deserialize)]
struct BroadcastMsg {
    u: String,
    m: String,
}

pub async fn handler(
    State(state): State<AppState>,
    Query(params): Query<Params>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    let target_user = Arc::new(params.user_id);

    let stream = BroadcastStream::new(rx)
        .filter_map(move |msg| {
            let target_user = Arc::clone(&target_user);
            async move {
                match msg {
                    Ok(raw_json) => {
                        if let Ok(data) = serde_json::from_str::<BroadcastMsg>(&raw_json) {
                            if data.u == *target_user {
                                return Some(Ok(Event::default().data(data.m)));
                            }
                        }
                        None
                    },
                    Err(_) => None,
                }
            }
        });

    Sse::new(stream).keep_alive(ax_sse::KeepAlive::default())
}
