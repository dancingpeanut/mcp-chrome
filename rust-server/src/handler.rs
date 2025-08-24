use std::convert::Infallible;
use std::time::Duration;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use axum::response::{IntoResponse, Sse};
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use tracing::{error, warn};
use crate::common::{ChromeResponsePayload};
use crate::proxy::{MessageType, ProxyState, SseMessage};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub(crate) success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

impl <T> ApiResponse<T> {
    pub fn data(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

#[derive(Deserialize)]
pub struct SseQuery {
    pub client_id: String,
}

pub async fn sse_handler(
    Query(params): Query<SseQuery>,
    State(state): State<ProxyState>,
) -> Sse<impl Stream<Item = Result<axum::response::sse::Event, Infallible>>> {
    let (client, stream) = state.connect_to_client(params.client_id.clone()).await;

    let connected_msg = SseMessage::from_message_type(MessageType::Connected);
    if let Err(e) = state.send_msg_to_client(&client, connected_msg).await {
        warn!("Failed to send connected message to client: {}", e);
    }

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive-text"),
    )
}

pub(crate) async fn client_response_handler(
    State(state): State<ProxyState>,
    Json(payload): Json<ChromeResponsePayload>,
) -> impl IntoResponse {
    if payload.request_id.is_empty() {
        warn!("Client response endpoint: No request ID provided");
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<String>::error("No request ID provided".to_string())),
        );
    }

    match state.handle_client_response(&payload.request_id, payload.response) {
        Ok(_) => (
            StatusCode::OK,
            Json(ApiResponse::<String>::data("Response received".to_string())),
        ),
        Err(e) => {
            error!("Failed to handle client response: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<String>::error("Failed to handle client response".to_string()))
            )
        },
    }
}
