#!/usr/bin/env python3
"""
Python HTTP Server for Chrome Extension
Replaces Native Host and MCP Server functionality
Supports both HTTP API and Server-Sent Events (SSE) for bidirectional communication
"""
from flask import Flask, request, jsonify, Response, stream_template
from flask_cors import CORS
import json
import logging
import threading
import time
from typing import Dict, Any, Optional, List
import os
import sys
import uuid
from datetime import datetime
import queue

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



app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

class ChromeExtensionServer:
    def __init__(self):
        self.tools = {}
        self.sse_clients = {}  # client_id: queue
        self.pending_requests = {}
        self.request_queue = queue.Queue()

    def add_sse_client(self, client_id, client_queue):
        self.sse_clients[client_id] = client_queue
        logger.info(f"SSE client connected: {client_id}. Total clients: {len(self.sse_clients)}")

    def remove_sse_client(self, client_id):
        if client_id in self.sse_clients:
            del self.sse_clients[client_id]
            logger.info(f"SSE client disconnected: {client_id}. Total clients: {len(self.sse_clients)}")

    def broadcast_to_chrome(self, message_type: str, payload: Any, request_id: str = None, client_id: str = None):
        """Broadcast or send message to specific Chrome client(s) via SSE"""
        message = {
            "type": message_type,
            "payload": payload,
            "timestamp": datetime.now().isoformat(),
            "requestId": request_id
        }
        message_str = f"data: {json.dumps(message)}\n\n"
        logger.info(f"Broadcasting to Chrome: {json.dumps(message, indent=2, ensure_ascii=False)}")
        disconnected_clients = []
        if client_id:
            client_queue = self.sse_clients.get(client_id)
            if client_queue:
                try:
                    client_queue.put(message_str)
                    logger.info(f"Message sent to client {client_id}")
                except Exception as e:
                    logger.error(f"Failed to send message to client {client_id}: {e}")
                    disconnected_clients.append(client_id)
        else:
            for cid, client_queue in self.sse_clients.items():
                try:
                    client_queue.put(message_str)
                    logger.info(f"Message sent to client {cid}")
                except Exception as e:
                    logger.error(f"Failed to send message to client {cid}: {e}")
                    disconnected_clients.append(cid)
        for cid in disconnected_clients:
            self.remove_sse_client(cid)
        logger.info(f"Broadcast completed. Sent to client {client_id}")

    def request_from_chrome(self, client_id: str, op_type: str, payload: Any, timeout: int = 30) -> Any:
        request_id = str(uuid.uuid4())
        response_event = threading.Event()
        response_data = {"success": False, "error": "Timeout"}
        def response_handler(response):
            nonlocal response_data
            response_data = response
            response_event.set()
        self.pending_requests[request_id] = response_handler
        self.broadcast_to_chrome(MESSAGE_TYPE_OP, {
            "type": op_type,
            "payload": payload
        }, request_id, client_id=client_id)
        logger.info(f"Waiting for Chrome response (timeout: {timeout}s)...")
        if response_event.wait(timeout):
            return response_data
        else:
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

    def get_tools_from_chrome(self, client_id: str) -> Dict[str, Any]:
        logger.info(f"Requesting tools from Chrome extension... {client_id}")
        try:
            response = self.request_from_chrome(client_id, OP_TYPE_GET_TOOLS, {})
            if response.get("success"):
                tools = response.get("data", {})
                logger.info(f"Successfully received {len(tools.get('tools', []))} tools from Chrome")
                return tools
            else:
                logger.error(f"Failed to get tools from Chrome: {response.get('error')}")
                return {}
        except Exception as e:
            logger.error(f"Error getting tools from Chrome: {e}")
            return {}

    def call_chrome_tool(self, client_id: str, tool_name: str, args: Any) -> Dict[str, Any]:
        logger.info(f"Calling Chrome tool: {tool_name}")
        logger.info(f"   Arguments: {json.dumps(args, indent=2)}")
        try:
            response = self.request_from_chrome(client_id, OP_TYPE_CALL_TOOL, {
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
@app.route('/sse')
def sse():
    """Server-Sent Events endpoint for Chrome extension"""
    client_id = request.args.get('client_id')
    if not client_id:
        return Response('Missing client_id', status=400)
    def generate():
        client_queue = queue.Queue()
        server.add_sse_client(client_id, client_queue)
        try:
            yield f"data: {json.dumps({'type': MESSAGE_TYPE_CONNECTED, 'message': 'SSE connection established', 'client_id': client_id})}\n\n"
            while True:
                try:
                    message = client_queue.get(timeout=30)
                    yield message
                except queue.Empty:
                    yield f"data: {json.dumps({'type': MESSAGE_TYPE_KEEPALIVE, 'timestamp': datetime.now().isoformat(), 'client_id': client_id})}\n\n"
        except GeneratorExit:
            server.remove_sse_client(client_id)
        except Exception as e:
            logger.error(f"SSE error: {e}")
            server.remove_sse_client(client_id)
    return Response(generate(), mimetype='text/event-stream')

# Endpoint for Chrome extension to send responses
@app.route('/api/chrome/response', methods=['POST'])
def chrome_response():
    """Handle response from Chrome extension"""
    try:
        data = request.get_json()
        if not data:
            logger.warning("Chrome response endpoint: No data provided")
            return jsonify({"success": False, "error": "No data provided"}), 400
        
        request_id = data.get('requestId')
        response_data = data.get('response', {})

        if request_id:
            server.handle_chrome_response(request_id, response_data)
            return jsonify({"success": True, "message": "Response received"})
        else:
            logger.warning("Chrome response endpoint: No request ID provided")
            return jsonify({"success": False, "error": "No request ID provided"}), 400
        
    except Exception as e:
        logger.error(f"Chrome response endpoint: Failed to handle Chrome response: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/tool/list', methods=['GET'])
def list_tools():
    """List all available tools (both local and Chrome)"""
    client_id = request.args.get('client_id')
    if not client_id:
        return jsonify({
            "success": False,
            "error": "Missing client_id"
            }), 400
    if not server.sse_clients.get(client_id):
        return jsonify({
            "success": False,
            "error": "Client not connected"
            }), 400

    try:
        # Get tools from Chrome
        tools = server.get_tools_from_chrome(client_id)
        
        return jsonify({
            "success": True,
            "data": tools
        })
    except Exception as e:
        logger.error(f"Failed to list tools: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/tool/call', methods=['GET'])
def call_tool():
    """List all available tools (both local and Chrome)"""
    client_id = request.args.get('client_id')
    if not client_id:
        return jsonify({
            "success": False,
            "error": "Missing client_id"
            }), 400
    if not server.sse_clients.get(client_id):
        return jsonify({
            "success": False,
            "error": "Client not connected"
            }), 400

    try:
        tool_name = 'chrome_navigate'
        tool_args = {
            "url": "https://www.baidu.com/",
            "newWindow": False,
        }
        result = server.call_chrome_tool(client_id, tool_name, tool_args)

        return jsonify({
            "success": True,
            "data": result
        })
    except Exception as e:
        logger.error(f"Failed to list tools: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Chrome Extension Python Server')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=12306, help='Port to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    
    args = parser.parse_args()
    
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)
