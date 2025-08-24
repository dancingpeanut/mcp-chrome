use std::convert::Infallible;
use std::time::Duration;
use axum::extract::{Query, State};
use axum::response::Sse;
use futures_util::Stream;
use serde::Deserialize;
use tracing::warn;
use crate::proxy::{MessageType, ProxyState, SseMessage};

#[derive(Deserialize)]
pub struct SseQuery {
    pub client_id: String,
}

pub async fn sse_handler(
    Query(params): Query<SseQuery>,
    State(proxy_state): State<ProxyState>,
) -> Sse<impl Stream<Item = Result<axum::response::sse::Event, Infallible>>> {
    let (client, stream) = proxy_state.connect_to_client(params.client_id.clone()).await;

    let connected_msg = SseMessage::from_message_type(MessageType::Connected);
    if let Err(e) = proxy_state.send_msg_to_client(&client, connected_msg).await {
        warn!("Failed to send connected message to client: {}", e);
    }

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive-text"),
    )
}
