/**
 * Python Server SSE Client for Chrome Extension
 * Handles Server-Sent Events connection and bidirectional communication
 */

import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { handleCallTool } from './tools';
import { ICONS, NOTIFICATIONS, STORAGE_KEYS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '@/common/constants';
import { v4 as uuidv4 } from 'uuid';

// 获取或生成唯一client_id
function getOrCreateClientId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['python_sse_client_id'], (result) => {
      let clientId = result.python_sse_client_id;
      if (!clientId) {
        clientId = uuidv4();
        chrome.storage.local.set({ python_sse_client_id: clientId }, () => {
          resolve(clientId);
        });
      } else {
        resolve(clientId);
      }
    });
  });
}

interface SSEMessage {
  type: string;
  payload: any;
  timestamp: string;
  requestId?: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId: NodeJS.Timeout;
}

let sseClientInitialized = false;

class PythonSSEClient {
  private eventSource: EventSource | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingRequests = new Map<string, PendingRequest>();
  private serverUrl = 'http://127.0.0.1:12306';
  private tools: Map<string, any> = new Map();
  private clientId: string | null = null;

  constructor() {
    this.initializeTools();
  }

  private initializeTools() {
    // Import and register all available tools
    import('./tools/browser').then((browserTools) => {
      Object.entries(browserTools).forEach(([name, tool]) => {
        if (tool && typeof tool === 'object' && 'name' in tool) {
          this.tools.set(tool.name, tool);
        }
      });
      console.log(`PythonSSEClient: Initialized ${this.tools.size} tools`);
    }).catch((error) => {
      console.error('PythonSSEClient: Failed to initialize tools:', error);
    });
  }

  /**
   * Connect to Python server via SSE
   */
  async connect(): Promise<boolean> {
    // 先断开已有连接，确保只有一个SSE连接
    if (this.eventSource) {
      this.disconnect();
    }
    if (this.isConnected) {
      // 已经连接，无需重复连接
      return true;
    }
    try {
      // 获取client_id
      if (!this.clientId) {
        this.clientId = await getOrCreateClientId();
      }
      const sseUrl = `${this.serverUrl}/sse?client_id=${encodeURIComponent(this.clientId)}`;
      console.log(`PythonSSEClient: Connecting to ${sseUrl}`);
      this.eventSource = new EventSource(sseUrl);
      this.eventSource.onopen = () => {
        console.log('PythonSSEClient: SSE connection opened');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.broadcastConnectionStatus(true);
      };
      this.eventSource.onmessage = (event) => {
        this.handleSSEMessage(event);
      };
      this.eventSource.onerror = (error) => {
        console.error('PythonSSEClient: SSE connection error:', error);
        this.handleConnectionError();
      };
      return true;
    } catch (error) {
      console.error('PythonSSEClient: Failed to connect:', error);
      return false;
    }
  }

  /**
   * Disconnect from Python server
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
    this.broadcastConnectionStatus(false);
    console.log('PythonSSEClient: Disconnected from Python server');
  }

  /**
   * Handle SSE messages from Python server
   */
  private handleSSEMessage(event: MessageEvent): void {
    try {
      const message: SSEMessage = JSON.parse(event.data);
      console.log('📨 PythonSSEClient: Received SSE message:', message);

      switch (message.type) {
        case 'connected':
          console.log('✅ PythonSSEClient: SSE connection confirmed');
          break;

        case 'keepalive':
          // Handle keepalive - no action needed
          console.log('💓 PythonSSEClient: Received keepalive message');
          break;

        case 'op':
          console.log('🔔 PythonSSEClient: Python server requesting data:', message);
          this.handlePythonRequest(message);
          break;

        default:
          console.log('❓ PythonSSEClient: Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('❌ PythonSSEClient: Failed to parse SSE message:', error);
    }
  }

  /**
   * Handle requests from Python server
   */
  private async handlePythonRequest(message: SSEMessage): Promise<void> {
    const requestId = message.requestId;
    const requestType = message.payload?.type;
    const requestPayload = message.payload?.payload;

    console.log('   Full Message:', message);

    try {
      let response: any;

      switch (requestType) {
        case 'get_tools':
          console.log('🛠️ PythonSSEClient: Python requesting tools list');
          response = await this.getToolsResponse();
          break;

        case 'call_tool':
          console.log('🚀 PythonSSEClient: Python requesting tool execution:', requestPayload);
          response = await this.callToolResponse(requestPayload);
          break;

        default:
          console.log('❓ PythonSSEClient: Unknown request type from Python:', requestType);
          response = {
            success: false,
            error: `Unknown request type: ${requestType}`
          };
      }

      console.log('📤 PythonSSEClient: Sending response to Python:', response);

      // Send response back to Python server
      if (requestId) {
        await this.sendResponseToPython(requestId, response);
      } else {
        console.warn('⚠️ PythonSSEClient: No request ID provided, cannot send response');
      }

    } catch (error) {
      console.error('❌ PythonSSEClient: Failed to handle Python request:', error);
      const errorResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.log('📤 PythonSSEClient: Sending error response to Python:', errorResponse);
      if (requestId) {
        await this.sendResponseToPython(requestId, errorResponse);
      }
    }
  }

  /**
   * Get tools response for Python server
   */
  private async getToolsResponse(): Promise<any> {
    const toolsList = Array.from(this.tools.keys());
    return {
      success: true,
      data: {
        tools: toolsList,
        count: toolsList.length,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Call tool response for Python server
   */
  private async callToolResponse(payload: any): Promise<any> {
    const toolName = payload?.name;
    const args = payload?.args;

    if (!toolName) {
      return {
        success: false,
        error: 'Tool name not specified'
      };
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found`
      };
    }

    try {
      const result = await tool.execute(args);
      return {
        success: true,
        data: result,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Send response to Python server
   */
  private async sendResponseToPython(requestId: string, response: any): Promise<void> {
    try {
      const responseData = {
        requestId,
        response
      };

      console.log('📤 PythonSSEClient: Sending response to Python server:');
      console.log('   Request ID:', requestId);
      console.log('   Response Data:', responseData);
      console.log('   Target URL:', `${this.serverUrl}/api/chrome/response`);

      const fetchResponse = await fetch(`${this.serverUrl}/api/chrome/response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(responseData)
      });

      if (!fetchResponse.ok) {
        throw new Error(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`);
      }

      const result = await fetchResponse.json();
      console.log('✅ PythonSSEClient: Response sent successfully to Python server');
      console.log('   Server response:', result);
    } catch (error) {
      console.error('❌ PythonSSEClient: Failed to send response to Python server:', error);
    }
  }

  /**
   * Send message to Python server
   */
  async sendMessageToPython(type: string, payload: any): Promise<boolean> {
    try {
      const messageData = {
        type,
        payload
      };

      console.log('📤 PythonSSEClient: Sending message to Python server:');
      console.log('   Message Type:', type);
      console.log('   Payload:', payload);
      console.log('   Target URL:', `${this.serverUrl}/api/chrome/message`);

      const response = await fetch(`${this.serverUrl}/api/chrome/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ PythonSSEClient: Message sent successfully to Python server');
      console.log('   Server response:', result);
      return result.success;
    } catch (error) {
      console.error('❌ PythonSSEClient: Failed to send message to Python server:', error);
      return false;
    }
  }

  /**
   * Handle connection errors and attempt reconnection
   */
  private handleConnectionError(): void {
    this.isConnected = false;
    this.broadcastConnectionStatus(false);

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`PythonSSEClient: Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('PythonSSEClient: Max reconnection attempts reached');
      this.showConnectionErrorNotification();
    }
  }

  /**
   * Show connection error notification
   */
  private showConnectionErrorNotification(): void {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: ICONS.NOTIFICATION, // 使用现有的通知图标
      title: 'Python Server Connection Failed',
      message: 'Failed to connect to Python server after multiple attempts'
    });
  }

  /**
   * Broadcast connection status to other parts of the extension
   */
  private broadcastConnectionStatus(connected: boolean): void {
    chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.PYTHON_SSE_STATUS_CHANGED,
      payload: {
        connected,
        timestamp: Date.now()
      }
    }).catch(() => {
      // Ignore errors if no listeners are present
    });
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get available tools
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }
}

// Create global instance
export const pythonSSEClient = new PythonSSEClient();

/**
 * Initialize Python SSE client
 */
export const initPythonSSEClient = () => {
  if (sseClientInitialized) return;
  sseClientInitialized = true;
  // Auto-connect on startup
  pythonSSEClient.connect().then((success) => {
    if (success) {
      console.log('PythonSSEClient: Auto-connection successful');
    } else {
      console.log('PythonSSEClient: Auto-connection failed');
    }
  });

  // Handle messages from other parts of the extension
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CONNECT_PYTHON_SSE') {
      pythonSSEClient.connect().then((success) => {
        sendResponse({ success });
      });
      return true;
    }

    if (message.type === 'DISCONNECT_PYTHON_SSE') {
      pythonSSEClient.disconnect();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'GET_PYTHON_SSE_STATUS') {
      sendResponse({
        success: true,
        connected: pythonSSEClient.getConnectionStatus()
      });
      return true;
    }

    if (message.type === 'SEND_MESSAGE_TO_PYTHON') {
      const { type, payload } = message;
      pythonSSEClient.sendMessageToPython(type, payload).then((success) => {
        sendResponse({ success });
      });
      return true;
    }

    if (message.type === 'GET_PYTHON_TOOLS') {
      sendResponse({
        success: true,
        tools: pythonSSEClient.getAvailableTools()
      });
      return true;
    }
  });
};
