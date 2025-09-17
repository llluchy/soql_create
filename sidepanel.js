/**
 * SOQL Creator 侧边栏主要逻辑类
 * 基于 Salesforce Inspector Reloaded 最佳实践
 * 负责管理SOQL查询生成、对象选择、字段管理等功能
 */
class SOQLCreator {

    // ========================================
    // 构造函数 - 初始化所有属性和状态
    // ========================================
    constructor() {
        // 核心数据属性
        this.currentObject = null; // 当前选中的Salesforce对象
        this.selectedFields = new Set(); // 用户选中的字段集合
        this.objects = []; // 当前显示的对象列表（经过筛选）
        this.allObjects = []; // 所有对象的备份，用于筛选操作
        this.fields = {}; // 字段数据缓存，按对象API名称索引
        this.sfHost = null; // 当前Salesforce实例主机名
        
        // 环境管理相关
        this.environments = new Map(); // 存储所有检测到的Salesforce环境
        this.currentEnvironment = null; // 当前选中的环境信息
        
        // 权限和会话管理
        this.sessionCache = new Map(); // 会话缓存，避免重复获取权限
        
        // 配置和常量
        this.standardObjectWhitelist = SOQL_CONSTANTS.STANDARD_OBJECT_WHITELIST; // 标准对象白名单
        this.userConfig = null; // 用户配置对象
        
        // 初始化应用
        this.init();
    }

    /**
     * 初始化应用
     * 按顺序执行所有初始化步骤
     */
    async init() {
        await this.loadUserConfig(); // 加载用户配置
        this.bindEvents(); // 绑定DOM事件监听器
        this.firstTimeGetObjects(); // 检查当前页面是否为Salesforce页面
    }

    // ========================================
    // 绑定DOM事件监听器
    // ========================================
    bindEvents() {
        // 扩展按钮 - 打开扩展功能页面
        document.getElementById('expandBtn').addEventListener('click', () => {
            this.openExpandPage();
        });

        // 设置按钮 - 打开设置页面
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettingsPage();
        });

        // 环境选择器事件
        document.getElementById('environmentSelect').addEventListener('change', (e) => {
            this.switchEnvironment(e.target.value);
        });

        // 刷新环境按钮事件
        document.getElementById('refreshEnvironmentBtn').addEventListener('click', () => {
            this.refreshEnvironmentDetection();
        });

        // 对象类型筛选（业务对象、元数据、系统对象等）
        document.querySelectorAll('input[name="objectType"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.filterObjects(); // 根据类型筛选对象
            });
        });

        // 对象搜索功能
        document.getElementById('objectSearch').addEventListener('input', (e) => {
            this.filterObjects(); // 实时搜索和筛选对象
        });

        // 刷新对象按钮 - 重新加载当前环境的对象列表
        document.getElementById('refreshObjects').addEventListener('click', () => {
            this.loadObjects();
        });

        // 全选字段
        document.getElementById('selectAllFields').addEventListener('click', () => {
            this.selectAllFields(); // 选择当前对象的所有字段
        });

        // 取消全选字段
        document.getElementById('deselectAllFields').addEventListener('click', () => {
            this.deselectAllFields(); // 取消选择所有字段
        });

        // 选择常用字段
        document.getElementById('selectCommonFields').addEventListener('click', () => {
            this.selectCommonFields(); // 选择常用字段（Id, Name, CreatedDate等）
        });

        // 字段解析按钮
        document.getElementById('parseFields').addEventListener('click', () => {
            this.parseAndSelectFields();
        });

        // SOQL操作按钮
        document.getElementById('copySoql').addEventListener('click', () => {
            this.copySOQL(); // 复制生成的SOQL到剪贴板
        });

        // SOQL区域折叠/展开按钮事件
        document.getElementById('toggleSoql').addEventListener('click', () => {
            this.toggleSoqlSection();
        });

        // 查看SOQL按钮 - 与折叠按钮功能相同
        document.getElementById('viewSoql').addEventListener('click', () => {
            this.toggleSoqlSection();
        });

        // 消息关闭按钮
        document.getElementById('closeMessage').addEventListener('click', () => {
            this.hideMessage();
        });

    }

    /**
     * 检查当前页面是否为Salesforce页面
     * 如果是，则自动加载对象列表
     */
    async checkSalesforcePage() {
        try {
            // 获取当前页面的Salesforce主机信息
            this.sfHost = await this.getSfHost();
            if (this.sfHost && this.isSalesforceHost(this.sfHost)) {
                // 是Salesforce页面，加载对象列表
                await this.loadObjects();
        } else {
                // 不是Salesforce页面，显示提示信息
            this.showMessage('请在Salesforce页面使用此插件', 'warning');
            console.log('请在Salesforce页面使用此插件');
            }
        } catch (error) {
            // 检测失败，显示错误信息
            this.showMessage('无法检测当前页面，请确保在Salesforce页面使用', 'error');
            console.log('无法检测当前页面，请确保在Salesforce页面使用');
        }
    }

    /**
     * 获取当前页面的Salesforce主机信息
     * @returns {string|null} Salesforce主机名或null
     */
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

    // ========================================
    // 第一次获取对象列表
    // ========================================
    async firstTimeGetObjects() {
        // 先进行环境检测
        await this.checkEnvironment();
    }

    // ========================================
    // 点击刷新环境检测按钮
    // ========================================
    async refreshEnvironmentDetection() {
        const refreshBtn = document.getElementById('refreshEnvironmentBtn');
        if (!refreshBtn) return;
        
        refreshBtn.disabled = true;
        refreshBtn.classList.add('loading');
        
        try {
            this.showMessage('正在刷新环境检测...', 'info');
            console.log('正在刷新环境检测...');
            await this.checkEnvironment();

            this.showMessage('环境检测刷新完成！', 'success');
            console.log('环境检测刷新完成！');
        } catch (error) {
            this.showMessage('环境检测刷新失败', 'error');
            console.log('环境检测刷新失败');
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('loading');
        }
    }

    // async switchEnvironment(environmentKey) {

    //     // 获取Map中的环境信息
    //     const environment = this.environments.get(environmentKey);
    //     if (!environment) {
    //         this.showMessage('选择的环境不存在', 'error');
    //         return;
    //     }

    //     // 切换环境时，清除当前对象的字段缓存
    //     this.currentObject = null; // 清除当前选中的对象
    //     this.selectedFields.clear(); // 清除当前选中的字段
    //     this.fields = {}; // 清除字段缓存
    //     this.fieldsMap = new Map(); // 清除字段映射
    //     this.populateFieldList(); // 填充字段列表
    //     this.generateSOQL();
        
    //     this.currentEnvironment = environment;
    //     this.sfHost = environment.host;
        
    //     this.showMessage(`正在切换到 ${environment.host}...`, 'info');
        
    //     try {
    //         await this.loadObjects();
    //         this.showMessage(`已切换到 ${environment.host}`, 'success');
    //     } catch (error) {
    //         this.showMessage(`切换到 ${environment.host} 成功，但加载对象失败`, 'warning');
    //     }
    // }

    // ========================================
    // 使用环境选择器切换环境
    // ========================================
    async switchEnvironment(environmentKey) {
        if (!environmentKey) {
            this.currentEnvironment = null;
            this.sfHost = null;
            this.showMessage('已清空环境选择', 'info');
            console.log('已清空环境选择');
            return;
        }
        
        const environment = this.environments.get(environmentKey);
        if (!environment) {
            this.showMessage('选择的环境不存在', 'error');
            console.log('选择的环境不存在');
            return;
        }
        
        // 切换环境时，清除当前对象的字段缓存
        this.currentObject = null;
        this.selectedFields.clear();
        this.fields = {};
        this.fieldsMap = new Map();
        this.populateFieldList();
        this.generateSOQL();
        
        this.currentEnvironment = environment;
        this.sfHost = environment.host;
        
        this.showMessage(`正在切换到 ${environment.name}...`, 'info');
        console.log(`正在切换到 ${environment.name}...`);
        
        try {
            await this.loadObjects();
            this.showMessage(`已切换到 ${environment.name}`, 'success');
            console.log(`已切换到 ${environment.name}`);
        } catch (error) {
            this.showMessage(`切换到 ${environment.name} 成功，但加载对象失败`, 'warning');
            console.log(`切换到 ${environment.name} 成功，但加载对象失败`);
        }
    }

    // ========================================
    // 环境检测 - 统一的环境检测方法
    // 负责检查环境，不论是首次加载，还是页面切换，还是点击刷新，都调用此方法进行环境监测
    // ========================================
    async checkEnvironment() {
        try {
            // 获取当前活动标签页
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            // 如果标签页存在且有URL
            if (tabs.length > 0 && tabs[0].url) {
                const url = tabs[0].url;
                const urlObj = new URL(url);
                // 检查是否为有效的Salesforce环境，包括salesforce.com、force.com、cloudforce.com、visualforce.com
                const isSalesforceHost = urlObj.hostname.includes('salesforce.com') || 
                    urlObj.hostname.includes('force.com') ||
                    urlObj.hostname.includes('cloudforce.com') ||
                    urlObj.hostname.includes('visualforce.com');

                // 不是Salesforce页面，直接返回
                if (!isSalesforceHost) {
                    this.currentEnvironment = null;
                    this.sfHost = null;
                    this.showMessage('当前页面不是Salesforce页面', 'warning');
                    return;
                }

                const environmentKey = urlObj.host;
                console.log('checkEnvironment - 环境标识符:', environmentKey);
                
                // 添加新环境到列表
                if (!this.environments.has(environmentKey)) {
                    const environmentInfo = {
                        key: environmentKey,
                        host: urlObj.host,
                        origin: urlObj.origin,
                        url: url
                    };
                    this.environments.set(environmentKey, environmentInfo);
                }
                
                // 获取环境选择器
                const select = document.getElementById('environmentSelect');
                if (!select) return;
                
                // 初始化环境选择器的值
                select.innerHTML = '<option value="">请选择环境...</option>';
                
                // 遍历环境列表，添加选项
                this.environments.forEach((env, key) => {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = env.host; // 使用host作为显示名称
                    select.appendChild(option);
                });
                
                // 如果环境列表为空，添加一个禁用的选项
                if (this.environments.size === 0) {
                    const option = document.createElement('option');
                    option.value = "no-env";
                    option.textContent = "未检测到Salesforce环境 - 点击刷新按钮重试";
                    option.disabled = true;
                    select.appendChild(option);
                }
                
                // 如果当前环境选择器的值存在，设置为当前环境
                if (environmentKey && this.environments.has(environmentKey)) {
                    select.value = environmentKey;
                }

                // 设置当前环境选择器的值为当前环境
                this.currentEnvironment = this.environments.get(environmentKey);

                if (this.currentEnvironment) {
                    this.sfHost = this.currentEnvironment.host; // 设置当前环境的主机名
                    this.currentObject = null; // 清除当前选中的对象
                    this.selectedFields.clear(); // 清除当前选中的字段
                    this.fields = {}; // 清除字段缓存
                    this.fieldsMap = new Map(); // 清除字段映射
                    this.populateFieldList(); // 填充字段列表
                    this.generateSOQL(); // 生成SOQL
                    
                    // 在加载对象之前，先获取会话
                    console.log('checkEnvironment - 开始获取会话');
                    await sfConn.getSession(this.sfHost);
                    if (sfConn.sessionId) {
                        // 缓存会话信息
                        this.cacheSession(environmentKey, sfConn.sessionId);
                        console.log('checkEnvironment - 会话获取并缓存成功');
                    } else {
                        console.log('checkEnvironment - 会话获取失败');
                    }
                    
                    this.loadObjects(); // 加载对象列表
                    this.showMessage(`已加载环境 ${this.currentEnvironment.host}`, 'success');
                    
                    // 检查checkEnvironment执行后的sessionCache状态
                    console.log('checkEnvironment执行完成后的sessionCache:', Array.from(this.sessionCache.entries()));
                }
            } else {
                // 没有获取到标签页信息
                this.currentEnvironment = null;
                this.sfHost = null;
                this.showMessage('无法获取当前标签页信息', 'error');
            }
        } catch (error) {
            this.showMessage('环境检测失败，请点击刷新按钮重试', 'error');
            console.error('环境检测错误:', error);
        }
    }























    // /**
    /**
     * 检查指定环境的会话是否有效（未过期）
     * @param {string} environmentKey - 环境标识符
     * @returns {boolean} 会话是否有效
     */
    hasValidSession(environmentKey) {
        console.log('检查会话缓存，环境key:', environmentKey);
        console.log('当前缓存内容:', Array.from(this.sessionCache.entries()));
        
        const cached = this.sessionCache.get(environmentKey);
        console.log('找到的缓存:', cached);
        
        if (!cached) {
            console.log('没有找到缓存，返回false');
            return false;
        }
        
        // 检查缓存是否过期（5分钟）
        const now = Date.now();
        const cacheExpiry = 5 * 60 * 1000; // 5分钟缓存有效期
        const isValid = (now - cached.timestamp) < cacheExpiry && cached.sessionId;
        console.log('缓存有效性检查:', {
            now: now,
            timestamp: cached.timestamp,
            age: now - cached.timestamp,
            expiry: cacheExpiry,
            hasSessionId: !!cached.sessionId,
            isValid: isValid
        });
        return isValid;
    }

    /**
     * 缓存会话信息到内存中
     * @param {string} environmentKey - 环境标识符
     * @param {string} sessionId - 会话ID
     */
    cacheSession(environmentKey, sessionId) {
        console.log('缓存会话，环境key:', environmentKey, '会话ID:', sessionId ? '已设置' : '未设置');
        console.log('缓存前的sessionCache大小:', this.sessionCache.size);
        
        this.sessionCache.set(environmentKey, {
            sessionId: sessionId,
            timestamp: Date.now()
        });
        
        console.log('缓存后的sessionCache大小:', this.sessionCache.size);
        console.log('缓存后的内容:', Array.from(this.sessionCache.entries()));
        
        // 验证缓存是否真的被设置
        const cached = this.sessionCache.get(environmentKey);
        console.log('验证缓存设置结果:', cached);
    }

    /**
     * 清除会话缓存
     * @param {string|null} environmentKey - 要清除的环境标识符，null表示清除所有
     */
    clearSessionCache(environmentKey = null) {
        if (environmentKey) {
            // 清除指定环境的缓存
            this.sessionCache.delete(environmentKey);
            } else {
            // 清除所有环境的缓存
            this.sessionCache.clear();
        }
    }

    /**
     * 处理会话失效情况
     * @param {string} environmentKey - 失效的环境标识符
     */
    handleSessionExpired(environmentKey) {
        this.clearSessionCache(environmentKey);
        this.showMessage('会话已过期，正在重新获取权限...', 'warning');
        console.log('会话已过期，正在重新获取权限...');
    }

    /**
     * 加载Salesforce对象列表
     * 包含权限检查、会话缓存、错误处理等完整流程
     */
    async loadObjects() {
        try {
            // 显示加载状态和用户提示
            this.showLoadingStatus('正在加载对象列表...', 'objectList');
            this.showMessage('正在加载对象列表...');
            console.log('正在加载对象列表...');
            
            
            // 确定当前环境标识符
            const environmentKey = this.currentEnvironment ? this.currentEnvironment.key : this.sfHost;
            console.log('loadObjects - 环境标识符:', environmentKey);
            console.log('loadObjects - currentEnvironment:', this.currentEnvironment);
            console.log('loadObjects - sfHost:', this.sfHost);
            let sessionId = null;
            
            // 检查是否已有有效的会话缓存，首次加载对象列表时，一般没有会话缓存
            // if (this.hasValidSession(environmentKey)) {
            //     // 使用缓存的会话，避免重复获取权限
            //     const cached = this.sessionCache.get(environmentKey);
            //     sessionId = cached.sessionId;
            //     sfConn.sessionId = sessionId;
            //     sfConn.instanceHostname = this.sfHost;
            // } else {
                // 获取新的会话
                console.log('获取新会话，主机:', this.sfHost);
                await sfConn.getSession(this.sfHost);
                sessionId = sfConn.sessionId;
                console.log('会话获取结果:', sessionId ? '成功' : '失败');
                
                if (sessionId) {
                    // 缓存新获取的会话信息
                    this.cacheSession(environmentKey, sessionId);
                }
            // }
            
            // 验证会话是否获取成功
            if (!sessionId) {
                this.hideLoadingStatus(document.getElementById('objectList'));
                this.showMessage('无法获取Salesforce会话，请检查登录状态', 'error');
                console.log('无法获取Salesforce会话，请检查登录状态');
                return;
            }
            
            // 调用Salesforce API获取对象列表
            const result = await soqlExecutor.getSObjects();
            
            if (result && result.sobjects && result.sobjects.length > 0) {
                // 过滤和转换对象数据
                this.allObjects = result.sobjects
                    .filter(obj => obj.queryable === true && obj.retrieveable === true) // 只保留可查询的对象
                    .sort((a, b) => a.label.localeCompare(b.label)) // 按标签名称排序
                    .map(obj => ({
                        name: obj.name,
                        label: obj.label || obj.name,
                        apiName: obj.name,
                        description: obj.description || '',
                        createable: obj.createable || false,
                        updateable: obj.updateable || false,
                        deletable: obj.deletable || false
                    }));
                
                // 初始化显示列表
                this.objects = [...this.allObjects];
                
                // 更新UI显示
                this.hideLoadingStatus(document.getElementById('objectList'));
                this.populateObjectList();
                this.showMessage(`成功加载 ${this.allObjects.length} 个对象`, 'success');
                console.log(`成功加载 ${this.allObjects.length} 个对象`);
            } else {
                // 没有获取到对象数据
                this.hideLoadingStatus(document.getElementById('objectList'));
                this.showMessage('无法获取对象列表，请检查权限', 'error');
                console.log('无法获取对象列表，请检查权限');
                this.allObjects = [];
                this.objects = [];
                this.populateObjectList();
            }
        } catch (error) {
            this.hideLoadingStatus(document.getElementById('objectList'));
            
            // 检查是否是会话失效错误（401 Unauthorized）
            if (error.message && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
                const environmentKey = this.currentEnvironment ? this.currentEnvironment.key : this.sfHost;
                this.handleSessionExpired(environmentKey);
                // 自动重试一次
                setTimeout(() => this.loadObjects(), 1000);
                return;
            }
            
            // 处理其他错误
            ErrorHandler.handle(error, 'loadObjects');
            this.allObjects = [];
            this.objects = [];
            this.populateObjectList();
        }
    }

    /**
     * 加载指定对象的字段列表
     * @param {string} objectApiName - 对象的API名称
     */
    async loadFields(objectApiName) {
        try {
            // 显示加载状态
            this.showLoadingStatus('正在加载字段列表...', 'fieldList');
            this.showMessage('正在加载字段列表...');
            console.log('正在加载字段列表...');
            
            // 调用Salesforce API获取对象字段描述
            const result = await soqlExecutor.describeSObject(objectApiName);
            
            if (result && result.fields && result.fields.length > 0) {
                // 过滤出可查询的字段
                // 注意：Salesforce字段没有queryable和retrieveable属性
                // 使用deprecatedAndHidden和sortable属性来判断字段是否可用
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
                this.fields[objectApiName] = fieldsMap;
                
                // 更新UI显示
                this.hideLoadingStatus(document.getElementById('fieldList'));
                this.populateFieldList();
                this.showMessage(`成功加载 ${Object.keys(fieldsMap).length} 个字段`, 'success');
                console.log(`成功加载 ${Object.keys(fieldsMap).length} 个字段`);
            } else {
                // 没有获取到字段数据
                this.hideLoadingStatus(document.getElementById('fieldList'));
                this.showMessage('无法获取字段列表，请检查权限', 'error');
                console.log('无法获取字段列表，请检查权限');
                this.fields[objectApiName] = {};
                this.populateFieldList();
            }
        } catch (error) {
            this.hideLoadingStatus(document.getElementById('fieldList'));
            
            // 检查是否是会话失效错误
            // if (error.message && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
            //     const environmentKey = this.currentEnvironment ? this.currentEnvironment.key : this.sfHost;
            //     this.handleSessionExpired(environmentKey);
            //     // 自动重试一次
            //     setTimeout(() => this.loadFields(objectApiName), 1000);
            //     return;
            // }
            
            // 处理其他错误
            ErrorHandler.handle(error, 'loadFields');
            this.fields[objectApiName] = {};
            this.populateFieldList();
        }
    }

    // 填充对象选择下拉框
    populateObjectList() {
        const objectList = document.getElementById('objectList');
        
        if (this.allObjects.length === 0) {
            objectList.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">暂无可用对象</div><div class="empty-description">请检查Session ID或网络连接</div></div>';
            return;
        }
        
        // 清空列表
        objectList.innerHTML = '';
        
        // 过滤掉Share对象，然后按标签名称排序
        const filteredObjects = this.allObjects.filter(obj => {
            const objectType = this.getObjectType(obj);
            
            // 过滤掉Share对象
            if (objectType === 'share') {
            return false;
        }
        
            // 对于业务对象（包含标准对象和自定义对象），根据设置决定是否启用白名单筛选
            if (objectType === 'business') {
                const enableFilter = localStorage.getItem('enableStandardObjectFilter') !== 'false';
                if (enableFilter) {
                    // 标准对象需要检查白名单
                    if (obj.name.endsWith('__c')) {
                        // 自定义对象不做限制
        return true;
                    } else {
                        // 标准对象必须在白名单中
                        return SOQL_CONSTANTS.isStandardObjectInWhitelist(obj.name);
                    }
                }
                // 如果禁用筛选，显示所有业务对象
                return true;
            }
            
            // 其他类型的对象（自定义、元数据、系统）都显示
            return true;
        });
        
        const sortedObjects = [...filteredObjects].sort((a, b) => a.label.localeCompare(b.label));
        
        // 打印所有对象到控制台
        console.log('=== SOQL Creator: 所有对象列表 ===');
        console.log('原始对象数量:', this.allObjects.length);
        console.log('过滤后对象数量:', sortedObjects.length);
        
        const enableFilter = localStorage.getItem('enableStandardObjectFilter') !== 'false';
        if (enableFilter) {
            console.log('已过滤掉Share对象和不在白名单中的标准对象');
            console.log('业务对象白名单筛选: 启用（标准对象需在白名单中，自定义对象无限制）');
                } else {
            console.log('已过滤掉Share对象');
            console.log('业务对象白名单筛选: 禁用');
        }
        
        // 统计各类型对象数量
        const typeCounts = {};
        sortedObjects.forEach(obj => {
            const objectType = this.getObjectType(obj);
            typeCounts[objectType] = (typeCounts[objectType] || 0) + 1;
        });
        console.log('对象类型统计:', typeCounts);
        
        console.log('对象详情:');
        sortedObjects.forEach((obj, index) => {
            const objectType = this.getObjectType(obj);
        });
        console.log('=== 对象列表结束 ===');

        if (sortedObjects.length === 0) {
            objectList.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">没有找到匹配的对象</div><div class="empty-description">请尝试调整筛选条件或搜索关键词</div></div>';
            return;
        }

        sortedObjects.forEach(obj => {
            const objectItem = document.createElement('div');
            objectItem.className = 'object-item';
            objectItem.dataset.apiName = obj.apiName;
            objectItem.dataset.objectType = this.getObjectType(obj);
            
            const objectInfo = document.createElement('div');
            objectInfo.className = 'object-info';
            
            const objectName = document.createElement('div');
            objectName.className = 'object-name';
            objectName.textContent = obj.label;
            
            const objectApi = document.createElement('div');
            objectApi.className = 'object-api';
            objectApi.textContent = obj.name;
            
            // 添加对象描述（如果有的话）
            if (obj.label !== obj.name) {
                const objectDescription = document.createElement('div');
                objectDescription.className = 'object-description';
                // objectDescription.textContent = `API名称: ${obj.name}`;
                objectInfo.appendChild(objectDescription);
            }
            
            objectInfo.appendChild(objectName);
            objectInfo.appendChild(objectApi);
            objectItem.appendChild(objectInfo);
            
            // 添加点击事件
            objectItem.addEventListener('click', () => {
                this.selectObject(obj.apiName);
            });
            
            objectList.appendChild(objectItem);
        });
    }

    // 选择对象
    selectObject(objectApiName) {
        // 更新选中状态
        const objectItems = document.querySelectorAll('.object-item');
        objectItems.forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.apiName === objectApiName) {
                item.classList.add('selected');
            }
        });
        
        // 调用原有的对象变化处理逻辑
        this.onObjectChange(objectApiName);
    }

    // 对象选择变化处理
    async onObjectChange(objectApiName) {
        if (!objectApiName) {
            this.currentObject = null;
            this.selectedFields.clear();
            this.clearFieldList();
            this.generateSOQL();
            return;
        }

        this.currentObject = this.allObjects.find(obj => obj.apiName === objectApiName);
        await this.loadFields(objectApiName);
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
     * 检查对象是否在白名单中（包括选中的和未选中的）
     * @param {string} objectName - 对象名称
     * @returns {boolean} 是否在白名单中
     */
    isObjectInWhitelist(objectName) {
        if (this.userConfig && this.userConfig.objectWhitelist && this.userConfig.objectWhitelist.allObjects) {
            return this.userConfig.objectWhitelist.allObjects.includes(objectName);
        }
        return false;
    }

    // 过滤对象列表
    filterObjects() {
        const objectList = document.getElementById('objectList');
        const searchTerm = document.getElementById('objectSearch').value.toLowerCase().trim();
        const selectedType = document.querySelector('input[name="objectType"]:checked').value;
        
        // 如果没有备份数据，直接返回
        if (this.allObjects.length === 0) {
            objectList.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">暂无可用对象</div><div class="empty-description">请检查Session ID或网络连接</div></div>';
            return;
        }
        
        // 清空列表
        objectList.innerHTML = '';
        
        // 从备份数据中筛选对象
        let filteredObjects = this.allObjects.filter(obj => {
            const objectType = this.getObjectType(obj);
            
            // 过滤掉Share对象
            if (objectType === 'share') {
                return false;
            }
            
            // 应用白名单过滤
            if (this.userConfig && this.userConfig.objectWhitelist) {
                // 检查对象是否在白名单中（包括选中的和未选中的）
                const isInWhitelist = this.isObjectInWhitelist(obj.name);
                if (isInWhitelist) {
                    // 在白名单中，只有选中的才显示
                    return this.userConfig.objectWhitelist.selectedObjects.includes(obj.name);
                }
            }
            // 白名单以外的对象正常显示
            
            // 对于业务对象（包含标准对象和自定义对象），根据设置决定是否启用白名单筛选
            if (objectType === 'business') {
                const enableFilter = localStorage.getItem('enableStandardObjectFilter') !== 'false';
                if (enableFilter) {
                    // 标准对象需要检查白名单
                    if (obj.name.endsWith('__c')) {
                        // 自定义对象不做限制
                        return true;
                    } else {
                        // 标准对象必须在白名单中
                        return SOQL_CONSTANTS.isStandardObjectInWhitelist(obj.name);
                    }
                }
                // 如果禁用筛选，显示所有业务对象
                return true;
            }
            
            // 其他类型的对象（自定义、元数据、系统）都显示
            return true;
        });
        
        // 应用类型筛选
        filteredObjects = filteredObjects.filter(obj => {
            const objectType = this.getObjectType(obj);
            return objectType === selectedType;
        });
        
        // 应用搜索筛选
        if (searchTerm) {
            filteredObjects = filteredObjects.filter(obj => {
                const labelMatch = obj.label.toLowerCase().includes(searchTerm);
                const apiMatch = obj.name.toLowerCase().includes(searchTerm);
                return labelMatch || apiMatch;
            });
        }
        
        // 按标签名称排序
        filteredObjects.sort((a, b) => a.label.localeCompare(b.label));
        
        // 如果没有匹配的对象，显示空状态提示
        if (filteredObjects.length === 0) {
            objectList.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">没有找到匹配的对象</div><div class="empty-description">请尝试调整筛选条件或搜索关键词</div></div>';
            return;
        }
        
        // 重新渲染对象列表
        filteredObjects.forEach(obj => {
            const objectItem = document.createElement('div');
            objectItem.className = 'object-item';
            objectItem.dataset.apiName = obj.apiName;
            objectItem.dataset.objectType = this.getObjectType(obj);
            
            const objectInfo = document.createElement('div');
            objectInfo.className = 'object-info';
            
            const objectName = document.createElement('div');
            objectName.className = 'object-name';
            objectName.textContent = obj.label;
            
            const objectApi = document.createElement('div');
            objectApi.className = 'object-api';
            objectApi.textContent = obj.name;
            
            // 添加对象描述（如果有的话）
            if (obj.label !== obj.name) {
                const objectDescription = document.createElement('div');
                objectDescription.className = 'object-description';
                objectInfo.appendChild(objectDescription);
            }
            
            objectInfo.appendChild(objectName);
            objectInfo.appendChild(objectApi);
            objectItem.appendChild(objectInfo);
            
            // 添加点击事件
            objectItem.addEventListener('click', () => {
                this.selectObject(obj.apiName);
            });
            
            objectList.appendChild(objectItem);
        });
    }

    // 填充字段列表
    populateFieldList() {
        const fieldList = document.getElementById('fieldList');
        fieldList.innerHTML = '';

        if (!this.currentObject || !this.fields[this.currentObject.apiName]) {
            fieldList.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">请先选择对象</div><div class="empty-description">选择一个对象以查看其字段列表</div></div>';
            return;
        }

        const fields = this.fields[this.currentObject.apiName];
        
        if (Object.keys(fields).length === 0) {
            fieldList.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">无法获取字段列表</div><div class="empty-description">请检查Session ID或重新选择对象</div></div>';
            return;
        }

        Object.values(fields).forEach(field => {
            const fieldItem = document.createElement('div');
            fieldItem.className = 'field-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `field_${field.name}`;
            checkbox.value = field.name;
            checkbox.addEventListener('change', (e) => {
                this.onFieldChange(e.target.value, e.target.checked);
            });

            const label = document.createElement('label');
            label.htmlFor = `field_${field.name}`;
            
            // 创建更丰富的字段显示
            const fieldInfo = document.createElement('div');
            fieldInfo.className = 'field-info';
            
            const fieldName = document.createElement('div');
            fieldName.className = 'field-name';
            fieldName.textContent = `${field.label} (${field.name})`;
            
            const fieldDetails = document.createElement('div');
            fieldDetails.className = 'field-details';
            fieldDetails.textContent = `${field.type}${field.custom ? ' (Custom)' : ''}${field.required ? ' (Required)' : ''}`;
            
            fieldInfo.appendChild(fieldName);
            fieldInfo.appendChild(fieldDetails);
            
            label.appendChild(fieldInfo);
            fieldItem.appendChild(checkbox);
            fieldItem.appendChild(label);
            fieldList.appendChild(fieldItem);
        });

        // 默认选择常用字段
        this.selectCommonFields();
    }

    // 清空字段列表
    clearFieldList() {
        const fieldList = document.getElementById('fieldList');
        fieldList.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">请先选择对象</div><div class="empty-description">选择一个对象以查看其字段列表</div></div>';
    }

    // 字段选择变化处理
    onFieldChange(fieldName, isSelected) {
        if (isSelected) {
            this.selectedFields.add(fieldName);
        } else {
            this.selectedFields.delete(fieldName);
        }
        this.generateSOQL();
    }

    // 全选字段
    selectAllFields() {
        if (!this.currentObject) return;
        
        const fields = this.fields[this.currentObject.apiName];
        Object.values(fields).forEach(field => {
            this.selectedFields.add(field.name);
            const checkbox = document.getElementById(`field_${field.name}`);
            if (checkbox) checkbox.checked = true;
        });
        this.generateSOQL();
    }

    // 取消全选字段
    deselectAllFields() {
        this.selectedFields.clear();
        const checkboxes = document.querySelectorAll('#fieldList input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.generateSOQL();
    }

    // 选择常用字段
    selectCommonFields() {
        if (!this.currentObject) return;
        
        const commonFieldNames = ['Id', 'Name', 'CreatedDate'];
        this.selectedFields.clear();
        
        const checkboxes = document.querySelectorAll('#fieldList input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (commonFieldNames.includes(checkbox.value)) {
                checkbox.checked = true;
                this.selectedFields.add(checkbox.value);
            } else {
                checkbox.checked = false;
            }
        });
        this.generateSOQL();
    }

    /**
     * 生成SOQL查询语句
     * 根据当前选中的对象和字段生成标准的SOQL SELECT语句
     */
    generateSOQL() {
        const soqlOutput = document.getElementById('soqlOutput');
        
        // 检查是否有选中的对象和字段
        if (!this.currentObject || this.selectedFields.size === 0) {
            soqlOutput.value = '';
            return;
        }

        // 生成SOQL语句
        const fields = Array.from(this.selectedFields).join(', ');
        const soql = `SELECT ${fields}\nFROM ${this.currentObject.apiName}`;
        
        // 更新输出区域
        soqlOutput.value = soql;
    }

    /**
     * 复制SOQL语句到剪贴板
     * 使用现代浏览器的Clipboard API
     */
    async copySOQL() {
        const soqlOutput = document.getElementById('soqlOutput');
        if (!soqlOutput.value.trim()) {
            this.showMessage('没有可复制的SOQL语句');
            console.log('没有可复制的SOQL语句');
            return;
        }

        try {
            // 使用Clipboard API复制文本
            await navigator.clipboard.writeText(soqlOutput.value);
            this.showMessage('SOQL已复制到剪贴板');
            console.log('SOQL已复制到剪贴板');
        } catch (error) {
            // 复制失败时的降级处理
            console.error('复制失败:', error);
            this.showMessage('复制失败，请手动复制');
            console.log('复制失败，请手动复制');
        }
    }

    /**
     * 显示消息提示
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型：'info'|'success'|'warning'|'error'
     */
    showMessage(message, type = 'info') {
        const messageContainer = document.getElementById('messageContainer');
        const messageContent = document.getElementById('messageContent');
        
        // 设置消息内容
        messageContent.textContent = message;
        
        // 设置消息类型样式
        messageContainer.className = `message-container ${type}`;
        
        // 显示消息
        messageContainer.style.display = 'flex';
        
        // 自动隐藏消息（5秒后）
        setTimeout(() => {
            this.hideMessage();
        }, 5000);
    }

    /**
     * 隐藏消息提示
     */
    hideMessage() {
        const messageContainer = document.getElementById('messageContainer');
        messageContainer.style.display = 'none';
    }

    // 显示加载状态
    showLoadingStatus(message = '正在加载...', containerId = null) {
        // 如果没有指定容器，默认使用对象列表容器
        const container = containerId ? document.getElementById(containerId) : document.querySelector('.object-list-container');
        
        if (!container) return;
        
        // 移除现有的加载覆盖层
        this.hideLoadingStatus(container);
        
        // 创建加载覆盖层
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner"></div>
            <span class="loading-text">${message}</span>
        `;
        
        container.appendChild(loadingOverlay);
    }

    // 隐藏加载状态
    hideLoadingStatus(container = null) {
        // 如果没有指定容器，查找所有加载覆盖层
        if (container) {
            const loadingOverlay = container.querySelector('.loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.remove();
            }
        } else {
            // 移除所有加载覆盖层
            const loadingOverlays = document.querySelectorAll('.loading-overlay');
            loadingOverlays.forEach(overlay => overlay.remove());
        }
    }

    /**
     * 解析并选择字段
     * 从用户输入的文本中解析字段名称，并自动选择匹配的字段
     */
    parseAndSelectFields() {
        const input = document.getElementById('fieldParserInput');
        const inputText = input.value.trim();
        
        // 验证输入
        if (!inputText) {
            this.showMessage('请输入要解析的字段列表', 'warning');
            console.log('请输入要解析的字段列表');
            return;
        }
        
        if (!this.currentObject) {
            this.showMessage('请先选择对象', 'warning');
            console.log('请先选择对象');
            return;
        }
        
        try {
            // 解析字段名称
            const fieldNames = this.parseFieldNames(inputText);
            
            if (fieldNames.length === 0) {
                this.showMessage('未找到有效的字段名称', 'warning');
                console.log('未找到有效的字段名称');
                return;
            }

            // 匹配当前对象的字段
            const matchedFields = this.matchFields(fieldNames);
            
            if (matchedFields.length === 0) {
                this.showMessage('未找到匹配的字段', 'warning');
                console.log('未找到匹配的字段');
                return;
            }

            // 选择匹配的字段
            this.selectMatchedFields(matchedFields);
            
            // 显示解析结果
            const unmatchedCount = fieldNames.length - matchedFields.length;
            if (unmatchedCount > 0) {
                this.showMessage(`成功选择 ${matchedFields.length} 个字段，${unmatchedCount} 个字段未匹配`, 'success');
                console.log(`成功选择 ${matchedFields.length} 个字段，${unmatchedCount} 个字段未匹配`);
        } else {
                this.showMessage(`成功选择 ${matchedFields.length} 个字段`, 'success');
                console.log(`成功选择 ${matchedFields.length} 个字段`);
            }

            // 清空输入框
            input.value = '';

        } catch (error) {
            console.error('SOQL Creator: 解析字段失败:', error);
            this.showMessage('解析字段失败，请检查输入格式', 'error');
            console.log('解析字段失败，请检查输入格式');
        }
    }

    /**
     * 解析字段名称 - 支持多种格式
     * 支持从Excel、文档等复制的字段列表，自动识别分隔符
     * @param {string} inputText - 用户输入的文本
     * @returns {Array<string>} 解析出的字段名称数组
     */
    parseFieldNames(inputText) {
        const fieldNames = [];
        
        // 移除常见的包装字符（如方括号、圆括号、引号等）
        let cleanText = inputText
            .replace(/^[\[\](){}"]+/, '')  // 移除开头的包装字符
            .replace(/[\[\](){}"]+$/, '')  // 移除结尾的包装字符
            .trim();

        // 尝试不同的分隔符（按优先级排序）
        const separators = [',', ';', '\t', '\n', ' ', '|'];
        
        for (const separator of separators) {
            if (cleanText.includes(separator)) {
                // 找到分隔符，按此分隔符分割
                const parts = cleanText.split(separator);
                for (const part of parts) {
                    const fieldName = part.trim();
                    if (fieldName && this.isValidFieldName(fieldName)) {
                        fieldNames.push(fieldName);
                    }
                }
                break; // 使用第一个匹配的分隔符
            }
        }

        // 如果没有找到分隔符，尝试作为单个字段处理
        if (fieldNames.length === 0 && this.isValidFieldName(cleanText)) {
            fieldNames.push(cleanText);
        }

        return fieldNames;
    }

    /**
     * 验证字段名称是否符合Salesforce命名规范
     * @param {string} fieldName - 要验证的字段名称
     * @returns {boolean} 是否为有效的字段名称
     */
    isValidFieldName(fieldName) {
        // Salesforce字段名称规则：字母开头，只能包含字母、数字、下划线
        return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName) && fieldName.length > 0;
    }

    /**
     * 匹配字段名称
     * 将解析出的字段名称与当前对象的可用字段进行匹配
     * @param {Array<string>} fieldNames - 要匹配的字段名称数组
     * @returns {Array<string>} 匹配成功的字段名称数组
     */
    matchFields(fieldNames) {
        const matchedFields = [];
        const availableFields = this.fields[this.currentObject.apiName] || {};
        const availableFieldNames = Object.keys(availableFields);

        for (const fieldName of fieldNames) {
            // 1. 精确匹配（完全相同的字段名）
            if (availableFieldNames.includes(fieldName)) {
                matchedFields.push(fieldName);
                continue;
            }

            // 2. 大小写不敏感匹配
            const lowerFieldName = fieldName.toLowerCase();
            const matchedField = availableFieldNames.find(name => 
                name.toLowerCase() === lowerFieldName
            );
            if (matchedField) {
                matchedFields.push(matchedField);
                continue;
            }

            // 3. 部分匹配（字段名包含输入的内容或输入包含字段名）
            const partialMatch = availableFieldNames.find(name => 
                name.toLowerCase().includes(lowerFieldName) || 
                lowerFieldName.includes(name.toLowerCase())
            );
            if (partialMatch) {
                matchedFields.push(partialMatch);
            }
        }

        return matchedFields;
    }

    /**
     * 选择匹配的字段
     * 将匹配成功的字段设置为选中状态，并更新UI和SOQL
     * @param {Array<string>} matchedFields - 匹配成功的字段名称数组
     */
    selectMatchedFields(matchedFields) {
        // 先清空所有选择
        this.selectedFields.clear();
        
        // 选择匹配的字段
        matchedFields.forEach(fieldName => {
            this.selectedFields.add(fieldName);
        });

        // 更新UI中的复选框状态
        const checkboxes = document.querySelectorAll('#fieldList input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.selectedFields.has(checkbox.value);
        });

        // 重新生成SOQL语句
        this.generateSOQL();
    }

    /**
     * 打开设置面板
     * 创建模态框显示设置选项和关于信息
     */
    openSettings() {
        // 创建设置模态框
        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        modal.innerHTML = `
            <div class="settings-overlay">
                <div class="settings-panel">
                    <div class="settings-header">
                        <h3>设置</h3>
                        <button class="settings-close">&times;</button>
                    </div>
                    <div class="settings-content">
                        <div class="settings-section">
                            <h4>侧边栏设置</h4>
                            <div class="setting-item">
                                <div class="setting-description">
                                    侧边栏位置可在Chrome浏览器设置中调整：<br>
                                    设置 → 外观 → 侧边栏位置
                                </div>
                            </div>
                        </div>
                        <div class="settings-section">
                            <h4>关于</h4>
                            <div class="setting-item">
                                <div class="setting-description">
                                    <strong>SOQL Creator</strong><br>
                                    版本：v1.0.0<br>
                                    一个用于生成Salesforce SOQL查询的Chrome扩展
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定设置面板事件
        this.bindSettingsEvents(modal);

        // 加载保存的设置
        this.loadSettings(modal);
    }

    /**
     * 打开扩展页面
     * 在新标签页中打开扩展功能页面
     */
    openExpandPage() {
        // 创建新标签页打开扩展页面
        chrome.tabs.create({
            url: chrome.runtime.getURL('expand.html')
        });
    }

    /**
     * 打开设置页面
     */
    openSettingsPage() {
        // 创建新标签页打开设置页面
        chrome.tabs.create({
            url: chrome.runtime.getURL('settings.html')
        });
    }

    /**
     * 加载用户配置
     */
    async loadUserConfig() {
        try {
            this.userConfig = await userConfig.getConfig();
            console.log('用户配置已加载:', this.userConfig);
            
            // 应用配置到界面
            this.applyUserConfig();
            
            // 监听配置变化
            this.setupConfigListener();
        } catch (error) {
            console.error('加载用户配置失败:', error);
            // 使用默认配置
            this.userConfig = userConfig.defaultConfig;
        }
    }

    /**
     * 应用用户配置到界面
     */
    applyUserConfig() {
        if (!this.userConfig) return;

        // 应用调试模式
        if (this.userConfig.enableDebugMode) {
            console.log('调试模式已启用');
        }

        // 如果对象列表已加载，重新过滤以应用新的白名单设置
        if (this.allObjects && this.allObjects.length > 0) {
            console.log('配置已更新，重新过滤对象列表');
            this.filterObjects();
        }
    }

    /**
     * 设置配置变化监听器
     */
    setupConfigListener() {
        userConfig.onConfigChanged((changes) => {
            console.log('配置已更改:', changes);
            
            // 重新加载配置
            this.loadUserConfig();
        });
    }

    /**
     * 获取配置值
     */
    getConfig(key) {
        return this.userConfig ? this.userConfig[key] : null;
    }

    /**
     * 设置配置值
     */
    async setConfig(key, value) {
        try {
            await userConfig.setConfig(key, value);
            this.userConfig[key] = value;
            console.log(`配置已更新: ${key} = ${value}`);
        } catch (error) {
            console.error('设置配置失败:', error);
        }
    }

    // 绑定设置面板事件
    bindSettingsEvents(modal) {
        // 关闭按钮
        modal.querySelector('.settings-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // 点击遮罩层关闭
        modal.querySelector('.settings-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                document.body.removeChild(modal);
            }
        });

    }

    // 加载设置
    async loadSettings(modal) {
        // 当前没有需要加载的设置
    }

    /**
     * 切换SOQL区域折叠/展开状态
     * 控制SOQL文本区域的显示和隐藏
     */
    toggleSoqlSection() {
        const toggleBtn = document.getElementById('toggleSoql');
        const soqlTextareaContainer = document.getElementById('soqlTextareaContainer');
        
        if (!toggleBtn || !soqlTextareaContainer) return;
        
        const isCollapsed = soqlTextareaContainer.classList.contains('collapsed');
        
        if (isCollapsed) {
            // 展开SOQL文本区域
            soqlTextareaContainer.classList.remove('collapsed');
            toggleBtn.classList.remove('collapsed');
        } else {
            // 折叠SOQL文本区域
            soqlTextareaContainer.classList.add('collapsed');
            toggleBtn.classList.add('collapsed');
        }
    }

}

// ========================================
// 页面初始化
// ========================================

/**
 * 页面加载完成后的初始化逻辑
 * 处理OAuth回调和创建SOQL Creator实例
 */
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否是OAuth回调页面
    if (window.location.hash.includes('access_token')) {
        const result = oauthManager.handleOAuthCallback();
        if (result.success) {
            console.log('SOQL Creator: OAuth回调处理成功');
            // 可以在这里显示成功消息或重定向
        }
    }
    
    // 创建并初始化SOQL Creator实例
    window.soqlCreator = new SOQLCreator();
});
