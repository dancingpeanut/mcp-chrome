mod proxy;
mod guard_sse_stream;
mod handler;
mod common;
mod mcp;

use std::env;
use axum::{middleware, routing::{get, post}, Router};
use axum::extract::{Path, Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use http::StatusCode;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::StreamableHttpService;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use crate::mcp::ChromeExtensionServer;
use crate::proxy::ProxyState;

async fn inject_client_id(State(proxy_state): State<ProxyState>, Path(client_id): Path<String>, mut req: Request, next: Next) -> Result<Response, StatusCode> {
    if !proxy_state.exists_client(&client_id) {
        tracing::warn!("Client not found: {}", client_id);
        return Err(StatusCode::UNAUTHORIZED)
    }
    tracing::info!("MCP client request, client_id: {}", client_id);
    req.headers_mut().insert("client_id", client_id.parse().unwrap());
    Ok(next.run(req).await)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".to_string().into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let proxy_state = ProxyState::new();
    let mcp_proxy_state = proxy_state.clone();
    let mcp_service = StreamableHttpService::new(
         move || { Ok(ChromeExtensionServer::new(mcp_proxy_state.clone())) },
        LocalSessionManager::default().into(),
        Default::default(),
    );
    let mcp_router = Router::new().nest_service("/{client_id}/mcp", mcp_service)
        .layer(middleware::from_fn_with_state(proxy_state.clone(), inject_client_id));

    let router = Router::new()
        .route("/_sse", get(handler::sse))
        .route("/api/client/response", post(handler::client_response))
        .route("/api/tool/list", get(handler::list_tools))
        .route("/api/tool/call", get(handler::call_tool))
        .with_state(proxy_state.clone())
        .merge(mcp_router);

    let port = env::var("PORT").unwrap_or_else(|_| "10824".to_string());
    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Server started on {}", addr);
    let tcp_listener = tokio::net::TcpListener::bind(addr).await?;
    let _ = axum::serve(tcp_listener, router)
        .with_graceful_shutdown(async { tokio::signal::ctrl_c().await.unwrap() })
        .await;

    Ok(())
}