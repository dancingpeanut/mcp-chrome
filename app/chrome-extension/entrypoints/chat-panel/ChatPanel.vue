<template>
  <div class="chat-panel-container">
    <div class="chat-header">
      <h2>孔明智能助手</h2>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>
    
    <div class="chat-content">
      <div class="stream-status" v-if="streamStatus">
        <div class="status-indicator"></div>
        <span>{{ streamStatus }}</span>
      </div>
      
      <div class="chat-container" ref="chatContainer">
        <div
          v-for="(message, index) in conversationHistory"
          :key="index"
          :class="['message', message.role]"
        >
          <div class="message-content">
            <div v-if="message.role === 'user'" class="user-avatar">👤</div>
            <div v-if="message.role === 'ai'" class="ai-avatar">🤖</div>
            <div class="message-text" v-html="message.content"></div>
          </div>
        </div>
      </div>
      
      <div class="input-container">
        <textarea
          ref="messageInput"
          v-model="currentMessage"
          placeholder="输入您的问题..."
          @keypress="handleKeyPress"
          :disabled="isLoading"
        ></textarea>
        <button
          class="send-btn"
          @click="sendMessage"
          :disabled="isLoading || !currentMessage.trim()"
        >
          <span v-if="!isLoading">发送</span>
          <span v-else>发送中...</span>
        </button>
      </div>
    </div>
    
    <div class="settings-panel" v-if="showSettings">
      <div class="settings-header">
        <h3>设置</h3>
        <button @click="showSettings = false">关闭</button>
      </div>
      <div class="settings-content">
        <div class="setting-item">
          <label>MCP 地址:</label>
          <input v-model="mcpAddress" placeholder="http://127.0.0.1:10823" />
        </div>
        <div class="setting-item">
          <label>AI 模型:</label>
          <select v-model="selectedModel">
            <option value="qwen3-32b">Qwen3-32B</option>
            <option value="qwen2.5-32b">Qwen2.5-32B</option>
            <option value="qwen2.5-14b">Qwen2.5-14B</option>
          </select>
        </div>
        <div class="setting-item">
          <label>流式输出:</label>
          <input type="checkbox" v-model="streamEnabled" />
        </div>
        <button @click="saveSettings">保存设置</button>
      </div>
    </div>
    
    <button class="settings-btn" @click="showSettings = !showSettings">
      ⚙️ 设置
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'

interface Message {
  role: 'user' | 'ai'
  content: string
  timestamp: number
}

const emit = defineEmits<{
  close: []
}>()

// 响应式数据
const chatContainer = ref<HTMLDivElement>()
const messageInput = ref<HTMLTextAreaElement>()
const currentMessage = ref('')
const conversationHistory = ref<Message[]>([])
const isLoading = ref(false)
const streamStatus = ref('')
const showSettings = ref(false)

// 设置相关
const mcpAddress = ref('http://127.0.0.1:10823')
const selectedModel = ref('qwen3-32b')
const streamEnabled = ref(true)

// 配置
const config = {
  DEFAULT_API_KEY: '',
  LLM_SERVICE: {
    BASE_URL: 'http://127.0.0.1:10823',
    MODEL: 'qwen3-32b',
    MAX_TOKENS: 102400,
    TEMPERATURE: 0.7
  },
  SYSTEM_PROMPT: '',
  DEFAULTS: {
    STREAM_OUTPUT: true,
    MAX_CONVERSATION_HISTORY: 64
  }
}

onMounted(() => {
  loadSettings()
  loadConversationHistory()
})

// 加载设置
const loadSettings = () => {
  try {
    const saved = localStorage.getItem('chat_mcpAddress')
    if (saved) mcpAddress.value = saved
    
    const model = localStorage.getItem('chat_model')
    if (model) selectedModel.value = model
    
    const stream = localStorage.getItem('chat_streamEnabled')
    if (stream !== null) streamEnabled.value = stream === 'true'
  } catch (error) {
    console.warn('加载设置失败:', error)
  }
}

// 保存设置
const saveSettings = () => {
  try {
    localStorage.setItem('chat_mcpAddress', mcpAddress.value)
    localStorage.setItem('chat_model', selectedModel.value)
    localStorage.setItem('chat_streamEnabled', streamEnabled.value.toString())
    showSettings.value = false
  } catch (error) {
    console.error('保存设置失败:', error)
  }
}

// 加载对话历史
const loadConversationHistory = () => {
  try {
    const saved = localStorage.getItem('chat_conversationHistory')
    if (saved) {
      conversationHistory.value = JSON.parse(saved)
    }
  } catch (error) {
    console.warn('加载对话历史失败:', error)
  }
}

// 保存对话历史
const saveConversationHistory = () => {
  try {
    localStorage.setItem('chat_conversationHistory', JSON.stringify(conversationHistory.value))
  } catch (error) {
    console.error('保存对话历史失败:', error)
  }
}

// 处理按键事件
const handleKeyPress = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// 发送消息
const sendMessage = async () => {
  if (!currentMessage.value.trim() || isLoading.value) return
  
  const userMessage: Message = {
    role: 'user',
    content: currentMessage.value,
    timestamp: Date.now()
  }
  
  conversationHistory.value.push(userMessage)
  saveConversationHistory()
  
  const messageToSend = currentMessage.value
  currentMessage.value = ''
  isLoading.value = true
  streamStatus.value = '正在思考...'
  
  try {
    await sendToMCP(messageToSend)
  } catch (error) {
    console.error('发送消息失败:', error)
    addAIMessage('抱歉，发送消息时出现错误，请稍后重试。')
  } finally {
    isLoading.value = false
    streamStatus.value = ''
  }
}

// 发送到MCP服务器
const sendToMCP = async (message: string) => {
  const systemPrompt = config.SYSTEM_PROMPT || '你是一个智能助手，请帮助用户解决问题。'
  
  const requestBody = {
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.value
        .filter(msg => msg.role === 'user')
        .slice(-10) // 只保留最近10条用户消息
        .map(msg => ({ role: 'user', content: msg.content })),
      { role: 'user', content: message }
    ],
    model: selectedModel.value,
    max_tokens: config.LLM_SERVICE.MAX_TOKENS,
    temperature: config.LLM_SERVICE.TEMPERATURE,
    stream: streamEnabled.value
  }
  
  if (streamEnabled.value) {
    await streamResponse(requestBody)
  } else {
    await regularResponse(requestBody)
  }
}

// 流式响应
const streamResponse = async (requestBody: any) => {
  const response = await fetch(`${mcpAddress.value}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.DEFAULT_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  })
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  
  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')
  
  let aiMessage = ''
  const aiMessageObj: Message = {
    role: 'ai',
    content: '',
    timestamp: Date.now()
  }
  
  conversationHistory.value.push(aiMessageObj)
  saveConversationHistory()
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = new TextDecoder().decode(value)
      const lines = chunk.split('\n')
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') break
          
          try {
            const parsed = JSON.parse(data)
            if (parsed.choices?.[0]?.delta?.content) {
              aiMessage += parsed.choices[0].delta.content
              aiMessageObj.content = aiMessage
              saveConversationHistory()
              await nextTick()
              scrollToBottom()
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// 普通响应
const regularResponse = async (requestBody: any) => {
  const response = await fetch(`${mcpAddress.value}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.DEFAULT_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  })
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  
  const data = await response.json()
  const aiContent = data.choices?.[0]?.message?.content || '抱歉，没有收到有效回复。'
  
  addAIMessage(aiContent)
}

// 添加AI消息
const addAIMessage = (content: string) => {
  const aiMessage: Message = {
    role: 'ai',
    content,
    timestamp: Date.now()
  }
  
  conversationHistory.value.push(aiMessage)
  saveConversationHistory()
  
  nextTick(() => {
    scrollToBottom()
  })
}

// 滚动到底部
const scrollToBottom = () => {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

// 监听对话历史变化，自动滚动
watch(conversationHistory, () => {
  nextTick(() => {
    scrollToBottom()
  })
})
</script>

<style scoped>
.chat-panel-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: white;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chat-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.chat-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255,255,255,0.3);
}

.chat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stream-status {
  background: rgba(0, 122, 255, 0.1);
  border: 1px solid rgba(0, 122, 255, 0.3);
  border-radius: 8px;
  margin: 10px 15px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #007AFF;
  font-size: 12px;
  font-weight: 500;
}

.status-indicator {
  width: 8px;
  height: 8px;
  background: #007AFF;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.message {
  max-width: 85%;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.message.user {
  align-self: flex-end;
}

.message.ai {
  align-self: flex-start;
}

.message-content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.user-avatar, .ai-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.user-avatar {
  background: #007AFF;
  color: white;
}

.ai-avatar {
  background: #34C759;
  color: white;
}

.message-text {
  background: #f5f5f5;
  padding: 12px 16px;
  border-radius: 18px;
  line-height: 1.5;
  word-wrap: break-word;
}

.message.user .message-text {
  background: #007AFF;
  color: white;
}

.message.ai .message-text {
  background: #f0f0f0;
  color: #333;
}

.input-container {
  padding: 15px;
  border-top: 1px solid #e0e0e0;
  background: white;
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.input-container textarea {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 20px;
  padding: 12px 16px;
  resize: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  min-height: 44px;
  max-height: 120px;
  outline: none;
  transition: border-color 0.2s;
}

.input-container textarea:focus {
  border-color: #007AFF;
}

.input-container textarea:disabled {
  background: #f5f5f5;
  color: #999;
}

.send-btn {
  background: #007AFF;
  color: white;
  border: none;
  border-radius: 20px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
  background: #0056CC;
}

.send-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.settings-btn {
  position: absolute;
  right: 20px;
  bottom: 20px;
  background: rgba(0,0,0,0.1);
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  cursor: pointer;
  font-size: 20px;
  transition: background 0.2s;
}

.settings-btn:hover {
  background: rgba(0,0,0,0.2);
}

.settings-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  padding: 20px;
  min-width: 400px;
  z-index: 10001;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.settings-header h3 {
  margin: 0;
  color: #333;
}

.settings-header button {
  background: #f0f0f0;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
}

.setting-item {
  margin-bottom: 15px;
}

.setting-item label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
}

.setting-item input,
.setting-item select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.setting-item input[type="checkbox"] {
  width: auto;
}

.settings-content button {
  background: #007AFF;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 10px 20px;
  cursor: pointer;
  width: 100%;
  margin-top: 10px;
}

.settings-content button:hover {
  background: #0056CC;
}
</style>
