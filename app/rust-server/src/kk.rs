use rmcp::handler::server::tool::ToolCallContext;
use rmcp::model::{CallToolRequestParam, CallToolResult, ErrorCode, Implementation, JsonObject, ListToolsResult, PaginatedRequestParam, ProtocolVersion, ServerCapabilities, ServerInfo, Tool};
use rmcp::{ErrorData, RoleServer, ServerHandler};
use rmcp::serde_json::from_str;
use rmcp::service::RequestContext;
use rmcp::transport::sse_server::{SseServer, SseServerConfig};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[derive(Clone, Default)]
pub struct MyServer;

impl ServerHandler for MyServer {
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
            instructions: Some("My MCP Server.".to_string()),
        }
    }
}

async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "debug".to_string().into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = SseServerConfig {
        bind: "127.0.0.1:12308".parse()?,
        sse_path: "/sse".to_string(),
        post_path: "/message".to_string(),
        ct: tokio_util::sync::CancellationToken::new(),
        sse_keep_alive: None,
    };

    let (sse_server, router) = SseServer::new(config);

    // Do something with the router, e.g., add routes or middleware

    let listener = tokio::net::TcpListener::bind(sse_server.config.bind).await?;

    let ct = sse_server.config.ct.child_token();

    let server = axum::serve(listener, router).with_graceful_shutdown(async move {
        ct.cancelled().await;
        tracing::info!("sse server cancelled");
    });

    tokio::spawn(async move {
        if let Err(e) = server.await {
            tracing::error!(error = %e, "sse server shutdown with error");
        }
    });

    let ct = sse_server.with_service(MyServer::default);

    tokio::signal::ctrl_c().await?;
    ct.cancel();
    Ok(())
}
