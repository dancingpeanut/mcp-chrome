/**
 * Cloud Server SSE Client for Chrome Extension
 * Handles Server-Sent Events connection and bidirectional communication
 */

import { TOOL_SCHEMAS } from 'chrome-mcp-shared';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { handleCallTool } from './tools';
import { ICONS, NOTIFICATIONS, STORAGE_KEYS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '@/common/constants';
import { v4 as uuidv4 } from 'uuid';

// 默认服务器URL
const DEFAULT_SERVER_URL = 'http://127.0.0.1:10824';

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
  message_type: string;
  payload: any;
  timestamp: string;
  request_id?: string;
}

let sseClientInitialized = false;

class CloudSSEClient {
  private eventSource: EventSource | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private serverUrl = DEFAULT_SERVER_URL;
  private tools: Map<string, any> = new Map();
  private clientId: string | null = null;

  constructor() {
    this.initializeTools();
    this.loadServerUrlFromStorage();
  }

  /**
   * 从存储中加载服务器URL
   */
  private async loadServerUrlFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.PYTHON_SSE_SERVER_URL]);
      if (result[STORAGE_KEYS.PYTHON_SSE_SERVER_URL]) {
        this.serverUrl = result[STORAGE_KEYS.PYTHON_SSE_SERVER_URL];
        console.log(`CloudSSEClient: Loaded server URL from storage: ${this.serverUrl}`);
      }
    } catch (error) {
      console.warn('CloudSSEClient: Failed to load server URL from storage, using default:', error);
    }
  }

  /**
   * 更新服务器URL
   */
  async updateServerUrl(newUrl: string): Promise<boolean> {
    try {
      // 验证URL格式
      const url = new URL(newUrl);
      if (!url.protocol || !url.hostname) {
        throw new Error('Invalid URL format');
      }

      // 保存到存储
      await chrome.storage.local.set({ [STORAGE_KEYS.PYTHON_SSE_SERVER_URL]: newUrl });
      
      // 更新内存中的URL
      this.serverUrl = newUrl;
      
      console.log(`CloudSSEClient: Server URL updated to: ${newUrl}`);
      
      // 注意：现在只允许在断开状态下更新，所以不需要重新连接逻辑
      
      return true;
    } catch (error) {
      console.error('CloudSSEClient: Failed to update server URL:', error);
      return false;
    }
  }

  /**
   * 获取当前服务器URL
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * 获取MCP地址
   */
  getMCPUrl(): string {
    if (!this.clientId) {
      throw new Error('Client ID not available');
    }
    return `${this.serverUrl}/${this.clientId}/mcp`;
  }

  /**
   * 获取客户端ID
   */
  getClientId(): string | null {
    return this.clientId;
  }

  private initializeTools() {
    // Import and register all available tools
    import('./tools/browser').then((browserTools) => {
      Object.entries(browserTools).forEach(([name, tool]) => {
        if (tool && typeof tool === 'object' && 'name' in tool) {
          this.tools.set(tool.name, tool);
        }
      });
      console.log(`CloudSSEClient: Initialized ${this.tools.size} tools`);
    }).catch((error) => {
      console.error('CloudSSEClient: Failed to initialize tools:', error);
    });
  }

  /**
   * Connect to Cloud server via SSE
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
      const sseUrl = `${this.serverUrl}/_sse?client_id=${encodeURIComponent(this.clientId)}`;
      console.log(`CloudSSEClient: Connecting to ${sseUrl}`);
      this.eventSource = new EventSource(sseUrl);
      this.eventSource.onopen = () => {
        console.log('CloudSSEClient: SSE connection opened');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.broadcastConnectionStatus(true);
      };
      this.eventSource.onmessage = (event) => {
        this.handleSSEMessage(event);
      };
      this.eventSource.onerror = (error) => {
        console.error('CloudSSEClient: SSE connection error:', error);
        this.handleConnectionError();
      };
      return true;
    } catch (error) {
      console.error('CloudSSEClient: Failed to connect:', error);
      return false;
    }
  }

  /**
   * Disconnect from Cloud server
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
    this.broadcastConnectionStatus(false);
    console.log('CloudSSEClient: Disconnected from Cloud server');
  }

  /**
   * Handle SSE messages from Cloud server
   */
  private async handleSSEMessage(event: MessageEvent): Promise<void> {
    console.log('Received SSE message:', event.data);
    if (event.data === 'heartbeat') {
      return
    }
    try {
      const message: SSEMessage = JSON.parse(event.data);
      const requestId = message.request_id;
      const requestPayload = message.payload;

      try {
        let result: any;

        switch (message.message_type) {
          case 'connected':
            console.log('✅ CloudSSEClient: SSE connection confirmed');
            return;

          case 'get_tools':
            console.log('🛠️ CloudSSEClient: Cloud requesting tools list');
            result = await this.getToolsResponse();
            break;

          case 'call_tool':
            console.log('🚀 CloudSSEClient: Cloud requesting tool execution:', requestPayload);
            result = await this.callToolResponse(requestPayload);
            break;

          default:
            console.log('❓ CloudSSEClient: Unknown message type from Cloud:', message.message_type);
            throw new Error(`Unknown message type: ${message.message_type}`);
        }

        console.log('📤 CloudSSEClient: Sending response to Cloud:', result);

        // Send response back to Cloud server
        if (requestId) {
          await this.sendResponseToCloud(requestId, true, result, "");
        } else {
          console.warn('⚠️ CloudSSEClient: No request ID provided, cannot send response');
        }

      } catch (error) {
        console.error('❌ CloudSSEClient: Failed to handle Cloud request:', error);
        if (requestId) {
          await this.sendResponseToCloud(requestId, false, null, String(error));
        }
      }
    } catch (error) {
      console.error('❌ CloudSSEClient: Failed to parse SSE message:', error);
    }
  }

  /**
   * Get tools response for Cloud server
   */
  private async getToolsResponse(): Promise<any> {
    console.log(TOOL_SCHEMAS);
    return TOOL_SCHEMAS;
  }

  /**
   * Call tool response for Cloud server
   */
  private async callToolResponse(payload: any): Promise<any> {
    console.log('🚀 CloudSSEClient: Calling tool:', payload)
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
   * Send response to Cloud server
   */
  private async sendResponseToCloud(request_id: string, success: boolean, data: any, error: string): Promise<void> {
    try {
      const responseData = {
        success,
        request_id,
        data,
        error
      };

      console.log('📤 CloudSSEClient: Sending response to Cloud server:', responseData);

      const fetchResponse = await fetch(`${this.serverUrl}/api/client/response`, {
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
      console.log('✅ CloudSSEClient: Response sent successfully to Cloud server');
      console.log('   Server response:', result);
    } catch (error) {
      console.error('❌ CloudSSEClient: Failed to send response to Cloud server:', error);
    }
  }

  /**
   * Send message to Cloud server
   */
  async sendMessageToCloud(type: string, payload: any): Promise<boolean> {
    try {
      const messageData = {
        type,
        payload
      };

      console.log('📤 CloudSSEClient: Sending message to Cloud server:');
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
      console.log('✅ CloudSSEClient: Message sent successfully to Cloud server');
      console.log('   Server response:', result);
      return result.success;
    } catch (error) {
      console.error('❌ CloudSSEClient: Failed to send message to Cloud server:', error);
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
      console.log(`CloudSSEClient: Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('CloudSSEClient: Max reconnection attempts reached');
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
      title: 'Cloud Server Connection Failed',
      message: 'Failed to connect to Cloud server after multiple attempts'
    });
  }

  /**
   * Broadcast connection status to other parts of the extension
   */
  private broadcastConnectionStatus(connected: boolean): void {
    const payload: any = {
      connected,
      timestamp: Date.now()
    };

    // 如果已连接，添加MCP地址
    if (connected && this.clientId) {
      try {
        payload.mcpUrl = this.getMCPUrl();
        payload.serverUrl = this.serverUrl;
        payload.clientId = this.clientId;
      } catch (error) {
        console.warn('CloudSSEClient: Failed to get MCP URL:', error);
      }
    }

    chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.PYTHON_SSE_STATUS_CHANGED,
      payload
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
export const pythonSSEClient = new CloudSSEClient();

/**
 * Initialize Cloud SSE client
 */
export const initCloudSSEClient = () => {
  if (sseClientInitialized) return;
  sseClientInitialized = true;
  // Auto-connect on startup
  pythonSSEClient.connect().then((success) => {
    if (success) {
      console.log('CloudSSEClient: Auto-connection successful');
    } else {
      console.log('CloudSSEClient: Auto-connection failed');
    }
  });

  // Handle messages from other parts of the extension
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CONNECT_PYTHON_SSE') {
      pythonSSEClient.connect().then((success) => {
        sendResponse({ success });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message || 'Failed to connect' });
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
      pythonSSEClient.sendMessageToCloud(type, payload).then((success) => {
        sendResponse({ success });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message || 'Failed to send message' });
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

    if (message.type === BACKGROUND_MESSAGE_TYPES.GET_PYTHON_SSE_CONFIG) {
      sendResponse({
        success: true,
        config: {
          serverUrl: pythonSSEClient.getServerUrl(),
          clientId: pythonSSEClient.getClientId(),
          mcpUrl: pythonSSEClient.getClientId() ? pythonSSEClient.getMCPUrl() : null,
          isConnected: pythonSSEClient.getConnectionStatus()
        }
      });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.UPDATE_PYTHON_SSE_CONFIG) {
      const { serverUrl } = message;
      
      // 检查是否已连接，如果已连接则不允许更新
      if (pythonSSEClient.getConnectionStatus()) {
        sendResponse({ 
          success: false, 
          error: 'Cannot update server URL while connected. Please disconnect first.' 
        });
        return true;
      }
      
      if (serverUrl) {
        pythonSSEClient.updateServerUrl(serverUrl).then((success) => {
          sendResponse({ success });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message || 'Failed to update server URL' });
        });
      } else {
        sendResponse({ success: false, error: 'Server URL is required' });
      }
      return true;
    }
  });
};
