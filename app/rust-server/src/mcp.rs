use http::request::Parts;
use rmcp::handler::server::tool::ToolCallContext;
use rmcp::model::{CallToolRequestParam, CallToolResult, ErrorCode, Implementation, JsonObject, ListToolsResult, PaginatedRequestParam, ProtocolVersion, ServerCapabilities, ServerInfo, Tool};
use rmcp::{ErrorData, RoleServer, ServerHandler};
use rmcp::serde_json::from_str;
use rmcp::service::RequestContext;
use crate::proxy::ProxyState;

#[derive(Clone)]
pub struct ChromeExtensionServer {
    state: ProxyState
}

impl ChromeExtensionServer {
    pub fn new(state: ProxyState) -> Self {
        Self { state }
    }

    pub fn get_client_id<'a>(&self, context: &'a RequestContext<RoleServer>) -> Result<&'a str, ErrorData> {
        if let Some(parts) = context.extensions.get::<Parts>() {
            let client_id = parts.headers.get("client_id")
                .ok_or_else(|| ErrorData::new(ErrorCode::INVALID_REQUEST, "No client_id".to_string(), None))?
                .to_str().map_err(|_| ErrorData::new(ErrorCode::INVALID_REQUEST, "Invalid client_id".to_string(), None))?;
            Ok(client_id)
        } else {
            Err(ErrorData::new(ErrorCode::INVALID_REQUEST, "No client_id".to_string(), None))
        }
    }
}

impl ServerHandler for ChromeExtensionServer {
    async fn call_tool(
        &self,
        request: CallToolRequestParam,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let tcc = ToolCallContext::new(self, request, context);
        // self.tool_router.call(tcc).await
        println!("call tool: {}, {:?}", tcc.name, tcc.arguments);
        Err(ErrorData::new(ErrorCode(1), "test".to_string(), None))
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        let parts = _context.extensions.get::<Parts>();
        tracing::info!("=== parts {:?}", parts);

        let client_id = self.get_client_id(&_context)?;
        let tools = self.state.get_tools(client_id).await
            .map_err(|e| ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), None))?;

        tracing::info!("Listing tools: {:?}", tools);

        let input_schema = from_str::<JsonObject>(r#"
        {
            "type": "object",
            "properties": {},
            "required": []
        }
        "#).expect("Failed to parse input schema");
        let tool = Tool::new("test", "Test tool", input_schema);
        // let items = self.tool_router.list_all();
        Ok(ListToolsResult::with_all_items(vec![tool]))
    }

    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .build(),
            server_info: Implementation::from_build_env(),
            instructions: Some("Chrome Extension MCP Server.".to_string()),
        }
    }
}
