#!/usr/bin/env python3
"""
Python HTTP Server for Chrome Extension
Replaces Native Host and MCP Server functionality
Supports both HTTP API and Server-Sent Events (SSE) for bidirectional communication
"""
from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response, PlainTextResponse
from starlette.requests import Request
from starlette.routing import Route
from starlette.middleware.cors import CORSMiddleware
import json
import logging
from typing import Dict, Any, List
import uuid
from dataclasses import dataclass
from datetime import datetime
from sse_starlette.sse import EventSourceResponse
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

MESSAGE_TYPE_CONNECTED = "connected"
MESSAGE_TYPE_KEEPALIVE = "keepalive"
MESSAGE_TYPE_OP = "op"

OP_TYPE_GET_TOOLS = "get_tools"
OP_TYPE_CALL_TOOL = "call_tool"


@dataclass
class ClientExtension:
    client_id: str
    msg_queue: asyncio.Queue
    tools: List[Dict[str, Any]] = None


class ChromeExtensionServer:
    def __init__(self):
        self.tools = {}
        self.sse_clients: Dict[str, ClientExtension] = {}  # client_id: asyncio.Queue
        self.pending_requests = {}

    async def add_sse_client(self, client: ClientExtension):
        self.sse_clients[client.client_id] = client
        logger.info(f"SSE client connected: {client.client_id}. Total clients: {len(self.sse_clients)}")

    async def remove_sse_client(self, client_id):
        if client_id in self.sse_clients:
            del self.sse_clients[client_id]
            logger.info(f"SSE client disconnected: {client_id}. Total clients: {len(self.sse_clients)}")

    async def broadcast_to_chrome(self, message_type: str, payload: Any, request_id: str = None, client_id: str = None):
        """Broadcast or send message to specific Chrome client(s) via SSE"""
        message = {
            "type": message_type,
            "payload": payload,
            "timestamp": datetime.now().isoformat(),
            "requestId": request_id
        }
        message_str = json.dumps(message)
        logger.info(f"Broadcasting to Chrome: {json.dumps(message, indent=2, ensure_ascii=False)}")
        disconnected_clients = []
        client = self.sse_clients.get(client_id)
        if client:
            try:
                await client.msg_queue.put(message_str)
                logger.info(f"Message sent to client {client_id}")
            except Exception as e:
                logger.error(f"Failed to send message to client {client_id}: {e}")
                disconnected_clients.append(client_id)
        else:
            logger.info(f"Client {client_id} not found. Broadcasting to nothing.")
        for cid in disconnected_clients:
            await self.remove_sse_client(cid)
        logger.info(f"Broadcast completed. Sent to client {client_id}")

    async def request_from_chrome(self, client_id: str, op_type: str, payload: Any, timeout: int = 30) -> Any:
        request_id = str(uuid.uuid4())
        response_event = asyncio.Event()
        response_data = {"success": False, "error": "Timeout"}
        def response_handler(response):
            nonlocal response_data
            response_data = response
            response_event.set()
        self.pending_requests[request_id] = response_handler
        await self.broadcast_to_chrome(MESSAGE_TYPE_OP, {
            "type": op_type,
            "payload": payload
        }, request_id, client_id=client_id)
        logger.info(f"Waiting for Chrome response (timeout: {timeout}s)...")
        try:
            await asyncio.wait_for(response_event.wait(), timeout=timeout)
            return response_data
        except asyncio.TimeoutError:
            logger.warning(f"Request timeout after {timeout}s")
            if request_id in self.pending_requests:
                del self.pending_requests[request_id]
            return {"success": False, "error": "Request timeout"}

    def handle_chrome_response(self, request_id: str, response: Any):
        logger.info(f"Received response from Chrome:")
        logger.info(f"   Request ID: {request_id}")
        logger.info(f"   Response: {json.dumps(response, indent=2)}")
        if request_id in self.pending_requests:
            handler = self.pending_requests[request_id]
            handler(response)
            del self.pending_requests[request_id]
            logger.info(f"Response handled for request {request_id}")
        else:
            logger.warning(f"No pending request found for ID: {request_id}")

    async def get_tools_from_chrome(self, client_id: str) -> Dict[str, Any]:
        logger.info(f"Requesting tools from Chrome extension... {client_id}")
        try:
            response = await self.request_from_chrome(client_id, OP_TYPE_GET_TOOLS, {})
            if response.get("success"):
                tools = response.get("data", {})
                logger.info(f"Successfully received {len(tools)} tools from Chrome")
                return tools
            else:
                logger.error(f"Failed to get tools from Chrome: {response.get('error')}")
                return {}
        except Exception as e:
            logger.error(f"Error getting tools from Chrome: {e}")
            return {}

    async def call_chrome_tool(self, client_id: str, tool_name: str, args: Any) -> Dict[str, Any]:
        logger.info(f"Calling Chrome tool: {tool_name}")
        logger.info(f"   Arguments: {json.dumps(args, indent=2)}")
        try:
            response = await self.request_from_chrome(client_id, OP_TYPE_CALL_TOOL, {
                "name": tool_name,
                "args": args
            })
            if response.get("success"):
                logger.info(f"Chrome tool {tool_name} executed successfully")
                logger.info(f"   Result: {json.dumps(response.get('data', {}), indent=2)}")
            else:
                logger.error(f"Chrome tool {tool_name} failed: {response.get('error')}")
            return response
        except Exception as e:
            logger.error(f"Error calling Chrome tool {tool_name}: {e}")
            return {"success": False, "error": str(e)}

# Global server instance
server = ChromeExtensionServer()

# SSE endpoint for Chrome extension to connect
async def _sse(request: Request):
    client_id = request.query_params.get('client_id')
    if not client_id:
        return PlainTextResponse('Missing client_id', status_code=400)
    client_queue = asyncio.Queue()
    client = ClientExtension(client_id=client_id, msg_queue=client_queue)
    await server.add_sse_client(client)
    async def event_generator():
        try:
            yield json.dumps({'type': MESSAGE_TYPE_CONNECTED, 'message': 'SSE connection established', 'client_id': client_id})
            while True:
                try:
                    message = await asyncio.wait_for(client_queue.get(), timeout=30)
                    yield message
                except asyncio.TimeoutError:
                    yield json.dumps({'type': MESSAGE_TYPE_KEEPALIVE, 'timestamp': datetime.now().isoformat(), 'client_id': client_id})
        except asyncio.CancelledError:
            await server.remove_sse_client(client_id)
        except Exception as e:
            logger.error(f"SSE error: {e}")
            await server.remove_sse_client(client_id)
    return EventSourceResponse(event_generator())

# Endpoint for Chrome extension to send responses
async def chrome_response(request: Request):
    try:
        data = await request.json()
        if not data:
            logger.warning("Chrome response endpoint: No data provided")
            return JSONResponse({"success": False, "error": "No data provided"}, status_code=400)
        request_id = data.get('requestId')
        response_data = data.get('response', {})
        if request_id:
            server.handle_chrome_response(request_id, response_data)
            return JSONResponse({"success": True, "message": "Response received"})
        else:
            logger.warning("Chrome response endpoint: No request ID provided")
            return JSONResponse({"success": False, "error": "No request ID provided"}, status_code=400)
    except Exception as e:
        logger.error(f"Chrome response endpoint: Failed to handle Chrome response: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

async def list_tools(request: Request):
    client_id = request.query_params.get('client_id')
    if not client_id:
        return JSONResponse({
            "success": False,
            "error": "Missing client_id"
        }, status_code=400)
    if not server.sse_clients.get(client_id):
        return JSONResponse({
            "success": False,
            "error": "Client not connected"
        }, status_code=400)
    try:
        tools = await server.get_tools_from_chrome(client_id)
        return JSONResponse({
            "success": True,
            "data": tools
        })
    except Exception as e:
        logger.error(f"Failed to list tools: {e}")
        return JSONResponse({
            "success": False,
            "error": str(e)
        }, status_code=500)

async def call_tool(request: Request):
    client_id = request.query_params.get('client_id')
    if not client_id:
        return JSONResponse({
            "success": False,
            "error": "Missing client_id"
        }, status_code=400)
    if not server.sse_clients.get(client_id):
        return JSONResponse({
            "success": False,
            "error": "Client not connected"
        }, status_code=400)
    try:
        tool_name = 'chrome_navigate'
        tool_args = {
            "url": "https://www.baidu.com/",
            "newWindow": False,
        }
        result = await server.call_chrome_tool(client_id, tool_name, tool_args)
        return JSONResponse({
            "success": True,
            "data": result
        })
    except Exception as e:
        logger.error(f"Failed to list tools: {e}")
        return JSONResponse({
            "success": False,
            "error": str(e)
        }, status_code=500)

routes = [
    Route('/_sse', _sse),
    Route('/api/chrome/response', chrome_response, methods=["POST"]),
    Route('/api/tool/list', list_tools, methods=["GET"]),
    Route('/api/tool/call', call_tool, methods=["GET"]),
]

app = Starlette(debug=True, routes=routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

if __name__ == '__main__':
    import argparse
    import uvicorn
    parser = argparse.ArgumentParser(description='Chrome Extension Python Server')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=12306, help='Port to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    args = parser.parse_args()
    uvicorn.run("server:app", host=args.host, port=args.port, reload=args.debug)
