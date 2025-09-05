# Salesforce扩展插件开发指南

## 概述

本指南基于Salesforce Inspector Reloaded项目的分析，详细说明如何创建一个与Salesforce进行数据交互的浏览器扩展插件。

## 1. 项目结构

```
your-extension/
├── manifest.json          # 扩展配置文件
├── background.js          # 后台服务脚本
├── sidepanel.html        # 侧边栏界面
├── sidepanel.js          # 侧边栏逻辑
├── salesforce-api.js     # 核心API调用模块
└── sidepanel.css         # 样式文件
```

## 2. 扩展配置 (manifest.json)

```json
{
  "name": "SOQL Creator",
  "description": "帮助Salesforce开发者快速生成SOQL查询语句的浏览器插件",
  "version": "1.0.0",
  "manifest_version": 3,
  "permissions": [
    "activeTab",
    "storage",
    "sidePanel",
    "scripting",
    "tabs",
    "cookies"
  ],
  "host_permissions": [
    "https://*.salesforce.com/*",
    "https://*.salesforce-setup.com/*",
    "https://*.force.com/*",
    "https://*.cloudforce.com/*",
    "https://*.visualforce.com/*",
    "https://*.lightning.force.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "SOQL Creator"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
}
```

## 3. 权限获取机制

### 3.1 后台服务脚本 (background.js)

```javascript
// 处理会话获取请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "getSession") {
    const sfHost = request.sfHost;
    
    // 从浏览器cookie获取Salesforce会话
    chrome.cookies.get({
      url: "https://" + sfHost, 
      name: "sid", 
      storeId: sender.tab.cookieStoreId
    }, sessionCookie => {
      if (!sessionCookie) {
        sendResponse(null);
        return;
      }
      
      // 返回会话信息
      let session = {
        key: sessionCookie.value, 
        hostname: sessionCookie.domain
      };
      sendResponse(session);
    });
    
    return true; // 异步响应
  }
});

// 处理OAuth重定向
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "createWindow") {
    chrome.windows.create({
      url: request.url,
      incognito: request.incognito ?? false
    });
  }
});
```

### 3.2 核心API模块 (salesforce-api.js)

```javascript
// 会话管理类
class SalesforceConnection {
  constructor() {
    this.sessionId = null;
    this.instanceHostname = null;
    this.clientId = "SOQL Creator Extension";
  }

  // 获取会话
  async getSession(sfHost) {
    const ACCESS_TOKEN = "access_token";
    const currentUrlIncludesToken = window.location.href.includes(ACCESS_TOKEN);
    const oldToken = localStorage.getItem(sfHost + "_" + ACCESS_TOKEN);
    
    this.instanceHostname = sfHost;
    
    // 方式1: OAuth流程刚完成
    if (currentUrlIncludesToken) {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = decodeURI(hashParams.get(ACCESS_TOKEN));
      sfHost = decodeURI(hashParams.get("instance_url")).replace(/^https?:\/\//i, "");
      this.sessionId = accessToken;
      localStorage.setItem(sfHost + "_" + ACCESS_TOKEN, accessToken);
    }
    // 方式2: 使用已保存的访问令牌
    else if (oldToken) {
      this.sessionId = oldToken;
    }
    // 方式3: 从cookie获取会话
    else {
      let message = await new Promise(resolve =>
        chrome.runtime.sendMessage({message: "getSession", sfHost}, resolve));
      if (message) {
        this.instanceHostname = message.hostname;
        this.sessionId = message.key;
      }
    }
    
    return this.sessionId;
  }

  // REST API调用
  async rest(url, options = {}) {
    const {
      method = "GET",
      api = "normal",
      body = undefined,
      headers = {},
      logErrors = true
    } = options;

    if (!this.instanceHostname) {
      throw new Error("Instance Hostname not found");
    }

    let xhr = new XMLHttpRequest();
    const sfHost = "https://" + this.instanceHostname;
    const fullUrl = new URL(url, sfHost);
    
    xhr.open(method, fullUrl.toString(), true);
    xhr.setRequestHeader("Accept", "application/json; charset=UTF-8");
    xhr.setRequestHeader("Sforce-Call-Options", `client=${this.clientId}`);

    // 根据API类型设置认证头
    if (api === "bulk") {
      xhr.setRequestHeader("X-SFDC-Session", this.sessionId);
    } else if (api === "normal") {
      xhr.setRequestHeader("Authorization", "Bearer " + this.sessionId);
    } else {
      throw new Error("Unknown api type");
    }

    // 设置请求体
    if (body !== undefined) {
      xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
      if (typeof body === "object") {
        body = JSON.stringify(body);
      }
    }

    // 设置自定义头部
    for (let [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }

    // 发送请求
    await new Promise((resolve, reject) => {
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          resolve();
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(body);
    });

    // 处理响应
    if (xhr.status >= 200 && xhr.status < 300) {
      return xhr.response;
    } else if (xhr.status === 401) {
      // 处理未授权错误
      let error = xhr.response.length > 0 ? xhr.response[0].message : "New access token needed";
      if (localStorage.getItem(this.instanceHostname + "_access_token")) {
        // 显示重新生成令牌的提示
        this.showTokenExpiredError();
      }
      throw new Error(`Unauthorized: ${error}`);
    } else if (xhr.status === 403) {
      // 处理禁止访问错误
      let error = xhr.response.length > 0 ? xhr.response[0].message : "Access forbidden";
      throw new Error(`Forbidden: ${error}`);
    } else {
      // 处理其他错误
      let errorMessage = "Unknown error";
      try {
        errorMessage = xhr.response.map(err => 
          `${err.errorCode}: ${err.message}`
        ).join("\n");
      } catch (ex) {
        errorMessage = JSON.stringify(xhr.response);
      }
      throw new Error(`HTTP ${xhr.status}: ${errorMessage}`);
    }
  }

  // 显示令牌过期错误
  showTokenExpiredError() {
    // 实现错误提示逻辑
    console.warn("Access token expired. Please generate a new token.");
  }
}

// 创建全局实例
const sfConn = new SalesforceConnection();
```

## 4. SOQL查询执行

### 4.1 查询执行器

```javascript
class SOQLExecutor {
  constructor(sfConn) {
    this.sfConn = sfConn;
    this.apiVersion = "v64.0"; // 使用最新的API版本
  }

  // 执行SOQL查询
  async executeSOQL(query, options = {}) {
    const {
      useToolingApi = false,
      includeDeleted = false
    } = options;

    let endpoint;
    if (useToolingApi) {
      endpoint = `/services/data/${this.apiVersion}/tooling/query/`;
    } else if (includeDeleted) {
      endpoint = `/services/data/${this.apiVersion}/queryAll/`;
    } else {
      endpoint = `/services/data/${this.apiVersion}/query/`;
    }

    const url = `${endpoint}?q=${encodeURIComponent(query)}`;
    
    try {
      const result = await this.sfConn.rest(url);
      return result;
    } catch (error) {
      console.error("SOQL execution failed:", error);
      throw error;
    }
  }

  // 执行SOSL搜索
  async executeSOSL(searchQuery) {
    const url = `/services/data/${this.apiVersion}/search/?q=${encodeURIComponent(searchQuery)}`;
    
    try {
      const result = await this.sfConn.rest(url);
      return result;
    } catch (error) {
      console.error("SOSL execution failed:", error);
      throw error;
    }
  }

  // 获取对象描述
  async describeSObject(sobjectName) {
    const url = `/services/data/${this.apiVersion}/sobjects/${sobjectName}/describe/`;
    
    try {
      const result = await this.sfConn.rest(url);
      return result;
    } catch (error) {
      console.error("Describe failed:", error);
      throw error;
    }
  }
}

// 创建查询执行器实例
const soqlExecutor = new SOQLExecutor(sfConn);
```

### 4.2 使用示例

```javascript
// 在sidepanel.js中使用
async function loadAccountData() {
  try {
    // 获取当前Salesforce主机
    const sfHost = await getCurrentSalesforceHost();
    
    // 获取会话
    await sfConn.getSession(sfHost);
    
    // 执行SOQL查询
    const query = "SELECT Id, Name, Industry FROM Account LIMIT 10";
    const result = await soqlExecutor.executeSOQL(query);
    
    // 处理结果
    console.log("查询结果:", result.records);
    displayResults(result.records);
    
  } catch (error) {
    console.error("加载数据失败:", error);
    ErrorHandler.handle(error, "loadAccountData");
  }
}

// 获取当前Salesforce主机
async function getCurrentSalesforceHost() {
  return new Promise((resolve) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const url = new URL(tabs[0].url);
      resolve(url.hostname);
    });
  });
}
```

## 5. OAuth2集成

### 5.1 OAuth配置

```javascript
class OAuthManager {
  constructor() {
    this.clientId = "your_connected_app_client_id"; // 需要替换为实际的Connected App Client ID
    this.redirectUri = `chrome-extension://${chrome.runtime.id}/sidepanel.html`;
  }

  // 启动OAuth流程
  startOAuthFlow(sfHost) {
    const authUrl = `https://${sfHost}/services/oauth2/authorize?` +
      `response_type=token&` +
      `client_id=${this.clientId}&` +
      `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
      `scope=api refresh_token`;
    
    // 打开OAuth授权页面
    chrome.runtime.sendMessage({
      message: "createWindow",
      url: authUrl
    });
  }

  // 处理OAuth回调
  handleOAuthCallback() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    
    const accessToken = params.get('access_token');
    const instanceUrl = params.get('instance_url');
    
    if (accessToken && instanceUrl) {
      const sfHost = instanceUrl.replace(/^https?:\/\//i, "");
      localStorage.setItem(sfHost + "_access_token", accessToken);
      
      // 重定向到主页面
      window.location.href = `sidepanel.html?host=${sfHost}`;
    }
  }
}

const oauthManager = new OAuthManager();
```

### 5.2 在sidepanel.html中处理OAuth回调

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SOQL Creator</title>
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <div id="app">
    <div id="loading">正在加载...</div>
    <div id="content" style="display: none;">
      <!-- 主要内容 -->
    </div>
  </div>
  
  <script src="salesforce-api.js"></script>
  <script src="sidepanel.js"></script>
  
  <script>
    // 检查是否是OAuth回调
    if (window.location.hash.includes('access_token')) {
      oauthManager.handleOAuthCallback();
    } else {
      // 正常加载
      initializeApp();
    }
  </script>
</body>
</html>
```

## 6. 错误处理和用户反馈

### 6.1 错误处理类

```javascript
class ErrorHandler {
  static handle(error, context = "") {
    console.error(`Error in ${context}:`, error);
    
    if (error.message.includes("Unauthorized")) {
      this.showTokenError();
    } else if (error.message.includes("Forbidden")) {
      this.showPermissionError();
    } else if (error.message.includes("Network error")) {
      this.showNetworkError();
    } else {
      this.showGenericError(error.message);
    }
  }

  static showTokenError() {
    // 显示令牌错误提示
    const message = "访问令牌已过期，请重新生成";
    this.showNotification(message, "warning");
  }

  static showPermissionError() {
    // 显示权限错误提示
    const message = "没有足够的权限执行此操作";
    this.showNotification(message, "error");
  }

  static showNetworkError() {
    // 显示网络错误提示
    const message = "网络连接失败，请检查网络连接";
    this.showNotification(message, "error");
  }

  static showGenericError(message) {
    // 显示通用错误提示
    this.showNotification(`操作失败: ${message}`, "error");
  }

  static showNotification(message, type = "info") {
    // 实现通知显示逻辑
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}
```

## 7. 完整的使用示例

### 7.1 sidepanel.js 完整示例

```javascript
// sidepanel.js
class SOQLCreator {
  constructor() {
    this.sfHost = null;
    this.isLoading = false;
  }

  async init() {
    try {
      this.showLoading(true);
      
      // 获取当前Salesforce主机
      this.sfHost = await this.getCurrentSalesforceHost();
      
      // 获取会话
      await sfConn.getSession(this.sfHost);
      
      // 加载对象列表
      await this.loadObjects();
      
      // 显示主界面
      this.showMainInterface();
      
    } catch (error) {
      ErrorHandler.handle(error, "initialization");
      this.showMessage("初始化失败", "error");
    } finally {
      this.showLoading(false);
    }
  }

  async getCurrentSalesforceHost() {
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const url = new URL(tabs[0].url);
        resolve(url.hostname);
      });
    });
  }

  async loadObjects() {
    try {
      const result = await soqlExecutor.getSObjects();
      // 处理对象列表
      this.displayObjects(result);
    } catch (error) {
      console.warn("无法获取对象列表:", error);
    }
  }

  async executeQuery() {
    const query = document.getElementById('queryInput').value;
    if (!query.trim()) {
      this.showMessage("请输入查询语句", "warning");
      return;
    }

    try {
      this.showLoading(true);
      
      const result = await soqlExecutor.executeSOQL(query);
      this.displayQueryResults(result);
      
    } catch (error) {
      ErrorHandler.handle(error, "query execution");
    } finally {
      this.showLoading(false);
    }
  }

  displayQueryResults(result) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = `
      <h3>查询结果 (${result.totalSize} 条记录)</h3>
      <div class="results-table">
        ${this.createResultsTable(result.records)}
      </div>
    `;
  }

  displayObjects(result) {
    // 实现对象列表显示逻辑
    console.log("对象列表:", result);
  }

  createResultsTable(records) {
    if (!records || records.length === 0) {
      return "<p>没有找到记录</p>";
    }

    const fields = Object.keys(records[0]).filter(key => key !== 'attributes');
    const headerRow = fields.map(field => `<th>${field}</th>`).join('');
    const dataRows = records.map(record => 
      `<tr>${fields.map(field => `<td>${record[field] || ''}</td>`).join('')}</tr>`
    ).join('');

    return `
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${dataRows}</tbody>
      </table>
    `;
  }

  showLoading(show) {
    this.isLoading = show;
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    
    if (show) {
      loadingEl.style.display = 'block';
      contentEl.style.display = 'none';
    } else {
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
    }
  }

  showMessage(message, type = 'info') {
    // 实现消息显示逻辑
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  showMainInterface() {
    document.getElementById('content').innerHTML = `
      <div class="header">
        <h2>SOQL Creator</h2>
        <p>当前组织: ${this.sfHost}</p>
      </div>
      
      <div class="query-section">
        <textarea id="queryInput" placeholder="输入SOQL查询语句，例如: SELECT Id, Name FROM Account LIMIT 10"></textarea>
        <button id="executeBtn" onclick="soqlCreator.executeQuery()">执行查询</button>
      </div>
      
      <div id="results" class="results-section"></div>
      <div id="error" class="error-message" style="display: none;"></div>
    `;
  }
}

// 初始化扩展
const soqlCreator = new SOQLCreator();
document.addEventListener('DOMContentLoaded', () => {
  soqlCreator.init();
});
```

## 8. 部署和测试

### 8.1 本地测试

1. 打开Chrome扩展管理页面 (`chrome://extensions/`)
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择你的扩展文件夹

### 8.2 生产部署

1. 创建扩展的ZIP文件
2. 在Chrome Web Store开发者控制台上传
3. 填写扩展信息和权限说明
4. 提交审核

## 9. 最佳实践

### 9.1 安全性

- 始终验证用户输入
- 使用HTTPS进行所有API调用
- 安全存储访问令牌
- 实现适当的错误处理

### 9.2 性能

- 使用缓存减少API调用
- 实现分页处理大量数据
- 异步处理长时间运行的操作
- 优化UI响应性

### 9.3 用户体验

- 提供清晰的错误消息
- 实现加载状态指示
- 支持键盘快捷键
- 响应式设计

## 10. 常见问题

### Q: 如何处理会话过期？
A: 实现自动令牌刷新机制，或在401错误时提示用户重新授权。

### Q: 如何支持多个Salesforce组织？
A: 使用组织特定的存储键，如 `${sfHost}_access_token`。

### Q: 如何处理大量数据？
A: 实现分页、流式处理或使用Bulk API。

### Q: 如何调试API调用？
A: 在开发者工具中查看网络请求，检查请求头和响应。

---

这个指南提供了创建Salesforce扩展插件的完整框架。您可以根据具体需求调整和扩展功能。记住始终遵循Salesforce的安全最佳实践和API使用限制。

