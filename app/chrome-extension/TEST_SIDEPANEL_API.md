# Chrome SidePanel API 测试文档

## 问题描述

用户报告在调用 `chrome.sidePanel.open()` 时出现错误：
```
TypeError: Error in invocation of sidePanel.open(sidePanel.OpenOptions options, function callback): No matching signature.
```

## 错误分析

这个错误表明 `chrome.sidePanel.open()` 方法的调用签名不正确。根据错误信息，该方法期望：
- 第一个参数：`sidePanel.OpenOptions options`
- 第二个参数：`function callback`

## 正确的API用法

### 1. 方法1：使用回调函数，指定tabId
```javascript
chrome.sidePanel.open({ tabId: currentTabId }, function() {
  console.log('SidePanel opened');
});
```

### 2. 方法2：使用Promise包装，获取当前标签页
```javascript
function openSidePanel() {
  return new Promise((resolve, reject) => {
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
}
```

### 3. 方法3：检查API可用性，完整实现
```javascript
function openSidePanel() {
  if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
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
  } else {
    return Promise.reject(new Error('SidePanel API not available'));
  }
}
```

## 修复建议

### 1. 更新App.vue中的函数
```typescript
const openChromeSidePanel = async () => {
  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
      // 使用正确的API调用方式
      await new Promise((resolve, reject) => {
        chrome.sidePanel.open({}, function() {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
      
      console.log('Chrome SidePanel opened successfully');
    } else {
      throw new Error('Chrome SidePanel API not available');
    }
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

### 2. 添加API版本检查
```typescript
// 检查Chrome版本和API支持
function checkSidePanelSupport() {
  const userAgent = navigator.userAgent;
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
  
  if (chromeMatch) {
    const version = parseInt(chromeMatch[1]);
    console.log('Chrome version:', version);
    
    if (version < 114) {
      console.warn('Chrome version too old for SidePanel API');
      return false;
    }
  }
  
  if (!chrome.sidePanel) {
    console.warn('SidePanel API not available');
    return false;
  }
  
  if (typeof chrome.sidePanel.open !== 'function') {
    console.warn('SidePanel.open method not available');
    return false;
  }
  
  return true;
}
```

## 测试步骤

### 1. 检查Chrome版本
- 打开 `chrome://version/`
- 确认版本号 >= 114

### 2. 检查扩展权限
- 打开 `chrome://extensions/`
- 确认扩展有 `sidePanel` 权限

### 3. 测试API调用
```javascript
// 在浏览器控制台中测试
if (chrome.sidePanel) {
  console.log('SidePanel API available');
  console.log('Methods:', Object.getOwnPropertyNames(chrome.sidePanel));
  
  if (chrome.sidePanel.open) {
    console.log('open method available');
    console.log('open method type:', typeof chrome.sidePanel.open);
  }
}
```

### 4. 测试打开SidePanel
```javascript
// 测试打开SidePanel（需要指定tabId）
chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
  if (tabs && tabs.length > 0) {
    const currentTab = tabs[0];
    chrome.sidePanel.open({ tabId: currentTab.id }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError.message);
      } else {
        console.log('SidePanel opened successfully');
      }
    });
  }
});
```

## 降级方案

如果SidePanel API不可用，提供以下替代方案：

### 1. 快捷键提示
```javascript
function showManualInstructions() {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcut = isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E';
  
  alert(`请手动打开Chrome的侧边栏：\n1. 按 ${shortcut}\n2. 或点击地址栏右侧的侧边栏图标`);
}
```

### 2. 创建新标签页
```javascript
function openSidePanelInNewTab() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('sidepanel.html')
  });
}
```

## 总结

主要问题是 `chrome.sidePanel.open()` 方法的调用方式不正确。正确的方法应该：

1. 接受一个选项对象作为第一个参数
2. 接受一个回调函数作为第二个参数
3. 使用Promise包装来处理异步操作

修复后，SidePanel功能应该能够正常工作。
