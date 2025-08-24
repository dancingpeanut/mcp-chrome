use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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

