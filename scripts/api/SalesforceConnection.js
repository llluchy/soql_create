// Salesforce连接管理模块
let defaultApiVersion = "64.0";
let apiVersion = localStorage.getItem("apiVersion") == null ? defaultApiVersion : localStorage.getItem("apiVersion");

let sessionError;
const clientId = "SOQL Creator Extension";


/**
 * Salesforce连接管理类
 * 负责管理与Salesforce的连接、会话管理和API调用
 */
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

// 导出类
window.SalesforceConnection = SalesforceConnection;
window.apiVersion = apiVersion;
window.sessionError = sessionError;
