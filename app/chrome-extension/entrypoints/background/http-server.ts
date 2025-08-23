/**
 * HTTP Server management for Chrome extension
 * Replaces Native Host communication
 */

import { httpClient, ApiResponse } from '@/common/http-client';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { handleCallTool } from './tools';
import {
  ICONS,
  NOTIFICATIONS,
  STORAGE_KEYS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/common/constants';

/**
 * Server status management interface
 */
interface ServerStatus {
  isRunning: boolean;
  port?: number;
  lastUpdated: number;
  baseUrl: string;
}

let currentServerStatus: ServerStatus = {
  isRunning: false,
  lastUpdated: Date.now(),
  baseUrl: '127.0.0.1',
};

/**
 * Save server status to chrome.storage
 */
async function saveServerStatus(status: ServerStatus): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SERVER_STATUS]: status });
  } catch (error) {
    console.error(ERROR_MESSAGES.SERVER_STATUS_SAVE_FAILED, error);
  }
}

/**
 * Load server status from chrome.storage
 */
async function loadServerStatus(): Promise<ServerStatus> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SERVER_STATUS]);
    if (result[STORAGE_KEYS.SERVER_STATUS]) {
      return result[STORAGE_KEYS.SERVER_STATUS];
    }
  } catch (error) {
    console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
  }
  return {
    isRunning: false,
    lastUpdated: Date.now(),
    baseUrl: '127.0.0.1',
  };
}

/**
 * Broadcast server status change to all listeners
 */
function broadcastServerStatusChange(status: ServerStatus): void {
  chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.SERVER_STATUS_CHANGED,
      payload: status,
    })
    .catch(() => {
      // Ignore errors if no listeners are present
    });
}

/**
 * Connect to HTTP server
 */
export async function connectHttpServer(port: number = 12306) {
  try {
    console.log(`Attempting to connect to HTTP server on port ${port}...`);
    
    // Check if server is running
    const statusResponse = await httpClient.getServerStatus();
    console.log('Server status response:', statusResponse);
    
    if (statusResponse.success && statusResponse.data?.isRunning) {
      currentServerStatus = {
        isRunning: true,
        port: port,
        lastUpdated: Date.now(),
        baseUrl: '127.0.0.1',
      };
      await saveServerStatus(currentServerStatus);
      broadcastServerStatusChange(currentServerStatus);
      console.log(`${SUCCESS_MESSAGES.SERVER_STARTED} on port ${port}`);
      return true;
    } else {
      console.log('Server not running, attempting to start...');
      // Try to start server
      const startResponse = await httpClient.startServer(port);
      console.log('Start server response:', startResponse);
      
      if (startResponse.success) {
        currentServerStatus = {
          isRunning: true,
          port: port,
          lastUpdated: Date.now(),
          baseUrl: '127.0.0.1',
        };
        await saveServerStatus(currentServerStatus);
        broadcastServerStatusChange(currentServerStatus);
        console.log(`${SUCCESS_MESSAGES.SERVER_STARTED} on port ${port}`);
        return true;
      } else {
        throw new Error(startResponse.error || 'Failed to start server');
      }
    }
  } catch (error) {
    console.error('HTTP server connection failed:', error);
    
    // Update status to reflect connection failure
    currentServerStatus = {
      isRunning: false,
      port: port,
      lastUpdated: Date.now(),
      baseUrl: '127.0.0.1',
    };
    await saveServerStatus(currentServerStatus);
    broadcastServerStatusChange(currentServerStatus);
    
    return false;
  }
}

/**
 * Call tool via HTTP
 */
export async function callToolViaHttp(toolName: string, params: any): Promise<any> {
  try {
    const response = await httpClient.callTool(toolName, params);
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.error || 'Tool execution failed');
    }
  } catch (error) {
    console.error('HTTP tool call failed:', error);
    throw error;
  }
}

/**
 * Process data via HTTP
 */
export async function processDataViaHttp(data: any): Promise<any> {
  try {
    const response = await httpClient.processData(data);
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.error || 'Data processing failed');
    }
  } catch (error) {
    console.error('HTTP data processing failed:', error);
    throw error;
  }
}

/**
 * Initialize HTTP server listeners and load initial state
 */
export const initHttpServerListener = () => {
  // Initialize server status from storage
  loadServerStatus()
    .then((status) => {
      currentServerStatus = status;
    })
    .catch((error) => {
      console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
    });

  chrome.runtime.onStartup.addListener(() => connectHttpServer());

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CONNECT_HTTP_SERVER') {
      const port = message.port || 12306;
      connectHttpServer(port).then((success) => {
        sendResponse({ success, port });
      });
      return true;
    }

    if (message.type === 'PING_HTTP_SERVER') {
      httpClient.getServerStatus().then((response) => {
        const connected = response.success && response.data?.isRunning;
        sendResponse({ connected });
      });
      return true;
    }

    if (message.type === 'DISCONNECT_HTTP_SERVER') {
      httpClient.stopServer().then((response) => {
        if (response.success) {
          currentServerStatus = {
            isRunning: false,
            port: currentServerStatus.port,
            lastUpdated: Date.now(),
            baseUrl: '127.0.0.1',
          };
          saveServerStatus(currentServerStatus);
          broadcastServerStatusChange(currentServerStatus);
        }
        sendResponse({ success: response.success });
      });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS) {
      sendResponse({
        success: true,
        serverStatus: currentServerStatus,
        connected: currentServerStatus.isRunning,
      });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.REFRESH_SERVER_STATUS) {
      httpClient.getServerStatus().then((response) => {
        if (response.success && response.data) {
          currentServerStatus = {
            ...response.data,
            lastUpdated: Date.now(),
          };
          saveServerStatus(currentServerStatus);
        }
        sendResponse({
          success: true,
          serverStatus: currentServerStatus,
          connected: currentServerStatus.isRunning,
        });
      }).catch((error) => {
        console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
        sendResponse({
          success: false,
          error: ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED,
          serverStatus: currentServerStatus,
          connected: currentServerStatus.isRunning,
        });
      });
      return true;
    }
  });
};
