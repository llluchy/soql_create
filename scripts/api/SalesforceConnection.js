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
        this.instanceHostname = sfHost;
        
        console.log("getSession 调试信息:", {
            sfHost,
            currentUrlIncludesToken
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
        } else {
            // 每次都从background实时获取Session，不使用localStorage缓存
            console.log("实时从background获取Session");
            let message = await new Promise(resolve =>
                chrome.runtime.sendMessage({message: "getSession", sfHost}, resolve));
            if (message) {
                this.instanceHostname = this.getMyDomain(message.hostname);
                this.sessionId = message.key;
                console.log("从background获取到Session");
            } else {
                console.log("从background未获取到Session");
                this.sessionId = null;
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

// 统一的对象和字段管理服务类
class ObjectService {
    constructor(sfConn, soqlExecutor) {
        this.sfConn = sfConn;
        this.soqlExecutor = soqlExecutor;
        this.fieldsCache = {}; // 字段数据缓存，按对象API名称索引
    }

    /**
     * 获取应用级筛选后的对象列表
     * 只进行应用级筛选：白名单筛选、权限筛选、数据清洗
     * @param {string} sfHost - Salesforce主机名
     * @returns {Promise<Array>} 应用级筛选后的对象列表
     */
    async getApplicationFilteredObjects(sfHost) {
        try {
            // 1. 设置Salesforce连接信息
            this.sfConn.instanceHostname = sfHost;
            
            // 2. 实时获取Session
            console.log('ObjectService: 实时获取Session for host:', sfHost);
            await this.sfConn.getSession(sfHost);
            
            if (!this.sfConn.sessionId) {
                throw new Error('无法获取有效的Salesforce会话，请检查登录状态');
            }
            
            console.log('ObjectService: Session获取成功，开始调用API');
            
            // 3. 调用Salesforce API获取对象列表
            const result = await this.soqlExecutor.getSObjects();
            
            if (!result || !result.sobjects || result.sobjects.length === 0) {
                return [];
            }
            
            // 4. 获取用户配置的白名单设置
            const userConfig = await this.getUserConfig();
            const whitelistConfig = userConfig.objectWhitelist || {
                allObjects: [],
                selectedObjects: []
            };
            
            console.log('ObjectService: 白名单配置:', whitelistConfig);
            
            // 5. 应用级筛选：权限筛选 - 只保留可查询的对象
            const queryableObjects = result.sobjects
                .filter(obj => obj.queryable === true && obj.retrieveable === true)
                .map(obj => ({
                    name: obj.name,
                    label: obj.label || obj.name,
                    apiName: obj.name,
                    description: obj.description || '',
                    createable: obj.createable || false,
                    updateable: obj.updateable || false,
                    deletable: obj.deletable || false,
                    custom: obj.custom || false // 是否是自定义对象
                }));
            
            // 6. 应用级筛选：白名单筛选
            const whitelistFilteredObjects = queryableObjects.filter(obj => {
                // 首先判断是否有白名单，如果没有白名单，那么筛选也就不生效了
                if (whitelistConfig.selectedObjects.length === 0) {
                    return true;
                } else {
                    // 如果有白名单，那么判断数据是否是标准对象
                    const isStandardObject = obj.custom === false;
                    // 如果是标准对象，那么进行筛选
                    if (isStandardObject) {
                        return whitelistConfig.selectedObjects.includes(obj.name);
                    } else {
                        // 如果是自定义对象，那么直接显示所有自定义对象
                        return true;
                    }
                }
            });
            
            // 7. 应用级筛选：数据清洗 - 过滤掉Share对象
            const cleanedObjects = whitelistFilteredObjects.filter(obj => {
                const objectType = this.getObjectType(obj);
                return objectType !== 'share';
            });
            
            console.log(`ObjectService: 应用级筛选结果: ${cleanedObjects.length}/${queryableObjects.length} 个对象`);
            
            // 8. 按标签排序
            return cleanedObjects.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));
            
        } catch (error) {
            console.error('ObjectService: 获取对象列表失败:', error);
            throw error;
        }
    }

    /**
     * 获取用户配置
     * @returns {Promise<Object>} 用户配置对象
     */
    async getUserConfig() {
        try {
            const result = await chrome.storage.sync.get(Object.keys(SOQL_CONSTANTS.DEFAULT_CONFIG));
            // 合并默认配置
            return { ...SOQL_CONSTANTS.DEFAULT_CONFIG, ...result };
        } catch (error) {
            console.error('ObjectService: 获取用户配置失败:', error);
            return SOQL_CONSTANTS.DEFAULT_CONFIG;
        }
    }

    /**
     * 分类对象类型
     * @param {string} objectName - 对象名称
     * @returns {string} 对象类型
     */
    classifyObjectType(objectName) {
        // 业务对象：常见的业务实体
        const businessObjects = [
            'Account', 'Contact', 'Opportunity', 'Case', 'Lead', 'Task', 'Event',
            'Campaign', 'Product2', 'Pricebook2', 'Order', 'Contract', 'Asset',
            'Entitlement', 'WorkOrder', 'ServiceContract', 'Individual'
        ];
        
        // 元数据对象：配置和元数据相关
        const metadataObjects = [
            'User', 'Profile', 'PermissionSet', 'Role', 'Group', 'Queue',
            'CustomObject', 'CustomField', 'ValidationRule', 'WorkflowRule',
            'ProcessBuilder', 'Flow', 'ApexClass', 'ApexTrigger', 'ApexPage'
        ];
        
        // 系统对象：系统内部对象
        const systemObjects = [
            'AsyncApexJob', 'ApexLog', 'CronTrigger', 'CronJobDetail',
            'SetupAuditTrail', 'LoginHistory', 'UserLogin', 'SessionPermSetActivation'
        ];

        if (businessObjects.includes(objectName)) {
            return 'business';
        } else if (metadataObjects.includes(objectName)) {
            return 'metadata';
        } else if (systemObjects.includes(objectName) || objectName.startsWith('__')) {
            return 'system';
        } else if (objectName.endsWith('__c')) {
            return 'business'; // 自定义对象归类为业务对象
        } else {
            return 'business'; // 默认为业务对象
        }
    }

    /**
     * 获取指定对象的字段列表
     * @param {string} objectApiName - 对象的API名称
     * @returns {Promise<Object>} 字段数据映射
     */
    async getObjectFields(objectApiName) {
        try {
            // 检查缓存
            if (this.fieldsCache[objectApiName]) {
                console.log(`ObjectService: 从缓存获取字段 ${objectApiName}`);
                return this.fieldsCache[objectApiName];
            }
            
            console.log(`ObjectService: 获取对象字段 ${objectApiName}`);
            
            // 调用Salesforce API获取对象字段描述
            const result = await this.soqlExecutor.describeSObject(objectApiName);
            
            if (result && result.fields && result.fields.length > 0) {
                // 过滤出可查询的字段
                const queryableFields = result.fields
                    .filter(field => {
                        // 过滤掉隐藏和废弃的字段
                        if (field.deprecatedAndHidden === true) return false;
                        // 过滤掉不可排序的字段（通常表示不可查询）
                        if (field.sortable === false) return false;
                        return true;
                    })
                    .sort((a, b) => a.label.localeCompare(b.label)); // 按标签名称排序
                
                // 转换为内部格式并缓存
                const fieldsMap = {};
                queryableFields.forEach(field => {
                    fieldsMap[field.name] = {
                        name: field.name,
                        label: field.label || field.name,
                        type: field.type || 'string',
                        required: field.nillable === false,
                        unique: field.unique === true,
                        length: field.length,
                        precision: field.precision,
                        scale: field.scale,
                        picklistValues: field.picklistValues || [],
                        referenceTo: field.referenceTo || [],
                        relationshipName: field.relationshipName || null,
                        // Salesforce字段属性
                        createable: field.createable,
                        updateable: field.updateable,
                        filterable: field.filterable,
                        sortable: field.sortable,
                        groupable: field.groupable,
                        aggregatable: field.aggregatable,
                        custom: field.custom,
                        soapType: field.soapType,
                        inlineHelpText: field.inlineHelpText,
                        // 字段描述信息
                        description: field.inlineHelpText || field.label || field.name
                    };
                });
                
                // 缓存字段数据
                this.fieldsCache[objectApiName] = fieldsMap;
                
                console.log(`ObjectService: 成功获取 ${Object.keys(fieldsMap).length} 个字段`);
                return fieldsMap;
            }
            
            return {};
        } catch (error) {
            console.error(`ObjectService: 获取字段失败 ${objectApiName}:`, error);
            throw error;
        }
    }

    /**
     * 页面级筛选对象列表
     * 只处理页面级筛选：搜索筛选、类型筛选
     * @param {Array} objects - 应用级筛选后的对象列表
     * @param {Object} filters - 页面级筛选条件
     * @returns {Array} 页面级筛选后的对象列表
     */
    filterObjectsForPage(objects, filters = {}) {
        let filteredObjects = [...objects];
        
        // 页面级筛选：按对象类型筛选
        if (filters.objectType && filters.objectType !== 'all') {
            filteredObjects = filteredObjects.filter(obj => {
                const objectType = this.getObjectType(obj);
                return objectType === filters.objectType;
            });
        }
        
        // 页面级筛选：按搜索关键词筛选
        if (filters.searchTerm) {
            const searchTerm = filters.searchTerm.toLowerCase().trim();
            filteredObjects = filteredObjects.filter(obj => {
                const labelMatch = obj.label.toLowerCase().includes(searchTerm);
                const apiMatch = obj.name.toLowerCase().includes(searchTerm);
                return labelMatch || apiMatch;
            });
        }
        
        // 按标签名称排序
        return filteredObjects.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));
    }

    /**
     * 筛选字段列表
     * @param {Object} fields - 字段映射
     * @param {Object} filters - 筛选条件
     * @returns {Array} 筛选后的字段列表
     */
    filterFields(fields, filters = {}) {
        let fieldList = Object.values(fields);
        
        // 按字段类型筛选
        if (filters.fieldType && filters.fieldType !== 'all') {
            fieldList = fieldList.filter(field => {
                if (filters.fieldType === 'custom') {
                    return field.custom === true;
                } else if (filters.fieldType === 'standard') {
                    return field.custom === false;
                } else if (filters.fieldType === 'required') {
                    return field.required === true;
                }
                return true;
            });
        }
        
        // 按搜索关键词筛选
        if (filters.searchTerm) {
            const searchTerm = filters.searchTerm.toLowerCase().trim();
            fieldList = fieldList.filter(field => {
                const nameMatch = field.name.toLowerCase().includes(searchTerm);
                const labelMatch = field.label.toLowerCase().includes(searchTerm);
                return nameMatch || labelMatch;
            });
        }
        
        // 按字段名称排序
        return fieldList.sort((a, b) => a.label.localeCompare(b.label));
    }

    /**
     * 判断Salesforce对象的类型
     * @param {Object} object - 对象信息
     * @returns {string} 对象类型：'business'|'metadata'|'system'|'share'
     */
    getObjectType(object) {
        const apiName = object.name || object.apiName;
        
        // Share对象（以__Share结尾）- 用于权限共享，通常不用于查询
        if (apiName.endsWith('__Share')) {
            return 'share'; // 特殊标记，用于过滤
        }
        
        // 自定义对象（以__c结尾）- 用户创建的业务对象
        if (apiName.endsWith('__c')) {
            return 'business'; // 归类为业务对象
        }
        
        // 元数据对象（以__mdt结尾）- 自定义元数据类型
        if (apiName.endsWith('__mdt')) {
            return 'metadata';
        }
        
        // 系统对象（以__开头的其他对象）- Salesforce内部系统对象
        if (apiName.startsWith('__')) {
            return 'system';
        }
        
        // 标准对象（其他所有对象）- Salesforce内置的标准业务对象
        return 'business';
    }

    /**
     * 获取常用字段列表
     * @param {string} objectApiName - 对象API名称
     * @returns {Array} 常用字段名称列表
     */
    getCommonFields(objectApiName) {
        // 通用常用字段
        const commonFields = ['Id', 'Name', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById'];
        
        // 根据对象类型添加特定常用字段
        const specificFields = this.getObjectSpecificCommonFields(objectApiName);
        
        return [...commonFields, ...specificFields];
    }

    /**
     * 获取对象特定的常用字段
     * @param {string} objectApiName - 对象API名称
     * @returns {Array} 特定常用字段列表
     */
    getObjectSpecificCommonFields(objectApiName) {
        const fieldMap = {
            'Account': ['Type', 'Industry', 'Phone', 'Website'],
            'Contact': ['FirstName', 'LastName', 'Email', 'Phone', 'AccountId'],
            'Opportunity': ['StageName', 'Amount', 'CloseDate', 'AccountId'],
            'Case': ['Status', 'Priority', 'Origin', 'Subject', 'AccountId'],
            'Lead': ['Status', 'Company', 'Email', 'Phone', 'FirstName', 'LastName'],
            'Task': ['Subject', 'Status', 'Priority', 'ActivityDate', 'WhoId', 'WhatId'],
            'Event': ['Subject', 'StartDateTime', 'EndDateTime', 'WhoId', 'WhatId'],
            'User': ['Username', 'Email', 'FirstName', 'LastName', 'IsActive', 'ProfileId']
        };
        
        return fieldMap[objectApiName] || [];
    }

    /**
     * 清除字段缓存
     * @param {string} objectApiName - 对象API名称，如果不指定则清除所有缓存
     */
    clearFieldsCache(objectApiName = null) {
        if (objectApiName) {
            delete this.fieldsCache[objectApiName];
            console.log(`ObjectService: 清除字段缓存 ${objectApiName}`);
        } else {
            this.fieldsCache = {};
            console.log('ObjectService: 清除所有字段缓存');
        }
    }

    /**
     * 初始化用户白名单配置
     * 首次使用时，将硬编码的默认值保存到云配置
     * @returns {Promise<boolean>} 是否成功初始化
     */
    async initializeUserWhitelist() {
        try {
            const currentConfig = await this.getUserConfig();
            
            // 检查是否已经初始化过
            if (currentConfig.objectWhitelist && 
                currentConfig.objectWhitelist.selectedObjects && 
                currentConfig.objectWhitelist.selectedObjects.length > 0) {
                console.log('ObjectService: 用户白名单已初始化，跳过');
                return true;
            }
            
            // 使用硬编码的默认值初始化
            const whitelistConfig = {
                allObjects: SOQL_CONSTANTS.STANDARD_OBJECT_WHITELIST,
                selectedObjects: SOQL_CONSTANTS.DEFAULT_SELECTED_OBJECTS
            };
            
            // 直接保存到云配置
            await chrome.storage.sync.set({
                objectWhitelist: whitelistConfig
            });
            
            console.log('ObjectService: 用户白名单初始化完成:', whitelistConfig);
            return true;
            
        } catch (error) {
            console.error('ObjectService: 初始化用户白名单失败:', error);
            return false;
        }
    }
}

// 创建全局实例
const sfConn = new SalesforceConnection();
const soqlExecutor = new SOQLExecutor(sfConn);
const oauthManager = new OAuthManager();
const objectService = new ObjectService(sfConn, soqlExecutor);

// 导出到全局作用域
window.sfConn = sfConn;
window.soqlExecutor = soqlExecutor;
window.oauthManager = oauthManager;
window.objectService = objectService;
window.ErrorHandler = ErrorHandler;
window.apiVersion = apiVersion;
window.sessionError = sessionError;

