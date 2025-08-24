mod proxy;
mod guard_sse_stream;
mod handler;
mod common;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Sse},
    routing::{get, post},
    Json, Router,
};
use tracing::info;
use crate::proxy::ProxyState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {

    // Initialize tracing
    tracing_subscriber::fmt()
        .init();

    let proxy_state = ProxyState::new();

    let app = Router::new()
        .route("/_sse", get(handler::sse))
        .route("/api/client/response", post(handler::client_response))
        .route("/api/tool/list", get(handler::list_tools))
        .route("/api/tool/call", get(handler::call_tool))
        .with_state(proxy_state);

    let addr = "0.0.0.0:12306";
    info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}