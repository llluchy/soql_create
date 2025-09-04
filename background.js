// SOQL Creator 后台脚本 - 基于官方文档实现
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

        // 监听来自侧边栏的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('SOQL Creator 后台脚本收到消息:', message);
            
            if (message.type === 'GET_CURRENT_DOMAIN') {
                this.handleGetCurrentDomain(sender, sendResponse);
                return true; // 保持消息通道开放
            }
        });

        // 标签页更新事件 - 根据官方文档实现
        chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
            if (!tab.url) return;
            
            const url = new URL(tab.url);
            console.log('SOQL Creator: 标签页更新，URL:', url.origin);
            
            // 检查是否为Salesforce网站
            if (this.isSalesforceOrigin(url.origin)) {
                console.log('SOQL Creator: 检测到Salesforce网站，启用侧边栏');
                // 在Salesforce网站启用侧边栏
                await chrome.sidePanel.setOptions({
                    tabId,
                    path: 'sidepanel.html',
                    enabled: true
                });
            } else {
                console.log('SOQL Creator: 非Salesforce网站，禁用侧边栏');
                // 在其他网站禁用侧边栏
                await chrome.sidePanel.setOptions({
                    tabId,
                    enabled: false
                });
            }
        });

        // 标签页激活事件
        chrome.tabs.onActivated.addListener(async (activeInfo) => {
            try {
                const tab = await chrome.tabs.get(activeInfo.tabId);
                if (tab.url) {
                    const url = new URL(tab.url);
                    if (this.isSalesforceOrigin(url.origin)) {
                        console.log('SOQL Creator: 切换到Salesforce网站，启用侧边栏');
                        await chrome.sidePanel.setOptions({
                            tabId: activeInfo.tabId,
                            path: 'sidepanel.html',
                            enabled: true
                        });
                    } else {
                        console.log('SOQL Creator: 切换到非Salesforce网站，禁用侧边栏');
                        await chrome.sidePanel.setOptions({
                            tabId: activeInfo.tabId,
                            enabled: false
                        });
                    }
                }
            } catch (error) {
                console.error('SOQL Creator: 处理标签页激活事件失败:', error);
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
    async toggleSidePanel(tabId) {
        try {
            console.log('SOQL Creator: 尝试切换侧边栏，标签页ID:', tabId);
            
            // 获取当前标签页信息
            const tab = await chrome.tabs.get(tabId);
            if (tab.url) {
                const url = new URL(tab.url);
                
                // 检查是否为Salesforce网站
                if (this.isSalesforceOrigin(url.origin)) {
                    // 在Salesforce网站，直接打开侧边栏
                    await chrome.sidePanel.open({ tabId });
                    console.log('SOQL Creator: 侧边栏打开成功');
                } else {
                    console.log('SOQL Creator: 非Salesforce网站，无法打开侧边栏');
                }
            }
            
        } catch (error) {
            console.error('SOQL Creator: 切换侧边栏失败:', error);
        }
    }

    // 判断是否为Salesforce网站（使用origin比较）
    isSalesforceOrigin(origin) {
        // 定义Salesforce相关的域名
        const salesforceOrigins = [
            'https://login.salesforce.com',
            'https://test.salesforce.com',
            'https://na1.salesforce.com',
            'https://na2.salesforce.com',
            'https://eu1.salesforce.com',
            'https://eu2.salesforce.com',
            'https://ap1.salesforce.com',
            'https://ap2.salesforce.com'
        ];
        
        // 检查是否匹配Salesforce域名模式
        const isSalesforceDomain = salesforceOrigins.some(salesforceOrigin => 
            origin === salesforceOrigin || 
            origin.endsWith('.salesforce.com') ||
            origin.endsWith('.force.com') ||
            origin.endsWith('.lightning.force.com')
        );
        
        console.log('SOQL Creator: 检查域名:', origin, '是否为Salesforce:', isSalesforceDomain);
        return isSalesforceDomain;
    }

    // 处理获取当前域名的消息
    async handleGetCurrentDomain(sender, sendResponse) {
        try {
            // 获取当前活动标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                const url = new URL(tab.url);
                console.log('SOQL Creator: 当前活动标签页域名:', url.origin);
                sendResponse({ success: true, domain: url.origin });
            } else {
                console.error('SOQL Creator: 无法获取当前活动标签页');
                sendResponse({ success: false, domain: null });
            }
        } catch (error) {
            console.error('SOQL Creator: 处理获取当前域名失败:', error);
            sendResponse({ success: false, domain: null });
        }
    }
}

// 初始化后台脚本
new SOQLCreatorBackground();

// 插件安装/更新事件
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('SOQL Creator 插件已安装');
    } else if (details.reason === 'update') {
        console.log('SOQL Creator 插件已更新到版本:', chrome.runtime.getManifest().version);
    }
});

// 插件启动事件
chrome.runtime.onStartup.addListener(() => {
    console.log('SOQL Creator 插件已启动');
});

