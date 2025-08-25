<template>
  <div class="side-panel-overlay" v-if="visible" @click="closePanel">
    <div class="side-panel" @click.stop>
      <div class="side-panel-header">
        <h2 class="side-panel-title">MCP Chrome Extension</h2>
        <button class="close-button" @click="closePanel">
          <span class="close-icon">×</span>
        </button>
      </div>
      
      <div class="side-panel-content">
        <div class="section">
          <h3 class="section-title">快速操作</h3>
          <div class="action-buttons">
            <button class="action-button primary" @click="openChatPanel">
              <span class="action-icon">💬</span>
              <span>打开聊天</span>
            </button>
            <button class="action-button secondary" @click="refreshStatus">
              <span class="action-icon">🔄</span>
              <span>刷新状态</span>
            </button>
            <button class="action-button secondary" @click="openSettings">
              <span class="action-icon">⚙️</span>
              <span>设置</span>
            </button>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">系统状态</h3>
          <div class="status-grid">
            <div class="status-item">
              <div class="status-label">连接状态</div>
              <div class="status-value" :class="getStatusClass()">
                {{ getStatusText() }}
              </div>
            </div>
            <div class="status-item">
              <div class="status-label">服务器状态</div>
              <div class="status-value" :class="getServerStatusClass()">
                {{ getServerStatusText() }}
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">最近活动</h3>
          <div class="activity-list">
            <div class="activity-item">
              <span class="activity-time">{{ getCurrentTime() }}</span>
              <span class="activity-text">SidePanel 已打开</span>
            </div>
            <div class="activity-item">
              <span class="activity-time">{{ getCurrentTime(-1) }}</span>
              <span class="activity-text">系统状态检查</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { defineProps, defineEmits } from 'vue';

interface Props {
  visible: boolean;
  nativeConnectionStatus?: 'unknown' | 'connected' | 'disconnected';
  serverStatus?: {
    isRunning: boolean;
    port?: number;
    lastUpdated: number;
  };
}

interface Emits {
  (e: 'close'): void;
  (e: 'refresh-status'): void;
  (e: 'open-chat'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const closePanel = () => {
  emit('close');
};

const openChatPanel = () => {
  emit('open-chat');
  closePanel();
};

const refreshStatus = () => {
  emit('refresh-status');
};

const openSettings = () => {
  // 这里可以添加打开设置的逻辑
  console.log('Opening settings...');
};

const getStatusClass = () => {
  if (props.nativeConnectionStatus === 'connected') {
    return 'status-connected';
  } else if (props.nativeConnectionStatus === 'disconnected') {
    return 'status-disconnected';
  } else {
    return 'status-unknown';
  }
};

const getStatusText = () => {
  if (props.nativeConnectionStatus === 'connected') {
    return '已连接';
  } else if (props.nativeConnectionStatus === 'disconnected') {
    return '未连接';
  } else {
    return '检测中';
  }
};

const getServerStatusClass = () => {
  if (props.serverStatus?.isRunning) {
    return 'status-running';
  } else {
    return 'status-stopped';
  }
};

const getServerStatusText = () => {
  if (props.serverStatus?.isRunning) {
    return `运行中 (端口: ${props.serverStatus.port || '未知'})`;
  } else {
    return '已停止';
  }
};

const getCurrentTime = (offsetMinutes = 0) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + offsetMinutes);
  return now.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};
</script>

<style scoped>
.side-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.3s ease-out;
}

.side-panel {
  width: 400px;
  height: 100vh;
  background: white;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease-out;
}

.side-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}

.side-panel-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.close-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  color: #64748b;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  background: #e2e8f0;
  color: #374151;
}

.close-icon {
  font-size: 20px;
  font-weight: 300;
}

.side-panel-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 16px 0;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  text-align: left;
}

.action-button.primary {
  background: #8b5cf6;
  color: white;
}

.action-button.primary:hover {
  background: #7c3aed;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
}

.action-button.secondary {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.action-button.secondary:hover {
  background: #e2e8f0;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}

.action-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.status-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
}

.status-label {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-value {
  font-size: 14px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  text-align: center;
}

.status-value.status-connected {
  background: #dcfce7;
  color: #166534;
}

.status-value.status-disconnected {
  background: #fef2f2;
  color: #dc2626;
}

.status-value.status-running {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-value.status-stopped {
  background: #fef3c7;
  color: #d97706;
}

.status-value.status-unknown {
  background: #f3f4f6;
  color: #6b7280;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.activity-time {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
  min-width: 60px;
}

.activity-text {
  font-size: 14px;
  color: #374151;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

@media (max-width: 480px) {
  .side-panel {
    width: 100vw;
  }
  
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>
