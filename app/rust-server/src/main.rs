mod proxy;
mod guard_sse_stream;
mod handler;
mod common;
mod mcp;

use axum::{
    routing::{get, post}, Router,
};
use rmcp::transport::sse_server::SseServerConfig;
use rmcp::transport::SseServer;
use tracing::{error, info};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use crate::mcp::ChromeExtensionServer;
use crate::proxy::ProxyState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "debug".to_string().into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let addr = "0.0.0.0:12306";

    let config = SseServerConfig {
        bind: addr.parse()?,
        sse_path: "/sse".to_string(),
        post_path: "/message".to_string(),
        ct: tokio_util::sync::CancellationToken::new(),
        sse_keep_alive: None,
    };

    let (sse_server, router) = SseServer::new(config);

    let proxy_state = ProxyState::new();

    let app = Router::new()
        .route("/_sse", get(handler::sse))
        .route("/api/client/response", post(handler::client_response))
        .route("/api/tool/list", get(handler::list_tools))
        .route("/api/tool/call", get(handler::call_tool))
        .with_state(proxy_state);

    let listener = tokio::net::TcpListener::bind(sse_server.config.bind).await?;

    let ct = sse_server.with_service(ChromeExtensionServer::default);

    // Handle signals for graceful shutdown
    let cancel_token = ct.clone();
    tokio::spawn(async move {
        match tokio::signal::ctrl_c().await {
            Ok(()) => {
                println!("Received Ctrl+C, shutting down server...");
                cancel_token.cancel();
            }
            Err(err) => {
                eprintln!("Unable to listen for Ctrl+C signal: {}", err);
            }
        }
    });

    // Start HTTP server
    info!("Server started on {}", addr);
    let server = axum::serve(listener, app).with_graceful_shutdown(async move {
        // Wait for cancellation signal
        ct.cancelled().await;
        info!("Server is shutting down...");
    });

    if let Err(e) = server.await {
        error!("Server error: {}", e);
    }

    info!("Server has been shut down");

    Ok(())
}