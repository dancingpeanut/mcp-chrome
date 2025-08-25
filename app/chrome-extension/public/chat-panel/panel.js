class ChatBot {
    constructor() {
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.sendIcon = document.getElementById('sendIcon');
        this.streamStatus = document.getElementById('streamStatus');
        this.settingsBtn = document.getElementById('settingsBtn');
        
        this.isLoading = false;
        this.conversationHistory = [];
        
        // 从配置文件获取默认设置
        this.config = window.CONFIG || {};
        this.defaultApiKey = this.config.DEFAULT_API_KEY || this.generateRandomApiKey();
        
        this.init();
    }
    
    generateRandomApiKey() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 32; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    init() {
        // 加载设置
        this.loadSettings();
        
        // 初始化 WASM
        this.initWasm();

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
        
        // 检查配置是否有效
        this.checkConfig();
    }

    async initWasm() {
        try {
            this.wasm = new window.WasmIntegration();
            const ok = await this.wasm.init();
            if (ok) {
                console.log('WASM 已初始化');
            }
        } catch (err) {
            console.warn('WASM 初始化失败: ', err);
        }
    }
    
    loadSettings() {
        // 默认启用流式输出
        this.streamEnabled = true;
        // 读取 MCP 地址
        try {
            const saved = localStorage.getItem('mcpAddress');
            this.mcpAddress = typeof saved === 'string' ? saved : '';
        } catch (_) {
            this.mcpAddress = '';
        }
        // 读取模型设置
        try {
            const saved = localStorage.getItem('model');
            this.model = typeof saved === 'string' ? saved : this.config.LLM_SERVICE?.MODEL || 'qwen3-32b';
        } catch (_) {
            this.model = this.config.LLM_SERVICE?.MODEL || 'qwen3-32b';
        }
    }
    
    isStreamEnabled() {
        return this.streamEnabled;
    }

    openSettings() {
        const choice = window.prompt('请选择要设置的内容：\n1. MCP 地址\n2. 系统提示词\n3. AI 模型\n\n请输入数字 1、2 或 3：', '1');
        
        if (choice === null) return; // 用户取消
        
        if (choice === '1' || choice === '1') {
            this.setMcpAddress();
        } else if (choice === '2' || choice === '2') {
            this.setSystemPrompt();
        } else if (choice === '3' || choice === '3') {
            this.setModel();
        } else {
            this.showMessage('❌ 无效选择，请输入 1、2 或 3', 'ai');
        }
    }
    
    setMcpAddress() {
        const current = this.mcpAddress || '';
        const input = window.prompt('请输入浏览器 MCP 地址（例如：https://localhost:3000）', current);
        if (input === null) return; // 用户取消
        const value = String(input).trim();
        if (!value) {
            try { localStorage.removeItem('mcpAddress'); } catch (_) {}
            this.mcpAddress = '';
            this.showMessage('已清空 MCP 地址', 'ai');
            return;
        }
        try {
            // 基础校验
            // 允许 http(s) 或 ws(s)
            const url = new URL(value);
            if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
                throw new Error('协议必须为 http/https/ws/wss');
            }
            localStorage.setItem('mcpAddress', value);
            this.mcpAddress = value;
            this.showMessage(`✅ MCP 地址已保存：${value}`, 'ai');
        } catch (e) {
            this.showMessage(`❌ MCP 地址无效：${e.message}`, 'ai');
        }
    }
    
    setSystemPrompt() {
        const current = this.getSystemPrompt();
        const input = window.prompt('请输入系统提示词（用于指导AI助手的角色和行为）：', current);
        if (input === null) return; // 用户取消
        const value = String(input).trim();
        if (!value) {
            try { localStorage.removeItem('systemPrompt'); } catch (_) {}
            this.showMessage('已恢复默认系统提示词', 'ai');
            return;
        }
        try {
            localStorage.setItem('systemPrompt', value);
            this.showMessage(`✅ 系统提示词已保存`, 'ai');
        } catch (e) {
            this.showMessage(`❌ 保存失败：${e.message}`, 'ai');
        }
    }
    
    getSystemPrompt() {
        try {
            const saved = localStorage.getItem('systemPrompt');
            return typeof saved === 'string' ? saved : this.config.SYSTEM_PROMPT;
        } catch (_) {
            return this.config.SYSTEM_PROMPT;
        }
    }
    
    setModel() {
        const current = this.getModel();
        const input = window.prompt('请输入 AI 模型名称（例如：qwen3-32b、gpt-4、claude-3）：', current);
        if (input === null) return; // 用户取消
        const value = String(input).trim();
        if (!value) {
            try { localStorage.removeItem('model'); } catch (_) {}
            this.showMessage('已恢复默认模型设置', 'ai');
            return;
        }
        try {
            localStorage.setItem('model', value);
            this.showMessage(`✅ AI 模型已设置为：${value}`, 'ai');
        } catch (e) {
            this.showMessage(`❌ 保存失败：${e.message}`, 'ai');
        }
    }
    
    getModel() {
        try {
            const saved = localStorage.getItem('model');
            return typeof saved === 'string' ? saved : this.config.LLM_SERVICE?.MODEL || 'qwen3-32b';
        } catch (_) {
            return this.config.LLM_SERVICE?.MODEL || 'qwen3-32b';
        }
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isLoading) return;
        
        // 使用默认API Key
        const apiKey = this.defaultApiKey;
        
        if (!apiKey) {
            this.showMessage('请在config.js中配置你的孔明智能API Key', 'ai');
            return;
        }
        
        // 添加用户消息
        this.addMessage(message, 'user');

        // 优先处理本地 WASM 指令
        const handled = await this.tryHandleLocalCommand(message);
        if (handled) {
            return;
        }
        this.messageInput.value = '';
        
        // 显示加载状态
        this.setLoading(true);
        
        try {
            // 调用OpenAI API
            await this.callOpenAI(message);
            // 不再 this.addMessage(response, 'ai')，避免重复
        } catch (error) {
            console.error('Error:', error);
            this.addMessage(`抱歉，发生了错误：${error.message}`, 'ai');
        } finally {
            this.setLoading(false);
        }
    }

    async tryHandleLocalCommand(message) {
        if (!this.wasm || !this.wasm.isReady || !this.wasm.isReady()) return false;

        const cmd = message.trim();
        try {
            if (cmd.startsWith('/fib ')) {
                const n = parseInt(cmd.slice(5).trim());
                const res = this.wasm.fibonacci(Number.isFinite(n) ? n : 0);
                this.addMessage(`斐波那契(${n}) = ${res}`, 'ai');
                return true;
            }
            if (cmd.startsWith('/add ')) {
                const [a, b] = cmd.slice(5).split(/[ ,]+/).map(parseFloat);
                const res = this.wasm.add(a, b);
                this.addMessage(`${a} + ${b} = ${res}`, 'ai');
                return true;
            }
            if (cmd.startsWith('/mul ')) {
                const [a, b] = cmd.slice(5).split(/[ ,]+/).map(parseFloat);
                const res = this.wasm.multiply(a, b);
                this.addMessage(`${a} × ${b} = ${res}`, 'ai');
                return true;
            }
            if (cmd.startsWith('/greet ')) {
                const name = cmd.slice(7).trim();
                const res = this.wasm.greet(name);
                this.addMessage(res, 'ai');
                return true;
            }
            if (cmd.startsWith('/arr ')) {
                const arr = cmd.slice(5).split(',').map(s => parseFloat(s.trim()));
                const res = Array.from(this.wasm.processArray(arr));
                this.addMessage(`处理后: [${res.join(', ')}]`, 'ai');
                return true;
            }
        } catch (e) {
            this.addMessage(`WASM 执行错误: ${e.message}`, 'ai');
            return true;
        }
        return false;
    }
    
    async callOpenAI(message) {
        const apiKey = this.defaultApiKey;
        const baseUrl = this.config.LLM_SERVICE?.BASE_URL || 'http://llm.demo.haizhi.com';
        const model = this.getModel();
        const maxTokens = this.config.LLM_SERVICE?.MAX_TOKENS || 1000;
        const temperature = this.config.LLM_SERVICE?.TEMPERATURE || 0.7;

        // 构建对话历史
        this.conversationHistory.push({ role: 'user', content: message });

        if (this.conversationHistory.length > (this.config.DEFAULTS?.MAX_CONVERSATION_HISTORY || 20)) {
            this.conversationHistory = this.conversationHistory.slice(-(this.config.DEFAULTS?.MAX_CONVERSATION_HISTORY || 20));
        }

        return new Promise(async (resolve, reject) => {
            const aiMessageDiv = this.createAIMessageContainer();
            const isStream = this.isStreamEnabled();

            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': isStream ? 'text/event-stream' : 'application/json'
                };
                if (this.mcpAddress) {
                    headers['x-mcp-address'] = this.mcpAddress;
                }

                const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'system', content: this.getSystemPrompt() },
                            ...this.conversationHistory
                        ],
                        max_tokens: maxTokens,
                        temperature: temperature,
                        stream: isStream
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const contentType = response.headers.get('content-type') || '';
                if (isStream && contentType.includes('text/event-stream')) {
                    await this.processSSEStream(response, aiMessageDiv, resolve, reject);
                } else {
                    const data = await response.json();
                    const aiResponse = data?.choices?.[0]?.message?.content || '';
                    this.finishStream(aiMessageDiv, aiResponse);
                    if (aiResponse) {
                        this.conversationHistory.push({ role: 'assistant', content: aiResponse });
                        resolve(aiResponse);
                    } else {
                        reject(new Error('API响应中消息内容为空'));
                    }
                }
            } catch (err) {
                console.error('请求错误: ', err);
                this.showMessage(`❌ 错误：${err.message}` , 'ai');
                reject(err);
            }
        });
    }

    async processSSEStream(response, aiMessageDiv, resolve, reject) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let contentAgg = '';
        let reasoningAgg = '';
        let reasoningDiv = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    const finalText = buffer.trim() || contentAgg;
                    this.finishStream(aiMessageDiv, finalText);
                    this.conversationHistory.push({ role: 'assistant', content: finalText });
                    resolve(finalText);
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        const finalText = buffer.trim() || contentAgg;
                        this.finishStream(aiMessageDiv, finalText);
                        this.conversationHistory.push({ role: 'assistant', content: finalText });
                        resolve(finalText);
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed?.choices?.[0]?.delta || {};
                        const content = typeof delta.content === 'string' ? delta.content : '';
                        const reasoningContent = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';

                        if (content) {
                            contentAgg += content;
                            buffer = contentAgg; // 同步主文本
                            this.showStreamStatus();
                            this.updateStreamContent(aiMessageDiv, contentAgg);
                            // 每次内容更新后保持滚动跟随
                            this.scrollToBottomSmooth();
                        }
                        if (reasoningContent) {
                            if (!reasoningDiv) {
                                reasoningDiv = this.createReasoningDivAfter(aiMessageDiv);
                            }
                            reasoningAgg += reasoningContent;
                            reasoningDiv.textContent = reasoningAgg;
                            reasoningDiv.style.display = '';
                            // 思考内容更新后也保持滚动跟随
                            this.scrollToBottomSmooth();
                        }
                    } catch (e) {
                        console.warn('SSE 数据解析失败:', e, '原始数据:', data);
                    }
                }
            }
        } catch (error) {
            console.error('流式处理错误:', error);
            this.showMessage(`❌ 错误：流式处理失败：${error.message}`, 'ai');
            reject(error);
        } finally {
            reader.releaseLock();
            this.hideStreamStatus();
        }
    }
    
    createAIMessageContainer() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ai-message thinking';
        messageDiv.textContent = '正在思考';

        // 创建思考内容区块
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'ai-reasoning';
        messageDiv.appendChild(reasoningDiv);

        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();

        return messageDiv;
    }

    addReasoningMessage(reasoningContent) {
        if (!reasoningContent) return;
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'ai-reasoning';
        reasoningDiv.textContent = reasoningContent;
        this.chatContainer.appendChild(reasoningDiv);
        this.scrollToBottom();
    }

    updateStreamContent(messageDiv, content) {
        // 只更新主内容
        messageDiv.classList.remove('thinking');
        messageDiv.classList.add('streaming');
        let mainTextNode = null;
        for (const node of messageDiv.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                mainTextNode = node;
                break;
            }
        }
        if (!mainTextNode) {
            mainTextNode = document.createTextNode('');
            messageDiv.insertBefore(mainTextNode, messageDiv.firstChild);
        }
        if (typeof content === 'string') {
            mainTextNode.textContent = content;
        }
        // 使用 scrollIntoView 保持滚动跟随
        this.scrollToBottomSmooth();
    }

    finishStream(messageDiv, finalContent) {
        // 只移除动画和状态，不再 set 内容，避免重复
        messageDiv.classList.remove('thinking', 'typing', 'streaming');
        this.hideStreamStatus();
        // 流式输出结束时保持滚动跟随
        this.scrollToBottomSmooth();
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
    
    addMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.textContent = content;
        
        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    setLoading(loading) {
        this.isLoading = loading;
        this.sendBtn.disabled = loading;
        
        if (loading) {
            this.sendIcon.innerHTML = '<div class="loading"></div>';
        } else {
            this.sendIcon.textContent = '➤';
        }
    }
    
    scrollToBottom() {
        // 使用 setTimeout 确保在DOM渲染后滚动，避免输入框聚焦等影响
        const container = this.chatContainer;
        if (!container) return;
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 0);
    }
    
    scrollToBottomSmooth() {
        // 使用 scrollIntoView 实现平滑滚动跟随
        const container = this.chatContainer;
        if (!container || !container.lastElementChild) return;
        
        const lastMessage = container.lastElementChild;
        lastMessage.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'end',
            inline: 'nearest'
        });
    }
    
    showMessage(content, type) {
        this.addMessage(content, type);
    }

    checkConfig() {
        if (!this.defaultApiKey) {
            this.showMessage('⚠️ 请先在config.js中配置你的孔明智能API Key', 'ai');
        }
    }

    getOrCreateReasoningDiv() {
        let div = this.chatContainer.querySelector('.ai-reasoning:last-of-type');
        if (!div) {
            div = document.createElement('div');
            div.className = 'ai-reasoning';
            this.chatContainer.appendChild(div);
        }
        div.style.display = '';
        return div;
    }

    createReasoningDivAfter(messageDiv) {
        const div = document.createElement('div');
        div.className = 'ai-reasoning';
        div.style.display = '';
        // 插入到当前AI消息前面（思考内容在上，正文在下）
        messageDiv.parentNode.insertBefore(div, messageDiv);
        // 新创建的思考内容区块立即滚动到可见区域
        this.scrollToBottomSmooth();
        return div;
    }
}

// 页面加载完成后初始化聊天机器人
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot();
});
