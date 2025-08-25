# Chrome SidePanel 功能说明

## 概述

这个Chrome扩展现在支持Chrome浏览器的原生SidePanel功能，用户可以通过点击按钮或使用快捷键打开浏览器右侧的侧边栏窗口。

## 功能特性

### 1. 原生Chrome SidePanel
- **浏览器集成**: 使用Chrome的原生SidePanel API
- **固定位置**: 显示在浏览器右侧，不会遮挡页面内容
- **持久显示**: 可以保持打开状态，方便随时查看
- **响应式设计**: 自动适应不同的屏幕尺寸

### 2. 系统状态监控
- **连接状态**: 实时显示与本地服务器的连接状态
- **服务器状态**: 显示MCP服务器的运行状态和端口信息
- **自动刷新**: 每30秒自动更新状态信息
- **手动刷新**: 支持手动刷新按钮

### 3. 快速操作
- **打开聊天**: 一键打开聊天面板
- **刷新状态**: 手动刷新系统状态
- **设置面板**: 快速访问设置选项
- **统计信息**: 显示已索引页面和活跃标签页数量

### 4. 实时活动记录
- **时间戳**: 显示当前时间和最后检查时间
- **活动日志**: 记录重要的系统活动
- **状态更新**: 实时反映系统变化

## 使用方法

### 方法1: 通过扩展按钮
1. 点击Chrome扩展图标打开popup
2. 点击"打开侧边栏"按钮
3. Chrome SidePanel会自动打开

### 方法2: 使用快捷键
- **Windows/Linux**: `Ctrl + Shift + E`
- **Mac**: `Cmd + Shift + E`

### 方法3: 手动打开
1. 在Chrome地址栏右侧找到侧边栏图标
2. 点击图标打开侧边栏
3. 选择"MCP Chrome Extension"标签页

## 技术实现

### 1. Manifest配置
```typescript
// wxt.config.ts
permissions: [
  'sidePanel', // 添加侧边栏权限
],
side_panel: {
  default_path: 'sidepanel.html' // 指定侧边栏页面
}
```

### 2. 文件结构
```
public/
├── sidepanel.html      # SidePanel的HTML页面
└── sidepanel.js        # SidePanel的JavaScript逻辑
```

### 3. API集成
- 使用Chrome SidePanel API (`chrome.sidePanel.open()`)
- 通过Chrome Runtime API与background script通信
- 支持消息传递和状态同步

## 配置要求

### 1. Chrome版本
- 需要Chrome 114或更高版本
- 支持SidePanel API的现代浏览器

### 2. 扩展权限
- `sidePanel`: 访问侧边栏功能
- `tabs`: 获取标签页信息
- `storage`: 访问存储数据
- `background`: 后台脚本支持

### 3. 文件访问
- 确保`sidepanel.html`和`sidepanel.js`在public目录中
- 构建时会自动复制到输出目录

## 功能详解

### 1. 状态监控
```javascript
// 自动刷新状态
setInterval(() => {
  this.loadStatus();
}, 30000);

// 更新连接状态
updateConnectionStatus(status) {
  const element = document.getElementById('connection-status');
  element.className = `status-value status-${status}`;
}
```

### 2. 消息通信
```javascript
// 发送消息到background script
async sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
```

### 3. 通知系统
```javascript
// 显示成功通知
showSuccess(message) {
  this.showNotification(message, 'success');
}

// 显示错误通知
showError(message) {
  this.showNotification(message, 'error');
}
```

## 自定义和扩展

### 1. 添加新功能
- 在`sidepanel.html`中添加新的UI元素
- 在`sidepanel.js`中实现对应的逻辑
- 在background script中处理相关消息

### 2. 样式定制
- 修改CSS变量来调整主题色彩
- 添加新的动画效果
- 调整布局和响应式设计

### 3. 功能增强
- 添加更多状态监控指标
- 实现更复杂的交互功能
- 集成其他Chrome API

## 故障排除

### 1. SidePanel无法打开
**问题**: 点击按钮后SidePanel没有反应
**解决方案**:
- 检查Chrome版本是否支持SidePanel API
- 确认扩展权限是否正确配置
- 查看控制台是否有错误信息

### 2. 状态显示异常
**问题**: 状态信息显示不正确或无法更新
**解决方案**:
- 检查background script是否正常运行
- 确认消息传递是否成功
- 验证API调用是否返回正确数据

### 3. 样式显示问题
**问题**: UI显示异常或布局错乱
**解决方案**:
- 检查CSS文件是否正确加载
- 确认响应式设计是否正常工作
- 验证浏览器兼容性

## 最佳实践

### 1. 性能优化
- 使用合理的刷新间隔（建议30秒）
- 避免频繁的DOM操作
- 合理使用事件监听器

### 2. 用户体验
- 提供清晰的状态反馈
- 支持键盘快捷键操作
- 保持界面简洁明了

### 3. 错误处理
- 实现完善的错误捕获机制
- 提供用户友好的错误提示
- 支持降级方案

## 更新日志

### v1.0.0
- 初始版本，支持基本的SidePanel功能
- 集成Chrome原生SidePanel API
- 实现状态监控和快速操作

### 计划功能
- 支持主题切换
- 添加更多统计信息
- 实现数据导出功能
- 支持自定义快捷键

## 总结

Chrome SidePanel功能为扩展提供了一个强大的侧边栏界面，用户可以：

1. **方便访问**: 随时查看系统状态和快速操作
2. **不干扰浏览**: 侧边栏不会遮挡页面内容
3. **持久显示**: 可以保持打开状态，提高工作效率
4. **原生体验**: 使用Chrome原生功能，体验更流畅

这个实现充分利用了Chrome的现代API，为用户提供了更好的扩展使用体验。
