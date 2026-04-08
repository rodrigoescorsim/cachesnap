use ax_sse::{Event, Sse};
use axum::{extract::State, response::sse as ax_sse};
use futures::stream::{Stream, StreamExt};
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;
use crate::AppState;

pub async fn handler(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    
    let stream = BroadcastStream::new(rx)
        .filter_map(|msg| async move {
            match msg {
                Ok(m) => Some(Ok(Event::default().data(m))),
                Err(_) => None,
            }
        });

    Sse::new(stream).keep_alive(ax_sse::KeepAlive::default())
}
