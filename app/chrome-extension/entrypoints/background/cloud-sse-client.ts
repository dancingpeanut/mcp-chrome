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
    chrome.storage.local.get(['cloud_sse_client_id'], (result) => {
      let clientId = result.cloud_sse_client_id;
      if (!clientId) {
        clientId = uuidv4().replaceAll('-', '');
        chrome.storage.local.set({ cloud_sse_client_id: clientId }, () => {
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
  
  // 连接保活机制
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private connectionHealthTimer: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private keepAliveInterval: number = 15000; // 15秒保活间隔，更频繁
  private healthCheckInterval: number = 30000; // 30秒健康检查间隔
  
  // Chrome扩展保活机制
  private chromeKeepAliveTimer: NodeJS.Timeout | null = null;
  private storageKeepAliveTimer: NodeJS.Timeout | null = null;
  private alarmKeepAliveTimer: NodeJS.Timeout | null = null;
  private chromeKeepAliveInterval: number = 10000; // 10秒Chrome保活间隔

  constructor() {
    this.initializeTools();
    this.loadServerUrlFromStorage();
    this.startConnectionKeepAlive();
  }

  /**
   * 启动连接保活机制
   */
  private startConnectionKeepAlive(): void {
    // 启动连接健康检查
    this.connectionHealthTimer = setInterval(() => {
      this.checkConnectionHealth();
    }, this.healthCheckInterval);

    // 启动Chrome扩展保活机制
    this.startChromeKeepAlive();

    console.log('CloudSSEClient: Connection keep-alive mechanism started');
  }

  /**
   * 启动Chrome扩展保活机制
   */
  private startChromeKeepAlive(): void {
    // 1. 定时器保活 - 每10秒执行一次
    this.chromeKeepAliveTimer = setInterval(() => {
      this.performChromeKeepAlive();
    }, this.chromeKeepAliveInterval);

    // 2. 存储保活 - 每20秒写入一次存储
    this.storageKeepAliveTimer = setInterval(() => {
      this.performStorageKeepAlive();
    }, 20000);

    // 3. 闹钟保活 - 每25秒设置一次闹钟
    this.alarmKeepAliveTimer = setInterval(() => {
      this.performAlarmKeepAlive();
    }, 25000);

    console.log('CloudSSEClient: Chrome extension keep-alive mechanism started');
  }

  /**
   * 执行Chrome扩展保活操作
   */
  private performChromeKeepAlive(): void {
    try {
      // 1. 发送内部保活消息
      chrome.runtime.sendMessage({
        type: 'INTERNAL_KEEP_ALIVE',
        timestamp: Date.now(),
        source: 'cloud_sse_client'
      }).catch(() => {
        // 忽略错误，这只是保活机制
      });

      // 2. 执行一些Chrome API调用保持活跃
      chrome.storage.local.get(['keep_alive_timestamp'], (result) => {
        // 读取存储保持活跃
        const timestamp = result.keep_alive_timestamp || 0;
        chrome.storage.local.set({ 
          keep_alive_timestamp: Date.now(),
          last_keep_alive: 'cloud_sse_client'
        });
      });

      // 3. 检查扩展权限保持活跃
      chrome.permissions.contains({
        permissions: ['storage', 'tabs']
      }, (hasPermissions) => {
        // 权限检查保持活跃
        if (hasPermissions) {
          console.log('CloudSSEClient: Chrome keep-alive performed');
        }
      });

    } catch (error) {
      console.warn('CloudSSEClient: Chrome keep-alive failed:', error);
    }
  }

  /**
   * 执行存储保活操作
   */
  private performStorageKeepAlive(): void {
    try {
      const keepAliveData = {
        timestamp: Date.now(),
        clientId: this.clientId,
        serverUrl: this.serverUrl,
        isConnected: this.isConnected,
        reconnectAttempts: this.reconnectAttempts
      };

      chrome.storage.local.set({ 
        sse_client_keep_alive: keepAliveData,
        last_storage_keep_alive: Date.now()
      }, () => {
        console.log('CloudSSEClient: Storage keep-alive performed');
      });
    } catch (error) {
      console.warn('CloudSSEClient: Storage keep-alive failed:', error);
    }
  }

  /**
   * 执行闹钟保活操作
   */
  private performAlarmKeepAlive(): void {
    try {
      // 创建临时闹钟保持活跃
      const alarmName = `sse_client_keep_alive_${Date.now()}`;
      chrome.alarms.create(alarmName, {
        delayInMinutes: 0.1 // 6秒后触发
      });

      // 立即清除闹钟，这只是为了保持活跃
      setTimeout(() => {
        chrome.alarms.clear(alarmName).catch(() => {
          // 忽略清除失败
        });
      }, 1000);

      console.log('CloudSSEClient: Alarm keep-alive performed');
    } catch (error) {
      console.warn('CloudSSEClient: Alarm keep-alive failed:', error);
    }
  }

  /**
   * 检查连接健康状态
   */
  private checkConnectionHealth(): void {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;
    
    // 如果超过健康检查间隔没有活动，认为连接有问题
    if (this.isConnected && timeSinceLastActivity > this.healthCheckInterval) {
      console.log('CloudSSEClient: Connection health check failed, no activity detected');
      this.handleConnectionError();
      return;
    }

    // 检查EventSource状态
    if (this.isConnected && this.eventSource) {
      if (this.eventSource.readyState === EventSource.CLOSED) {
        console.log('CloudSSEClient: EventSource is closed, triggering reconnection');
        this.handleConnectionError();
        return;
      }
    }

    console.log('CloudSSEClient: Connection health check passed');
  }

  /**
   * 从存储中加载服务器URL
   */
  private async loadServerUrlFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.cloud_sse_status_changed]);
      if (result[STORAGE_KEYS.cloud_sse_status_changed]) {
        this.serverUrl = result[STORAGE_KEYS.cloud_sse_status_changed];
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
      await chrome.storage.local.set({ [STORAGE_KEYS.cloud_sse_status_changed]: newUrl });
      
      // 更新内存中的URL
      this.serverUrl = newUrl;
      
      console.log(`CloudSSEClient: Server URL updated to: ${newUrl}`);
      
      // 注意：现在只允许在断开状态下更新，所以不需要重新连接逻辑
      
      return true;
    } catch (error) {
      console.warn('CloudSSEClient: Failed to update server URL:', error);
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
      console.warn('CloudSSEClient: Failed to initialize tools:', error);
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
        this.lastActivityTime = Date.now(); // 更新活动时间
        this.broadcastConnectionStatus(true);
      };
      this.eventSource.onmessage = (event) => {
        this.handleSSEMessage(event);
      };
      this.eventSource.onerror = (error) => {
        console.warn('CloudSSEClient: SSE connection error:', error);
        this.handleConnectionError();
      };
      return true;
    } catch (error) {
      console.warn('CloudSSEClient: Failed to connect:', error);
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
    // 更新最后活动时间
    this.lastActivityTime = Date.now();
    
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
        console.warn('❌ CloudSSEClient: Failed to handle Cloud request:', error);
        if (requestId) {
          await this.sendResponseToCloud(requestId, false, null, String(error));
        }
      }
    } catch (error) {
      console.warn('❌ CloudSSEClient: Failed to parse SSE message:', error);
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
      console.warn('❌ CloudSSEClient: Failed to send response to Cloud server:', error);
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
      console.warn('CloudSSEClient: Max reconnection attempts reached');
      // this.showConnectionErrorNotification();
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
      type: BACKGROUND_MESSAGE_TYPES.CLOUD_SSE_STATUS_CHANGED,
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

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.connectionHealthTimer) {
      clearInterval(this.connectionHealthTimer);
      this.connectionHealthTimer = null;
    }
    if (this.chromeKeepAliveTimer) {
      clearInterval(this.chromeKeepAliveTimer);
      this.chromeKeepAliveTimer = null;
    }
    if (this.storageKeepAliveTimer) {
      clearInterval(this.storageKeepAliveTimer);
      this.storageKeepAliveTimer = null;
    }
    if (this.alarmKeepAliveTimer) {
      clearInterval(this.alarmKeepAliveTimer);
      this.alarmKeepAliveTimer = null;
    }
    if (this.eventSource) {
      this.disconnect();
    }
    console.log('CloudSSEClient: Resources cleaned up');
  }
}

// Create global instance
export const cloudSSEClient = new CloudSSEClient();

/**
 * Initialize Cloud SSE client
 */
export const initCloudSSEClient = () => {
  if (sseClientInitialized) return;
  sseClientInitialized = true;
  // Auto-connect on startup
  cloudSSEClient.connect().then((success) => {
    if (success) {
      console.log('CloudSSEClient: Auto-connection successful');
    } else {
      console.log('CloudSSEClient: Auto-connection failed');
    }
  });

  // Handle messages from other parts of the extension
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CONNECT_CLOUD_SSE') {
      cloudSSEClient.connect().then((success) => {
        sendResponse({ success });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message || 'Failed to connect' });
      });
      return true;
    }

    if (message.type === 'DISCONNECT_CLOUD_SSE') {
      cloudSSEClient.disconnect();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'GET_CLOUD_SSE_STATUS') {
      sendResponse({
        success: true,
        connected: cloudSSEClient.getConnectionStatus()
      });
      return true;
    }

    if (message.type === 'GET_CLOUD_TOOLS') {
      sendResponse({
        success: true,
        tools: cloudSSEClient.getAvailableTools()
      });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.GET_CLOUD_SSE_CONFIG) {
      sendResponse({
        success: true,
        config: {
          serverUrl: cloudSSEClient.getServerUrl(),
          clientId: cloudSSEClient.getClientId(),
          mcpUrl: cloudSSEClient.getClientId() ? cloudSSEClient.getMCPUrl() : null,
          isConnected: cloudSSEClient.getConnectionStatus()
        }
      });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.UPDATE_CLOUD_SSE_CONFIG) {
      const { serverUrl } = message;
      
      // 检查是否已连接，如果已连接则不允许更新
      if (cloudSSEClient.getConnectionStatus()) {
        sendResponse({ 
          success: false, 
          error: 'Cannot update server URL while connected. Please disconnect first.' 
        });
        return true;
      }
      
      if (serverUrl) {
        cloudSSEClient.updateServerUrl(serverUrl).then((success) => {
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
