// 孔明智能插件配置文件
// 
// 使用说明：
// 1. 将 DEFAULT_API_KEY 改为你的孔明智能API Key
// 2. 如需使用其他LLM服务，修改 LLM_SERVICE.BASE_URL
// 3. 可以调整模型参数如 max_tokens 和 temperature
// 4. 修改完成后重新加载扩展即可生效
//
const CONFIG = {
    // 默认API Key - 请替换为你的孔明智能API Key
    // 获取方式：访问孔明智能官网，在API Keys页面创建
    DEFAULT_API_KEY: '',
    
    // 孔明智能服务配置
    LLM_SERVICE: {
        // 服务地址 - 孔明智能API服务地址
        // BASE_URL: 'http://llm.demo.haizhi.com',
        // BASE_URL: 'http://demo-chrome.demo.haizhi.com',
        BASE_URL: 'http://127.0.0.1:10823',
        // 使用的模型名称 - 孔明智能模型
        MODEL: 'qwen3-32b',
        // 最大生成token数量
        MAX_TOKENS: 102400,
        // 生成随机性，0-1之间，越高越随机
        TEMPERATURE: 0.7
    },

    SYSTEM_PROMPT: "",
    
    // 默认设置
    DEFAULTS: {
        // 是否默认启用流式输出
        STREAM_OUTPUT: true,
        // 最大对话历史记录数量
        MAX_CONVERSATION_HISTORY: 64
    }
};

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
