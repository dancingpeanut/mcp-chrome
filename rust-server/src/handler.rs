use std::convert::Infallible;
use std::time::Duration;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use axum::response::{IntoResponse, Sse};
use futures_util::Stream;
use serde::{Deserialize};
use serde_json::Value;
use tracing::{error, warn};
use crate::{ClientQuery};
use crate::common::{ApiResponse};
use crate::proxy::{MessageType, ProxyState, SseMessage};

#[derive(Deserialize)]
pub struct SseQuery {
    pub client_id: String,
}

pub async fn sse(
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

pub(crate) async fn client_response(
    State(state): State<ProxyState>,
    Json(client_response): Json<ApiResponse<Value>>,
) -> impl IntoResponse {
    if let Some(request_id) = &client_response.request_id {
        let response = ApiResponse::<String>::new_with_request_id(request_id.clone());
        match state.handle_client_response(request_id, client_response.clone()) {
            Ok(_) => (
                StatusCode::OK,
                Json(response.with_success("Response received".to_string())),
            ),
            Err(e) => {
                error!("Failed to handle client response: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(response.with_error("Failed to handle client response".to_string()))
                )
            },
        }
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<String>::error("Request ID is required".to_string())),
        )
    }
}

pub async fn list_tools(
    Query(params): Query<ClientQuery>,
    State(state): State<ProxyState>,
) -> impl IntoResponse {
    match state.get_tools(&params.client_id).await {
        Ok(tools) => (
            StatusCode::OK,
            Json(ApiResponse::success(tools)),
        ),
        Err(e) => {
            error!("Failed to list tools: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Vec<Value>>::error("Failed to list tools".to_string())),
            )
        }
    }
}
