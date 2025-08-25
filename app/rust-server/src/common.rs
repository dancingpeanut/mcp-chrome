use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

// Data structures

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub request_id: Option<String>,
    pub(crate) success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

impl <T> ApiResponse<T> {

    pub fn new() -> Self {
        Self {
            request_id: Some(Uuid::new_v4().to_string()),
            success: true,
            data: None,
            error: None,
        }
    }

    pub fn new_with_request_id(request_id: String) -> Self {
        Self {
            request_id: Some(request_id),
            success: true,
            data: None,
            error: None,
        }
    }

    pub fn with_success(mut self, data: T) -> Self {
        self.success = true;
        self.data = Some(data);
        self
    }

    pub fn with_error(mut self, error: String) -> Self {
        self.success = false;
        self.error = Some(error);
        self
    }

    pub fn success(data: T) -> Self {
        Self::new().with_success(data)
    }

    pub fn error(error: String) -> Self {
        Self::new().with_error(error)
    }
}

pub enum MessageType {
    Connected,
    GetTools,
    CallTool(String, Option<Value>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseMessage {
    message_type: String,
    payload: Option<Value>,
    timestamp: DateTime<Utc>,
    pub(crate) request_id: String,
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
                payload: Some(json!({
                    "name": name,
                    "args": args
                })),
                timestamp,
                request_id,
            },
        }
    }
}
