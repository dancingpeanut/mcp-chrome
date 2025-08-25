import {
  initSemanticSimilarityListener,
  initializeSemanticEngineIfCached,
} from './semantic-similarity';
import { initStorageManagerListener } from './storage-manager';
import { initCloudSSEClient, cloudSSEClient } from './cloud-sse-client';
import { cleanupModelCache } from '@/utils/semantic-similarity-engine';

/**
 * Badge管理 - 当Server Status连接上时循环改变setBadgeText，断开后还原
 */
let connected = false;
let index = 0;
let timer: NodeJS.Timeout | null = null;
const textToShow = "MCP";

function startTimer() {
  index = 0;
  updateBadge();

  timer = setInterval(() => {
    index = (index + 1) % textToShow.length;
    updateBadge();
  }, 1000);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  chrome.action.setBadgeText({ text: "" });
}

function updateBadge() {
  const letter = textToShow[index];
  chrome.action.setBadgeText({ text: letter });
  chrome.action.setBadgeBackgroundColor({ color: "#28a745" });
}

// 检查连接状态并更新badge
function checkAndUpdateConnectionStatus() {
  try {
    const currentStatus = cloudSSEClient.getConnectionStatus();
    
    if (currentStatus !== connected) {
      connected = currentStatus;
      if (connected) {
        startTimer();
      } else {
        stopTimer();
      }
    }
  } catch (error) {
    console.error('Badge: Error checking connection status:', error);
  }
}

/**
 * Background script entry point
 * Initializes all background services and listeners
 */
export default defineBackground(() => {
  // Initialize core services
  initSemanticSimilarityListener();
  initStorageManagerListener();
  initCloudSSEClient();

  // 定期检查连接状态并更新badge
  setInterval(checkAndUpdateConnectionStatus, 2000); // 每2秒检查一次

  // 监听连接状态变化，管理badge显示
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CLOUD_SSE_STATUS_CHANGED') {
      const { connected: newConnected } = message.payload;
      if (newConnected !== connected) {
        connected = newConnected;
        if (connected) {
          startTimer();
        } else {
          stopTimer();
        }
      }
    }
    
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

  // 初始化完成后立即检查一次连接状态
  setTimeout(checkAndUpdateConnectionStatus, 1000);
});
