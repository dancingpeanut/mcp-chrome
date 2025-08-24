use std::sync::Arc;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};

// Data structures

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponseold<T> {
    pub(crate) success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseMessage {
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) payload: Option<Value>,
    pub(crate) timestamp: DateTime<Utc>,
    #[serde(rename = "requestId", skip_serializing_if = "Option::is_none")]
    pub(crate) request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) client_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChromeResponsePayload {
    #[serde(rename = "requestId")]
    pub(crate) request_id: String,
    pub(crate) response: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpPayload {
    #[serde(rename = "type")]
    pub(crate) op_type: String,
    pub(crate) payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallPayload {
    pub(crate) name: String,
    pub(crate) args: Value,
}

#[derive(Debug, Clone)]
pub struct ClientExtension {
    pub(crate) client_id: String,
    pub(crate) sender: mpsc::UnboundedSender<String>,
    pub(crate) tools: Arc<tokio::sync::RwLock<Option<Vec<Value>>>>,
}

#[derive(Debug)]
pub struct PendingRequest {
    pub(crate) sender: oneshot::Sender<Value>,
}
