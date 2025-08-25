// SidePanel JavaScript 逻辑
class SidePanelManager {
    constructor() {
        this.init();
    }

    init() {
        this.updateTime();
        this.bindEvents();
        this.loadStatus();
        this.startAutoRefresh();
    }

    bindEvents() {
        // 打开聊天按钮
        document.getElementById('open-chat-btn').addEventListener('click', () => {
            this.openChat();
        });

        // 刷新状态按钮
        document.getElementById('refresh-status-btn').addEventListener('click', () => {
            this.refreshStatus();
        });

        // 设置按钮
        document.getElementById('open-settings-btn').addEventListener('click', () => {
            this.openSettings();
        });

        // 刷新所有数据按钮
        document.getElementById('refresh-all-btn').addEventListener('click', () => {
            this.refreshAllData();
        });
    }

    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        document.getElementById('current-time').textContent = timeString;
        
        // 每分钟更新一次时间
        setTimeout(() => this.updateTime(), 60000);
    }

    async loadStatus() {
        try {
            // 获取连接状态
            const connectionResponse = await this.sendMessage({ type: 'PING_HTTP_SERVER' });
            this.updateConnectionStatus(connectionResponse?.connected ? 'connected' : 'disconnected');

            // 获取服务器状态
            const serverResponse = await this.sendMessage({ 
                type: 'GET_SERVER_STATUS' 
            });
            this.updateServerStatus(serverResponse?.serverStatus);

            // 获取存储统计
            const storageResponse = await this.sendMessage({ 
                type: 'get_storage_stats' 
            });
            this.updateStorageStats(storageResponse?.stats);

            // 更新最后检查时间
            this.updateLastCheckTime();

        } catch (error) {
            console.error('Failed to load status:', error);
            this.showError('加载状态失败: ' + error.message);
        }
    }

    updateConnectionStatus(status) {
        const element = document.getElementById('connection-status');
        element.className = `status-value status-${status}`;
        
        switch (status) {
            case 'connected':
                element.textContent = '已连接';
                break;
            case 'disconnected':
                element.textContent = '未连接';
                break;
            default:
                element.textContent = '检测中...';
                element.className = 'status-value status-unknown';
        }
    }

    updateServerStatus(serverStatus) {
        const element = document.getElementById('server-status');
        
        if (serverStatus?.isRunning) {
            element.className = 'status-value status-running';
            element.textContent = `运行中 (端口: ${serverStatus.port || '未知'})`;
        } else {
            element.className = 'status-value status-stopped';
            element.textContent = '已停止';
        }
    }

    updateStorageStats(stats) {
        if (stats) {
            document.getElementById('indexed-pages').textContent = stats.indexedPages || 0;
            document.getElementById('active-tabs').textContent = stats.totalTabs || 0;
        }
    }

    updateLastCheckTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        document.getElementById('last-check-time').textContent = timeString;
    }

    async refreshStatus() {
        const button = document.getElementById('refresh-status-btn');
        button.classList.add('loading');
        
        try {
            await this.loadStatus();
            this.showSuccess('状态已刷新');
        } catch (error) {
            this.showError('刷新失败: ' + error.message);
        } finally {
            button.classList.remove('loading');
        }
    }

    async refreshAllData() {
        const button = document.getElementById('refresh-all-btn');
        button.classList.add('loading');
        
        try {
            await this.loadStatus();
            this.showSuccess('所有数据已刷新');
        } catch (error) {
            this.showError('刷新失败: ' + error.message);
        } finally {
            button.classList.remove('loading');
        }
    }

    openChat() {
        // 发送消息给background script来打开聊天面板
        this.sendMessage({ 
            type: 'OPEN_CHAT_PANEL' 
        }).then(() => {
            this.showSuccess('正在打开聊天面板...');
        }).catch(error => {
            this.showError('打开聊天面板失败: ' + error.message);
        });
    }

    openSettings() {
        // 发送消息给background script来打开设置
        this.sendMessage({ 
            type: 'OPEN_SETTINGS' 
        }).then(() => {
            this.showSuccess('正在打开设置...');
        }).catch(error => {
            this.showError('打开设置失败: ' + error.message);
        });
    }

    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // 添加样式
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
            max-width: 300px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease-out;
        `;

        // 根据类型设置背景色
        if (type === 'success') {
            notification.style.background = '#10b981';
        } else if (type === 'error') {
            notification.style.background = '#ef4444';
        } else {
            notification.style.background = '#3b82f6';
        }

        // 添加到页面
        document.body.appendChild(notification);

        // 3秒后自动移除
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    startAutoRefresh() {
        // 每30秒自动刷新一次状态
        setInterval(() => {
            this.loadStatus();
        }, 30000);
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 初始化SidePanel
document.addEventListener('DOMContentLoaded', () => {
    new SidePanelManager();
});

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATUS_UPDATE') {
        // 处理状态更新
        if (message.connectionStatus !== undefined) {
            const sidePanel = document.querySelector('.sidepanel-container')?.__sidePanelManager;
            if (sidePanel) {
                sidePanel.updateConnectionStatus(message.connectionStatus);
            }
        }
        
        if (message.serverStatus !== undefined) {
            const sidePanel = document.querySelector('.sidepanel-container')?.__sidePanelManager;
            if (sidePanel) {
                sidePanel.updateServerStatus(message.serverStatus);
            }
        }
        
        sendResponse({ success: true });
    }
});
