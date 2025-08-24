mod proxy;
mod guard_sse_stream;
mod handler;
mod common;
mod mcp;

use axum::{middleware, routing::{get, post}, Extension, Router};
use axum::extract::{NestedPath, Path, Request};
use axum::middleware::Next;
use axum::response::IntoResponse;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::StreamableHttpService;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use crate::mcp::ChromeExtensionServer;
use crate::proxy::ProxyState;

async fn sse_entry(Path(client_id): Path<String>, mut req: Request, next: Next) -> impl IntoResponse {
    tracing::info!("Received SSE request: {:?}", req.uri().path_and_query());
    tracing::info!("Client ID: {:?}", client_id);
    // let r =  Request::builder()
    //     .method("GET")
    //     .uri("http://127.0.0.1/api/v1/crates")
    //     .body(Body::empty()).unwrap();
    //
    // let np = NestedPath::from_request(r, &()).await.unwrap();
    // tracing::info!("Nested path: {:?}", np);
    next.run(req).await
}

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

    let proxy_state = ProxyState::new();
    let mcp_proxy_state = proxy_state.clone();
    let mcp_service = StreamableHttpService::new(
         move || { Ok(ChromeExtensionServer::new(mcp_proxy_state.clone())) },
        LocalSessionManager::default().into(),
        Default::default(),
    );
    let mcp_router = Router::new().nest_service("/{client_id}/mcp", mcp_service)
        .layer(middleware::from_fn(sse_entry));

    let router = Router::new()
        .route("/_sse", get(handler::sse))
        .route("/api/client/response", post(handler::client_response))
        .route("/api/tool/list", get(handler::list_tools))
        .route("/api/tool/call", get(handler::call_tool))
        .with_state(proxy_state.clone())
        .merge(mcp_router);


    let addr = "0.0.0.0:12306";
    tracing::info!("Server started on {}", addr);
    let tcp_listener = tokio::net::TcpListener::bind(addr).await?;
    let _ = axum::serve(tcp_listener, router)
        .with_graceful_shutdown(async { tokio::signal::ctrl_c().await.unwrap() })
        .await;

    Ok(())
}