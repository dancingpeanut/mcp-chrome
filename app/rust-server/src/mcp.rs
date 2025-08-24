use http::request::Parts;
use rmcp::handler::server::tool::ToolCallContext;
use rmcp::model::{CallToolRequestParam, CallToolResult, ErrorCode, Implementation, JsonObject, ListToolsResult, PaginatedRequestParam, ProtocolVersion, ServerCapabilities, ServerInfo, Tool};
use rmcp::{ErrorData, RoleServer, ServerHandler};
use rmcp::service::RequestContext;
use serde::{Deserialize, Serialize};
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
        let client_id = self.get_client_id(&_context)?;
        let tools = self.state.get_tools(client_id).await
            .map_err(|e| ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), None))?;

        let converted_tools: Vec<ToolConverted> = serde_json::from_str(&serde_json::to_string(&tools).unwrap()).unwrap();

        let mut tools = vec![];
        for tool_c in converted_tools {
            let tool = Tool::new(tool_c.name, tool_c.description, tool_c.input_schema);
            tools.push(tool);
        }

        // let items = self.tool_router.list_all();
        Ok(ListToolsResult::with_all_items(tools))
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

#[derive(Debug, Deserialize, Serialize)]
pub struct ToolConverted {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: JsonObject,
}
