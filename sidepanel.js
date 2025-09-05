// SOQL Creator 侧边栏主要逻辑 - 基于 Salesforce Inspector Reloaded 最佳实践
class SOQLCreator {
    constructor() {
        this.currentObject = null;
        this.selectedFields = new Set();
        this.objects = [];
        this.fields = {};
        this.sfHost = null;
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

        document.getElementById('clearSoql').addEventListener('click', () => {
            this.clearSOQL();
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
            this.showLoadingStatus('正在加载对象列表...');
            this.showMessage('正在加载对象列表...');
            
            // 获取会话
            await sfConn.getSession(this.sfHost);
            
            if (!sfConn.sessionId) {
                this.hideLoadingStatus();
                this.showMessage('无法获取Salesforce会话，请检查登录状态', 'error');
                return;
            }
            
            // 使用新的API模块获取对象列表
            const result = await soqlExecutor.getSObjects();
            
            if (result && result.sobjects && result.sobjects.length > 0) {
                // 过滤出可查询的对象，并按名称排序
                this.objects = result.sobjects
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
                
                this.hideLoadingStatus();
                this.populateObjectList();
                this.showMessage(`成功加载 ${this.objects.length} 个对象`, 'success');
            } else {
                this.hideLoadingStatus();
                this.showMessage('无法获取对象列表，请检查权限', 'error');
                this.objects = [];
                this.populateObjectList();
            }
        } catch (error) {
            console.error('SOQL Creator: 加载对象失败:', error);
            this.hideLoadingStatus();
            ErrorHandler.handle(error, 'loadObjects');
            this.objects = [];
            this.populateObjectList();
        }
    }

    // 加载对象字段
    async loadFields(objectApiName) {
        try {
            this.showLoadingStatus('正在加载字段列表...');
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
                this.hideLoadingStatus();
                this.populateFieldList();
                this.showMessage(`成功加载 ${Object.keys(fieldsMap).length} 个字段`, 'success');
            } else {
                this.hideLoadingStatus();
                this.showMessage('无法获取字段列表，请检查权限', 'error');
                this.fields[objectApiName] = {};
                this.populateFieldList();
            }
        } catch (error) {
            console.error('SOQL Creator: 加载字段失败:', error);
            this.hideLoadingStatus();
            ErrorHandler.handle(error, 'loadFields');
            this.fields[objectApiName] = {};
            this.populateFieldList();
        }
    }





    // 填充对象选择下拉框
    populateObjectList() {
        const objectList = document.getElementById('objectList');
        
        if (this.objects.length === 0) {
            objectList.innerHTML = '<div class="placeholder">暂无可用对象，请检查Session ID</div>';
            return;
        }
        
        // 清空列表
        objectList.innerHTML = '';
        
        // 过滤掉Share对象，然后按标签名称排序
        const filteredObjects = this.objects.filter(obj => {
            const objectType = this.getObjectType(obj);
            return objectType !== 'share'; // 过滤掉Share对象
        });
        
        const sortedObjects = [...filteredObjects].sort((a, b) => a.label.localeCompare(b.label));
        
        // 打印所有对象到控制台
        console.log('=== SOQL Creator: 所有对象列表 ===');
        console.log('原始对象数量:', this.objects.length);
        console.log('过滤后对象数量:', sortedObjects.length);
        console.log('已过滤掉Share对象');
        console.log('对象详情:');
        sortedObjects.forEach((obj, index) => {
            const objectType = this.getObjectType(obj);
            console.log(`${index + 1}. [${objectType}] ${obj.label} (${obj.name})`);
        });
        console.log('=== 对象列表结束 ===');

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

        this.currentObject = this.objects.find(obj => obj.apiName === objectApiName);
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
            return 'custom';
        }
        
        // 元数据对象 (以__mdt结尾)
        if (apiName.endsWith('__mdt')) {
            return 'metadata';
        }
        
        // 系统对象 (以__开头的其他对象)
        if (apiName.startsWith('__')) {
            return 'system';
        }
        
        // 标准对象 (其他所有对象)
        return 'standard';
    }

    // 获取对象类型标签
    getObjectTypeLabel(type) {
        const typeLabels = {
            'standard': '标准',
            'custom': '自定义',
            'metadata': '元数据',
            'system': '系统'
        };
        return typeLabels[type] || '未知';
    }

    // 过滤对象列表
    filterObjects() {
        const objectItems = document.querySelectorAll('.object-item');
        const searchTerm = document.getElementById('objectSearch').value.toLowerCase().trim();
        const selectedType = document.querySelector('input[name="objectType"]:checked').value;
        
        objectItems.forEach(item => {
            const apiName = item.dataset.apiName;
            const object = this.objects.find(obj => obj.apiName === apiName);
            
            if (!object) {
                item.classList.add('hidden');
                return;
            }
            
            // 类型筛选
            const objectType = this.getObjectType(object);
            const typeMatch = objectType === selectedType;
            
            // 搜索筛选
            let searchMatch = true;
            if (searchTerm) {
                const labelMatch = object.label.toLowerCase().includes(searchTerm);
                const apiMatch = object.name.toLowerCase().includes(searchTerm);
                searchMatch = labelMatch || apiMatch;
            }
            
            // 同时满足类型和搜索条件才显示
            if (typeMatch && searchMatch) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });
    }


    // 填充字段列表
    populateFieldList() {
        const fieldList = document.getElementById('fieldList');
        fieldList.innerHTML = '';

        if (!this.currentObject || !this.fields[this.currentObject.apiName]) {
            fieldList.innerHTML = '<p class="placeholder">请先选择对象</p>';
            return;
        }

        const fields = this.fields[this.currentObject.apiName];
        
        if (Object.keys(fields).length === 0) {
            fieldList.innerHTML = '<p class="placeholder">无法获取字段列表，请检查Session ID或重新选择对象</p>';
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
        fieldList.innerHTML = '<p class="placeholder">请先选择对象</p>';
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

    // 清空SOQL
    clearSOQL() {
        document.getElementById('soqlOutput').value = '';
        this.showMessage('SOQL已清空');
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
            historyList.innerHTML = '<p class="placeholder">暂无查询历史</p>';
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
    showLoadingStatus(message = '正在加载...') {
        const loadingStatus = document.getElementById('loadingStatus');
        const loadingText = loadingStatus.querySelector('.loading-text');
        if (loadingStatus && loadingText) {
            loadingText.textContent = message;
            loadingStatus.style.display = 'flex';
        }
    }

    // 隐藏加载状态
    hideLoadingStatus() {
        const loadingStatus = document.getElementById('loadingStatus');
        if (loadingStatus) {
            loadingStatus.style.display = 'none';
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
