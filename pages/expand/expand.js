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
        
        // 权限和会话管理
        this.sfConn = new SalesforceConnection(); // Salesforce连接实例
        this.soqlExecutor = new SOQLExecutor(this.sfConn); // SOQL执行器实例
        this.objectService = new ObjectService(this.sfConn, this.soqlExecutor); // 对象服务实例
        
        this.init();
    }

    async init() {
        console.log('初始化 SOQL Creator');
        
        // 加载用户配置
        await this.loadUserConfig();
        
        // 绑定事件
        this.bindEvents();
        
        // 初始化界面
        this.initializeUI();
        
        // 加载可用环境列表
        await this.loadAvailableEnvironments();
        
        // 如果有环境，自动加载对象列表
        if (this.availableEnvironments.length > 0) {
            await this.loadObjects();
        } else {
            this.showObjectListError('未找到可用的Salesforce环境，请先打开Salesforce标签页');
        }
    }

    // ========================================
    // 配置管理
    // ========================================
    async loadUserConfig() {
        try {
            this.userConfig = await this.getUserConfig();
            console.log('用户配置已加载:', this.userConfig);
        } catch (error) {
            console.error('加载用户配置失败:', error);
            this.userConfig = SOQL_CONSTANTS.DEFAULT_CONFIG;
        }
    }

    async getUserConfig() {
        try {
            const result = await chrome.storage.sync.get(Object.keys(SOQL_CONSTANTS.DEFAULT_CONFIG));
            // 合并默认配置
            return { ...SOQL_CONSTANTS.DEFAULT_CONFIG, ...result };
        } catch (error) {
            console.error('获取用户配置失败:', error);
            return SOQL_CONSTANTS.DEFAULT_CONFIG;
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
            } else {
                this.showObjectListError('未找到可用的Salesforce环境，请先打开Salesforce标签页');
            }
            
        } catch (error) {
            console.error('从 Session 加载环境列表失败:', error);
            this.availableEnvironments = [];
            this.showObjectListError('加载环境列表失败: ' + error.message);
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
                        
                        // 不再获取Session信息，只记录环境基本信息
                        // Session将在实际使用时实时获取
                        environments.push({
                            name: this.generateEnvironmentName(host),
                            host: host,
                            type: this.detectEnvironmentType(host),
                            tabId: tab.id
                        });
                    }
                } catch (error) {
                    console.warn(`处理标签页 ${tab.id} 时出错:`, error);
                }
            }

            return environments;
        } catch (error) {
            console.error('获取环境失败:', error);
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


    generateEnvironmentName(host) {
        // 根据主机名生成环境名称
        
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

    detectEnvironmentType(host) {
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
        // if (host.includes('test') || 
        //     host.includes('dev') || 
        //     host.includes('staging')) {
        //     return 'sandbox';
        // }
        
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
            
            // 检查是否有选中的环境
            if (!this.selectedEnvironment) {
                this.showObjectListError('请先选择一个Salesforce环境');
                return;
            }
            
            // 显示加载状态
            this.showObjectListLoading();
            
            // 获取真实的Salesforce对象数据
            const objects = await this.fetchObjectsFromSalesforce();
            
            console.log(`loadObjects: 获取到 ${objects ? objects.length : 0} 个对象`);
            
            if (objects && objects.length > 0) {
                // 保存应用级筛选后的对象列表
                this.allObjects = objects;
                
                // 应用页面级筛选并渲染
                const filteredObjects = this.applyPageLevelFilters(objects);
                this.renderObjectList(filteredObjects, objectList);
                this.showMessage(`成功加载 ${objects.length} 个对象`, 'success');
            } else {
                this.showObjectListError('未找到可查询的对象');
            }
            
        } catch (error) {
            console.error('加载对象列表失败:', error);
            this.showObjectListError('加载对象列表失败: ' + error.message);
        }
    }

    async fetchObjectsFromSalesforce() {
        try {
            // 使用统一的对象服务获取应用级筛选后的对象列表
            return await this.objectService.getApplicationFilteredObjects(this.sfHost);
        } catch (error) {
            console.error('从Salesforce获取对象失败:', error);
            throw error;
        }
    }


    /**
     * 判断Salesforce对象的类型 - 与sidepanel.js保持一致
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

    renderObjectList(objects, container) {
        // 清空现有内容
        container.innerHTML = '';
        
        console.log(`renderObjectList: 准备渲染 ${objects.length} 个对象`);
        
        // 渲染对象列表
        objects.forEach(obj => {
            const objectElement = document.createElement('div');
            objectElement.className = 'object-item';
            objectElement.dataset.object = obj.name;
            objectElement.dataset.type = this.objectService.getObjectType(obj); // 使用统一服务的getObjectType方法
            
            objectElement.innerHTML = `
                <span class="object-name">${obj.name}</span>
                <span class="object-label">${obj.label}</span>
            `;
            
            container.appendChild(objectElement);
        });
    }

    showObjectListLoading() {
        const objectList = document.getElementById('objectList');
        objectList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⏳</div>
                <div class="empty-title">正在加载对象列表...</div>
                <div class="empty-description">请稍候，正在获取Salesforce对象数据</div>
            </div>
        `;
    }

    showObjectListError(message) {
        const objectList = document.getElementById('objectList');
        objectList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">❌</div>
                <div class="empty-title">加载失败</div>
                <div class="empty-description">${message}</div>
            </div>
        `;
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
        try {
            // 使用统一的对象服务获取字段列表
            const fieldsMap = await this.objectService.getObjectFields(objectName);
            
            // 转换为expand.js期望的格式
            return Object.values(fieldsMap).map(field => ({
                name: field.name,
                label: field.label,
                type: field.type,
                required: field.required,
                custom: field.custom,
                description: field.description
            }));
        } catch (error) {
            console.error('获取字段失败:', error);
            return [];
        }
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
                            <span class="field-label">${field.label}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            
            container.appendChild(groupElement);
        });
        
        // 将已勾选的必填字段添加到selectedFields中
        const checkedCheckboxes = container.querySelectorAll('.field-checkbox:checked');
        checkedCheckboxes.forEach(checkbox => {
            const fieldName = checkbox.closest('.field-item').dataset.field;
            this.selectedFields.add(fieldName);
        });
        
        // 更新状态栏
        this.updateFieldStatus();
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
        document.getElementById('generatedQuery').value = query;
        
        this.showMessage('SOQL 已生成', 'success');
        console.log('生成的 SOQL:', query);
    }

    updateSOQLDisplay() {
        // 这个方法现在不再自动调用，只在手动生成时使用
        const query = this.generateSOQL();
        if (query) {
            document.getElementById('generatedQuery').value = query;
        }
    }

    // ========================================
    // 查询执行
    // ========================================
    
    /**
     * 过滤掉查询结果中的attributes属性
     * @param {Object} result - Salesforce API返回的查询结果
     * @returns {Object} 过滤后的结果
     */
    filterAttributes(result) {
        if (!result || !result.records) {
            return result;
        }
        
        // 深拷贝结果对象
        const filteredResult = JSON.parse(JSON.stringify(result));
        
        // 过滤每条记录的attributes属性
        filteredResult.records = filteredResult.records.map(record => {
            const filteredRecord = { ...record };
            delete filteredRecord.attributes;
            return filteredRecord;
        });
        
        return filteredResult;
    }
    
    async executeQuery() {
        try {
            const query = document.getElementById('generatedQuery').value.trim();
            if (!query) {
                this.showMessage('请输入 SOQL 查询', 'warning');
                return;
            }
            console.log('执行查询:', query);
            
            // 显示加载状态
            this.setLoadingState(true);
            
            // 调用 Salesforce API
            // 将查询参数编码并添加到URL中
            const encodedQuery = encodeURIComponent(query);
            const result = await this.sfConn.rest(`/services/data/v58.0/query/?q=${encodedQuery}`, {
                method: 'GET'
            });
            
            // 过滤掉attributes属性
            const filteredResult = this.filterAttributes(result);
            
            // 显示结果
            this.displayResults(filteredResult);
            
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
        const executeQueryBtn = document.getElementById('executeQueryBtn');
        if (loading) {
            executeQueryBtn.textContent = '执行中...';
            executeQueryBtn.disabled = true;
            this.queryStartTime = Date.now();
        } else {
            executeQueryBtn.textContent = '执行';
            executeQueryBtn.disabled = false;
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
    // 拖拽调整高度功能
    // ========================================
    bindResizeEvents() {
        const resizeHandle = document.getElementById('resizeHandle');
        const querySection = document.querySelector('.query-display-section');
        const resultSection = document.querySelector('.result-section');
        const mainContent = document.querySelector('.main-content');
        
        let isResizing = false;
        let startY = 0;
        let startQueryHeight = 0;
        let startResultHeight = 0;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startQueryHeight = querySection.offsetHeight;
            startResultHeight = resultSection.offsetHeight;
            
            // 添加全局事件监听器
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            // 添加拖拽样式
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        });
        
        function handleMouseMove(e) {
            if (!isResizing) return;
            
            const deltaY = e.clientY - startY;
            const mainContentHeight = mainContent.offsetHeight;
            const resizeHandleHeight = resizeHandle.offsetHeight;
            const availableHeight = mainContentHeight - resizeHandleHeight;
            
            // 计算新的高度
            let newQueryHeight = startQueryHeight + deltaY;
            let newResultHeight = startResultHeight - deltaY;
            
            // 设置最小和最大高度限制
            const minQueryHeight = 100;
            const maxQueryHeight = availableHeight * 0.7;
            const minResultHeight = 200;
            
            newQueryHeight = Math.max(minQueryHeight, Math.min(maxQueryHeight, newQueryHeight));
            newResultHeight = Math.max(minResultHeight, availableHeight - newQueryHeight - resizeHandleHeight);
            
            // 应用新高度
            querySection.style.height = `${newQueryHeight}px`;
            resultSection.style.height = `${newResultHeight}px`;
        }
        
        function handleMouseUp() {
            isResizing = false;
            
            // 移除全局事件监听器
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // 移除拖拽样式
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }

    // ========================================
    // 键盘快捷键支持
    // ========================================
    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter 或 Cmd+Enter 执行查询
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.executeQuery();
            }
            
            // Ctrl+Shift+F 或 Cmd+Shift+F 格式化查询
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                this.formatQuery();
            }
            
            // Ctrl+Shift+C 或 Cmd+Shift+C 复制查询
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                this.copyQuery();
            }
        });
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

        // 点击field-item区域选择字段
        document.addEventListener('click', (e) => {
            if (e.target.closest('.field-item')) {
                const fieldItem = e.target.closest('.field-item');
                const checkbox = fieldItem.querySelector('.field-checkbox');
                
                // 如果点击的是checkbox本身，不处理（避免重复触发）
                if (e.target.classList.contains('field-checkbox')) {
                    return;
                }
                
                // 切换checkbox状态
                checkbox.checked = !checkbox.checked;
                this.handleFieldToggle(checkbox);
            }
        });

        // 拖拽调整高度功能
        this.bindResizeEvents();

        // 键盘快捷键支持
        this.bindKeyboardEvents();

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
        document.getElementById('executeQueryBtn').addEventListener('click', () => {
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

        document.getElementById('refreshObjects').addEventListener('click', async () => {
            await this.loadObjects();
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
    async handleEnvironmentChange(e) {
        const selectedHost = e.target.value;
        
        if (!selectedHost) {
            // 选择了默认选项
            this.selectedEnvironment = null;
            this.sfHost = null;
            this.updateConnectionInfo();
            this.showObjectListError('请先选择一个Salesforce环境');
            this.showMessage('请选择一个环境', 'warning');
            return;
        }
        
        // 查找对应的环境对象
        const environment = this.availableEnvironments.find(env => env.host === selectedHost);
        
        if (environment) {
            this.selectEnvironment(environment);
            this.showMessage(`已切换到环境: ${environment.name || environment.host}`, 'success');
            
            // 重新加载对象列表（因为环境变了）
            await this.loadObjects();
        } else {
            this.showMessage('环境信息无效', 'error');
            this.showObjectListError('环境信息无效');
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

    /**
     * 应用页面级筛选
     * 处理搜索和类型筛选
     * @param {Array} objects - 应用级筛选后的对象列表
     * @param {string} searchTerm - 搜索关键词
     * @param {string} filterType - 筛选类型
     * @returns {Array} 页面级筛选后的对象列表
     */
    applyPageLevelFilters(objects, searchTerm = '', filterType = 'all') {
        // 使用统一的对象服务进行页面级筛选
        return this.objectService.filterObjectsForPage(objects, {
            objectType: filterType,
            searchTerm: searchTerm
        });
    }

    applyObjectFilter(filterType) {
        // 获取当前搜索关键词
        const searchInput = document.getElementById('objectSearch');
        const searchTerm = searchInput ? searchInput.value : '';
        
        // 应用页面级筛选
        const filteredObjects = this.applyPageLevelFilters(this.allObjects || [], searchTerm, filterType);
        
        // 重新渲染对象列表
        this.renderObjectList(filteredObjects, document.getElementById('objectList'));
    }

    filterObjects(searchTerm) {
        // 获取当前筛选类型
        const activeFilter = document.querySelector('.filter-btn.active');
        const filterType = activeFilter ? activeFilter.dataset.filter : 'all';
        
        // 应用页面级筛选
        const filteredObjects = this.applyPageLevelFilters(this.allObjects || [], searchTerm, filterType);
        
        // 重新渲染对象列表
        this.renderObjectList(filteredObjects, document.getElementById('objectList'));
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
        const query = document.getElementById('generatedQuery').value;
        navigator.clipboard.writeText(query).then(() => {
            this.showMessage('查询已复制到剪贴板');
        });
    }

    formatQuery() {
        const query = document.getElementById('generatedQuery').value;
        // 简单的格式化逻辑
        const formatted = query.replace(/\s+/g, ' ').trim();
        document.getElementById('generatedQuery').value = formatted;
    }

    clearQuery() {
        this.currentObject = null;
        this.selectedFields.clear();
        document.getElementById('generatedQuery').value = 'SELECT Id FROM Account LIMIT 10';
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

    /**
     * 选择常用字段
     */
    selectCommonFields() {
        if (!this.currentObject) return;
        
        // 使用统一的对象服务获取常用字段
        const commonFields = this.objectService.getCommonFields(this.currentObject);
        
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
        document.getElementById('generatedQuery').value = 'SELECT Id FROM Account LIMIT 10';
        
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
            
            // 如果有环境，重新加载对象列表
            if (this.availableEnvironments.length > 0) {
                await this.loadObjects();
            }
            
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
            url: chrome.runtime.getURL('/pages/settings/settings.html')
        });
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new SOQLCreator();
});

