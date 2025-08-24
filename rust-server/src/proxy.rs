use anyhow::{anyhow, Result};
use std::sync::Arc;
use std::time::Duration;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};
use tokio::time::timeout;
use tracing::{info, warn};
use uuid::Uuid;
use crate::common::{ApiResponse};
use crate::guard_sse_stream::{GuardListener, GuardedSseStream, SseStats};

#[derive(Clone)]
pub struct ProxyState {
    clients: Arc<DashMap<String, ExtensionClient>>,
    pending_requests: Arc<DashMap<String, PendingRequest>>,
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(DashMap::new()),
            pending_requests: Arc::new(DashMap::new()),
        }
    }

    pub async fn connect_to_client(&self, client_id: String) -> (ExtensionClient, GuardedSseStream<ClientListener>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let client = ExtensionClient {
            client_id: client_id.clone(),
            sender: tx.clone(),
            tools: Arc::new(tokio::sync::RwLock::new(None)),
        };
        let listener = ClientListener {
            client_id: client_id.clone(),
            state: self.clone(),
        };
        let stream = GuardedSseStream::new(rx, listener,
                                           Some(Duration::from_secs(15)));

        self.clients.insert(client_id, client.clone());
        info!("Client connected: {}. Total clients: {}", client.client_id, self.clients.len());

        (client, stream)
    }

    async fn remove_client(&self, client_id: &str) {
        if self.clients.remove(client_id).is_some() {
            info!("Client remove: {}. Total clients: {}", client_id, self.clients.len());
        }
    }

    /// 向client端发送消息
    pub async fn send_msg_to_client(&self, client: &ExtensionClient, message: SseMessage) -> Result<()> {
        let msg_content = serde_json::to_string(&message)?;
        client.sender.send(msg_content)
            .map_err(|e| anyhow!("Failed to send message to client {}: {}", client.client_id, e))
    }

    /// 请求client端，并等待结果
    pub async fn request_client(
        &self,
        client: &ExtensionClient,
        message: SseMessage,
        timeout_secs: u64,
    ) -> Result<ApiResponse<Value>> {
        let request_id = message.request_id.clone();
        let (tx, rx) = oneshot::channel();

        self.pending_requests
            .insert(request_id.clone(), PendingRequest { sender: tx });

        self.send_msg_to_client(client, message).await?;

        info!("Waiting for Chrome response (timeout: {}s)...", timeout_secs);

        match timeout(Duration::from_secs(timeout_secs), rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => {
                self.pending_requests.remove(&request_id);
                Err(anyhow!("Channel closed"))
            }
            Err(_) => {
                warn!("Request timeout after {}s", timeout_secs);
                self.pending_requests.remove(&request_id);
                Err(anyhow!("Request timeout"))
            }
        }
    }

    pub fn handle_client_response(&self, request_id: &str, response: ApiResponse<Value>) -> Result<()> {
        if let Some((_, pending)) = self.pending_requests.remove(request_id) {
            if pending.sender.send(response).is_err() {
                return Err(anyhow!("Failed to send response to waiting handler"));
            } else {
                info!("Response handled for request {}", request_id);
            }
        } else {
            warn!("No pending request found for ID: {}", request_id);
        }
        Ok(())
    }

    async fn get_tools_from_client(&self, client: &ExtensionClient) -> Result<Vec<Value>> {
        info!("Requesting tools from client... {}", client.client_id);
        let message = SseMessage::from_message_type(MessageType::GetTools);

        let response = self.request_client(client, message, 30).await?;
        println!("response: {:?}", response);

        Err(anyhow!("Failed to get tools from client"))
    }

    pub(crate) async fn get_tools(&self, client_id: &str) -> Result<Vec<Value>> {
        let client = self.clients.get(client_id)
            .map(|c| c.clone())
            .ok_or_else(|| anyhow!("Client {} not found", client_id))?;

        let tools_guard_client = client.clone();
        {
            let tools_guard = tools_guard_client.tools.read().await;
            if let Some(ref tools) = *tools_guard {
                return Ok(tools.clone())
            }
        }

        let tools = self.get_tools_from_client(&client).await?;
        {
            let tools_guard = client.tools.write().await;
            if let Some(ref tools) = *tools_guard {
                return Ok(tools.clone())
            }
        }

        Ok(tools)
    }

    async fn call_chrome_tool(
        &self,
        client_id: &str,
        tool_name: &str,
        args: Value,
    ) -> Result<Value, String> {
        Ok(Value::Null)
    }
}

pub struct ClientListener {
    client_id: String,
    state: ProxyState,
}

#[derive(Debug, Clone)]
pub struct ExtensionClient {
    pub client_id: String,
    pub sender: mpsc::UnboundedSender<String>,
    pub tools: Arc<tokio::sync::RwLock<Option<Vec<Value>>>>,
}

impl GuardListener for ClientListener {
    fn close(&self, stats: SseStats) {
        println!("Client disconnected: {:?}", stats);
    }
}

pub enum MessageType {
    Connected,
    GetTools,
    CallTool(String, Value),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseMessage {
    message_type: String,
    payload: Option<Value>,
    timestamp: DateTime<Utc>,
    request_id: String,
}

impl SseMessage {
    pub fn from_message_type(message_type: MessageType) -> Self {
        let request_id = Uuid::new_v4().to_string();
        let timestamp = Utc::now();
        match message_type {
            MessageType::Connected => Self {
                message_type: "connected".to_string(),
                payload: None,
                timestamp,
                request_id,
            },
            MessageType::GetTools => Self {
                message_type: "get_tools".to_string(),
                payload: None,
                timestamp,
                request_id,
            },
            MessageType::CallTool(name, args) => Self {
                message_type: "call_tool".to_string(),
                payload: None,
                timestamp,
                request_id,
            },
        }
    }
}

#[derive(Debug)]
pub struct PendingRequest {
    pub(crate) sender: oneshot::Sender<ApiResponse<Value>>,
}
