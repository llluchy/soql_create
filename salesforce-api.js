// Salesforce API 模块 - 基于 Salesforce Inspector Reloaded 最佳实践
class SalesforceConnection {
    constructor() {
        this.sessionId = null;
        this.instanceHostname = null;
        this.clientId = "SOQL Creator Extension";
    }

    // 获取会话 - 支持多种方式，带权限检查
    async getSession(sfHost, forceRefresh = false) {
        const ACCESS_TOKEN = "access_token";
        const currentUrlIncludesToken = window.location.href.includes(ACCESS_TOKEN);
        const oldToken = localStorage.getItem(sfHost + "_" + ACCESS_TOKEN);
        
        this.instanceHostname = sfHost;
        
        // 如果已有会话且不强制刷新，直接返回
        if (!forceRefresh && this.sessionId && this.instanceHostname === sfHost) {
            return this.sessionId;
        }
        
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

    // 清除会话缓存
    clearSession() {
        this.sessionId = null;
        this.instanceHostname = null;
    }

    // 检查会话是否有效
    hasValidSession() {
        return this.sessionId && this.instanceHostname;
    }

    // 获取Salesforce主机 - 基于 Salesforce Inspector Reloaded
    async getSfHost() {
        try {
            // 获取当前标签页URL
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url) {
                throw new Error('无法获取当前标签页URL');
            }

            // 发送消息到后台脚本获取Salesforce主机
            const sfHost = await new Promise(resolve =>
                chrome.runtime.sendMessage({message: "getSfHost", url: tab.url}, resolve));
            
            return sfHost;
        } catch (error) {
            return null;
        }
    }

    // REST API调用 - 使用 XMLHttpRequest
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

        return new Promise((resolve, reject) => {
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
                reject(new Error("Unknown api type"));
                return;
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

            // 处理响应
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                            resolve(response);
                        } catch (e) {
                            resolve(xhr.responseText);
                        }
                    } else if (xhr.status === 401) {
                        // 处理未授权错误
                        let error = "New access token needed";
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            if (errorResponse.length > 0) {
                                error = errorResponse[0].message;
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                        
                        if (localStorage.getItem(this.instanceHostname + "_access_token")) {
                            this.showTokenExpiredError();
                        }
                        reject(new Error(`Unauthorized: ${error}`));
                    } else if (xhr.status === 403) {
                        // 处理禁止访问错误
                        let error = "Access forbidden";
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            if (errorResponse.length > 0) {
                                error = errorResponse[0].message;
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                        reject(new Error(`Forbidden: ${error}`));
                    } else {
                        // 处理其他错误
                        let errorMessage = "Unknown error";
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            if (Array.isArray(errorResponse)) {
                                errorMessage = errorResponse.map(err => 
                                    `${err.errorCode}: ${err.message}`
                                ).join("\n");
                            } else {
                                errorMessage = JSON.stringify(errorResponse);
                            }
                        } catch (e) {
                            errorMessage = xhr.responseText || `HTTP ${xhr.status}`;
                        }
                        reject(new Error(`HTTP ${xhr.status}: ${errorMessage}`));
                    }
                }
            };

            xhr.onerror = () => reject(new Error("Network error"));
            xhr.send(body);
        });
    }

    // 显示令牌过期错误
    showTokenExpiredError() {
        // 这里可以触发UI显示错误消息
        if (window.soqlCreator) {
            window.soqlCreator.showMessage('访问令牌已过期，请重新生成', 'warning');
        }
    }
}

// SOQL查询执行器
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
            throw error;
        }
    }

    // 获取所有对象列表
    async getSObjects() {
        const url = `/services/data/${this.apiVersion}/sobjects/`;
        
        try {
            const result = await this.sfConn.rest(url);
            return result;
        } catch (error) {
            throw error;
        }
    }
}

// OAuth管理器
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
            
            return { success: true, host: sfHost };
        }
        
        return { success: false };
    }
}

// 错误处理类
class ErrorHandler {
    static handle(error, context = "") {
        
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
        const message = "访问令牌已过期，请重新生成";
        this.showNotification(message, "warning");
    }

    static showPermissionError() {
        const message = "没有足够的权限执行此操作";
        this.showNotification(message, "error");
    }

    static showNetworkError() {
        const message = "网络连接失败，请检查网络连接";
        this.showNotification(message, "error");
    }

    static showGenericError(message) {
        this.showNotification(`操作失败: ${message}`, "error");
    }

    static showNotification(message, type = "info") {
        if (window.soqlCreator) {
            window.soqlCreator.showMessage(message, type);
        }
    }
}

// 创建全局实例
const sfConn = new SalesforceConnection();
const soqlExecutor = new SOQLExecutor(sfConn);
const oauthManager = new OAuthManager();

// 导出到全局作用域
window.sfConn = sfConn;
window.soqlExecutor = soqlExecutor;
window.oauthManager = oauthManager;
window.ErrorHandler = ErrorHandler;
