# Popup 页面显示控制说明

## 📋 当前状态

popup 页面目前只显示 **Python Server SSE** 功能，其他功能已隐藏但代码保留。

## 🔧 如何重新显示其他功能

### 方法 1: 修改 v-if 属性
将想要显示的部分的 `v-if="false"` 改为 `v-if="true"`：

```vue
<!-- 隐藏状态 -->
<div v-if="false" class="section">
  <h2 class="section-title">Native Server 配置</h2>
  <!-- 内容 -->
</div>

<!-- 显示状态 -->
<div v-if="true" class="section">
  <h2 class="section-title">Native Server 配置</h2>
  <!-- 内容 -->
</div>
```

### 方法 2: 删除 v-if 属性
直接删除 `v-if="false"` 属性，元素将始终显示：

```vue
<!-- 删除 v-if 后，元素将始终显示 -->
<div class="section">
  <h2 class="section-title">Native Server 配置</h2>
  <!-- 内容 -->
</div>
```

## 📱 可控制显示的功能模块

### 1. Native Server 配置
```vue
<div v-if="false" class="section">
  <h2 class="section-title">{{ getMessage('nativeServerConfigLabel') }}</h2>
  <!-- 服务器状态、端口配置、连接按钮等 -->
</div>
```

### 2. 语义引擎
```vue
<div v-if="false" class="section">
  <h2 class="section-title">{{ getMessage('semanticEngineLabel') }}</h2>
  <!-- 语义引擎状态、初始化按钮等 -->
</div>
```

### 3. 嵌入模型
```vue
<div v-if="false" class="section">
  <h2 class="section-title">{{ getMessage('embeddingModelLabel') }}</h2>
  <!-- 模型列表、切换按钮等 -->
</div>
```

### 4. 索引数据管理
```vue
<div v-if="false" class="section">
  <h2 class="section-title">{{ getMessage('indexDataManagementLabel') }}</h2>
  <!-- 统计信息、清理按钮等 -->
</div>
```

### 5. 模型缓存管理
```vue
<div v-if="false">
  <ModelCacheManagement
    :cache-stats="cacheStats"
    :is-managing-cache="isManagingCache"
    @cleanup-cache="cleanupCache"
    @clear-all-cache="clearAllCache"
  />
</div>
```

### 6. 确认对话框
```vue
<div v-if="false">
  <ConfirmDialog
    <!-- 对话框配置 -->
  />
</div>
```

## 🎯 快速切换示例

### 显示所有功能
将所有 `v-if="false"` 改为 `v-if="true"`：

```bash
# 使用 sed 命令批量替换（Linux/Mac）
sed -i 's/v-if="false"/v-if="true"/g' App.vue

# 或者手动修改每个 v-if 属性
```

### 只显示特定功能
根据需要修改对应的 `v-if` 属性：

```vue
<!-- 显示 Native Server 配置 -->
<div v-if="true" class="section">
  <h2 class="section-title">{{ getMessage('nativeServerConfigLabel') }}</h2>
  <!-- 内容 -->
</div>

<!-- 隐藏语义引擎 -->
<div v-if="false" class="section">
  <h2 class="section-title">{{ getMessage('semanticEngineLabel') }}</h2>
  <!-- 内容 -->
</div>
```

## 📝 注意事项

1. **代码完整性**: 所有功能代码都保留，只是通过 `v-if` 控制显示
2. **功能依赖**: 某些功能可能依赖其他功能，显示时需要注意依赖关系
3. **性能影响**: 隐藏的元素不会渲染，但相关的 JavaScript 逻辑仍会执行
4. **状态管理**: 隐藏的功能仍会维护其状态，重新显示时会保持之前的状态

## 🔄 恢复默认显示

如果要恢复显示所有功能，可以：

1. 将所有 `v-if="false"` 改为 `v-if="true"`
2. 或者直接删除所有 `v-if` 属性
3. 或者从 Git 历史中恢复原始文件

## 📚 相关文件

- `App.vue` - 主要的 popup 页面组件
- `PythonSSEStatus.vue` - Python SSE 状态组件
- 其他组件文件保持不变

通过这种方式，你可以灵活控制 popup 页面显示哪些功能，而无需删除任何代码。
