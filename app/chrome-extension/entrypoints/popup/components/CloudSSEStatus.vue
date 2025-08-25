<template>
  <div class="cloud-sse-status">
    <div class="status-header">
      <h3>Server Status</h3>
      <div class="status-indicator" :class="{ connected: isConnected, disconnected: !isConnected, connecting: isConnecting }">
        <span class="status-dot"></span>
        {{ isConnecting ? '连接中...' : (isConnected ? 'Connected' : 'Disconnected') }}
      </div>
    </div>

    <div class="connection-controls">
      <button 
        @click="connectToCloud"
        :disabled="isConnected || isConnecting"
        class="btn btn-primary"
      >
        {{ isConnecting ? '连接中...' : 'Connect' }}
      </button>
      <button 
        @click="disconnectFromCloud"
        :disabled="!isConnected"
        class="btn btn-secondary"
      >
        Disconnect
      </button>
    </div>

    <div v-if=false class="tools-info">
      <h4>Available Tools</h4>
      <div class="tools-list">
        <div v-for="tool in availableTools" :key="tool" class="tool-item">
          {{ tool }}
        </div>
      </div>
      <div class="tools-count">
        Total: {{ availableTools.length }} tools
      </div>
    </div>

          <div class="server-config">
        <h4>Server Configuration</h4>
        <div class="config-item">
          <label for="serverUrl" class="config-label">Server URL:</label>
          <div class="config-input-group">
            <input
              id="serverUrl"
              v-model="serverUrlInput"
              type="text"
              placeholder="http://127.0.0.1:10824"
              class="config-input"
              :class="{ 'editing': isEditingServerUrl }"
              :disabled="isConnected"
              @focus="onServerUrlFocus"
              @blur="onServerUrlBlur"
            />
            <button 
              @click="updateServerUrl" 
              class="btn btn-info" 
              :disabled="!serverUrlInput.trim() || isConnected"
              :title="isConnected ? 'Please disconnect first to update server URL' : 'Update server URL'"
            >
              Update
            </button>
          </div>
          <div v-if="isConnected" class="config-note">
            ⚠️ Please disconnect first to update server URL
          </div>
        </div>
      </div>

    <div class="server-info">
      <h4>Server Information</h4>
      <div class="info-item">
        <span class="label">Current URL:</span>
        <span class="value">{{ currentServerUrl }}</span>
      </div>
      <div class="info-item">
        <span class="label">Client ID:</span>
        <span class="value">{{ clientId || 'Not available' }}</span>
      </div>
      <div class="info-item">
        <span class="label">MCP Address:</span>
        <span class="value mcp-url">{{ mcpUrl || 'Not available' }}</span>
        <button v-if="mcpUrl" @click="copyMcpUrl" class="copy-btn" title="Copy MCP URL">
          📋
        </button>
      </div>
      <div class="info-item">
        <span class="label">Last Updated:</span>
        <span class="value">{{ lastUpdated }}</span>
      </div>
    </div>

    <div v-if="false" class="actions">
      <button @click="syncTools" class="btn btn-info">
        Sync Tools
      </button>
      <button @click="pingServer" class="btn btn-info">
        Ping Server
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

// Reactive state
const isConnected = ref(false);
const isConnecting = ref(false); // 添加连接中状态
const availableTools = ref<string[]>([]);
const serverUrlInput = ref('http://127.0.0.1:12306');
const currentServerUrl = ref('http://127.0.0.1:12306');
const clientId = ref<string | null>(null);
const mcpUrl = ref<string | null>(null);
const lastUpdated = ref('Never');
const isEditingServerUrl = ref(false);

// Message listener cleanup
let messageListener: ((message: any) => void) | null = null;

// Methods
const connectToCloud = async () => {
  try {
    // 设置连接中状态
    isConnecting.value = true;
    
    const response = await chrome.runtime.sendMessage({ type: 'CONNECT_CLOUD_SSE' });
    if (response.success) {
      console.log('Successfully connected to cloud server');
      // 立即更新状态，不等待消息监听器
      isConnected.value = true;
      // 立即获取最新状态信息
      await refreshStatusImmediately();
    } else {
      console.error('Failed to connect to cloud server');
    }
  } catch (error) {
    console.error('Error connecting to cloud server:', error);
  } finally {
    // 无论成功还是失败，都要清除连接中状态
    isConnecting.value = false;
  }
};

const disconnectFromCloud = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'DISCONNECT_CLOUD_SSE' });
    if (response.success) {
      console.log('Disconnected from Cloud SSE server');
      // 立即更新状态，不等待消息监听器
      isConnected.value = false;
      // 清空相关状态
      mcpUrl.value = null;
      clientId.value = null;
      // 立即更新状态显示
      await refreshStatusImmediately();
    }
  } catch (error) {
    console.error('Error disconnecting from Cloud SSE server:', error);
  }
};

const syncTools = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CLOUD_TOOLS' });
    if (response.success) {
      availableTools.value = response.tools;
      lastUpdated.value = new Date().toLocaleString();
    }
  } catch (error) {
    console.error('Error syncing tools:', error);
  }
};

const pingServer = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ping',
      payload: { message: 'Hello from Chrome extension!' }
    });
    if (response.success) {
      console.log('Ping successful');
    } else {
      console.error('Ping failed');
    }
  } catch (error) {
    console.error('Error pinging server:', error);
  }
};

const updateServerUrl = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'update_cloud_sse_config',
      serverUrl: serverUrlInput.value.trim()
    });
    if (response && response.success) {
      console.log('Server URL updated successfully');
      // 更新成功后，重置编辑状态
      isEditingServerUrl.value = false;
      // 更新当前服务器URL显示
      currentServerUrl.value = serverUrlInput.value.trim();
      // 可选：显示成功提示
      console.log('Server URL updated and synchronized');
    } else {
      console.error('Failed to update server URL:', response?.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error updating server URL:', error);
  }
};

const copyMcpUrl = async () => {
  if (mcpUrl.value) {
    try {
      await navigator.clipboard.writeText(mcpUrl.value);
      console.log('MCP URL copied to clipboard');
    } catch (error) {
      console.error('Failed to copy MCP URL:', error);
    }
  }
};

const onServerUrlFocus = () => {
  isEditingServerUrl.value = true;
};

const onServerUrlBlur = () => {
  // 延迟设置，避免在点击Update按钮时立即重置
  setTimeout(() => {
    isEditingServerUrl.value = false;
  }, 100);
};

const updateStatus = async () => {
  try {
    // 获取连接状态
    const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_CLOUD_SSE_STATUS' });
    if (statusResponse.success) {
      isConnected.value = statusResponse.connected;
      if (statusResponse.connected) {
        await syncTools();
      }
    }

    // 获取配置信息
    const configResponse = await chrome.runtime.sendMessage({ type: 'get_cloud_sse_config' });
    if (configResponse && configResponse.success) {
      currentServerUrl.value = configResponse.config.serverUrl;
      clientId.value = configResponse.config.clientId;
      mcpUrl.value = configResponse.config.mcpUrl;
      
      // 只有在用户没有编辑时才自动更新输入框的值
      if (!isEditingServerUrl.value) {
        serverUrlInput.value = configResponse.config.serverUrl;
      }
    }
  } catch (error) {
    console.error('Error getting status:', error);
  }
};

// 立即更新状态的辅助方法
const refreshStatusImmediately = async () => {
  try {
    await updateStatus();
    // 强制更新最后更新时间
    lastUpdated.value = new Date().toLocaleString();
  } catch (error) {
    console.error('Error refreshing status immediately:', error);
  }
};

// Setup message listener
const setupMessageListener = () => {
  messageListener = (message: any) => {
    if (message.type === 'CLOUD_SSE_STATUS_CHANGED') {
      // 立即更新连接状态
      isConnected.value = message.payload.connected;
      
      if (message.payload.connected) {
        // 连接成功后立即同步工具和更新信息
        syncTools();
        // 更新MCP地址和客户端ID
        if (message.payload.mcpUrl) {
          mcpUrl.value = message.payload.mcpUrl;
          clientId.value = message.payload.clientId;
          currentServerUrl.value = message.payload.serverUrl;
          
          // 只有在用户没有编辑时才自动更新输入框的值
          if (!isEditingServerUrl.value) {
            serverUrlInput.value = message.payload.serverUrl;
          }
        }
      } else {
        // 断开连接时立即清空相关状态
        mcpUrl.value = null;
        clientId.value = null;
      }
      
      // 立即更新最后更新时间
      lastUpdated.value = new Date().toLocaleString();
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);
};

// Lifecycle
onMounted(async () => {
  setupMessageListener();
  await updateStatus();
  
  // 设置更频繁的状态检查，确保与图标更新同步
  const statusInterval = setInterval(updateStatus, 2000); // 改为每2秒检查一次
  
  onUnmounted(() => {
    clearInterval(statusInterval);
  });
});

onUnmounted(() => {
  if (messageListener) {
    chrome.runtime.onMessage.removeListener(messageListener);
  }
});
</script>

<style scoped>
.cloud-sse-status {
  padding: 16px;
  max-width: 400px;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.status-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #ccc;
}

.status-indicator.connected .status-dot {
  background-color: #4caf50;
}

.status-indicator.disconnected .status-dot {
  background-color: #f44336;
}

.status-indicator.connecting .status-dot {
  background-color: #ff9800; /* 连接中状态的点颜色 */
  animation: pulse 1.5s ease-in-out infinite; /* 添加脉冲动画 */
}

@keyframes pulse {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.connection-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #1976d2;
}

.btn-secondary {
  background-color: #f44336;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #d32f2f;
}

.btn-info {
  background-color: #ff9800;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background-color: #f57c00;
}

.tools-info {
  margin-bottom: 16px;
  padding: 12px;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.tools-info h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.tools-list {
  max-height: 120px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.tool-item {
  padding: 4px 8px;
  background-color: white;
  border-radius: 2px;
  margin-bottom: 4px;
  font-size: 12px;
  font-family: monospace;
}

.tools-count {
  font-size: 12px;
  color: #666;
  text-align: right;
}

.server-info {
  margin-bottom: 16px;
  padding: 12px;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.server-info h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 12px;
}

.info-item .label {
  font-weight: 500;
  color: #666;
}

.info-item .value {
  color: #333;
  font-family: monospace;
}

.actions {
  display: flex;
  gap: 8px;
}

.server-config {
  margin-bottom: 16px;
  padding: 12px;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.server-config h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.config-item {
  margin-bottom: 8px;
}

.config-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

.config-input-group {
  display: flex;
  gap: 8px;
}

.config-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
}

.mcp-url {
  font-family: monospace;
  word-break: break-all;
  max-width: 200px;
}

.copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 2px;
  transition: background-color 0.2s;
}

.copy-btn:hover {
  background-color: #f0f0f0;
}

.config-note {
  margin-top: 8px;
  padding: 8px;
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
  font-size: 12px;
  color: #856404;
  display: flex;
  align-items: center;
  gap: 6px;
}

.config-input:disabled {
  background-color: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}

.config-input.editing {
  border-color: #2196f3;
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.config-input.editing:focus {
  outline: none;
  border-color: #1976d2;
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
