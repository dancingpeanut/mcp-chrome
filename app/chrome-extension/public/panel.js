// 孔明智能助手 - Panel版本
class ChatBot {
    constructor() {
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.streamStatus = document.getElementById('streamStatus');
        
        this.isLoading = false;
        this.conversationHistory = [];
        
        // 默认配置
        this.config = {
            LLM_SERVICE: {
                BASE_URL: 'http://127.0.0.1:10823',
                MODEL: 'qwen3-32b',
                MAX_TOKENS: 1000,
                TEMPERATURE: 0.7
            },
            DEFAULTS: {
                STREAM_OUTPUT: true,
                MAX_CONVERSATION_HISTORY: 64
            }
        };
        
        this.streamEnabled = true;
        this.mcpAddress = '';
        this.model = this.config.LLM_SERVICE.MODEL;
        
        this.init();
    }
    
    init() {
        // 加载设置
        this.loadSettings();
        
        // 绑定事件
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        // 自动调整输入框高度
        this.messageInput.addEventListener('input', () => this.autoResizeTextarea());
        
        // 添加欢迎消息
        this.addMessage('您好！我是孔明智能助手，很高兴为您服务。您可以输入 /help 查看可用命令，或者直接与我对话。', 'ai');
        
        // 聚焦输入框
        this.messageInput.focus();
    }
    
    loadSettings() {
        try {
            const saved = localStorage.getItem('chatApiConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.config.LLM_SERVICE = { ...this.config.LLM_SERVICE, ...parsed };
                this.model = this.config.LLM_SERVICE.MODEL;
            }
            
            // 加载流式输出设置
            const streamSetting = localStorage.getItem('streamEnabled');
            if (streamSetting !== null) {
                this.streamEnabled = streamSetting === 'true';
            }
        } catch (error) {
            console.warn('加载设置失败:', error);
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('chatApiConfig', JSON.stringify({
                BASE_URL: this.config.LLM_SERVICE.BASE_URL,
                MODEL: this.config.LLM_SERVICE.MODEL,
                MAX_TOKENS: this.config.LLM_SERVICE.MAX_TOKENS,
                TEMPERATURE: this.config.LLM_SERVICE.TEMPERATURE
            }));
            
            // 保存流式输出设置
            localStorage.setItem('streamEnabled', this.streamEnabled.toString());
        } catch (error) {
            console.warn('保存设置失败:', error);
        }
    }
    
    openSettings() {
        const choice = window.prompt(
            '请选择要设置的内容：\n' +
            '1. API地址\n' +
            '2. AI模型\n' +
            '3. 温度\n' +
            '4. 最大Token\n' +
            '5. 流式输出\n\n' +
            '请输入数字 1-5：', '1'
        );
        
        if (choice === null) return;
        
        switch (choice.trim()) {
            case '1':
                this.setApiAddress();
                break;
            case '2':
                this.setModel();
                break;
            case '3':
                this.setTemperature();
                break;
            case '4':
                this.setMaxTokens();
                break;
            case '5':
                this.setStreamOutput();
                break;
            default:
                this.addMessage('❌ 无效选择，请输入 1-5', 'ai');
        }
    }
    
    setApiAddress() {
        const newAddress = window.prompt(
            '请输入API地址：\n' +
            '当前地址：' + this.config.LLM_SERVICE.BASE_URL,
            this.config.LLM_SERVICE.BASE_URL
        );
        
        if (newAddress && newAddress.trim()) {
            this.config.LLM_SERVICE.BASE_URL = newAddress.trim();
            this.saveSettings();
            this.addMessage('✅ API地址已更新为：' + this.config.LLM_SERVICE.BASE_URL, 'ai');
        }
    }
    
    setModel() {
        const models = ['qwen3-32b', 'qwen2.5-32b', 'qwen2.5-14b', 'gpt-3.5-turbo'];
        const modelList = models.map((m, i) => `${i + 1}. ${m}`).join('\n');
        
        const choice = window.prompt(
            '请选择模型：\n' + modelList + '\n\n请输入数字 1-' + models.length + '：',
            models.indexOf(this.model) + 1
        );
        
        if (choice && !isNaN(choice)) {
            const index = parseInt(choice) - 1;
            if (index >= 0 && index < models.length) {
                this.model = models[index];
                this.config.LLM_SERVICE.MODEL = this.model;
                this.saveSettings();
                this.addMessage('✅ 模型已更新为：' + this.model, 'ai');
            }
        }
    }
    
    setTemperature() {
        const newTemp = window.prompt(
            '请输入温度值（0-1，越高越随机）：\n' +
            '当前温度：' + this.config.LLM_SERVICE.TEMPERATURE,
            this.config.LLM_SERVICE.TEMPERATURE
        );
        
        if (newTemp && !isNaN(newTemp)) {
            const temp = parseFloat(newTemp);
            if (temp >= 0 && temp <= 1) {
                this.config.LLM_SERVICE.TEMPERATURE = temp;
                this.saveSettings();
                this.addMessage('✅ 温度已更新为：' + temp, 'ai');
            } else {
                this.addMessage('❌ 温度值必须在0-1之间', 'ai');
            }
        }
    }
    
    setMaxTokens() {
        const newMaxTokens = window.prompt(
            '请输入最大Token数（100-100000）：\n' +
            '当前值：' + this.config.LLM_SERVICE.MAX_TOKENS,
            this.config.LLM_SERVICE.MAX_TOKENS
        );
        
        if (newMaxTokens && !isNaN(newMaxTokens)) {
            const tokens = parseInt(newMaxTokens);
            if (tokens >= 100 && tokens <= 100000) {
                this.config.LLM_SERVICE.MAX_TOKENS = tokens;
                this.saveSettings();
                this.addMessage('✅ 最大Token数已更新为：' + tokens, 'ai');
            } else {
                this.addMessage('❌ Token数必须在100-100000之间', 'ai');
            }
        }
    }
    
    setStreamOutput() {
        const currentStatus = this.streamEnabled ? '启用' : '禁用';
        const choice = window.prompt(
            `当前流式输出状态：${currentStatus}\n\n` +
            '请选择：\n' +
            '1. 启用流式输出（实时显示AI回复）\n' +
            '2. 禁用流式输出（等待完整回复后显示）\n\n' +
            '请输入数字 1 或 2：',
            this.streamEnabled ? '1' : '2'
        );
        
        if (choice === null) return;
        
        switch (choice.trim()) {
            case '1':
                this.streamEnabled = true;
                this.saveSettings();
                this.addMessage('✅ 流式输出已启用，AI回复将实时显示', 'ai');
                break;
            case '2':
                this.streamEnabled = false;
                this.saveSettings();
                this.addMessage('✅ 流式输出已禁用，AI回复将等待完整后显示', 'ai');
                break;
            default:
                this.addMessage('❌ 无效选择，请输入 1 或 2', 'ai');
        }
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isLoading) return;
        
        // 检查特殊命令
        if (await this.handleSpecialCommands(message)) {
            this.messageInput.value = '';
            this.autoResizeTextarea();
            return;
        }
        
        // 添加用户消息
        this.addMessage(message, 'user');
        this.messageInput.value = '';
        this.autoResizeTextarea();
        
        // 显示加载状态
        this.setLoading(true);
        
        try {
            // 调用AI API
            await this.callAIAPI(message);
        } catch (error) {
            console.error('发送消息失败:', error);
            this.addMessage(`抱歉，处理您的消息时出现了错误：${error.message}`, 'ai');
        } finally {
            this.setLoading(false);
        }
    }
    
    async handleSpecialCommands(message) {
        const cmd = message.trim().toLowerCase();
        
        if (cmd === '/help') {
            this.addMessage(`可用命令：
• /help - 显示此帮助信息
• /clear - 清空对话历史
• /time - 显示当前时间
• /settings - 打开设置面板
• /status - 显示当前配置状态

设置说明：
• 输入 /settings 可以配置API地址、模型、温度、最大Token和流式输出
• 流式输出启用时，AI回复会实时显示；禁用时会等待完整回复后显示

其他消息将发送给AI助手处理。`, 'ai');
            return true;
        }
        
        if (cmd === '/clear') {
            this.conversationHistory = [];
            this.chatContainer.innerHTML = '';
            this.addMessage('对话历史已清空。', 'ai');
            return true;
        }
        
        if (cmd === '/time') {
            this.addMessage(`当前时间：${new Date().toLocaleString('zh-CN')}`, 'ai');
            return true;
        }
        
        if (cmd === '/status') {
            this.addMessage(`当前配置：
• API地址：${this.config.LLM_SERVICE.BASE_URL}
• 模型：${this.model}
• 温度：${this.config.LLM_SERVICE.TEMPERATURE}
• 最大Token：${this.config.LLM_SERVICE.MAX_TOKENS}
• 流式输出：${this.streamEnabled ? '启用' : '禁用'}`, 'ai');
            return true;
        }
        
        return false;
    }
    
    async callAIAPI(userMessage) {
        try {
            // 如果启用流式输出，创建流式消息容器
            let streamMessageDiv = null;
            let streamMessageText = null;
            
            if (this.streamEnabled) {
                // 创建流式消息容器
                streamMessageDiv = document.createElement('div');
                streamMessageDiv.className = 'message ai';
                streamMessageDiv.id = 'streamMessage';
                
                const messageContent = document.createElement('div');
                messageContent.className = 'message-content';
                
                streamMessageText = document.createElement('div');
                streamMessageText.className = 'message-text';
                streamMessageText.innerHTML = '';
                
                const messageTime = document.createElement('div');
                messageTime.className = 'message-time';
                messageTime.textContent = new Date().toLocaleTimeString('zh-CN', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                messageContent.appendChild(streamMessageText);
                messageContent.appendChild(messageTime);
                streamMessageDiv.appendChild(messageContent);
                
                this.chatContainer.appendChild(streamMessageDiv);
                this.scrollToBottom();
            }
            
            const response = await fetch(`${this.config.LLM_SERVICE.BASE_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer 123`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: '你是一个有用的AI助手，请用中文回答用户的问题。' },
                        { role: 'user', content: userMessage }
                    ],
                    max_tokens: this.config.LLM_SERVICE.MAX_TOKENS,
                    temperature: this.config.LLM_SERVICE.TEMPERATURE,
                    stream: this.streamEnabled
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            if (this.streamEnabled) {
                // 流式处理
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullResponse = '';
                
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');
                        
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') {
                                    // 流式响应结束
                                    if (streamMessageDiv) {
                                        streamMessageDiv.id = ''; // 移除ID，避免重复删除
                                    }
                                    break;
                                }
                                
                                try {
                                    const parsed = JSON.parse(data);
                                    const content = parsed.choices?.[0]?.delta?.content || '';
                                    if (content) {
                                        fullResponse += content;
                                        if (streamMessageText) {
                                            streamMessageText.innerHTML = fullResponse.replace(/\n/g, '<br>');
                                            this.scrollToBottom();
                                        }
                                    }
                                } catch (e) {
                                    // 忽略解析错误
                                }
                            }
                        }
                    }
                } finally {
                    reader.releaseLock();
                }
                
                // 保存到历史记录
                this.conversationHistory.push({ role: 'assistant', content: fullResponse });
                
            } else {
                // 非流式处理
                const data = await response.json();
                const aiResponse = data?.choices?.[0]?.message?.content || '抱歉，我没有收到有效的回复。';
                
                if (streamMessageDiv) {
                    // 如果创建了流式容器但未启用流式，则更新内容
                    if (streamMessageText) {
                        streamMessageText.innerHTML = aiResponse.replace(/\n/g, '<br>');
                    }
                } else {
                    this.addMessage(aiResponse, 'ai');
                }
            }
            
        } catch (error) {
            console.error('API调用失败:', error);
            
            // 智能错误提示
            let errorMessage = '抱歉，AI服务暂时不可用。';
            
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = '网络连接失败，请检查API地址是否正确，或者AI服务是否正在运行。';
            } else if (error.message.includes('HTTP 404')) {
                errorMessage = 'API地址不存在，请检查配置的地址是否正确。';
            } else if (error.message.includes('HTTP 500')) {
                errorMessage = 'AI服务内部错误，请稍后重试。';
            } else {
                errorMessage = `连接错误：${error.message}`;
            }
            
            this.addMessage(errorMessage, 'ai');
            throw error;
        }
    }
    
    addMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.innerHTML = content.replace(/\n/g, '<br>');
        
        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = new Date().toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageContent.appendChild(messageText);
        messageContent.appendChild(messageTime);
        messageDiv.appendChild(messageContent);
        
        this.chatContainer.appendChild(messageDiv);
        
        // 保存到历史记录
        this.conversationHistory.push({ role: type === 'user' ? 'user' : 'assistant', content });
        
        // 限制历史记录数量
        if (this.conversationHistory.length > this.config.DEFAULTS.MAX_CONVERSATION_HISTORY) {
            this.conversationHistory = this.conversationHistory.slice(-this.config.DEFAULTS.MAX_CONVERSATION_HISTORY);
        }
        
        // 滚动到底部
        this.scrollToBottom();
    }
    
    setLoading(loading) {
        this.isLoading = loading;
        this.sendBtn.disabled = loading;
        this.messageInput.disabled = loading;
        
        if (loading) {
            if (this.streamEnabled) {
                this.showStreamStatus();
            } else {
                this.showTypingIndicator();
            }
        } else {
            this.hideTypingIndicator();
            this.hideStreamStatus();
        }
    }
    
    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai';
        typingDiv.id = 'typingIndicator';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        
        messageContent.appendChild(typingIndicator);
        typingDiv.appendChild(messageContent);
        
        this.chatContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }
    
    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
    
    showStreamStatus() {
        if (this.streamStatus) {
            this.streamStatus.style.display = 'flex';
        }
    }
    
    hideStreamStatus() {
        if (this.streamStatus) {
            this.streamStatus.style.display = 'none';
        }
    }
    
    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
    
    autoResizeTextarea() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
    }
}

// 初始化聊天机器人
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot();
});
