use anyhow::{anyhow, Result};
use std::sync::Arc;
use std::time::Duration;
use dashmap::DashMap;
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};
use tokio::time::timeout;
use crate::common::{ApiResponse, MessageType, SseMessage};
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
        tracing::info!("Extension client connected: {}. Total clients: {}", client.client_id, self.clients.len());

        (client, stream)
    }

    async fn remove_client(&self, client_id: &str) {
        if self.clients.remove(client_id).is_some() {
            tracing::info!("Extension client remove: {}. Total clients: {}", client_id, self.clients.len());
        }
    }

    /// 向client端发送消息
    pub async fn send_msg_to_client(&self, client: &ExtensionClient, message: SseMessage) -> Result<()> {
        let msg_content = serde_json::to_string(&message)?;
        client.sender.send(msg_content)
            .map_err(|e| anyhow!("Failed to send message to extension client {}: {}", client.client_id, e))
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

        tracing::info!("Waiting for response (request_id: {}, timeout: {}s)...", request_id, timeout_secs);

        match timeout(Duration::from_secs(timeout_secs), rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => {
                self.pending_requests.remove(&request_id);
                Err(anyhow!("Channel closed"))
            }
            Err(_) => {
                tracing::warn!("Request timeout after {}s", timeout_secs);
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
                tracing::info!("Response handled for request {}", request_id);
            }
        } else {
            tracing::warn!("No pending request found for ID: {}", request_id);
        }
        Ok(())
    }

    async fn get_tools_from_client(&self, client: &ExtensionClient) -> Result<Vec<Value>> {
        tracing::info!("Requesting tools from client... {}", client.client_id);
        let message = SseMessage::from_message_type(MessageType::GetTools);

        let response = self.request_client(client, message, 30).await?;
        if response.success {
            if let Some(data) = response.data {
                let tools = data.as_array().cloned()
                    .ok_or_else(|| anyhow!("Invalid response format"))?;
                return Ok(tools);
            }
        }

        Err(anyhow!("Failed to get tools from extension client"))
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
            let mut tools_guard = client.tools.write().await;
            *tools_guard = Some(tools.clone());
            Ok(tools.clone())
        }
    }

    pub async fn call_tool(&self, client_id: &str, tool_name: &str, args: Option<Value>) -> Result<Value> {
        tracing::info!(
            "Calling tool,\n  client_id: {}\n  tool_name: {}\n  Arguments: {}",
            client_id,
            tool_name,
            serde_json::to_string_pretty(&args).unwrap_or_default()
        );
        let client = self.clients.get(client_id)
            .map(|c| c.clone())
            .ok_or_else(|| anyhow!("Extension client {} not found", client_id))?;
        let message = SseMessage::from_message_type(MessageType::CallTool(tool_name.to_string(), args));
        let response = self.request_client(&client, message, 300).await?;

        if response.success {
            if let Some(data) = response.data {
                return Ok(data);
            }
        } else {
            tracing::error!("Failed to call tool: {:?}", response.error);
        }
        Err(anyhow!("Failed to call tool: {}", tool_name))
    }
}

#[derive(Debug, Clone)]
pub struct ExtensionClient {
    pub client_id: String,
    pub sender: mpsc::UnboundedSender<String>,
    pub tools: Arc<tokio::sync::RwLock<Option<Vec<Value>>>>,
}

pub struct ClientListener {
    client_id: String,
    state: ProxyState,
}

impl GuardListener for ClientListener {
    fn close(&self, stats: SseStats) {
        tracing::info!(
            "StreamGuard dropped for client: {} (bytes sent: {}, messages sent: {}, duration: {:?})",
            self.client_id, stats.bytes_sent, stats.messages_sent, stats.duration
        );

        let state = self.state.clone();
        let client_id = self.client_id.clone();
        // 异步清理
        tokio::spawn(async move {
            state.remove_client(&client_id).await;
            tracing::info!("Extension client {} cleaned up", client_id);
        });
    }
}

#[derive(Debug)]
pub struct PendingRequest {
    pub(crate) sender: oneshot::Sender<ApiResponse<Value>>,
}
