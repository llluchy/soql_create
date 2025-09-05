// SOQL Creator 侧边栏主要逻辑 - 基于 Salesforce Inspector Reloaded 最佳实践
class SOQLCreator {
    constructor() {
        this.currentObject = null;
        this.selectedFields = new Set();
        this.objects = [];
        this.allObjects = []; // 备份所有对象，用于筛选
        this.fields = {};
        this.sfHost = null;
        
        // 使用常量类中的标准对象白名单
        this.standardObjectWhitelist = SOQL_CONSTANTS.STANDARD_OBJECT_WHITELIST;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.bindMessageEvents();
        this.loadHistory();
        this.checkSalesforcePage();
    }

    bindEvents() {
        // 对象搜索事件
        document.getElementById('objectSearch').addEventListener('input', (e) => {
            this.filterObjects();
        });

        // 对象类型筛选事件
        document.querySelectorAll('input[name="objectType"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.filterObjects();
            });
        });

        // 刷新对象按钮
        document.getElementById('refreshObjects').addEventListener('click', () => {
            this.loadObjects();
        });


        // 字段控制按钮
        document.getElementById('selectAllFields').addEventListener('click', () => {
            this.selectAllFields();
        });

        document.getElementById('deselectAllFields').addEventListener('click', () => {
            this.deselectAllFields();
        });

        document.getElementById('selectCommonFields').addEventListener('click', () => {
            this.selectCommonFields();
        });

        // 字段解析按钮
        document.getElementById('parseFields').addEventListener('click', () => {
            this.parseAndSelectFields();
        });

        // 字段解析输入框回车事件
        document.getElementById('fieldParserInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.parseAndSelectFields();
            }
        });

        // SOQL操作按钮
        document.getElementById('copySoql').addEventListener('click', () => {
            this.copySOQL();
        });

        // 设置按钮
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });
    }


    // 检查是否在Salesforce页面
    async checkSalesforcePage() {
        try {
            // 使用新的getSfHost方法获取Salesforce主机
            this.sfHost = await sfConn.getSfHost();
            
            if (this.sfHost && this.isSalesforceHost(this.sfHost)) {
                await this.loadObjects();
        } else {
            this.showMessage('请在Salesforce页面使用此插件', 'warning');
            }
        } catch (error) {
            console.error('SOQL Creator: 检查Salesforce页面失败:', error);
            this.showMessage('无法检测当前页面，请确保在Salesforce页面使用', 'error');
        }
    }


    // 判断是否为Salesforce主机
    isSalesforceHost(hostname) {
        return hostname.includes('salesforce.com') || 
               hostname.includes('force.com') ||
               hostname.includes('cloudforce.com') ||
               hostname.includes('visualforce.com');
    }

    // 加载Salesforce对象列表
    async loadObjects() {
        try {
            // 显示加载状态
            this.showLoadingStatus('正在加载对象列表...', 'objectList');
            this.showMessage('正在加载对象列表...');
            
            // 获取会话
            await sfConn.getSession(this.sfHost);
            
            if (!sfConn.sessionId) {
                this.hideLoadingStatus(document.getElementById('objectList'));
                this.showMessage('无法获取Salesforce会话，请检查登录状态', 'error');
                return;
            }
            
            // 使用新的API模块获取对象列表
            const result = await soqlExecutor.getSObjects();
            
            if (result && result.sobjects && result.sobjects.length > 0) {
                // 过滤出可查询的对象，并按名称排序
                this.allObjects = result.sobjects
                    .filter(obj => obj.queryable === true && obj.retrieveable === true)
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map(obj => ({
                        name: obj.name,
                        label: obj.label || obj.name,
                        apiName: obj.name,
                        description: obj.description || '',
                        createable: obj.createable || false,
                        updateable: obj.updateable || false,
                        deletable: obj.deletable || false
                    }));
                
                // 初始化时显示所有对象
                this.objects = [...this.allObjects];
                
                this.hideLoadingStatus(document.getElementById('objectList'));
                this.populateObjectList();
                this.showMessage(`成功加载 ${this.allObjects.length} 个对象`, 'success');
            } else {
                this.hideLoadingStatus(document.getElementById('objectList'));
                this.showMessage('无法获取对象列表，请检查权限', 'error');
                this.allObjects = [];
                this.objects = [];
                this.populateObjectList();
            }
        } catch (error) {
            console.error('SOQL Creator: 加载对象失败:', error);
            this.hideLoadingStatus(document.getElementById('objectList'));
            ErrorHandler.handle(error, 'loadObjects');
            this.allObjects = [];
            this.objects = [];
            this.populateObjectList();
        }
    }

    // 加载对象字段
    async loadFields(objectApiName) {
        try {
            this.showLoadingStatus('正在加载字段列表...', 'fieldList');
            this.showMessage('正在加载字段列表...');
            
            // 使用新的API模块获取字段列表
            const result = await soqlExecutor.describeSObject(objectApiName);
            
            if (result && result.fields && result.fields.length > 0) {
                console.log('fields', result.fields);
                // 过滤出可查询的字段，并按名称排序
                // 注意：根据实际数据，字段没有queryable和retrieveable属性
                // 我们使用其他属性来判断字段是否可查询
                const queryableFields = result.fields
                    .filter(field => {
                        // 过滤掉隐藏和废弃的字段
                        if (field.deprecatedAndHidden === true) return false;
                        // 过滤掉不可排序的字段（通常表示不可查询）
                        if (field.sortable === false) return false;
                        return true;
                    })
                    .sort((a, b) => a.label.localeCompare(b.label));
                
                // 转换为我们的格式
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
                        // 添加更多有用的属性
                        createable: field.createable,
                        updateable: field.updateable,
                        filterable: field.filterable,
                        sortable: field.sortable,
                        groupable: field.groupable,
                        aggregatable: field.aggregatable,
                        custom: field.custom,
                        soapType: field.soapType,
                        inlineHelpText: field.inlineHelpText,
                        // 添加字段描述信息
                        description: field.inlineHelpText || field.label || field.name
                    };
                });
                
                this.fields[objectApiName] = fieldsMap;
                this.hideLoadingStatus(document.getElementById('fieldList'));
                this.populateFieldList();
                this.showMessage(`成功加载 ${Object.keys(fieldsMap).length} 个字段`, 'success');
            } else {
                this.hideLoadingStatus(document.getElementById('fieldList'));
                this.showMessage('无法获取字段列表，请检查权限', 'error');
                this.fields[objectApiName] = {};
                this.populateFieldList();
            }
        } catch (error) {
            console.error('SOQL Creator: 加载字段失败:', error);
            this.hideLoadingStatus(document.getElementById('fieldList'));
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

    // 判断对象类型
    getObjectType(object) {
        const apiName = object.name || object.apiName;
        
        // 过滤掉Share对象
        if (apiName.endsWith('__Share')) {
            return 'share'; // 特殊标记，用于过滤
        }
        
        // 自定义对象 (以__c结尾)
        if (apiName.endsWith('__c')) {
            return 'business'; // 业务对象（包含标准对象和自定义对象）
        }
        
        // 元数据对象 (以__mdt结尾)
        if (apiName.endsWith('__mdt')) {
            return 'metadata';
        }
        
        // 系统对象 (以__开头的其他对象)
        if (apiName.startsWith('__')) {
            return 'system';
        }
        
        // 标准对象 (其他所有对象) - 现在归类为业务对象
        return 'business';
    }

    // 获取对象类型标签
    getObjectTypeLabel(type) {
        const typeLabels = {
            'business': '业务对象',
            'metadata': '元数据',
            'system': '系统'
        };
        return typeLabels[type] || '未知';
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

    // 生成SOQL查询
    generateSOQL() {
        const soqlOutput = document.getElementById('soqlOutput');
        
        if (!this.currentObject || this.selectedFields.size === 0) {
            soqlOutput.value = '';
            return;
        }

        const fields = Array.from(this.selectedFields).join(', ');
        const soql = `SELECT ${fields}\nFROM ${this.currentObject.apiName}`;
        
        soqlOutput.value = soql;
        this.saveToHistory(soql);
    }

    // 复制SOQL到剪贴板
    async copySOQL() {
        const soqlOutput = document.getElementById('soqlOutput');
        if (!soqlOutput.value.trim()) {
            this.showMessage('没有可复制的SOQL语句');
            return;
        }

        try {
            await navigator.clipboard.writeText(soqlOutput.value);
            this.showMessage('SOQL已复制到剪贴板');
        } catch (error) {
            console.error('复制失败:', error);
            this.showMessage('复制失败，请手动复制');
        }
    }

    // 保存到历史记录
    saveToHistory(soql) {
        if (!soql.trim()) return;

        const history = this.getHistory();
        const newHistoryItem = {
            id: Date.now(),
            object: this.currentObject?.label || '未知对象',
            soql: soql,
            timestamp: new Date().toLocaleString()
        };

        // 避免重复
        const exists = history.find(item => item.soql === soql);
        if (!exists) {
            history.unshift(newHistoryItem);
            // 只保留最近20条记录
            if (history.length > 20) {
                history.pop();
            }
            localStorage.setItem('soql_history', JSON.stringify(history));
            this.updateHistoryDisplay();
        }
    }

    // 获取历史记录
    getHistory() {
        try {
            return JSON.parse(localStorage.getItem('soql_history') || '[]');
        } catch {
            return [];
        }
    }

    // 加载历史记录
    loadHistory() {
        this.updateHistoryDisplay();
    }

    // 更新历史记录显示
    updateHistoryDisplay() {
        const historyList = document.getElementById('historyList');
        const history = this.getHistory();

        if (history.length === 0) {
            historyList.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-title">暂无查询历史</div><div class="empty-description">生成的SOQL查询将保存在这里</div></div>';
            return;
        }

        historyList.innerHTML = '';
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.addEventListener('click', () => {
                this.loadHistoryItem(item);
            });

            const title = document.createElement('div');
            title.className = 'history-title';
            title.textContent = `${item.object} - ${item.timestamp}`;

            const preview = document.createElement('div');
            preview.className = 'history-preview';
            preview.textContent = item.soql.substring(0, 50) + (item.soql.length > 50 ? '...' : '');

            historyItem.appendChild(title);
            historyItem.appendChild(preview);
            historyList.appendChild(historyItem);
        });
    }

    // 加载历史记录项
    loadHistoryItem(historyItem) {
        document.getElementById('soqlOutput').value = historyItem.soql;
        this.showMessage('已加载历史记录');
    }

    // 显示消息
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
        
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    // 隐藏消息
    hideMessage() {
        const messageContainer = document.getElementById('messageContainer');
        messageContainer.style.display = 'none';
    }

    // 绑定消息关闭事件
    bindMessageEvents() {
        const closeButton = document.getElementById('closeMessage');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hideMessage();
            });
        }
    }

    // 设置手动输入的Session ID

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

    // 解析并选择字段
    parseAndSelectFields() {
        const input = document.getElementById('fieldParserInput');
        const inputText = input.value.trim();
        
        if (!inputText) {
            this.showMessage('请输入要解析的字段列表', 'warning');
            return;
        }

        if (!this.currentObject) {
            this.showMessage('请先选择对象', 'warning');
            return;
        }

        try {
            // 解析字段名称
            const fieldNames = this.parseFieldNames(inputText);
            
            if (fieldNames.length === 0) {
                this.showMessage('未找到有效的字段名称', 'warning');
                return;
            }

            // 匹配当前对象的字段
            const matchedFields = this.matchFields(fieldNames);
            
            if (matchedFields.length === 0) {
                this.showMessage('未找到匹配的字段', 'warning');
                return;
            }

            // 选择匹配的字段
            this.selectMatchedFields(matchedFields);
            
            // 显示结果
            const unmatchedCount = fieldNames.length - matchedFields.length;
            if (unmatchedCount > 0) {
                this.showMessage(`成功选择 ${matchedFields.length} 个字段，${unmatchedCount} 个字段未匹配`, 'success');
            } else {
                this.showMessage(`成功选择 ${matchedFields.length} 个字段`, 'success');
            }

            // 清空输入框
            input.value = '';

        } catch (error) {
            console.error('SOQL Creator: 解析字段失败:', error);
            this.showMessage('解析字段失败，请检查输入格式', 'error');
        }
    }

    // 解析字段名称 - 支持多种格式
    parseFieldNames(inputText) {
        const fieldNames = [];
        
        // 移除常见的包装字符
        let cleanText = inputText
            .replace(/^[\[\](){}"]+/, '')  // 移除开头的包装字符
            .replace(/[\[\](){}"]+$/, '')  // 移除结尾的包装字符
            .trim();

        // 尝试不同的分隔符
        const separators = [',', ';', '\t', '\n', ' ', '|'];
        
        for (const separator of separators) {
            if (cleanText.includes(separator)) {
                const parts = cleanText.split(separator);
                for (const part of parts) {
                    const fieldName = part.trim();
                    if (fieldName && this.isValidFieldName(fieldName)) {
                        fieldNames.push(fieldName);
                    }
                }
                break;
            }
        }

        // 如果没有找到分隔符，尝试作为单个字段
        if (fieldNames.length === 0 && this.isValidFieldName(cleanText)) {
            fieldNames.push(cleanText);
        }

        return fieldNames;
    }

    // 验证字段名称是否有效
    isValidFieldName(fieldName) {
        // Salesforce字段名称规则：字母开头，只能包含字母、数字、下划线
        return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName) && fieldName.length > 0;
    }

    // 匹配字段
    matchFields(fieldNames) {
        const matchedFields = [];
        const availableFields = this.fields[this.currentObject.apiName] || {};
        const availableFieldNames = Object.keys(availableFields);

        for (const fieldName of fieldNames) {
            // 精确匹配
            if (availableFieldNames.includes(fieldName)) {
                matchedFields.push(fieldName);
                continue;
            }

            // 大小写不敏感匹配
            const lowerFieldName = fieldName.toLowerCase();
            const matchedField = availableFieldNames.find(name => 
                name.toLowerCase() === lowerFieldName
            );
            if (matchedField) {
                matchedFields.push(matchedField);
                continue;
            }

            // 部分匹配（字段名包含输入的内容）
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

    // 选择匹配的字段
    selectMatchedFields(matchedFields) {
        // 先清空所有选择
        this.selectedFields.clear();
        
        // 选择匹配的字段
        matchedFields.forEach(fieldName => {
            this.selectedFields.add(fieldName);
        });

        // 更新UI
        const checkboxes = document.querySelectorAll('#fieldList input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.selectedFields.has(checkbox.value);
        });

        // 重新生成SOQL
        this.generateSOQL();
    }

    // 打开设置面板
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

}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否是OAuth回调
    if (window.location.hash.includes('access_token')) {
        const result = oauthManager.handleOAuthCallback();
        if (result.success) {
            console.log('SOQL Creator: OAuth回调处理成功');
            // 可以在这里显示成功消息或重定向
        }
    }
    
    // 初始化SOQL Creator
    window.soqlCreator = new SOQLCreator();
});
