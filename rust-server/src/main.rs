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
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    convert::Infallible,
    sync::Arc,
    time::Duration,
    pin::Pin,
    task::{Context, Poll},
};
use tokio::{
    sync::{mpsc, oneshot},
    time::{interval, timeout},
};
use tower_http::cors::CorsLayer;
use tracing::{error, info, warn};
use uuid::Uuid;
use crate::common::{ApiResponseold, ChromeResponsePayload, ClientExtension, OpPayload, PendingRequest, SseMessage, ToolCallPayload};
use crate::proxy::ProxyState;

// Constants
const MESSAGE_TYPE_CONNECTED: &str = "connected";
const MESSAGE_TYPE_KEEPALIVE: &str = "keepalive";
const MESSAGE_TYPE_OP: &str = "op";

const OP_TYPE_GET_TOOLS: &str = "get_tools";
const OP_TYPE_CALL_TOOL: &str = "call_tool";



#[derive(Clone)]
struct AppState {
    sse_clients: Arc<DashMap<String, ClientExtension>>,
    pending_requests: Arc<DashMap<String, PendingRequest>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            sse_clients: Arc::new(DashMap::new()),
            pending_requests: Arc::new(DashMap::new()),
        }
    }

    async fn add_sse_client(&self, client: ClientExtension) {
        let client_id = client.client_id.clone();
        self.sse_clients.insert(client_id.clone(), client);
        let client_count = self.sse_clients.len();
        info!(
            "SSE client connected: {}. Total clients: {}",
            client_id, client_count
        );
    }

    async fn remove_sse_client(&self, client_id: &str) {
        if self.sse_clients.remove(client_id).is_some() {
            let client_count = self.sse_clients.len();
            info!(
                "SSE client disconnected: {}. Total clients: {}",
                client_id, client_count
            );
        }
    }

    async fn broadcast_to_chrome(
        &self,
        message_type: &str,
        payload: Option<Value>,
        request_id: Option<String>,
        client_id: &str,
    ) {
        let message = SseMessage {
            message_type: message_type.to_string(),
            payload,
            timestamp: Utc::now(),
            request_id,
            message: None,
            client_id: None,
        };

        let message_str = serde_json::to_string(&message).unwrap_or_default();
        info!(
            "Broadcasting to Chrome: {}",
            serde_json::to_string_pretty(&message).unwrap_or_default()
        );

        info!("Looking for client {} in {} total clients", client_id, self.sse_clients.len());

        // 获取sender的克隆，避免长期持有DashMap的引用
        let sender = {
            if let Some(client) = self.sse_clients.get(client_id) {
                info!("Found client {}, attempting to send message", client_id);
                Some(client.sender.clone())
            } else {
                warn!("Client {} not found in connected clients", client_id);
                // List all connected clients for debugging
                for client in self.sse_clients.iter() {
                    info!("Connected client: {}", client.key());
                }
                None
            }
        };

        if let Some(sender) = sender {
            if let Err(e) = sender.send(message_str) {
                error!("Failed to send message to client {}: {}", client_id, e);
                // 现在可以安全地移除客户端，因为我们不再持有引用
                self.remove_sse_client(client_id).await;
            } else {
                info!("Message successfully sent to client {}", client_id);
            }
        }

        info!("Broadcast completed. Sent to client {}", client_id);
    }

    async fn request_from_chrome(
        &self,
        client_id: &str,
        op_type: &str,
        payload: Value,
        timeout_secs: u64,
    ) -> Result<Value, String> {
        let request_id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();

        self.pending_requests
            .insert(request_id.clone(), PendingRequest { sender: tx });

        let op_payload = OpPayload {
            op_type: op_type.to_string(),
            payload,
        };

        self.broadcast_to_chrome(
            MESSAGE_TYPE_OP,
            Some(serde_json::to_value(op_payload).unwrap()),
            Some(request_id.clone()),
            client_id,
        )
            .await;

        info!("Waiting for Chrome response (timeout: {}s)...", timeout_secs);

        match timeout(Duration::from_secs(timeout_secs), rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => {
                self.pending_requests.remove(&request_id);
                Err("Channel closed".to_string())
            }
            Err(_) => {
                warn!("Request timeout after {}s", timeout_secs);
                self.pending_requests.remove(&request_id);
                Err("Request timeout".to_string())
            }
        }
    }

    fn handle_chrome_response(&self, request_id: &str, response: Value) {
        info!("Received response from Chrome:");
        info!("   Request ID: {}", request_id);
        info!(
            "   Response: {}",
            serde_json::to_string_pretty(&response).unwrap_or_default()
        );

        if let Some((_, pending)) = self.pending_requests.remove(request_id) {
            if pending.sender.send(response).is_err() {
                warn!("Failed to send response to waiting handler");
            } else {
                info!("Response handled for request {}", request_id);
            }
        } else {
            warn!("No pending request found for ID: {}", request_id);
        }
    }

    async fn get_tools_from_chrome(&self, client_id: &str) -> Result<Vec<Value>, String> {
        info!("Requesting tools from Chrome extension... {}", client_id);

        match self
            .request_from_chrome(client_id, OP_TYPE_GET_TOOLS, Value::Object(serde_json::Map::new()), 30)
            .await
        {
            Ok(response) => {
                if let Some(success) = response.get("success").and_then(|v| v.as_bool()) {
                    if success {
                        let tools = response
                            .get("data")
                            .and_then(|v| v.as_array())
                            .cloned()
                            .unwrap_or_default();
                        info!("Successfully received {} tools from Chrome", tools.len());
                        Ok(tools)
                    } else {
                        let error = response
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error");
                        error!("Failed to get tools from Chrome: {}", error);
                        Err(error.to_string())
                    }
                } else {
                    Err("Invalid response format".to_string())
                }
            }
            Err(e) => {
                error!("Error getting tools from Chrome: {}", e);
                Err(e)
            }
        }
    }

    async fn call_chrome_tool(
        &self,
        client_id: &str,
        tool_name: &str,
        args: Value,
    ) -> Result<Value, String> {
        info!("Calling Chrome tool: {}", tool_name);
        info!(
            "   Arguments: {}",
            serde_json::to_string_pretty(&args).unwrap_or_default()
        );

        let payload = ToolCallPayload {
            name: tool_name.to_string(),
            args,
        };

        match self
            .request_from_chrome(
                client_id,
                OP_TYPE_CALL_TOOL,
                serde_json::to_value(payload).unwrap(),
                30,
            )
            .await
        {
            Ok(response) => {
                if let Some(success) = response.get("success").and_then(|v| v.as_bool()) {
                    if success {
                        info!("Chrome tool {} executed successfully", tool_name);
                        if let Some(data) = response.get("data") {
                            info!(
                                "   Result: {}",
                                serde_json::to_string_pretty(data).unwrap_or_default()
                            );
                        }
                        Ok(response)
                    } else {
                        let error = response
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error");
                        error!("Chrome tool {} failed: {}", tool_name, error);
                        Err(error.to_string())
                    }
                } else {
                    Err("Invalid response format".to_string())
                }
            }
            Err(e) => {
                error!("Error calling Chrome tool {}: {}", tool_name, e);
                Err(e)
            }
        }
    }

    async fn get_tools(&self, client_id: &str) -> Result<Vec<Value>, String> {
        // 首先获取tools的克隆，避免长期持有DashMap引用
        let tools_lock = {
            if let Some(client) = self.sse_clients.get(client_id) {
                Some(client.tools.clone())
            } else {
                return Err(format!("Client {} not found", client_id));
            }
        };

        if let Some(tools_lock) = tools_lock {
            let tools_guard = tools_lock.read().await;
            if let Some(ref tools) = *tools_guard {
                Ok(tools.clone())
            } else {
                drop(tools_guard); // Release read lock
                let tools = self.get_tools_from_chrome(client_id).await?;
                let mut tools_guard = tools_lock.write().await;
                *tools_guard = Some(tools.clone());
                Ok(tools)
            }
        } else {
            Err(format!("Client {} not found", client_id))
        }
    }
}

// Handler functions
#[derive(Deserialize)]
struct SseQuery {
    client_id: String,
}

struct AdvancedSseConnectionGuard {
    client_id: String,
    state: AppState,
    connected_at: DateTime<Utc>,
    bytes_sent: Arc<std::sync::atomic::AtomicU64>,
    messages_sent: Arc<std::sync::atomic::AtomicU64>,
}

impl AdvancedSseConnectionGuard {
    fn new(client_id: String, state: AppState) -> Self {
        Self {
            client_id,
            state,
            connected_at: Utc::now(),
            bytes_sent: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            messages_sent: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    fn track_message(&self, message_size: usize) {
        self.bytes_sent.fetch_add(message_size as u64, std::sync::atomic::Ordering::Relaxed);
        self.messages_sent.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    fn get_stats(&self) -> (u64, u64, Duration) {
        let bytes = self.bytes_sent.load(std::sync::atomic::Ordering::Relaxed);
        let messages = self.messages_sent.load(std::sync::atomic::Ordering::Relaxed);
        let duration = Utc::now().signed_duration_since(self.connected_at);
        (bytes, messages, duration.to_std().unwrap_or(Duration::ZERO))
    }
}

impl Drop for AdvancedSseConnectionGuard {
    fn drop(&mut self) {
        let client_id = self.client_id.clone();
        let state = self.state.clone();
        let (bytes, messages, duration) = self.get_stats();

        info!(
            "AdvancedSseConnectionGuard dropped for client: {} (bytes: {}, messages: {}, duration: {:?})",
            client_id, bytes, messages, duration
        );

        // 异步清理
        tokio::spawn(async move {
            state.remove_sse_client(&client_id).await;
            info!(
                "SSE client {} cleaned up - Stats: {} bytes, {} messages, {:?} duration",
                client_id, bytes, messages, duration
            );
        });
    }
}

struct GuardedSseStream {
    rx: mpsc::UnboundedReceiver<String>,
    keepalive: tokio::time::Interval,
    client_id: String,
    _guard: AdvancedSseConnectionGuard, // 保持 guard 存活
}

impl GuardedSseStream {
    fn new(
        rx: mpsc::UnboundedReceiver<String>,
        client_id: String,
        state: AppState,
    ) -> Self {
        Self {
            rx,
            keepalive: interval(Duration::from_secs(30)),
            client_id: client_id.clone(),
            _guard: AdvancedSseConnectionGuard::new(client_id, state),
        }
    }
}

impl Stream for GuardedSseStream {
    type Item = Result<axum::response::sse::Event, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // 检查是否有新消息
        match self.rx.poll_recv(cx) {
            Poll::Ready(Some(message)) => {
                // 记录消息统计
                self._guard.track_message(message.len());

                return Poll::Ready(Some(Ok(
                    axum::response::sse::Event::default().data(message)
                )));
            }
            Poll::Ready(None) => {
                // Channel closed
                info!("Channel closed for client {}", self.client_id);
                return Poll::Ready(None); // 这会触发 Drop
            }
            Poll::Pending => {}
        }

        // 检查 keepalive
        if let Poll::Ready(_) = self.keepalive.poll_tick(cx) {
            let keepalive_msg = SseMessage {
                message_type: MESSAGE_TYPE_KEEPALIVE.to_string(),
                payload: None,
                timestamp: Utc::now(),
                request_id: None,
                message: None,
                client_id: Some(self.client_id.clone()),
            };

            let message_str = serde_json::to_string(&keepalive_msg).unwrap_or_default();
            self._guard.track_message(message_str.len());

            return Poll::Ready(Some(Ok(
                axum::response::sse::Event::default().data(message_str)
            )));
        }

        Poll::Pending
    }
}

async fn sse_handler(
    Query(params): Query<SseQuery>,
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<axum::response::sse::Event, Infallible>>> {
    let client_id = params.client_id.clone();
    let (tx, rx) = mpsc::unbounded_channel();
    let client = ClientExtension {
        client_id: client_id.clone(),
        sender: tx.clone(),
        tools: Arc::new(tokio::sync::RwLock::new(None)),
    };
    state.add_sse_client(client).await;
    let stream = GuardedSseStream::new(rx, client_id.clone(), state);

    // 发送连接确认消息
    let connected_msg = SseMessage {
        message_type: MESSAGE_TYPE_CONNECTED.to_string(),
        payload: None,
        timestamp: Utc::now(),
        request_id: None,
        message: Some("SSE connection established".to_string()),
        client_id: Some(client_id),
    };
    let _ = tx.send(serde_json::to_string(&connected_msg).unwrap_or_default());

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive-text"),
    )
}

async fn chrome_response_handler(
    State(state): State<AppState>,
    Json(payload): Json<ChromeResponsePayload>,
) -> impl IntoResponse {
    if payload.request_id.is_empty() {
        warn!("Chrome response endpoint: No request ID provided");
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponseold::<String> {
                success: false,
                data: None,
                error: Some("No request ID provided".to_string()),
            }),
        );
    }

    state.handle_chrome_response(&payload.request_id, payload.response);

    (
        StatusCode::OK,
        Json(ApiResponseold::<String> {
            success: true,
            data: Some("Response received".to_string()),
            error: None,
        }),
    )
}

#[derive(Deserialize)]
struct ClientQuery {
    client_id: String,
}

async fn list_tools_handler(
    Query(params): Query<ClientQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if !state.sse_clients.contains_key(&params.client_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponseold::<Vec<Value>> {
                success: false,
                data: None,
                error: Some("Client not connected".to_string()),
            }),
        );
    }

    match state.get_tools(&params.client_id).await {
        Ok(tools) => (
            StatusCode::OK,
            Json(ApiResponseold {
                success: true,
                data: Some(tools),
                error: None,
            }),
        ),
        Err(e) => {
            error!("Failed to list tools: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponseold::<Vec<Value>> {
                    success: false,
                    data: None,
                    error: Some(e),
                }),
            )
        }
    }
}

async fn call_tool_handler(
    Query(params): Query<ClientQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if !state.sse_clients.contains_key(&params.client_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponseold::<Value> {
                success: false,
                data: None,
                error: Some("Client not connected".to_string()),
            }),
        );
    }

    let tool_name = "chrome_navigate";
    let mut tool_args = serde_json::Map::new();
    tool_args.insert("url".to_string(), Value::String("https://www.baidu.com/".to_string()));
    tool_args.insert("newWindow".to_string(), Value::Bool(false));

    match state
        .call_chrome_tool(&params.client_id, tool_name, Value::Object(tool_args))
        .await
    {
        Ok(result) => (
            StatusCode::OK,
            Json(ApiResponseold::<Value> {
                success: true,
                data: Some(result),
                error: None,
            }),
        ),
        Err(e) => {
            error!("Failed to call tool: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponseold::<Value> {
                    success: false,
                    data: None,
                    error: Some(e),
                }),
            )
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {

    // Initialize tracing
    tracing_subscriber::fmt()
        .init();

    let state = AppState::new();
    let proxy_state = ProxyState::new();

    let app = Router::new()
        // .route("/api/client/response", post(chrome_response_handler))
        // .route("/api/tool/list", get(list_tools_handler))
        // .route("/api/tool/call", get(call_tool_handler))
        // .layer(CorsLayer::permissive())
        // .with_state(state)
        .route("/_sse", get(handler::sse))
        .route("/api/client/response", post(handler::client_response))
        .route("/api/tool/list", get(handler::list_tools))
        .with_state(proxy_state);

    let addr = "0.0.0.0:12306";
    info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}