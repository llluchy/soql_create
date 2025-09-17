// SOQL Creator 数据库管理工具主逻辑

class SOQLCreator {
    constructor() {
        this.currentObject = null;
        this.selectedFields = new Set();
        this.queryTabs = new Map();
        this.currentTabId = 1;
        this.sfHost = null;
        this.userConfig = null;
        this.availableEnvironments = [];
        this.selectedEnvironment = null;
        
        this.init();
    }

    async init() {
        console.log('初始化 SOQL Creator');
        
        // 加载用户配置
        await this.loadUserConfig();
        
        // 加载可用环境列表
        await this.loadAvailableEnvironments();
        
        // 绑定事件
        this.bindEvents();
        
        // 初始化界面
        this.initializeUI();
        
        // 加载对象列表
        await this.loadObjects();
    }

    // ========================================
    // 配置管理
    // ========================================
    async loadUserConfig() {
        try {
            this.userConfig = await userConfig.getConfig();
            console.log('用户配置已加载:', this.userConfig);
        } catch (error) {
            console.error('加载用户配置失败:', error);
            this.userConfig = userConfig.defaultConfig;
        }
    }

    // ========================================
    // 环境管理
    // ========================================
    async loadAvailableEnvironments() {
        try {
            // 从 Session 中读取所有可用环境
            this.availableEnvironments = await this.getEnvironmentsFromSession();
            
            console.log('从 Session 读取的环境列表:', this.availableEnvironments);
            
            // 更新环境下拉列表
            this.updateEnvironmentSelect();
            
            // 如果有环境，选择第一个
            if (this.availableEnvironments.length > 0) {
                this.selectEnvironment(this.availableEnvironments[0]);
            }
            
        } catch (error) {
            console.error('从 Session 加载环境列表失败:', error);
            this.availableEnvironments = [];
        }
    }

    async getEnvironmentsFromSession() {
        try {
            // 获取所有打开的 Salesforce 标签页
            const tabs = await chrome.tabs.query({});
            const salesforceTabs = tabs.filter(tab => 
                tab.url && (
                    tab.url.includes('.lightning.force.com') || 
                    tab.url.includes('.salesforce.com') ||
                    tab.url.includes('.my.salesforce.com')
                )
            );

            const environments = [];
            const seenHosts = new Set();

            // 从每个 Salesforce 标签页提取环境信息
            for (const tab of salesforceTabs) {
                try {
                    const host = this.extractHostFromUrl(tab.url);
                    if (host && !seenHosts.has(host)) {
                        seenHosts.add(host);
                        
                        // 获取该标签页的 Session 信息
                        const sessionInfo = await this.getSessionFromTab(tab.id);
                        
                        if (sessionInfo) {
                            environments.push({
                                name: this.generateEnvironmentName(host, sessionInfo),
                                host: host,
                                type: this.detectEnvironmentType(host, sessionInfo),
                                tabId: tab.id,
                                sessionInfo: sessionInfo
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`处理标签页 ${tab.id} 时出错:`, error);
                }
            }

            return environments;
        } catch (error) {
            console.error('从 Session 获取环境失败:', error);
            return [];
        }
    }

    extractHostFromUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            return null;
        }
    }

    async getSessionFromTab(tabId) {
        try {
            // 通过消息传递获取标签页的 Session 信息
            const response = await chrome.tabs.sendMessage(tabId, { 
                action: 'getSessionInfo' 
            });
            return response;
        } catch (error) {
            // 如果无法获取 Session，尝试从 cookies 获取
            try {
                const cookies = await chrome.cookies.getAll({ 
                    domain: this.extractHostFromUrl(await chrome.tabs.get(tabId).then(tab => tab.url))
                });
                
                const sessionCookie = cookies.find(cookie => 
                    cookie.name === 'sid' || cookie.name === 'sessionId'
                );
                
                if (sessionCookie) {
                    return {
                        sessionId: sessionCookie.value,
                        domain: sessionCookie.domain
                    };
                }
            } catch (cookieError) {
                console.warn('无法从 cookies 获取 Session:', cookieError);
            }
            
            return null;
        }
    }

    generateEnvironmentName(host, sessionInfo) {
        // 根据主机名和 Session 信息生成环境名称
        
        // 处理 Salesforce 沙盒环境格式: company--username.sandbox.lightning.force.com
        if (host.includes('.sandbox.lightning.force.com')) {
            // 提取 company--username 部分
            const sandboxPart = host.replace('.sandbox.lightning.force.com', '');
            return sandboxPart;
        }
        
        // 处理 Salesforce 生产环境格式: company.lightning.force.com
        if (host.includes('.lightning.force.com') && !host.includes('.sandbox.')) {
            const productionPart = host.replace('.lightning.force.com', '');
            return productionPart;
        }
        
        // 处理其他 Salesforce 域名格式
        if (host.includes('.salesforce.com')) {
            const parts = host.split('.');
            if (parts.length >= 2) {
                return parts[0];
            }
        }
        
        // 处理包含 -- 的域名（自定义格式）
        if (host.includes('--')) {
            const parts = host.split('--');
            if (parts.length >= 2) {
                // 提取第一部分作为公司名，第二部分作为环境标识
                const companyName = parts[0];
                const envIdentifier = parts[1].split('.')[0]; // 去掉域名后缀
                return `${companyName}--${envIdentifier}`;
            }
        }
        
        // 处理测试/开发环境
        if (host.includes('test') || host.includes('dev') || host.includes('staging')) {
            return `${host} (测试)`;
        }
        
        // 默认返回主机名
        return host;
    }

    detectEnvironmentType(host, sessionInfo) {
        // 检测环境类型
        
        // Salesforce 沙盒环境
        if (host.includes('.sandbox.lightning.force.com')) {
            return 'sandbox';
        }
        
        // 包含 sandbox 关键词
        if (host.includes('sandbox')) {
            return 'sandbox';
        }
        
        // 包含 -- 的通常是沙盒环境
        if (host.includes('--')) {
            return 'sandbox';
        }
        
        // 测试/开发环境
        if (host.includes('test') || 
            host.includes('dev') || 
            host.includes('staging')) {
            return 'sandbox';
        }
        
        // 默认为生产环境
        return 'production';
    }

    updateEnvironmentSelect() {
        const orgSelect = document.getElementById('orgSelect');
        
        // 清空现有选项（保留默认选项）
        orgSelect.innerHTML = '<option value="">请选择环境</option>';
        
        // 添加可用环境选项
        this.availableEnvironments.forEach(env => {
            const option = document.createElement('option');
            option.value = env.host;
            option.textContent = env.name || env.host;
            option.dataset.envType = env.type || 'production';
            orgSelect.appendChild(option);
        });
    }

    selectEnvironment(environment) {
        this.selectedEnvironment = environment;
        this.sfHost = environment.host;
        
        // 更新下拉列表选择
        const orgSelect = document.getElementById('orgSelect');
        orgSelect.value = environment.host;
        
        // 更新环境徽章
        this.updateEnvironmentBadge(environment.type || 'production');
        
        // 更新连接状态
        this.updateConnectionInfo();
        
        console.log('已选择环境:', environment);
    }

    updateEnvironmentBadge(envType) {
        const envBadge = document.getElementById('envBadge');
        envBadge.textContent = envType === 'sandbox' ? 'Sandbox' : 'Production';
        envBadge.className = `env-badge ${envType === 'sandbox' ? 'sandbox' : 'production'}`;
    }

    updateConnectionInfo() {
        if (this.selectedEnvironment) {
            document.getElementById('connectionStatus').textContent = '已连接';
        } else {
            document.getElementById('connectionStatus').textContent = '未连接';
        }
    }

    // ========================================
    // 对象管理
    // ========================================
    async loadObjects() {
        try {
            const objectList = document.getElementById('objectList');
            const objects = await this.fetchObjects();
            
            // 渲染对象列表
            this.renderObjectList(objects, objectList);
            
        } catch (error) {
            console.error('加载对象列表失败:', error);
            this.showError('加载对象列表失败');
        }
    }

    async fetchObjects() {
        // 使用 constants.js 中的标准对象列表
        const standardObjects = SOQL_CONSTANTS.STANDARD_OBJECT_WHITELIST;
        
        return standardObjects.map(objectName => ({
            name: objectName,
            label: this.getObjectLabel(objectName),
            type: 'standard'
        }));
    }

    getObjectLabel(objectName) {
        const labelMap = {
            'Account': '客户',
            'Contact': '联系人',
            'Opportunity': '商机',
            'Case': '案例',
            'Lead': '潜在客户',
            'Task': '任务',
            'Event': '事件',
            'User': '用户',
            'Campaign': '营销活动',
            'Product2': '产品',
            'Pricebook2': '价格手册',
            'Order': '订单',
            'Contract': '合同',
            'Asset': '资产',
            'Entitlement': '权利',
            'WorkOrder': '工作订单',
            'ServiceContract': '服务合同',
            'Individual': '个人',
            'ContentVersion': '内容版本',
            'AsyncApexJob': '异步Apex作业'
        };
        
        return labelMap[objectName] || objectName;
    }

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

    renderObjectList(objects, container) {
        // 清空现有内容
        container.innerHTML = '';
        
        // 渲染对象列表
        objects.forEach(obj => {
            const objectElement = document.createElement('div');
            objectElement.className = 'object-item';
            objectElement.dataset.object = obj.name;
            objectElement.dataset.type = this.classifyObjectType(obj.name);
            
            objectElement.innerHTML = `
                <span class="object-name">${obj.name}</span>
                <span class="object-label">${obj.label}</span>
            `;
            
            container.appendChild(objectElement);
        });
    }

    getObjectIcon(objectName) {
        const iconMap = {
            'Account': '📊',
            'Contact': '👤',
            'Opportunity': '💰',
            'Case': '🎫',
            'Lead': '🎯',
            'Task': '✅',
            'Event': '📅',
            'User': '👨‍💼',
            'Campaign': '📢',
            'Product2': '📦',
            'Pricebook2': '💰',
            'Order': '📋',
            'Contract': '📄',
            'Asset': '🏢',
            'Entitlement': '🔐',
            'WorkOrder': '🔧',
            'ServiceContract': '📋',
            'Individual': '👤',
            'ContentVersion': '📄',
            'AsyncApexJob': '⚙️'
        };
        
        return iconMap[objectName] || '📊';
    }

    // ========================================
    // 字段管理
    // ========================================
    async loadFields(objectName) {
        try {
            const fieldList = document.getElementById('fieldList');
            
            // 显示加载状态
            fieldList.innerHTML = '<div class="loading">正在加载字段...</div>';
            
            // 模拟字段数据（实际应该调用 Salesforce API）
            const fields = await this.fetchFields(objectName);
            
            // 清空现有内容
            fieldList.innerHTML = '';
            
            // 按类型分组字段
            const groupedFields = this.groupFieldsByType(fields);
            
            // 渲染字段列表
            this.renderFieldGroups(groupedFields, fieldList);
            
            // 更新状态栏
            this.updateFieldStatus();
            
        } catch (error) {
            console.error('加载字段列表失败:', error);
            this.showError('加载字段列表失败');
        }
    }

    async fetchFields(objectName) {
        // 模拟字段数据
        const commonFields = [
            { name: 'Id', label: 'ID', type: 'ID', required: true },
            { name: 'Name', label: '名称', type: 'String', required: true },
            { name: 'CreatedDate', label: '创建日期', type: 'DateTime', required: false },
            { name: 'LastModifiedDate', label: '最后修改日期', type: 'DateTime', required: false },
            { name: 'CreatedById', label: '创建人', type: 'Reference', required: false },
            { name: 'LastModifiedById', label: '最后修改人', type: 'Reference', required: false }
        ];

        // 根据对象类型添加特定字段
        const specificFields = this.getObjectSpecificFields(objectName);
        
        return [...commonFields, ...specificFields];
    }

    getObjectSpecificFields(objectName) {
        const fieldMap = {
            'Account': [
                { name: 'Type', label: '类型', type: 'Picklist', required: false },
                { name: 'Industry', label: '行业', type: 'Picklist', required: false },
                { name: 'Phone', label: '电话', type: 'Phone', required: false },
                { name: 'Website', label: '网站', type: 'Url', required: false }
            ],
            'Contact': [
                { name: 'FirstName', label: '名字', type: 'String', required: false },
                { name: 'LastName', label: '姓氏', type: 'String', required: true },
                { name: 'Email', label: '邮箱', type: 'Email', required: false },
                { name: 'Phone', label: '电话', type: 'Phone', required: false },
                { name: 'AccountId', label: '客户', type: 'Reference', required: false }
            ],
            'Opportunity': [
                { name: 'StageName', label: '阶段', type: 'Picklist', required: true },
                { name: 'Amount', label: '金额', type: 'Currency', required: false },
                { name: 'CloseDate', label: '关闭日期', type: 'Date', required: true },
                { name: 'AccountId', label: '客户', type: 'Reference', required: true }
            ]
        };

        return fieldMap[objectName] || [];
    }

    groupFieldsByType(fields) {
        const groups = {
            'standard': { title: '标准字段', items: [] },
            'custom': { title: '自定义字段', items: [] },
            'system': { title: '系统字段', items: [] }
        };

        fields.forEach(field => {
            if (field.name.endsWith('__c')) {
                groups.custom.items.push(field);
            } else if (field.name.includes('Id') && field.name !== 'Id') {
                groups.system.items.push(field);
            } else {
                groups.standard.items.push(field);
            }
        });

        return groups;
    }

    renderFieldGroups(groups, container) {
        Object.entries(groups).forEach(([type, group]) => {
            if (group.items.length === 0) return;

            const groupElement = document.createElement('div');
            groupElement.className = 'field-group';
            
            groupElement.innerHTML = `
                <div class="group-header">
                    <span class="group-title">${group.title}</span>
                </div>
                <div class="field-items">
                    ${group.items.map(field => `
                        <div class="field-item" data-field="${field.name}">
                            <input type="checkbox" class="field-checkbox" ${field.required ? 'checked' : ''}>
                            <span class="field-name">${field.name}</span>
                            <span class="field-type">${field.type}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            
            container.appendChild(groupElement);
        });
    }

    // ========================================
    // SOQL 生成
    // ========================================
    generateSOQL() {
        if (!this.currentObject) {
            this.showMessage('请先选择一个对象', 'warning');
            return;
        }

        if (this.selectedFields.size === 0) {
            this.showMessage('请至少选择一个字段', 'warning');
            return;
        }

        const fields = Array.from(this.selectedFields).join(', ');
        const query = `SELECT ${fields} FROM ${this.currentObject} LIMIT 10`;
        
        // 更新 SOQL 显示
        document.getElementById('generatedQuery').textContent = query;
        
        this.showMessage('SOQL 已生成', 'success');
        console.log('生成的 SOQL:', query);
    }

    updateSOQLDisplay() {
        // 这个方法现在不再自动调用，只在手动生成时使用
        const query = this.generateSOQL();
        if (query) {
            document.getElementById('generatedQuery').textContent = query;
        }
    }

    // ========================================
    // 查询执行
    // ========================================
    async executeQuery() {
        try {
            const query = this.generateSOQL();
            console.log('执行查询:', query);
            
            // 显示加载状态
            this.setLoadingState(true);
            
            // 调用 Salesforce API
            const result = await sfConn.rest('/services/data/v58.0/query/', {
                method: 'GET',
                body: { q: query }
            });
            
            // 显示结果
            this.displayResults(result);
            
        } catch (error) {
            console.error('查询执行失败:', error);
            this.showError('查询执行失败: ' + error.message);
        } finally {
            this.setLoadingState(false);
        }
    }

    displayResults(result) {
        const resultTable = document.getElementById('resultTable');
        const resultCount = document.getElementById('resultCount');
        const executionTime = document.getElementById('executionTime');
        
        // 更新统计信息
        resultCount.textContent = result.totalSize || 0;
        executionTime.textContent = `执行时间: ${Date.now() - this.queryStartTime}ms`;
        
        if (result.records && result.records.length > 0) {
            // 生成表头
            const headers = Object.keys(result.records[0]);
            const headerRow = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
            
            // 生成数据行
            const dataRows = result.records.map(record => 
                `<tr>${headers.map(h => `<td>${record[h] || ''}</td>`).join('')}</tr>`
            ).join('');
            
            resultTable.innerHTML = `<thead>${headerRow}</thead><tbody>${dataRows}</tbody>`;
        } else {
            resultTable.innerHTML = '<tbody><tr><td colspan="100%">没有找到记录</td></tr></tbody>';
        }
    }

    // ========================================
    // 界面状态管理
    // ========================================
    setLoadingState(loading) {
        const executeBtn = document.getElementById('executeBtn');
        if (loading) {
            executeBtn.textContent = '⏳';
            executeBtn.disabled = true;
            this.queryStartTime = Date.now();
        } else {
            executeBtn.textContent = '▶️';
            executeBtn.disabled = false;
        }
    }

    updateFieldStatus() {
        const selectedFieldsElement = document.getElementById('selectedFields');
        selectedFieldsElement.textContent = `${this.selectedFields.size} 个字段`;
    }

    updateObjectStatus() {
        const selectedObjectElement = document.getElementById('selectedObject');
        selectedObjectElement.textContent = this.currentObject || '未选择对象';
    }

    // ========================================
    // 事件绑定
    // ========================================
    bindEvents() {
        // 对象选择
        document.addEventListener('click', (e) => {
            if (e.target.closest('.object-item')) {
                this.handleObjectSelect(e.target.closest('.object-item'));
            }
        });

        // 右键菜单
        document.addEventListener('contextmenu', (e) => {
            this.handleContextMenu(e);
        });

        // 点击其他地方关闭右键菜单
        document.addEventListener('click', (e) => {
            this.closeContextMenu();
        });

        // 字段选择
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('field-checkbox')) {
                this.handleFieldToggle(e.target);
            }
        });

        // 搜索功能
        document.getElementById('objectSearch').addEventListener('input', (e) => {
            this.filterObjects(e.target.value);
        });

        document.getElementById('fieldSearch').addEventListener('input', (e) => {
            this.filterFields(e.target.value);
        });

        // 对象筛选功能
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleObjectFilter(e.target);
            });
        });

        // 按钮事件
        document.getElementById('executeBtn').addEventListener('click', () => {
            this.executeQuery();
        });

        document.getElementById('copyQueryBtn').addEventListener('click', () => {
            this.copyQuery();
        });

        document.getElementById('formatQueryBtn').addEventListener('click', () => {
            this.formatQuery();
        });

        document.getElementById('clearQueryBtn').addEventListener('click', () => {
            this.clearQuery();
        });

        document.getElementById('selectAllFields').addEventListener('click', () => {
            this.selectAllFields();
        });

        document.getElementById('deselectAllFields').addEventListener('click', () => {
            this.deselectAllFields();
        });

        document.getElementById('selectCommonFields').addEventListener('click', () => {
            this.selectCommonFields();
        });

        document.getElementById('generateSOQLBtn').addEventListener('click', () => {
            this.generateSOQL();
        });

        document.getElementById('refreshObjects').addEventListener('click', () => {
            this.loadObjects();
        });

        document.getElementById('exportResultBtn').addEventListener('click', () => {
            this.exportResults();
        });

        document.getElementById('refreshResultBtn').addEventListener('click', () => {
            this.executeQuery();
        });

        // 设置按钮
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });

        // 环境选择
        document.getElementById('orgSelect').addEventListener('change', (e) => {
            this.handleEnvironmentChange(e);
        });
    }

    // ========================================
    // 事件处理
    // ========================================
    handleEnvironmentChange(e) {
        const selectedHost = e.target.value;
        
        if (!selectedHost) {
            // 选择了默认选项
            this.selectedEnvironment = null;
            this.sfHost = null;
            this.updateConnectionInfo();
            this.showMessage('请选择一个环境', 'warning');
            return;
        }
        
        // 查找对应的环境对象
        const environment = this.availableEnvironments.find(env => env.host === selectedHost);
        
        if (environment) {
            this.selectEnvironment(environment);
            this.showMessage(`已切换到环境: ${environment.name || environment.host}`, 'success');
            
            // 重新加载对象列表（因为环境变了）
            this.loadObjects();
        } else {
            this.showMessage('环境信息无效', 'error');
        }
    }

    async handleObjectSelect(objectElement) {
        // 移除之前的选中状态
        document.querySelectorAll('.object-item').forEach(item => {
            item.classList.remove('selected');
        });

        // 设置新的选中状态
        objectElement.classList.add('selected');
        
        // 获取对象名称
        const objectName = objectElement.dataset.object;
        this.currentObject = objectName;
        
        // 更新状态栏
        this.updateObjectStatus();
        
        // 清空字段选择
        this.selectedFields.clear();
        
        // 加载字段列表
        await this.loadFields(objectName);
        
        // 不再自动更新 SOQL，需要手动点击生成按钮
    }

    handleFieldToggle(checkbox) {
        const fieldName = checkbox.closest('.field-item').dataset.field;
        
        if (checkbox.checked) {
            this.selectedFields.add(fieldName);
        } else {
            this.selectedFields.delete(fieldName);
        }
        
        // 更新状态栏
        this.updateFieldStatus();
        
        // 不再自动更新 SOQL，需要手动点击生成按钮
    }

    // ========================================
    // 工具方法
    // ========================================
    handleObjectFilter(filterBtn) {
        // 更新按钮状态
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        filterBtn.classList.add('active');
        
        // 获取筛选类型
        const filterType = filterBtn.dataset.filter;
        
        // 应用筛选
        this.applyObjectFilter(filterType);
    }

    applyObjectFilter(filterType) {
        const objectItems = document.querySelectorAll('.object-item');
        
        objectItems.forEach(item => {
            const objectType = item.dataset.type;
            
            if (filterType === 'all' || objectType === filterType) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    filterObjects(searchTerm) {
        const objectItems = document.querySelectorAll('.object-item');
        const term = searchTerm.toLowerCase();
        
        objectItems.forEach(item => {
            const name = item.querySelector('.object-name').textContent.toLowerCase();
            const label = item.querySelector('.object-label').textContent.toLowerCase();
            
            if (name.includes(term) || label.includes(term)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    filterFields(searchTerm) {
        const fieldItems = document.querySelectorAll('.field-item');
        const term = searchTerm.toLowerCase();
        
        fieldItems.forEach(item => {
            const name = item.querySelector('.field-name').textContent.toLowerCase();
            
            if (name.includes(term)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    copyQuery() {
        const query = document.getElementById('generatedQuery').textContent;
        navigator.clipboard.writeText(query).then(() => {
            this.showMessage('查询已复制到剪贴板');
        });
    }

    formatQuery() {
        const query = document.getElementById('generatedQuery').textContent;
        // 简单的格式化逻辑
        const formatted = query.replace(/\s+/g, ' ').trim();
        document.getElementById('generatedQuery').textContent = formatted;
    }

    clearQuery() {
        this.currentObject = null;
        this.selectedFields.clear();
        document.getElementById('generatedQuery').textContent = 'SELECT Id FROM Account LIMIT 10';
        document.getElementById('fieldList').innerHTML = '<div class="empty-state">请先选择对象</div>';
        this.updateObjectStatus();
        this.updateFieldStatus();
    }

    selectAllFields() {
        const checkboxes = document.querySelectorAll('.field-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            const fieldName = checkbox.closest('.field-item').dataset.field;
            this.selectedFields.add(fieldName);
        });
        this.updateFieldStatus();
        this.showMessage('已选择所有字段', 'success');
    }

    deselectAllFields() {
        const checkboxes = document.querySelectorAll('.field-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.selectedFields.clear();
        this.updateFieldStatus();
        this.showMessage('已取消选择所有字段', 'success');
    }

    selectCommonFields() {
        // 常用字段列表
        const commonFields = ['Id', 'Name', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById'];
        
        const checkboxes = document.querySelectorAll('.field-checkbox');
        checkboxes.forEach(checkbox => {
            const fieldName = checkbox.closest('.field-item').dataset.field;
            if (commonFields.includes(fieldName)) {
                checkbox.checked = true;
                this.selectedFields.add(fieldName);
            } else {
                checkbox.checked = false;
                this.selectedFields.delete(fieldName);
            }
        });
        this.updateFieldStatus();
        this.showMessage('已选择常用字段', 'success');
    }

    exportResults() {
        const table = document.getElementById('resultTable');
        const rows = Array.from(table.querySelectorAll('tr'));
        const csv = rows.map(row => 
            Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent).join(',')
        ).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'query_results.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ========================================
    // 界面初始化
    // ========================================
    initializeUI() {
        // 设置默认查询
        document.getElementById('generatedQuery').textContent = 'SELECT Id FROM Account LIMIT 10';
        
        // 初始化状态栏
        this.updateObjectStatus();
        this.updateFieldStatus();
    }

    // ========================================
    // 消息显示
    // ========================================
    showMessage(message, type = 'info') {
        // 创建消息元素
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.textContent = message;
        
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-size: 14px;
            z-index: 1000;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        switch (type) {
            case 'success':
                messageEl.style.backgroundColor = '#28a745';
                break;
            case 'error':
                messageEl.style.backgroundColor = '#dc3545';
                break;
            case 'warning':
                messageEl.style.backgroundColor = '#ffc107';
                messageEl.style.color = '#333';
                break;
            default:
                messageEl.style.backgroundColor = '#007bff';
        }
        
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 3000);
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    // ========================================
    // 右键菜单处理
    // ========================================
    handleContextMenu(e) {
        e.preventDefault();
        
        // 关闭之前的菜单
        this.closeContextMenu();
        
        // 获取右键位置
        const x = e.clientX;
        const y = e.clientY;
        
        // 根据右键位置确定菜单内容
        const menuItems = this.getContextMenuItems(e.target);
        
        if (menuItems.length === 0) {
            return; // 没有特殊设定的位置，不做回应
        }
        
        // 创建右键菜单
        this.createContextMenu(menuItems, x, y);
    }

    getContextMenuItems(target) {
        const menuItems = [];
        
        // 对象项右键菜单
        if (target.closest('.object-item')) {
            const objectItem = target.closest('.object-item');
            const objectName = objectItem.dataset.object;
            
            menuItems.push(
                { text: '选择对象', action: () => this.handleObjectSelect(objectItem) },
                { text: '查看对象详情', action: () => this.viewObjectDetails(objectName) },
                { text: '复制对象名', action: () => this.copyToClipboard(objectName) },
                { text: '生成基础查询', action: () => this.generateBasicQuery(objectName) }
            );
        }
        
        // 字段项右键菜单
        else if (target.closest('.field-item')) {
            const fieldItem = target.closest('.field-item');
            const fieldName = fieldItem.dataset.field;
            const checkbox = fieldItem.querySelector('.field-checkbox');
            
            menuItems.push(
                { text: checkbox.checked ? '取消选择字段' : '选择字段', action: () => this.toggleField(checkbox) },
                { text: '复制字段名', action: () => this.copyToClipboard(fieldName) },
                { text: '查看字段详情', action: () => this.viewFieldDetails(fieldName) }
            );
        }
        
        // SOQL 查询区域右键菜单
        else if (target.closest('.query-display') || target.closest('.query-code')) {
            menuItems.push(
                { text: '复制查询', action: () => this.copyQuery() },
                { text: '格式化查询', action: () => this.formatQuery() },
                { text: '清空查询', action: () => this.clearQuery() },
                { text: '执行查询', action: () => this.executeQuery() }
            );
        }
        
        // 查询结果表格右键菜单
        else if (target.closest('.result-table')) {
            menuItems.push(
                { text: '导出结果', action: () => this.exportResults() },
                { text: '刷新结果', action: () => this.executeQuery() },
                { text: '复制表格', action: () => this.copyTable() }
            );
        }
        
        // 查询标签页右键菜单
        else if (target.closest('.tab')) {
            const tab = target.closest('.tab');
            const tabId = tab.dataset.queryId;
            
            menuItems.push(
                { text: '关闭标签页', action: () => this.closeTab(tabId) },
                { text: '重命名标签页', action: () => this.renameTab(tabId) },
                { text: '复制标签页', action: () => this.duplicateTab(tabId) }
            );
        }
        
        // 环境选择器右键菜单
        else if (target.closest('.org-select') || target.closest('.connection-info')) {
            menuItems.push(
                { text: '刷新环境列表', action: () => this.refreshEnvironments() },
                { text: '查看环境信息', action: () => this.showEnvironmentInfo() }
            );
        }
        
        return menuItems;
    }

    createContextMenu(menuItems, x, y) {
        // 创建菜单容器
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(102, 126, 234, 0.2);
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            min-width: 160px;
            padding: 4px 0;
            font-size: 13px;
        `;
        
        // 创建菜单项
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.textContent = item.text;
            menuItem.style.cssText = `
                padding: 8px 16px;
                cursor: pointer;
                transition: background-color 0.2s;
                color: #333;
            `;
            
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
            });
            
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.backgroundColor = 'transparent';
            });
            
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
                this.closeContextMenu();
            });
            
            menu.appendChild(menuItem);
        });
        
        // 添加到页面
        document.body.appendChild(menu);
        
        // 调整菜单位置，防止超出屏幕
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }
        
        // 保存菜单引用
        this.currentContextMenu = menu;
    }

    closeContextMenu() {
        if (this.currentContextMenu) {
            this.currentContextMenu.remove();
            this.currentContextMenu = null;
        }
    }

    // ========================================
    // 右键菜单动作
    // ========================================
    viewObjectDetails(objectName) {
        this.showMessage(`查看对象详情: ${objectName}`, 'info');
        // TODO: 实现对象详情查看功能
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showMessage(`已复制: ${text}`, 'success');
        });
    }

    generateBasicQuery(objectName) {
        this.currentObject = objectName;
        this.selectedFields.clear();
        this.selectedFields.add('Id');
        this.selectedFields.add('Name');
        this.updateSOQLDisplay();
        this.showMessage(`已生成 ${objectName} 的基础查询`, 'success');
    }

    toggleField(checkbox) {
        checkbox.checked = !checkbox.checked;
        this.handleFieldToggle(checkbox);
    }

    viewFieldDetails(fieldName) {
        this.showMessage(`查看字段详情: ${fieldName}`, 'info');
        // TODO: 实现字段详情查看功能
    }

    copyTable() {
        const table = document.getElementById('resultTable');
        const rows = Array.from(table.querySelectorAll('tr'));
        const text = rows.map(row => 
            Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent).join('\t')
        ).join('\n');
        
        navigator.clipboard.writeText(text).then(() => {
            this.showMessage('表格已复制到剪贴板', 'success');
        });
    }

    closeTab(tabId) {
        const tab = document.querySelector(`[data-query-id="${tabId}"]`);
        if (tab && document.querySelectorAll('.tab').length > 1) {
            tab.remove();
            this.showMessage('标签页已关闭', 'info');
        } else {
            this.showMessage('不能关闭最后一个标签页', 'warning');
        }
    }

    renameTab(tabId) {
        const tab = document.querySelector(`[data-query-id="${tabId}"]`);
        const newName = prompt('请输入新的标签页名称:', tab.textContent);
        if (newName && newName.trim()) {
            tab.textContent = newName.trim();
            this.showMessage('标签页已重命名', 'success');
        }
    }

    duplicateTab(tabId) {
        const tab = document.querySelector(`[data-query-id="${tabId}"]`);
        const newTab = tab.cloneNode(true);
        newTab.dataset.queryId = Date.now();
        newTab.textContent = `${tab.textContent} (副本)`;
        newTab.classList.remove('active');
        tab.parentNode.insertBefore(newTab, tab.nextSibling);
        this.showMessage('标签页已复制', 'success');
    }

    // ========================================
    // 环境管理方法
    // ========================================
    manageEnvironments() {
        this.showMessage('环境管理功能开发中...', 'info');
        // TODO: 实现环境管理界面
    }

    addNewEnvironment() {
        this.showMessage('环境列表从当前打开的 Salesforce 标签页自动获取', 'info');
    }

    async refreshEnvironments() {
        try {
            this.showMessage('正在刷新环境列表...', 'info');
            await this.loadAvailableEnvironments();
            this.showMessage('环境列表已刷新', 'success');
        } catch (error) {
            console.error('刷新环境列表失败:', error);
            this.showMessage('刷新环境列表失败', 'error');
        }
    }

    showEnvironmentInfo() {
        if (this.availableEnvironments.length === 0) {
            this.showMessage('当前没有可用的 Salesforce 环境', 'warning');
            return;
        }

        const info = this.availableEnvironments.map(env => 
            `• ${env.name} (${env.host}) - ${env.type}`
        ).join('\n');

        alert(`当前可用的 Salesforce 环境:\n\n${info}\n\n提示: 环境列表从当前打开的 Salesforce 标签页自动获取`);
    }

    // ========================================
    // 设置页面
    // ========================================
    openSettings() {
        // 打开设置页面
        chrome.tabs.create({
            url: chrome.runtime.getURL('settings.html')
        });
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new SOQLCreator();
});
