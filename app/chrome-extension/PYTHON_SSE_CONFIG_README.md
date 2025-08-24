# Python SSE 客户端配置功能

## 概述

`CloudSSEClient` 现在支持可配置的服务器URL，并在连接成功后提供MCP地址。

## 新功能

### 1. 可配置的服务器URL

- 服务器URL现在可以通过扩展界面进行配置
- 配置会保存到Chrome存储中，重启后仍然有效
- 支持动态更新，无需重启扩展

### 2. MCP地址提供

- 连接成功后自动生成MCP地址
- MCP地址格式：`{serverUrl}/{client_id}/mcp`
- 可以在扩展界面中复制MCP地址

## 使用方法

### 在扩展界面中配置

1. 打开扩展弹窗
2. **重要：必须先断开连接**
3. 在"Server Configuration"部分输入新的服务器URL
4. 点击"Update"按钮保存配置
5. 配置更新后，可以重新连接以使用新的服务器

### 通过代码配置

```typescript
// 获取当前配置
const response = await chrome.runtime.sendMessage({
  type: 'get_python_sse_config'
});

// 更新服务器URL
const response = await chrome.runtime.sendMessage({
  type: 'update_python_sse_config',
  serverUrl: 'http://new-server:8080'
});
```

## 配置存储

- 配置存储在 `chrome.storage.local` 中
- 存储键：`python_sse_server_url`
- 默认值：`http://127.0.0.1:12306`

## 消息类型

### 新增的消息类型

- `get_python_sse_config`: 获取当前配置
- `update_python_sse_config`: 更新服务器URL

### 状态变化消息

连接状态变化消息现在包含更多信息：

```typescript
{
  type: 'python_sse_status_changed',
  payload: {
    connected: boolean,
    timestamp: number,
    mcpUrl?: string,        // MCP地址
    serverUrl?: string,     // 服务器URL
    clientId?: string       // 客户端ID
  }
}
```

## 技术实现

### CloudSSEClient 类

- 新增 `updateServerUrl()` 方法
- 新增 `getServerUrl()` 方法
- 新增 `getMCPUrl()` 方法
- 新增 `getClientId()` 方法
- 自动从存储加载配置

### 错误处理

- URL格式验证
- 存储操作错误处理
- 连接失败时的重试机制

## 注意事项

1. 服务器URL必须包含协议（http:// 或 https://）
2. **重要：只有在断开连接状态下才能更新服务器URL**
3. 更新URL后，需要手动重新连接以使用新的服务器
4. MCP地址只有在连接成功且有clientId时才可用
5. 配置更改会立即生效，无需重启扩展
