# SidePanel 故障排除指南

## 问题描述

用户报告在调用 `chrome.sidePanel.open()` 时出现错误：
```
TypeError: Error in invocation of sidePanel.open(sidePanel.OpenOptions options, function callback): No matching signature.
```

## 问题分析

这个错误表明 `chrome.sidePanel.open()` 方法的调用签名不正确。根据错误信息，该方法期望：
- 第一个参数：`sidePanel.OpenOptions options` (选项对象)
- 第二个参数：`function callback` (回调函数)

## 解决方案

### 1. 修复API调用方式

**错误的调用方式：**
```javascript
// ❌ 错误：没有传递必需的参数
chrome.sidePanel.open();

// ❌ 错误：只传递了一个参数
chrome.sidePanel.open({});
```

**正确的调用方式：**
```javascript
// ✅ 正确：指定tabId和回调函数
chrome.sidePanel.open({ tabId: currentTabId }, function() {
  console.log('SidePanel opened successfully');
});

// ✅ 正确：使用Promise包装，获取当前标签页
await new Promise((resolve, reject) => {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      const currentTab = tabs[0];
      chrome.sidePanel.open({ tabId: currentTab.id }, function() {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } else {
      reject(new Error('无法获取当前标签页'));
    }
  });
});
```

### 2. 检查Chrome版本

SidePanel API 需要 Chrome 114 或更高版本：

```javascript
function checkChromeVersion() {
  const userAgent = navigator.userAgent;
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
  
  if (chromeMatch) {
    const version = parseInt(chromeMatch[1]);
    if (version < 114) {
      throw new Error(`Chrome版本过低，需要114或更高版本，当前版本：${version}`);
    }
  }
}
```

### 3. 检查API可用性

```javascript
function checkSidePanelSupport() {
  if (!chrome.sidePanel) {
    throw new Error('SidePanel API不可用');
  }
  
  if (typeof chrome.sidePanel.open !== 'function') {
    throw new Error('SidePanel.open方法不可用');
  }
  
  return true;
}
```

## 测试步骤

### 1. 使用测试页面

我们创建了一个测试页面 `test-sidepanel.html`，可以用来验证API是否正常工作：

1. 在浏览器中打开 `chrome-extension://<extension-id>/test-sidepanel.html`
2. 点击"检查Chrome版本"按钮
3. 点击"检查SidePanel API"按钮
4. 点击"测试打开SidePanel"按钮

### 2. 在控制台中测试

```javascript
// 检查API是否可用
if (chrome.sidePanel) {
  console.log('SidePanel API available');
  console.log('Methods:', Object.getOwnPropertyNames(chrome.sidePanel));
} else {
  console.log('SidePanel API not available');
}

// 测试打开SidePanel
if (chrome.sidePanel && chrome.sidePanel.open) {
  chrome.sidePanel.open({}, function() {
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError.message);
    } else {
      console.log('Success!');
    }
  });
}
```

## 常见问题

### 1. "SidePanel API不可用"

**可能原因：**
- Chrome版本过低（< 114）
- 扩展权限配置错误
- 扩展未正确加载

**解决方案：**
- 更新Chrome到最新版本
- 检查 `wxt.config.ts` 中的权限配置
- 重新加载扩展

### 2. "open方法不可用"

**可能原因：**
- API存在但方法未实现
- 权限不足

**解决方案：**
- 检查Chrome版本
- 确认扩展权限
- 查看控制台错误信息

### 3. "调用失败"

**可能原因：**
- API调用方式错误
- 参数类型不匹配
- 运行时错误

**解决方案：**
- 使用正确的API调用方式
- 检查参数类型
- 查看详细错误信息

## 降级方案

如果SidePanel API无法使用，提供以下替代方案：

### 1. 快捷键提示

```javascript
function showManualInstructions() {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcut = isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E';
  
  alert(`请手动打开Chrome的侧边栏：\n1. 按 ${shortcut}\n2. 或点击地址栏右侧的侧边栏图标`);
}
```

### 2. 新标签页打开

```javascript
function openSidePanelInNewTab() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('sidepanel.html')
  });
}
```

### 3. 弹出窗口

```javascript
function openSidePanelAsPopup() {
  const width = 400;
  const height = 600;
  const left = screen.width - width;
  const top = (screen.height - height) / 2;
  
  window.open(
    chrome.runtime.getURL('sidepanel.html'),
    'sidepanel',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
}
```

## 调试技巧

### 1. 启用详细日志

```javascript
// 在popup中添加详细日志
const openChromeSidePanel = async () => {
  console.log('Starting SidePanel open process...');
  
  try {
    console.log('Checking Chrome version...');
    const support = checkSidePanelSupport();
    console.log('Support check result:', support);
    
    if (!support.supported) {
      throw new Error(support.reason);
    }
    
    console.log('Calling chrome.sidePanel.open...');
    await new Promise((resolve, reject) => {
      chrome.sidePanel.open({}, function() {
        console.log('SidePanel.open callback executed');
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('SidePanel opened successfully');
          resolve();
        }
      });
    });
    
    console.log('SidePanel open process completed');
  } catch (error) {
    console.error('SidePanel open process failed:', error);
    // 显示错误信息给用户
  }
};
```

### 2. 检查扩展状态

```javascript
// 检查扩展是否正确加载
chrome.management.getSelf(function(extensionInfo) {
  console.log('Extension info:', extensionInfo);
  console.log('Permissions:', extensionInfo.permissions);
  console.log('Enabled:', extensionInfo.enabled);
});
```

## 总结

主要问题是 `chrome.sidePanel.open()` 方法的调用方式不正确。修复后，SidePanel功能应该能够正常工作。

如果问题仍然存在，请：
1. 使用测试页面验证API状态
2. 检查Chrome版本和扩展权限
3. 查看控制台详细错误信息
4. 考虑使用降级方案

修复后的代码应该能够正常打开Chrome的SidePanel，为用户提供更好的扩展使用体验。
