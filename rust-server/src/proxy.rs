use std::sync::Arc;
use std::time::Duration;
use chrono::Utc;
use dashmap::DashMap;
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};
use tokio::time::timeout;
use tracing::{error, info, warn};
use uuid::Uuid;
use crate::{MESSAGE_TYPE_OP, OP_TYPE_CALL_TOOL, OP_TYPE_GET_TOOLS};
use crate::common::{OpPayload, PendingRequest, SseMessage, ToolCallPayload};

#[derive(Debug, Clone)]
struct ExtensionClient {
    client_id: String,
    sender: mpsc::UnboundedSender<String>,
    tools: Arc<tokio::sync::RwLock<Option<Vec<Value>>>>,
}

#[derive(Clone)]
struct ProxyState {
    clients: Arc<DashMap<String, ExtensionClient>>,
    pending_requests: Arc<DashMap<String, PendingRequest>>,
}

impl ProxyState {
    fn new() -> Self {
        Self {
            clients: Arc::new(DashMap::new()),
            pending_requests: Arc::new(DashMap::new()),
        }
    }

    async fn add_client(&self, client: ExtensionClient) {
        let client_id = client.client_id.clone();
        self.clients.insert(client_id.clone(), client);
        info!("SSE client connected: {}. Total clients: {}", client_id, self.clients.len());
    }

    async fn remove_client(&self, client_id: &str) {
        if self.clients.remove(client_id).is_some() {
            info!("SSE client remove: {}. Total clients: {}", client_id, self.clients.len());
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

        info!("Looking for client {} in {} total clients", client_id, self.clients.len());

        // 获取sender的克隆，避免长期持有DashMap的引用
        let sender = {
            if let Some(client) = self.clients.get(client_id) {
                info!("Found client {}, attempting to send message", client_id);
                Some(client.sender.clone())
            } else {
                warn!("Client {} not found in connected clients", client_id);
                // List all connected clients for debugging
                for client in self.clients.iter() {
                    info!("Connected client: {}", client.key());
                }
                None
            }
        };

        if let Some(sender) = sender {
            if let Err(e) = sender.send(message_str) {
                error!("Failed to send message to client {}: {}", client_id, e);
                // 现在可以安全地移除客户端，因为我们不再持有引用
                self.remove_client(client_id).await;
            } else {
                info!("Message successfully sent to client {}", client_id);
            }
        }

        info!("Broadcast completed. Sent to client {}", client_id);
    }

    async fn request_client(
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
            .request_client(client_id, OP_TYPE_GET_TOOLS, Value::Object(serde_json::Map::new()), 30)
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
            .request_client(
                client_id,
                OP_TYPE_CALL_TOOL,
                serde_json::to_value(payload).unwrap(),
                180,
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
            if let Some(client) = self.clients.get(client_id) {
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
