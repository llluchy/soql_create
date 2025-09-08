// SOQL Creator 后台脚本 - 基于 Salesforce Inspector Reloaded 最佳实践

// 允许启用侧边栏的网站域名列表
// 注意：此数组需要与 constants.js 中的 ALLOWED_ORIGINS 保持同步
const ALLOWED_ORIGINS = [
    'https://login.salesforce.com',
    'https://test.salesforce.com',
    'https://na1.salesforce.com',
    'https://na2.salesforce.com',
    'https://eu1.salesforce.com',
    'https://eu2.salesforce.com',
    'https://ap1.salesforce.com',
    'https://ap2.salesforce.com'
];

// 检查域名是否在允许列表中
function isAllowedOrigin(origin) {
    console.log('当前域名:', origin);
    return ALLOWED_ORIGINS.some(allowedOrigin => 
        origin === allowedOrigin || 
        origin.endsWith('.salesforce.com') ||
        origin.endsWith('.force.com') ||
        origin.endsWith('.lightning.force.com')
    );
}

class SOQLCreatorBackground {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupSidePanel();
    }

    bindEvents() {
        // 插件图标点击事件 - 这是核心功能
        chrome.action.onClicked.addListener((tab) => {
            console.log('SOQL Creator: 插件图标被点击，标签页ID:', tab.id);
            this.toggleSidePanel(tab.id);
        });

        // 键盘快捷键支持
        chrome.commands?.onCommand.addListener((command) => {
            console.log('SOQL Creator: 快捷键触发:', command);
            this.handleCommand(command);
        });

        // 监听来自侧边栏的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('SOQL Creator 后台脚本收到消息:', message);
            
            if (message.type === 'GET_CURRENT_DOMAIN') {
                this.handleGetCurrentDomain(sender, sendResponse);
                return true; // 保持消息通道开放
            }
            
            
            // 处理获取Salesforce主机请求 - 基于 Salesforce Inspector Reloaded
            if (message.message === "getSfHost") {
                this.handleGetSfHost(message, sender, sendResponse);
                return true; // 异步响应
            }
            
            // 处理会话获取请求 - 基于 Salesforce Inspector Reloaded
            if (message.message === "getSession") {
                this.handleGetSession(message, sender, sendResponse);
                return true; // 异步响应
            }
            
            // 处理OAuth重定向
            if (message.message === "createWindow") {
                this.handleCreateWindow(message);
            }
            
            // 处理页面重载
            if (message.message === "reloadPage") {
                this.handleReloadPage();
            }
        });

        // // 标签页更新事件 - 根据官方文档实现
        // chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
        //     // 使用非异步函数避免严格模式问题
        //     this.handleTabUpdated(tabId, info, tab);
        // });

        // // 标签页激活事件
        // chrome.tabs.onActivated.addListener((activeInfo) => {
        //     // 使用非异步函数避免严格模式问题
        //     this.handleTabActivated(activeInfo);
        // });
    }

    // 处理标签页更新事件
    handleTabUpdated(tabId, info, tab) {
        console.log('Updated tabId',tabId);
        console.log('Updated info',info);
        console.log('Updated tab',tab);
        if (!tab.url) return;
        
        const url = new URL(tab.url);
        console.log('SOQL Creator: 标签页更新，URL:', url.origin);
        
        // 检查是否为允许的网站
        if (this.isSalesforceOrigin(url.origin)) {
            console.log('SOQL Creator: 检测到允许的网站，启用侧边栏');
            // 在允许的网站启用侧边栏
            chrome.sidePanel.setOptions({
                tabId,
                path: 'sidepanel.html',
                enabled: true
            }).catch(error => {
                console.error('SOQL Creator: 设置侧边栏选项失败:', error);
            });
        } else {
            console.log('SOQL Creator: 非允许网站，禁用侧边栏');
            // 在其他网站禁用侧边栏
            chrome.sidePanel.setOptions({
                tabId,
                enabled: false
            }).catch(error => {
                console.error('SOQL Creator: 设置侧边栏选项失败:', error);
            });
        }
    }

    // 处理标签页激活事件
    handleTabActivated(activeInfo) {
        console.log('Activate activeInfo',activeInfo);
        console.log(activeInfo);
        chrome.tabs.get(activeInfo.tabId, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('SOQL Creator: 获取标签页信息失败:', chrome.runtime.lastError);
                return;
            }
            
            if (tab.url) {
                const url = new URL(tab.url);
                if (this.isSalesforceOrigin(url.origin)) {
                    console.log('SOQL Creator: 切换到允许的网站，启用侧边栏');
                    chrome.sidePanel.setOptions(
                        {
                            tabId: activeInfo.tabId,
                            path: 'sidepanel.html',
                            enabled: true
                        }
                    ).catch(error => {
                        console.error('SOQL Creator: 设置侧边栏选项失败:', error);
                    });
                } else {
                    console.log('SOQL Creator: 切换到非允许网站，禁用侧边栏');
                    chrome.sidePanel.setOptions({
                        tabId: activeInfo.tabId,
                        enabled: false
                    }).catch(error => {
                        console.error('SOQL Creator: 设置侧边栏选项失败:', error);
                    });
                }
            }
        });
    }

    // 设置侧边栏
    setupSidePanel() {
        try {
            // 确保侧边栏功能可用
            if (chrome.sidePanel) {
                // 设置默认行为：点击插件图标时打开侧边栏
                chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
                console.log('SOQL Creator: 侧边栏已配置，点击插件图标时打开');
            }
        } catch (error) {
            console.error('SOQL Creator: 设置侧边栏失败:', error);
        }
    }

    // 切换侧边栏显示/隐藏
    toggleSidePanel(tabId) {
        console.log('SOQL Creator: 尝试切换侧边栏，标签页ID:', tabId);
        
        // 获取当前标签页信息
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('SOQL Creator: 获取标签页信息失败:', chrome.runtime.lastError);
                return;
            }
            
            if (tab.url) {
                const url = new URL(tab.url);
                
                // 检查是否为Salesforce网站
                if (this.isSalesforceOrigin(url.origin)) {
                    // 在Salesforce网站，直接打开侧边栏
                    chrome.sidePanel.open({ tabId }).then(() => {
                        console.log('SOQL Creator: 侧边栏打开成功');
                    }).catch(error => {
                        console.error('SOQL Creator: 打开侧边栏失败:', error);
                    });
                } else {
                    console.log('SOQL Creator: 非Salesforce网站，无法打开侧边栏');
                }
            }
        });
    }

    // 判断是否为Salesforce网站
    isSalesforceOrigin(origin) {
        const isSalesforceDomain = isAllowedOrigin(origin);
        console.log('SOQL Creator: 检查域名:', origin, '是否为Salesforce:', isSalesforceDomain);
        return isSalesforceDomain;
    }

    // 处理获取Salesforce主机请求 - 基于 Salesforce Inspector Reloaded
    async handleGetSfHost(message, sender, sendResponse) {
        try {
            const currentDomain = new URL(message.url).hostname;
            console.log('SOQL Creator: 获取Salesforce主机，当前域名:', currentDomain);
            
            // 当在 *.visual.force.com 页面时，cookie中的会话没有API访问权限，
            // 所以我们需要从对应的 *.salesforce.com 页面读取会话。
            // 会话cookie的第一部分是OrgID，我们用它作为键来支持同时登录多个组织。
            const cookieStoreId = sender.tab?.cookieStoreId;
            console.log('SOQL Creator: getSfHost Cookie Store ID:', cookieStoreId);
            
            chrome.cookies.get({
                url: message.url, 
                name: "sid", 
                storeId: cookieStoreId
            }, cookie => {
                if (!cookie || currentDomain.endsWith(".mcas.ms")) { // Microsoft Defender for Cloud Apps使用的域名，sid存在但无法读取
                    console.log('SOQL Creator: 未找到会话cookie或Microsoft Defender域名，返回当前域名');
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
                            console.log('SOQL Creator: 找到匹配的会话cookie，域名:', sessionCookie.domain);
                            found = true;
                            sendResponse(sessionCookie.domain);
                        }
                    });
                });
                
                // 如果没有找到匹配的cookie，返回当前域名
                setTimeout(() => {
                    if (!found) {
                        console.log('SOQL Creator: 未找到匹配的会话cookie，返回当前域名');
                        sendResponse(currentDomain);
                    }
                }, 1000);
            });
            
        } catch (error) {
            console.error('SOQL Creator: 获取Salesforce主机失败:', error);
            sendResponse(message.url ? new URL(message.url).hostname : null);
        }
    }

    // 处理会话获取请求 - 基于 Salesforce Inspector Reloaded
    async handleGetSession(message, sender, sendResponse) {
        try {
            const sfHost = message.sfHost;
            console.log('SOQL Creator: 获取会话，主机:', sfHost);
            
            // 获取cookieStoreId，如果sender.tab不存在则使用undefined（默认cookie store）
            const cookieStoreId = sender.tab?.cookieStoreId;
            console.log('SOQL Creator: Cookie Store ID:', cookieStoreId);
            
            // 从浏览器cookie获取Salesforce会话
            const sessionCookie = await chrome.cookies.get({
                url: "https://" + sfHost,
                name: "sid",
                storeId: cookieStoreId
            });
            
            if (!sessionCookie) {
                console.log('SOQL Creator: 未找到会话cookie');
                sendResponse(null);
                return;
            }
            
            // 返回会话信息
            const session = {
                key: sessionCookie.value,
                hostname: sessionCookie.domain
            };
            
            console.log('SOQL Creator: 成功获取会话');
            sendResponse(session);
            
        } catch (error) {
            console.error('SOQL Creator: 获取会话失败:', error);
            sendResponse(null);
        }
    }

    // 处理OAuth重定向
    handleCreateWindow(message) {
        chrome.windows.create({
            url: message.url,
            incognito: message.incognito ?? false
        });
    }

    // 处理页面重载
    handleReloadPage() {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
                console.log('SOQL Creator: 页面已重载');
            }
        });
    }

    // 处理键盘快捷键命令
    handleCommand(command) {
        if (command.startsWith("link-")) {
            let link;
            switch (command) {
                case "link-setup":
                    link = "/lightning/setup/SetupOneHome/home";
                    break;
                case "link-home":
                    link = "/";
                    break;
                case "link-dev":
                    link = "/_ui/common/apex/debug/ApexCSIPage";
                    break;
                default:
                    return;
            }
            
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0] && tabs[0].url) {
                    const url = new URL(tabs[0].url);
                    if (this.isSalesforceOrigin(url.origin)) {
                        chrome.tabs.create({
                            url: `https://${url.hostname}${link}`
                        });
                    }
                }
            });
        } else if (command.startsWith("open-")) {
            // 发送消息到侧边栏处理
            chrome.runtime.sendMessage({
                msg: "shortcut_pressed", 
                command: command
            });
        } else {
            // 打开扩展页面
            chrome.tabs.create({
                url: `chrome-extension://${chrome.runtime.id}/${command}.html`
            });
        }
    }

    // 处理获取当前域名的消息
    handleGetCurrentDomain(sender, sendResponse) {
        // 获取当前活动标签页
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error('SOQL Creator: 获取当前活动标签页失败:', chrome.runtime.lastError);
                sendResponse({ success: false, domain: null });
                return;
            }
            
            const tab = tabs[0];
            if (tab && tab.url) {
                const url = new URL(tab.url);
                console.log('SOQL Creator: 当前活动标签页域名:', url.origin);
                sendResponse({ success: true, domain: url.origin });
            } else {
                console.error('SOQL Creator: 无法获取当前活动标签页');
                sendResponse({ success: false, domain: null });
            }
        });
    }

}

// 初始化后台脚本
new SOQLCreatorBackground();

// 插件安装/更新事件
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('SOQL Creator 插件已安装');
        
        // 设置默认侧边栏行为
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).then(() => {
            console.log('SOQL Creator: 默认侧边栏行为已设置');
        }).catch(error => {
            console.error('SOQL Creator: 设置默认侧边栏行为失败:', error);
        });
        
        // 打开欢迎页面
        chrome.tabs.create({
            url: "https://github.com/your-username/soql-creator" // 替换为实际的欢迎页面URL
        });
    } else if (details.reason === 'update') {
        console.log('SOQL Creator 插件已更新到版本:', chrome.runtime.getManifest().version);
    }
});

// 设置卸载URL
chrome.runtime.setUninstallURL("https://forms.gle/your-feedback-form"); // 替换为实际的反馈表单URL

// 插件启动事件
chrome.runtime.onStartup.addListener(() => {
    console.log('SOQL Creator 插件已启动');
});

