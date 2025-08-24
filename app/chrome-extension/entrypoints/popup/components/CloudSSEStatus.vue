<template>
  <div class="python-sse-status">
    <div class="status-header">
      <h3>Server Status</h3>
      <div class="status-indicator" :class="{ connected: isConnected, disconnected: !isConnected }">
        <span class="status-dot"></span>
        {{ isConnected ? 'Connected' : 'Disconnected' }}
      </div>
    </div>

    <div class="connection-controls">
      <button 
        @click="connectToPython" 
        :disabled="isConnected"
        class="btn btn-primary"
      >
        Connect
      </button>
      <button 
        @click="disconnectFromPython" 
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

    <div class="server-info">
      <h4>Server Information</h4>
      <div class="info-item">
        <span class="label">URL:</span>
        <span class="value">{{ serverUrl }}</span>
      </div>
      <div class="info-item">
        <span class="label">Port:</span>
        <span class="value">{{ serverPort }}</span>
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
const availableTools = ref<string[]>([]);
const serverUrl = ref('127.0.0.1');
const serverPort = ref(12306);
const lastUpdated = ref('Never');

// Message listener cleanup
let messageListener: ((message: any) => void) | null = null;

// Methods
const connectToPython = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CONNECT_PYTHON_SSE' });
    if (response.success) {
      console.log('Successfully connected to Python server');
    } else {
      console.error('Failed to connect to Python server');
    }
  } catch (error) {
    console.error('Error connecting to Python server:', error);
  }
};

const disconnectFromPython = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'DISCONNECT_PYTHON_SSE' });
    if (response.success) {
      console.log('Successfully disconnected from Python server');
    } else {
      console.error('Failed to disconnect from Python server');
    }
  } catch (error) {
    console.error('Error disconnecting from Python server:', error);
  }
};

const syncTools = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PYTHON_TOOLS' });
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
      type: 'SEND_MESSAGE_TO_PYTHON',
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

const updateStatus = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PYTHON_SSE_STATUS' });
    if (response.success) {
      isConnected.value = response.connected;
      if (response.connected) {
        await syncTools();
      }
    }
  } catch (error) {
    console.error('Error getting status:', error);
  }
};

// Setup message listener
const setupMessageListener = () => {
  messageListener = (message: any) => {
    if (message.type === 'python_sse_status_changed') {
      isConnected.value = message.payload.connected;
      if (message.payload.connected) {
        syncTools();
      }
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);
};

// Lifecycle
onMounted(async () => {
  setupMessageListener();
  await updateStatus();
  
  // Set up periodic status check
  const statusInterval = setInterval(updateStatus, 5000);
  
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
.python-sse-status {
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
</style>
