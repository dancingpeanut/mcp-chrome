use rmcp::handler::server::tool::ToolCallContext;
use rmcp::model::{CallToolRequestParam, CallToolResult, ErrorCode, Implementation, JsonObject, ListToolsResult, PaginatedRequestParam, ProtocolVersion, ServerCapabilities, ServerInfo, Tool};
use rmcp::{ErrorData, RoleServer, ServerHandler};
use rmcp::serde_json::from_str;
use rmcp::service::RequestContext;
use crate::proxy::ProxyState;

#[derive(Clone, Default)]
pub struct ChromeExtensionServer;

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
        context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        let state = context.extensions.get::<ProxyState>();
        tracing::info!("-- {:?}", state.is_some());

        tracing::info!("Listing tools");
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
