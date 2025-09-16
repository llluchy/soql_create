// SOQL Creator 后台脚本 - 事件块方式

// ========================================
// 插件安装/更新事件
// ========================================
chrome.runtime.onInstalled.addListener((details) => {
    console.log('插件安装/更新事件');
    if (details.reason === 'install') { // 插件安装事件
        // TODO: 打开项目说明地址
    } else if (details.reason === 'update') { // 插件更新事件
        // TODO: 打开更新说明地址
    } else if (details.reason === 'chrome_update') { // 浏览器更新事件
        // TODO: 什么也不做
    } else if (details.reason === 'shared_module_update') { // 共享模块更新事件
        // TODO: 什么也不做
    }
});

// ========================================
// 插件图标点击事件
// ========================================
// chrome.action.onClicked.addListener((tab) => {
//     console.log('插件图标点击事件，如果操作具有弹出式窗口，则不会触发此事件。');
// });

// ========================================
// 消息监听器 - 处理来自该插件其他模块的消息
// ========================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    // 处理获取当前域名请求
    if (message.type === 'GET_CURRENT_DOMAIN') {
        console.log('处理获取当前域名请求');
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, domain: null });
                return;
            }
            
            const tab = tabs[0];
            if (tab && tab.url) {
                const url = new URL(tab.url);
                sendResponse({ success: true, domain: url.origin });
            } else {
                sendResponse({ success: false, domain: null });
            }
        });
        return true; // 保持消息通道开放
    }

    // 处理获取Salesforce主机请求
    if (message.message === "getSfHost") {
        console.log('处理获取Salesforce主机请求');
        try {
            const currentDomain = new URL(message.url).hostname;
            const cookieStoreId = sender.tab?.cookieStoreId;
            
            chrome.cookies.get({
                url: message.url, 
                name: "sid", 
                storeId: cookieStoreId
            }, cookie => {
                if (!cookie || currentDomain.endsWith(".mcas.ms")) {
                    sendResponse(currentDomain);
                    return;
                }
                
                const [orgId] = cookie.value.split("!");
                const orderedDomains = ["salesforce.com", "cloudforce.com", "salesforce.mil", "cloudforce.mil", "sfcrmproducts.cn", "force.com"];
                
                let found = false;
                orderedDomains.forEach(domain => {
                    if (found) return;
                    
                    chrome.cookies.getAll({
                        name: "sid", 
                        domain: domain, 
                        secure: true, 
                        storeId: cookieStoreId
                    }, cookies => {
                        if (found) return;
                        
                        let sessionCookie = cookies.find(c => 
                            c.value.startsWith(orgId + "!") && 
                            c.domain !== "help.salesforce.com"
                        );
                        
                        if (sessionCookie) {
                            found = true;
                            sendResponse(sessionCookie.domain);
                        }
                    });
                });
                
                setTimeout(() => {
                    if (!found) {
                        sendResponse(currentDomain);
                    }
                }, 1000);
            });
        } catch (error) {
            sendResponse(message.url ? new URL(message.url).hostname : null);
        }
        return true; // 异步响应
    }
    
    // 处理会话获取请求
    if (message.message === "getSession") {
        sfHost = request.sfHost;
        chrome.cookies.get({url: "https://" + request.sfHost, name: "sid", storeId: sender.tab.cookieStoreId}, sessionCookie => {
          if (!sessionCookie) {
            sendResponse(null);
            return;
          }
          let session = {key: sessionCookie.value, hostname: sessionCookie.domain};
          sendResponse(session);
        });
        return true; // Tell Chrome that we want to call sendResponse asynchronously.
    }
    
    // 处理OAuth重定向
    if (message.message === "createWindow") {
        console.log('处理OAuth重定向');
        chrome.windows.create({
            url: message.url,
            incognito: message.incognito ?? false
        });
    }
    
    // 处理页面重载
    if (message.message === "reloadPage") {
        console.log('处理页面重载');
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
    }
});

// ========================================
// 标签页激活事件 - 环境切换检测
// ========================================
chrome.tabs.onActivated.addListener((activeInfo) => {
    console.log('处理标签页激活事件');
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) return;
        
        if (tab.url) {
            const url = new URL(tab.url);
            chrome.runtime.sendMessage({
                action: 'environmentChanged',
                url: tab.url,
                origin: url.origin
            }).catch(() => {
                // 侧边栏可能未打开，忽略错误
            });
        }
    });
});

// ========================================
// 初始化侧边栏设置
// ========================================
// try {
    // console.log('初始化侧边栏设置');
    // if (chrome.sidePanel) {
        // 设置点击快捷栏按钮打开侧边栏的行为
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        // chrome.sidePanel.setOptions({
        //     path: 'sidepanel.html',
        //     enabled: true
        // });
    // }
// } catch (error) {
    // 忽略设置错误
// }