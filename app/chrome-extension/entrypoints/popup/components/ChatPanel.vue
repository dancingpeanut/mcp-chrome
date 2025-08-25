<template>
  <div class="chat-panel-overlay" @click="closePanel">
    <div class="chat-panel" @click.stop>
      <div class="chat-header">
        <h2 class="chat-title">孔明智能助手</h2>
        <div class="header-controls">
          <button class="settings-button" @click="showSettings = !showSettings" title="设置">
            ⚙️
          </button>
          <button class="close-button" @click="closePanel">✕</button>
        </div>
      </div>
      
      <!-- 设置面板 -->
      <div v-if="showSettings" class="settings-panel">
        <div class="setting-item">
          <label>API地址:</label>
          <input v-model="apiConfig.baseUrl" placeholder="http://127.0.0.1:10823" />
        </div>
        <div class="setting-item">
          <label>模型:</label>
          <select v-model="apiConfig.model">
            <option value="qwen3-32b">Qwen3-32B</option>
            <option value="qwen2.5-32b">Qwen2.5-32B</option>
            <option value="qwen2.5-14b">Qwen2.5-14B</option>
          </select>
        </div>
        <div class="setting-item">
          <label>温度:</label>
          <input v-model="apiConfig.temperature" type="range" min="0" max="1" step="0.1" />
          <span>{{ apiConfig.temperature }}</span>
        </div>
        <div class="setting-item">
          <label>最大Token:</label>
          <input v-model="apiConfig.maxTokens" type="number" min="100" max="100000" />
        </div>
        <button class="save-settings-btn" @click="saveSettings">保存设置</button>
      </div>
      
      <div class="chat-container" ref="chatContainer">
        <div v-for="(message, index) in conversationHistory" :key="index" class="message" :class="message.type">
          <div class="message-content">
            <div class="message-text" v-html="formatMessage(message.content)"></div>
            <div class="message-time">{{ formatTime(message.timestamp) }}</div>
          </div>
        </div>
        
        <div v-if="isLoading" class="message ai">
          <div class="message-content">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="chat-input-container">
        <div class="input-wrapper">
          <textarea
            ref="messageInput"
            v-model="currentMessage"
            @keydown="handleKeyDown"
            placeholder="输入您的消息... (支持 /help 查看命令)"
            class="message-input"
            rows="1"
          ></textarea>
          <button 
            class="send-button" 
            @click="sendMessage"
            :disabled="!currentMessage.trim() || isLoading"
          >
            <span class="send-icon">📤</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, nextTick, watch } from 'vue';

interface Message {
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface ApiConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const emit = defineEmits<{
  close: [];
}>();

const chatContainer = ref<HTMLElement>();
const messageInput = ref<HTMLTextAreaElement>();
const currentMessage = ref('');
const isLoading = ref(false);
const conversationHistory = ref<Message[]>([]);
const showSettings = ref(false);

// API配置
const apiConfig = ref<ApiConfig>({
  baseUrl: 'http://127.0.0.1:10823',
  model: 'qwen3-32b',
  temperature: 0.7,
  maxTokens: 1000
});

const closePanel = () => {
  emit('close');
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

const sendMessage = async () => {
  const message = currentMessage.value.trim();
  if (!message || isLoading.value) return;

  // 检查是否是特殊命令
  if (await handleSpecialCommands(message)) {
    return;
  }

  // 添加用户消息
  const userMessage: Message = {
    type: 'user',
    content: message,
    timestamp: new Date()
  };
  conversationHistory.value.push(userMessage);
  currentMessage.value = '';
  
  // 滚动到底部
  await nextTick();
  scrollToBottom();
  
  // 显示加载状态
  isLoading.value = true;
  
  try {
    // 调用AI API
    await callAIAPI(message);
  } catch (error) {
    console.error('发送消息失败:', error);
    const errorMessage: Message = {
      type: 'ai',
      content: `抱歉，处理您的消息时出现了错误：${error instanceof Error ? error.message : '未知错误'}`,
      timestamp: new Date()
    };
    conversationHistory.value.push(errorMessage);
  } finally {
    isLoading.value = false;
    await nextTick();
    scrollToBottom();
  }
};

const handleSpecialCommands = async (message: string): Promise<boolean> => {
  const cmd = message.trim().toLowerCase();
  
  if (cmd === '/help') {
    const helpMessage: Message = {
      type: 'ai',
      content: `可用命令：
• /help - 显示此帮助信息
• /clear - 清空对话历史
• /time - 显示当前时间
• /settings - 显示/隐藏设置面板

其他消息将发送给AI助手处理。`,
      timestamp: new Date()
    };
    conversationHistory.value.push(helpMessage);
    return true;
  }
  
  if (cmd === '/clear') {
    conversationHistory.value = [];
    return true;
  }
  
  if (cmd === '/time') {
    const timeMessage: Message = {
      type: 'ai',
      content: `当前时间：${new Date().toLocaleString('zh-CN')}`,
      timestamp: new Date()
    };
    conversationHistory.value.push(timeMessage);
    return true;
  }
  
  if (cmd === '/settings') {
    showSettings.value = !showSettings.value;
    return true;
  }
  
  return false;
};

const callAIAPI = async (userMessage: string) => {
  try {
    const response = await fetch(`${apiConfig.value.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: apiConfig.value.model,
        messages: [
          { role: 'system', content: '你是一个有用的AI助手，请用中文回答用户的问题。' },
          { role: 'user', content: userMessage }
        ],
        max_tokens: apiConfig.value.maxTokens,
        temperature: apiConfig.value.temperature,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data?.choices?.[0]?.message?.content || '抱歉，我没有收到有效的回复。';
    
    const aiMessage: Message = {
      type: 'ai',
      content: aiResponse,
      timestamp: new Date()
    };
    conversationHistory.value.push(aiMessage);
    
  } catch (error) {
    console.error('API调用失败:', error);
    
    // 如果API调用失败，提供友好的错误信息和备用回复
    let errorMessage = '抱歉，AI服务暂时不可用。';
    
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = '网络连接失败，请检查API地址是否正确，或者AI服务是否正在运行。';
      } else if (error.message.includes('HTTP 404')) {
        errorMessage = 'API地址不存在，请检查配置的地址是否正确。';
      } else if (error.message.includes('HTTP 500')) {
        errorMessage = 'AI服务内部错误，请稍后重试。';
      } else {
        errorMessage = `连接错误：${error.message}`;
      }
    }
    
    const aiMessage: Message = {
      type: 'ai',
      content: errorMessage,
      timestamp: new Date()
    };
    conversationHistory.value.push(aiMessage);
    
    throw error;
  }
};

const saveSettings = () => {
  // 保存设置到localStorage
  localStorage.setItem('chatApiConfig', JSON.stringify(apiConfig.value));
  showSettings.value = false;
  
  // 显示保存成功消息
  const saveMessage: Message = {
    type: 'ai',
    content: '设置已保存！',
    timestamp: new Date()
  };
  conversationHistory.value.push(saveMessage);
};

const loadSettings = () => {
  try {
    const saved = localStorage.getItem('chatApiConfig');
    if (saved) {
      const parsed = JSON.parse(saved);
      apiConfig.value = { ...apiConfig.value, ...parsed };
    }
  } catch (error) {
    console.warn('加载设置失败:', error);
  }
};

const formatMessage = (content: string) => {
  // 简单的格式化，将换行符转换为<br>
  return content.replace(/\n/g, '<br>');
};

const formatTime = (timestamp: Date) => {
  return timestamp.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

const scrollToBottom = () => {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
};

const autoResizeTextarea = () => {
  if (messageInput.value) {
    messageInput.value.style.height = 'auto';
    messageInput.value.style.height = messageInput.value.scrollHeight + 'px';
  }
};

watch(currentMessage, () => {
  autoResizeTextarea();
});

onMounted(() => {
  // 加载设置
  loadSettings();
  
  // 添加欢迎消息
  const welcomeMessage: Message = {
    type: 'ai',
    content: '您好！我是孔明智能助手，很高兴为您服务。您可以输入 /help 查看可用命令，或者直接与我对话。',
    timestamp: new Date()
  };
  conversationHistory.value.push(welcomeMessage);
  
  // 聚焦输入框
  nextTick(() => {
    messageInput.value?.focus();
  });
});
</script>

<style scoped>
.chat-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.chat-panel {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  width: 90vw;
  max-width: 600px;
  height: 80vh;
  max-height: 700px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.chat-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.settings-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.settings-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.close-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.settings-panel {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-item label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  min-width: 80px;
}

.setting-item input,
.setting-item select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.setting-item input[type="range"] {
  flex: 1;
  min-width: 100px;
}

.setting-item span {
  font-size: 14px;
  color: #6b7280;
  min-width: 30px;
  text-align: center;
}

.save-settings-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  align-self: flex-start;
}

.save-settings-btn:hover {
  background: #2563eb;
}

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  max-width: 80%;
  animation: fadeIn 0.3s ease-in;
}

.message.user {
  align-self: flex-end;
}

.message.ai {
  align-self: flex-start;
}

.message-content {
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 18px;
  position: relative;
}

.message.user .message-content {
  background: #3b82f6;
  color: white;
}

.message.ai .message-content {
  background: #f1f5f9;
  color: #1e293b;
}

.message-text {
  line-height: 1.5;
  word-wrap: break-word;
}

.message-time {
  font-size: 11px;
  opacity: 0.7;
  margin-top: 4px;
  text-align: right;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #9ca3af;
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.chat-input-container {
  padding: 20px;
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.message-input {
  flex: 1;
  border: 2px solid #e2e8f0;
  border-radius: 24px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  font-family: inherit;
  transition: border-color 0.2s;
  max-height: 120px;
  overflow-y: auto;
}

.message-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.send-button {
  background: #3b82f6;
  color: white;
  border: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.send-button:hover:not(:disabled) {
  background: #2563eb;
}

.send-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.send-icon {
  font-size: 18px;
}

/* 滚动条样式 */
.chat-container::-webkit-scrollbar {
  width: 6px;
}

.chat-container::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.chat-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.chat-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
