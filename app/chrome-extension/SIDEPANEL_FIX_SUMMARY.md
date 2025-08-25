# SidePanel 修复总结

## 问题回顾

我们遇到了两个主要的Chrome SidePanel API问题：

### 1. 第一个问题：API调用签名错误
```
TypeError: Error in invocation of sidePanel.open(sidePanel.OpenOptions options, function callback): No matching signature.
```

**原因**: `chrome.sidePanel.open()` 方法需要两个参数：
- 第一个参数：选项对象
- 第二个参数：回调函数

### 2. 第二个问题：缺少必需参数
```
At least one of `tabId` and `windowId` must be provided
```

**原因**: `chrome.sidePanel.open()` 方法需要在选项对象中指定 `tabId` 或 `windowId`

## 修复方案

### 1. 修复API调用方式

**修复前（错误）：**
```typescript
// ❌ 错误：没有传递必需的参数
chrome.sidePanel.open();

// ❌ 错误：只传递了空对象
chrome.sidePanel.open({});
```

**修复后（正确）：**
```typescript
// ✅ 正确：指定tabId和回调函数
await new Promise((resolve, reject) => {
  // 获取当前活动标签页
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      const currentTab = tabs[0];
      
      // 在当前标签页中打开SidePanel
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

### 2. 完整的修复代码

```typescript
const openChromeSidePanel = async () => {
  try {
    // 首先检查API支持
    const support = checkSidePanelSupport();
    if (!support.supported) {
      throw new Error(support.reason);
    }
    
    // 使用正确的API调用方式，需要指定tabId或windowId
    await new Promise((resolve, reject) => {
      // 获取当前活动标签页
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (tabs && tabs.length > 0) {
          const currentTab = tabs[0];
          console.log('Opening SidePanel for tab:', currentTab.id);
          
          // 在当前标签页中打开SidePanel
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
    
    console.log('Chrome SidePanel opened successfully');
  } catch (error) {
    console.error('Failed to open Chrome SidePanel:', error);
    
    let errorMessage = '打开侧边栏失败\n\n';
    errorMessage += '可能的解决方案：\n';
    errorMessage += '1. 确保Chrome版本为114或更高\n';
    errorMessage += '2. 手动打开侧边栏：\n';
    errorMessage += '   - 按 Ctrl+Shift+E (Windows/Linux)\n';
    errorMessage += '   - 或按 Cmd+Shift+E (Mac)\n';
    errorMessage += '   - 或点击地址栏右侧的侧边栏图标\n';
    errorMessage += '3. 检查扩展权限是否正确\n\n';
    errorMessage += '错误详情：' + error.message;
    
    alert(errorMessage);
  }
};
```

## 技术要点

### 1. Chrome SidePanel API 要求

- **必需参数**: `tabId` 或 `windowId` 必须指定一个
- **回调函数**: 异步操作完成后必须调用回调函数
- **错误处理**: 使用 `chrome.runtime.lastError` 检查错误

### 2. 标签页查询

```typescript
chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
  // tabs[0] 是当前活动的标签页
  const currentTab = tabs[0];
  const tabId = currentTab.id;
});
```

### 3. Promise 包装

由于Chrome API使用回调函数，我们需要用Promise包装来支持async/await：

```typescript
await new Promise((resolve, reject) => {
  chrome.sidePanel.open({ tabId: tabId }, function() {
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message));
    } else {
      resolve();
    }
  });
});
```

## 测试验证

### 1. 使用测试页面

我们创建了 `test-sidepanel.html` 测试页面，可以用来验证修复：

1. 打开测试页面
2. 点击"检查Chrome版本"
3. 点击"检查SidePanel API"
4. 点击"测试打开SidePanel"

### 2. 在控制台中测试

```javascript
// 检查API是否可用
if (chrome.sidePanel) {
  console.log('SidePanel API available');
  
  // 获取当前标签页
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      const currentTab = tabs[0];
      console.log('Current tab:', currentTab.id);
      
      // 测试打开SidePanel
      chrome.sidePanel.open({ tabId: currentTab.id }, function() {
        if (chrome.runtime.lastError) {
          console.error('Error:', chrome.runtime.lastError.message);
        } else {
          console.log('Success!');
        }
      });
    }
  });
}
```

## 权限要求

确保在 `wxt.config.ts` 中有以下权限：

```typescript
permissions: [
  'sidePanel',  // 侧边栏权限
  'tabs',       // 标签页访问权限（必需）
  // ... 其他权限
],
side_panel: {
  default_path: 'sidepanel.html'
}
```

## 兼容性

- **Chrome版本**: 需要114或更高版本
- **API支持**: 需要支持SidePanel API
- **权限**: 需要sidePanel和tabs权限

## 总结

通过修复这两个关键问题：

1. ✅ **API调用签名**: 正确传递选项对象和回调函数
2. ✅ **必需参数**: 指定tabId来标识目标标签页
3. ✅ **错误处理**: 完善的错误捕获和用户提示
4. ✅ **测试工具**: 提供测试页面和故障排除指南

现在Chrome SidePanel功能应该能够正常工作，用户可以：

- 点击扩展按钮打开SidePanel
- 使用快捷键打开SidePanel
- 在浏览器右侧看到扩展的侧边栏
- 享受不干扰浏览的原生体验

这个修复确保了扩展能够正确使用Chrome的现代API，为用户提供最佳的扩展使用体验。
