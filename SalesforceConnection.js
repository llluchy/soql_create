// Salesforce API 模块 - 基于 Salesforce Inspector Reloaded 最佳实践
let defaultApiVersion = "64.0";
let apiVersion = localStorage.getItem("apiVersion") == null ? defaultApiVersion : localStorage.getItem("apiVersion");

let sessionError;
const clientId = "SOQL Creator Extension";

class XML {
    static stringify({name, attributes, value}) {
        let doc = new DOMParser().parseFromString("<" + name + attributes + "/>", "text/xml");
        
        function buildRequest(el, params) {
            if (params == null) {
                el.setAttribute("xsi:nil", "true");
            } else if (typeof params == "object") {
                for (let [key, value] of Object.entries(params)) {
                    if (key == "_") {
                        if (value == null) {
                            el.setAttribute("xsi:nil", "true");
                        } else {
                            el.textContent = value;
                        }
                    } else if (key == "$xsi:type") {
                        el.setAttribute("xsi:type", value);
                    } else if (value === undefined) {
                        // 忽略
                    } else if (Array.isArray(value)) {
                        for (let element of value) {
                            let x = doc.createElement(key);
                            buildRequest(x, element);
                            el.appendChild(x);
                        }
                    } else {
                        let x = doc.createElement(key);
                        buildRequest(x, value);
                        el.appendChild(x);
                    }
                }
            } else {
                el.textContent = params;
            }
        }
        
        buildRequest(doc.documentElement, value);
        return '<?xml version="1.0" encoding="UTF-8"?>' + new XMLSerializer().serializeToString(doc).replace(/ xmlns=""/g, "");
    }

    static parse(element) {
        function parseResponse(element) {
            let str = ""; // XSD简单类型值
            let obj = null; // XSD复杂类型值
            // 如果元素有子元素，它是复杂类型。否则我们假设它是简单类型。
            if (element.getAttribute("xsi:nil") == "true") {
                return null;
            }
            let type = element.getAttribute("xsi:type");
            if (type) {
                // Salesforce从不在简单类型上设置xsi:type属性。它只用于sObjects。
                obj = {
                    "$xsi:type": type
                };
            }
            for (let child = element.firstChild; child != null; child = child.nextSibling) {
                if (child instanceof CharacterData) {
                    str += child.data;
                } else if (child instanceof Element) {
                    if (obj == null) {
                        obj = {};
                    }
                    let name = child.localName;
                    let content = parseResponse(child);
                    if (name in obj) {
                        if (obj[name] instanceof Array) {
                            obj[name].push(content);
                        } else {
                            obj[name] = [obj[name], content];
                        }
                    } else {
                        obj[name] = content;
                    }
                } else {
                    throw new Error("未知的子节点类型");
                }
            }
            return obj || str;
        }
        return parseResponse(element);
    }
}

class SalesforceConnection {
    constructor() {
        this.sessionId = null;
        this.instanceHostname = null;
        this.clientId = clientId;
    }

    // 获取会话 - 参考 inspector.js 的实现
    async getSession(sfHost) {
        sfHost = this.getMyDomain(sfHost);
        const ACCESS_TOKEN = "access_token"; // OAuth 回调 URL 中的参数名
        const currentUrlIncludesToken = window.location.href.includes(ACCESS_TOKEN);
        const oldToken = localStorage.getItem(sfHost + "_" + ACCESS_TOKEN);
        this.instanceHostname = sfHost;
        
        console.log("getSession 调试信息:", {
            sfHost,
            currentUrlIncludesToken,
            hasOldToken: !!oldToken,
            oldTokenLength: oldToken ? oldToken.length : 0
        });
        
        if (currentUrlIncludesToken){ // OAuth流程刚完成
            if (window.location.href.includes(ACCESS_TOKEN)) {
                const url = new URL(window.location.href);
                const hashParams = new URLSearchParams(url.hash.substring(1)); // hash (#) 用于用户代理流程
                const accessToken = decodeURI(hashParams.get(ACCESS_TOKEN));
                sfHost = decodeURI(hashParams.get("instance_url")).replace(/^https?:\/\//i, "");
                this.sessionId = accessToken;
                localStorage.setItem(sfHost + "_" + ACCESS_TOKEN, accessToken);
                console.log("OAuth流程完成，设置新token");
            }
        } else if (oldToken) {
            this.sessionId = oldToken;
            console.log("使用缓存的token");
        } else {
            console.log("没有缓存token，通过background获取");
            let message = await new Promise(resolve =>
                chrome.runtime.sendMessage({message: "getSession", sfHost}, resolve));
            if (message) {
                this.instanceHostname = this.getMyDomain(message.hostname);
                this.sessionId = message.key;
                console.log("从background获取到token");
            } else {
                console.log("从background未获取到token");
            }
        }
        if (localStorage.getItem(sfHost + "_trialExpirationDate") == null) {
            this.rest("/services/data/v" + apiVersion + "/query/?q=SELECT+IsSandbox,+InstanceName+,TrialExpirationDate+FROM+Organization").then(res => {
                localStorage.setItem(sfHost + "_isSandbox", res.records[0].IsSandbox);
                localStorage.setItem(sfHost + "_orgInstance", res.records[0].InstanceName);
                localStorage.setItem(sfHost + "_trialExpirationDate", res.records[0].TrialExpirationDate);
            }).catch(err => {
                console.log("获取组织信息失败:", err);
            });
        }
        return this.sessionId;
    }

    // REST API调用
    async rest(url, {logErrors = true, method = "GET", api = "normal", body = undefined, bodyType = "json", responseType = "json", headers = {}, progressHandler = null, useCache = true, rawResponse = false} = {}) {
        if (!this.instanceHostname) {
            throw new Error("Instance Hostname not found");
        }
        
        console.log("rest 方法调用:", {
            url,
            method,
            hasSessionId: !!this.sessionId,
            sessionIdLength: this.sessionId ? this.sessionId.length : 0,
            instanceHostname: this.instanceHostname
        });

        let xhr = new XMLHttpRequest();
        if (useCache) {
            url += (url.includes("?") ? "&" : "?") + "cache=" + Math.random();
        }
        const sfHost = "https://" + this.instanceHostname;
        const fullUrl = new URL(url, sfHost);
        xhr.open(method, fullUrl.toString(), true);
        xhr.setRequestHeader("Accept", "application/json; charset=UTF-8");
        xhr.setRequestHeader("Sforce-Call-Options", `client=${this.clientId}`);

        if (api == "bulk") {
            xhr.setRequestHeader("X-SFDC-Session", this.sessionId);
        } else if (api == "normal") {
            xhr.setRequestHeader("Authorization", "Bearer " + this.sessionId);
        } else {
            throw new Error("Unknown api");
        }

        if (body !== undefined) {
            xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
            if (bodyType == "json") {
                body = JSON.stringify(body);
            } else if (bodyType == "raw") {
                // 不做任何处理
            } else {
                throw new Error("Unknown bodyType");
            }
        }

        for (let [name, value] of Object.entries(headers)) {
            xhr.setRequestHeader(name, value);
        }

        xhr.responseType = responseType;
        await new Promise((resolve, reject) => {
            if (progressHandler) {
                progressHandler.abort = () => {
                    let err = new Error("请求被中止。");
                    err.name = "AbortError";
                    reject(err);
                    xhr.abort();
                };
            }

            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4) {
                    resolve();
                }
            };
            xhr.send(body);
        });
        if (rawResponse){
            return xhr;
        } else if (xhr.status >= 200 && xhr.status < 300) {
            return xhr.response;
        } else if (xhr.status == 0) {
            if (!logErrors) { console.error("从Salesforce REST API收到无响应", xhr); }
            let err = new Error();
            err.name = "SalesforceRestError";
            err.message = "网络错误，离线或超时";
            throw err;
        } else if (xhr.status == 401) {
            let error = xhr.response.length > 0 ? xhr.response[0].message : "需要新的访问令牌";
            // 只有在用户已经生成了令牌时才设置sessionError，这将防止在会话过期且未配置API访问控制时显示错误
            if (localStorage.getItem(this.instanceHostname + "_access_token")){
                sessionError = {text: "访问令牌已过期", title: "生成新令牌", type: "warning", icon: "warning"};
                this.showToastBanner();
            }
            let err = new Error();
            err.name = "Unauthorized";
            err.message = error;
            throw err;
        } else if (xhr.status == 403) {
            let error = xhr.response.length > 0 ? xhr.response[0].message : "错误";
            sessionError = {text: error, type: "error", icon: "error"};
            this.showToastBanner();
            let err = new Error();
            err.name = "Forbidden";
            err.message = error;
            throw err;
        } else {
            if (!logErrors) { console.error("从Salesforce REST API收到错误响应", xhr); }
            let err = new Error();
            err.name = "SalesforceRestError";
            err.detail = xhr.response;
            try {
                err.message = err.detail.map(err => `${err.errorCode}: ${err.message}${err.fields && err.fields.length > 0 ? ` [${err.fields.join(", ")}]` : ""}`).join("\n");
            } catch (ex) {
                err.message = JSON.stringify(xhr.response);
            }
            if (!err.message) {
                err.message = "HTTP错误 " + xhr.status + " " + xhr.statusText;
            }
            throw err;
        }
    }

    // SOAP WSDL 配置 - 参考 inspector.js 的实现
    wsdl(apiVersion, apiName) {
        let wsdl = {
            Enterprise: {
                servicePortAddress: "/services/Soap/c/" + apiVersion,
                targetNamespaces: ' xmlns="urn:enterprise.soap.sforce.com" xmlns:sf="urn:sobject.enterprise.soap.sforce.com"',
                apiName: "Enterprise"
            },
            Partner: {
                servicePortAddress: "/services/Soap/u/" + apiVersion,
                targetNamespaces: ' xmlns="urn:partner.soap.sforce.com" xmlns:sf="urn:sobject.partner.soap.sforce.com"',
                apiName: "Partner"
            },
            Apex: {
                servicePortAddress: "/services/Soap/s/" + apiVersion,
                targetNamespaces: ' xmlns="http://soap.sforce.com/2006/08/apex"',
                apiName: "Apex"
            },
            Metadata: {
                servicePortAddress: "/services/Soap/m/" + apiVersion,
                targetNamespaces: ' xmlns="http://soap.sforce.com/2006/04/metadata"',
                apiName: "Metadata"
            },
            Tooling: {
                servicePortAddress: "/services/Soap/T/" + apiVersion,
                targetNamespaces: ' xmlns="urn:tooling.soap.sforce.com" xmlns:sf="urn:sobject.tooling.soap.sforce.com" xmlns:mns="urn:metadata.tooling.soap.sforce.com"',
                apiName: "Tooling"
            }
        };
        if (apiName) {
            wsdl = wsdl[apiName];
        }
        return wsdl;
    }

    // SOAP API 调用 - 参考 inspector.js 的实现
    async soap(wsdl, method, args, {headers} = {}) {
        if (!this.instanceHostname || !this.sessionId) {
            throw new Error("未找到会话");
        }

        let xhr = new XMLHttpRequest();
        xhr.open("POST", "https://" + this.instanceHostname + wsdl.servicePortAddress + "?cache=" + Math.random(), true);
        xhr.setRequestHeader("Content-Type", "text/xml");
        xhr.setRequestHeader("SOAPAction", '""');
        xhr.setRequestHeader("CallOptions", `client:${this.clientId}`);

        let sessionHeaderKey = wsdl.apiName == "Metadata" ? "met:SessionHeader" : "SessionHeader";
        let sessionIdKey = wsdl.apiName == "Metadata" ? "met:sessionId" : "sessionId";
        let requestMethod = wsdl.apiName == "Metadata" ? `met:${method}` : method;
        let requestAttributes = [
            'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"',
            'xmlns:xsd="http://www.w3.org/2001/XMLSchema"',
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        ];
        if (wsdl.apiName == "Metadata") {
            requestAttributes.push('xmlns:met="http://soap.sforce.com/2006/04/metadata"');
        }

        let requestBody = XML.stringify({
            name: "soapenv:Envelope",
            attributes: ` ${requestAttributes.join(" ")}${wsdl.targetNamespaces}`,
            value: {
                "soapenv:Header": Object.assign({}, {[sessionHeaderKey]: {[sessionIdKey]: this.sessionId}}, headers),
                "soapenv:Body": {[requestMethod]: args}
            }
        });

        xhr.responseType = "document";
        await new Promise(resolve => {
            xhr.onreadystatechange = () => {
                if (xhr.readyState == 4) {
                    resolve(xhr);
                }
            };
            xhr.send(requestBody);
        });
        if (xhr.status == 200) {
            let responseBody = xhr.response.querySelector(method + "Response");
            let parsed = XML.parse(responseBody).result;
            return parsed;
        } else {
            console.error("从Salesforce SOAP API收到错误响应", xhr);
            let err = new Error();
            err.name = "SalesforceSoapError";
            err.detail = xhr.response;
            try {
                err.message = xhr.response.querySelector("faultstring").textContent;
            } catch (ex) {
                err.message = "HTTP错误 " + xhr.status + " " + xhr.statusText;
            }
            throw err;
        }
    }

    // 数组转换工具方法 - 参考 inspector.js 的实现
    asArray(x) {
        if (!x) return [];
        if (x instanceof Array) return x;
        return [x];
    }

    // 获取MyDomain - 参考 inspector.js 的实现
    getMyDomain(host) {
        if (host) {
            const myDomain = host
                .replace(/\.lightning\.force\./, ".my.salesforce.") // 避免HTTP重定向（这会导致Authorization头被丢弃）
                .replace(/\.mcas\.ms$/, ""); // 如果客户端使用Microsoft Defender for Cloud Apps，则删除尾随的.mcas.ms
            return myDomain;
        }
        return host;
    }

    // 显示Toast横幅 - 参考 inspector.js 的实现
    showToastBanner(){
        const containerToShow = document.getElementById("toastBanner");
        if (containerToShow) { containerToShow.classList.remove("hide"); }
        const containerToMask = document.getElementById("mainTabs");
        if (containerToMask) { containerToMask.classList.add("mask"); }
    }

    // 清除会话缓存
    clearSession() {
        this.sessionId = null;
        this.instanceHostname = null;
    }
}

// SOQL查询执行器
class SOQLExecutor {
    constructor(sfConn) {
        this.sfConn = sfConn;
        this.apiVersion = apiVersion; // 使用全局API版本
    }

    // 执行SOQL查询
    async executeSOQL(query, options = {}) {
        const {
            useToolingApi = false,
            includeDeleted = false
        } = options;

        let endpoint;
        if (useToolingApi) {
            endpoint = `/services/data/v${this.apiVersion}/tooling/query/`;
        } else if (includeDeleted) {
            endpoint = `/services/data/v${this.apiVersion}/queryAll/`;
        } else {
            endpoint = `/services/data/v${this.apiVersion}/query/`;
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
        const url = `/services/data/v${this.apiVersion}/search/?q=${encodeURIComponent(searchQuery)}`;
        
        try {
            const result = await this.sfConn.rest(url);
            return result;
        } catch (error) {
            throw error;
        }
    }

    // 获取对象描述
    async describeSObject(sobjectName) {
        const url = `/services/data/v${this.apiVersion}/sobjects/${sobjectName}/describe/`;
        
        try {
            const result = await this.sfConn.rest(url);
            return result;
        } catch (error) {
            throw error;
        }
    }

    // 获取所有对象列表
    async getSObjects() {
        const url = `/services/data/v${this.apiVersion}/sobjects/`;
        
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
window.apiVersion = apiVersion;
window.sessionError = sessionError;

