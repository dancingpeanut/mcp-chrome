import {
  initSemanticSimilarityListener,
  initializeSemanticEngineIfCached,
} from './semantic-similarity';
import { initStorageManagerListener } from './storage-manager';
import { initCloudSSEClient } from './cloud-sse-client';
import { cleanupModelCache } from '@/utils/semantic-similarity-engine';

/**
 * Background script entry point
 * Initializes all background services and listeners
 */
export default defineBackground(() => {
  // Initialize core services
  initSemanticSimilarityListener();
  initStorageManagerListener();
  initCloudSSEClient();

  // 添加保活消息处理
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'BACKGROUND_KEEP_ALIVE') {
      // 处理保活消息，保持后台脚本活跃
      console.log('Background: Keep-alive message received:', message.timestamp);
      sendResponse({ success: true, timestamp: Date.now() });
      return true;
    }
    
    if (message.type === 'INTERNAL_KEEP_ALIVE') {
      // 处理内部保活消息
      console.log('Background: Internal keep-alive from:', message.source, 'at:', message.timestamp);
      sendResponse({ success: true, timestamp: Date.now() });
      return true;
    }

    // 处理SidePanel消息
    if (message.type === 'OPEN_CHAT_PANEL') {
      console.log('Background: Opening chat panel from SidePanel');
      // 这里可以添加打开聊天面板的逻辑
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'OPEN_SETTINGS') {
      console.log('Background: Opening settings from SidePanel');
      // 这里可以添加打开设置的逻辑
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'GET_SERVER_STATUS') {
      console.log('Background: Getting server status for SidePanel');
      // 返回服务器状态
      sendResponse({ 
        success: true, 
        serverStatus: {
          isRunning: false, // 这里需要根据实际情况返回
          port: 12306,
          lastUpdated: Date.now()
        }
      });
      return true;
    }
  });

  // 设置闹钟监听器保持活跃
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith('sse_client_keep_alive_')) {
      console.log('Background: Keep-alive alarm triggered:', alarm.name);
      // 立即清除这个临时闹钟
      chrome.alarms.clear(alarm.name).catch(() => {
        // 忽略清除失败
      });
    }
  });

  // Conditionally initialize semantic similarity engine if model cache exists
  initializeSemanticEngineIfCached()
    .then((initialized) => {
      if (initialized) {
        console.log('Background: Semantic similarity engine initialized from cache');
      } else {
        console.log(
          'Background: Semantic similarity engine initialization skipped (no cache found)',
        );
      }
    })
    .catch((error) => {
      console.warn('Background: Failed to conditionally initialize semantic engine:', error);
    });

  // Initial cleanup on startup
  cleanupModelCache().catch((error) => {
    console.warn('Background: Initial cache cleanup failed:', error);
  });
});
