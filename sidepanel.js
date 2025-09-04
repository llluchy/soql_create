// SOQL Creator 侧边栏主要逻辑
class SOQLCreator {
    constructor() {
        this.currentObject = null;
        this.selectedFields = new Set();
        this.objects = [];
        this.fields = {};
        this.init();
    }

    init() {
        this.bindEvents();
        this.bindMessageEvents();
        this.loadHistory();
        this.checkSalesforcePage();
    }

    bindEvents() {
        // 对象选择事件
        document.getElementById('objectSelect').addEventListener('change', (e) => {
            this.onObjectChange(e.target.value);
        });

        // 刷新对象按钮
        document.getElementById('refreshObjects').addEventListener('click', () => {
            this.loadObjects();
        });

        // Session ID设置按钮
        document.getElementById('setSessionId').addEventListener('click', () => {
            this.setManualSessionId();
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

        // SOQL操作按钮
        document.getElementById('copySoql').addEventListener('click', () => {
            this.copySOQL();
        });

        document.getElementById('clearSoql').addEventListener('click', () => {
            this.clearSOQL();
        });
    }

    // 检查是否在Salesforce页面
    checkSalesforcePage() {
        if (this.isSalesforcePage()) {
            this.updateSessionStatus('正在检测Session...');
            this.loadObjects();
        } else {
            this.showMessage('请在Salesforce页面使用此插件', 'warning');
            this.updateSessionStatus('非Salesforce页面');
        }
    }

    // 判断是否为Salesforce页面
    isSalesforcePage() {
        return window.location.hostname.includes('salesforce.com') || 
               window.location.hostname.includes('force.com');
    }

    // 加载Salesforce对象列表
    async loadObjects() {
        try {
            this.showMessage('正在加载对象列表...');
            
            // 使用cURL风格的Salesforce API获取对象列表
            const objects = await this.getSalesforceObjectsCurl();
            
            if (objects && objects.length > 0) {
                this.objects = objects;
                this.populateObjectSelect();
                this.showMessage(`成功加载 ${objects.length} 个对象`, 'success');
            } else {
                this.showMessage('无法获取对象列表，请检查Session ID', 'error');
                this.objects = [];
                this.populateObjectSelect();
            }
        } catch (error) {
            console.error('加载对象失败:', error);
            this.showMessage('加载对象失败，请检查Session ID', 'error');
            this.objects = [];
            this.populateObjectSelect();
        }
    }

    // 加载对象字段
    async loadFields(objectApiName) {
        try {
            this.showMessage('正在加载字段列表...');
            
            // 使用cURL风格的Salesforce API获取字段列表
            const fields = await this.getSalesforceFieldsCurl(objectApiName);
            
            if (fields && Object.keys(fields).length > 0) {
                this.fields[objectApiName] = fields;
                this.populateFieldList();
                this.showMessage(`成功加载 ${Object.keys(fields).length} 个字段`, 'success');
            } else {
                this.showMessage('无法获取字段列表，请检查Session ID', 'error');
                this.fields[objectApiName] = {};
                this.populateFieldList();
            }
        } catch (error) {
            console.error('加载字段失败:', error);
            this.showMessage('加载字段失败，请检查Session ID', 'error');
            
            this.fields[objectApiName] = {};
            this.populateFieldList();
        }
    }

    // 使用Salesforce REST API获取对象列表
    async getSalesforceObjects() {
        try {
            // 方法1：尝试从当前页面获取session ID
            const sessionId = await this.getSessionId();
            
            if (sessionId) {
                this.updateSessionStatus('检测到页面Session ID');
                return await this.callSalesforceAPI(sessionId);
            }
            
            // 方法2：尝试从localStorage获取
            const storedSessionId = localStorage.getItem('salesforce_session_id');
            if (storedSessionId) {
                this.updateSessionStatus('使用存储的Session ID');
                return await this.callSalesforceAPI(storedSessionId);
            }
            
            // 方法3：尝试从cookie获取
            const cookieSessionId = this.getSessionIdFromCookie();
            if (cookieSessionId) {
                this.updateSessionStatus('检测到Cookie Session ID');
                return await this.callSalesforceAPI(cookieSessionId);
            }
            
            this.updateSessionStatus('未检测到Session ID');
            this.showMessage('请在高级设置中手动输入Session ID', 'warning');
            throw new Error('无法获取Salesforce会话信息');
            
        } catch (error) {
            console.error('获取Salesforce对象失败:', error);
            if (error.message.includes('无法获取当前页面域名')) {
                this.updateSessionStatus('无法获取页面域名，请确保在Salesforce页面使用');
                this.showMessage('请在Salesforce页面中使用此插件', 'error');
            } else if (error.message.includes('401')) {
                this.updateSessionStatus('Session ID已过期，请重新获取');
                this.showMessage('Session ID已过期，请重新登录Salesforce并获取新的Session ID', 'error');
            } else if (error.message.includes('403')) {
                this.updateSessionStatus('权限不足，请检查用户权限');
                this.showMessage('权限不足，请确保您有访问元数据的权限', 'error');
            } else if (error.message.includes('Failed to fetch')) {
                this.updateSessionStatus('网络请求失败，请检查网络连接');
                this.showMessage('网络请求失败，请检查网络连接或刷新页面重试', 'error');
            } else {
                this.updateSessionStatus('Session ID无效或已过期');
                this.showMessage('Session ID无效，请检查输入是否正确', 'error');
            }
            return null;
        }
    }

    // 从当前页面获取session ID
    async getSessionId() {
        try {
            // 方法1: 从cookie获取sid (最可靠的方法)
            const sidCookie = this.getSessionIdFromCookie();
            if (sidCookie) {
                console.log('从Cookie获取到Session ID');
                return sidCookie;
            }
            
            // 方法2: 尝试从页面中查找session ID
            const sessionElements = document.querySelectorAll('[data-session-id], [id*="session"], [name*="session"]');
            
            for (const element of sessionElements) {
                const sessionId = element.value || element.textContent || element.getAttribute('data-session-id');
                if (this.isValidSessionId(sessionId)) {
                    console.log('从页面元素获取到Session ID');
                    return sessionId;
                }
            }
            
            // 方法3: 尝试从URL参数获取
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('sid') || urlParams.get('sessionId');
            if (this.isValidSessionId(sessionId)) {
                console.log('从URL参数获取到Session ID');
                return sessionId;
            }
            
            // 方法4: 尝试从localStorage获取
            const storedSessionId = localStorage.getItem('salesforce_session_id');
            if (this.isValidSessionId(storedSessionId)) {
                console.log('从localStorage获取到Session ID');
                return storedSessionId;
            }
            
            return null;
        } catch (error) {
            console.error('获取session ID失败:', error);
            return null;
        }
    }

    // 从cookie获取session ID (改进版本)
    getSessionIdFromCookie() {
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                // 检查多种可能的cookie名称
                if (name === 'sid' || 
                    name === 'sessionId' || 
                    name === 'sf_session_id' ||
                    name === 'salesforce_session_id' ||
                    name.includes('session')) {
                    if (this.isValidSessionId(value)) {
                        console.log('从Cookie获取到有效的Session ID:', name);
                        return value;
                    }
                }
            }
            return null;
        } catch (error) {
            console.error('从cookie获取session ID失败:', error);
            return null;
        }
    }

    // 验证Session ID格式
    isValidSessionId(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') {
            return false;
        }
        
        // Salesforce Session ID通常以00D开头，长度在100-200字符之间
        const trimmed = sessionId.trim();
        if (trimmed.length < 50 || trimmed.length > 300) {
            return false;
        }
        
        // // 检查是否包含特殊字符（Session ID通常只包含字母数字）
        // if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
        //     return false;
        // }
        
        return true;
    }

    // 调用Salesforce REST API
    async callSalesforceAPI(sessionId) {
        try {
            // 获取当前活动标签页的域名，而不是侧边栏的域名
            const currentDomain = await this.getCurrentPageDomain();
            if (!currentDomain) {
                throw new Error('无法获取当前页面域名');
            }
            
            // 验证Session ID
            if (!this.isValidSessionId(sessionId)) {
                throw new Error('Session ID格式无效');
            }
            
            // 构建API URL - 使用当前页面的协议和正确的API版本
            const protocol = window.location.protocol;
            const apiUrl = `https://${currentDomain}/services/data/v64.0/sobjects/`;
            console.log('SOQL Creator: 调用Salesforce API:', apiUrl);
            console.log('SOQL Creator: 使用Session ID长度:', sessionId.length);
            console.log('SOQL Creator: 使用协议:', protocol);
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionId}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include' // 包含cookies
            });
            
            console.log('SOQL Creator: API响应状态:', response.status, response.statusText);
            console.log('SOQL Creator: API响应头:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                let errorMessage = '';
                let errorDetails = '';
                
                try {
                    const errorData = await response.text();
                    console.log('SOQL Creator: 错误响应内容:', errorData);
                    errorDetails = errorData;
                } catch (e) {
                    console.log('SOQL Creator: 无法读取错误响应内容');
                }
                
                if (response.status === 401) {
                    errorMessage = 'Session ID已过期或无效，请重新登录';
                    this.updateSessionStatus('Session ID已过期，请重新获取');
                } else if (response.status === 403) {
                    errorMessage = '权限不足，请检查用户权限';
                    this.updateSessionStatus('权限不足，请检查用户权限');
                } else if (response.status === 404) {
                    errorMessage = 'API端点不存在，请检查Salesforce版本';
                    this.updateSessionStatus('API端点不存在，请检查Salesforce版本');
                } else {
                    errorMessage = `API调用失败: ${response.status} ${response.statusText}`;
                    this.updateSessionStatus(`API调用失败: ${response.status}`);
                }
                
                console.error('SOQL Creator: API调用失败:', {
                    status: response.status,
                    statusText: response.statusText,
                    url: apiUrl,
                    sessionIdLength: sessionId.length,
                    protocol: protocol,
                    errorDetails: errorDetails
                });
                
                throw new Error(`${response.status}: ${errorMessage}`);
            }
            
            const data = await response.json();
            console.log('SOQL Creator: API调用成功，获取到数据:', data);
            
            if (data.sobjects && Array.isArray(data.sobjects)) {
                // 过滤出可查询的对象，并按名称排序
                const queryableObjects = data.sobjects
                    .filter(obj => obj.queryable === true && obj.retrieveable === true)
                    .sort((a, b) => a.label.localeCompare(b.label));
                
                console.log('SOQL Creator: 找到可查询对象数量:', queryableObjects.length);
                
                // 转换为我们的格式
                return queryableObjects.map(obj => ({
                    name: obj.name,
                    label: obj.label || obj.name,
                    apiName: obj.name,
                    description: obj.description || '',
                    createable: obj.createable || false,
                    updateable: obj.updateable || false,
                    deletable: obj.deletable || false
                }));
            }
            
            return [];
            
        } catch (error) {
            console.error('SOQL Creator: Salesforce API调用失败:', error);
            throw error;
        }
    }

    // 获取当前页面域名
    async getCurrentPageDomain() {
        try {
            // 使用chrome.tabs API获取当前活动标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                const url = new URL(tab.url);
                return url.hostname;
            }
            return null;
        } catch (error) {
            console.error('获取当前页面域名失败:', error);
            return null;
        }
    }

    // 填充对象选择下拉框
    populateObjectSelect() {
        const select = document.getElementById('objectSelect');
        select.innerHTML = '<option value="">请选择Salesforce对象...</option>';
        
        if (this.objects.length === 0) {
            select.innerHTML = '<option value="">暂无可用对象，请检查Session ID</option>';
            return;
        }
        
        this.objects.forEach(obj => {
            const option = document.createElement('option');
            option.value = obj.apiName;
            option.textContent = `${obj.label} (${obj.name})`;
            select.appendChild(option);
        });
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

    // 使用cURL风格获取Salesforce对象列表
    async getSalesforceObjectsCurl() {
        try {
            // 获取当前页面域名
            const currentDomain = await this.getCurrentPageDomain();
            if (!currentDomain) {
                throw new Error('无法获取当前页面域名');
            }
            
            // 获取Session ID
            const sessionId = await this.getSessionId();
            if (!sessionId) {
                throw new Error('无法获取Session ID');
            }
            
            // 构建cURL风格的请求
            const url = `https://${currentDomain}/services/data/v64.0/sobjects/`;
            const headers = {
                'Authorization': `Bearer ${sessionId}`
            };
            
            console.log('SOQL Creator: 执行cURL请求获取对象列表');
            const data = await this.curlRequest(url, { headers });
            
            if (data.sobjects && Array.isArray(data.sobjects)) {
                // 过滤出可查询的对象，并按名称排序
                const queryableObjects = data.sobjects
                    .filter(obj => obj.queryable === true && obj.retrieveable === true)
                    .sort((a, b) => a.label.localeCompare(b.label));
                
                console.log('SOQL Creator: cURL获取到可查询对象数量:', queryableObjects.length);
                
                // 转换为我们的格式
                return queryableObjects.map(obj => ({
                    name: obj.name,
                    label: obj.label || obj.name,
                    apiName: obj.name,
                    description: obj.description || '',
                    createable: obj.createable || false,
                    updateable: obj.updateable || false,
                    deletable: obj.deletable || false
                }));
            }
            
            return [];
            
        } catch (error) {
            console.error('SOQL Creator: cURL获取对象列表失败:', error);
            throw error;
        }
    }

    // 使用cURL风格获取Salesforce字段列表
    async getSalesforceFieldsCurl(objectApiName) {
        try {
            // 获取当前页面域名
            const currentDomain = await this.getCurrentPageDomain();
            if (!currentDomain) {
                throw new Error('无法获取当前页面域名');
            }
            
            // 获取Session ID
            const sessionId = await this.getSessionId();
            if (!sessionId) {
                throw new Error('无法获取Session ID');
            }
            
            // 构建cURL风格的请求
            const url = `https://${currentDomain}/services/data/v64.0/sobjects/${objectApiName}/describe`;
            const headers = {
                'Authorization': `Bearer ${sessionId}`
            };
            
            console.log('SOQL Creator: 执行cURL请求获取字段列表:', objectApiName);
            const data = await this.curlRequest(url, { headers });
            
            if (data.fields && Array.isArray(data.fields)) {
                // 过滤出可查询的字段，并按名称排序
                const queryableFields = data.fields
                    .filter(field => field.queryable === true && field.retrieveable === true)
                    .sort((a, b) => a.label.localeCompare(b.label));
                
                console.log('SOQL Creator: cURL获取到可查询字段数量:', queryableFields.length);
                
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
                        relationshipName: field.relationshipName || null
                    };
                });
                
                return fieldsMap;
            }
            
            return {};
            
        } catch (error) {
            console.error('SOQL Creator: cURL获取字段列表失败:', error);
            throw error;
        }
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
            label.textContent = `${field.label} (${field.name})`;

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
    setManualSessionId() {
        const sessionIdInput = document.getElementById('sessionIdInput');
        const sessionId = sessionIdInput.value.trim();
        
        if (!sessionId) {
            this.showMessage('请输入Session ID', 'warning');
            return;
        }
        
        if (sessionId.length < 20) {
            this.showMessage('Session ID格式不正确', 'error');
            return;
        }
        
        // 保存到localStorage
        localStorage.setItem('salesforce_session_id', sessionId);
        
        // 更新状态显示
        this.updateSessionStatus('已设置手动Session ID');
        
        // 重新加载对象
        this.loadObjects();
        
        this.showMessage('Session ID已设置，正在重新加载对象...', 'success');
    }

    // 更新Session状态显示
    updateSessionStatus(status) {
        const sessionStatus = document.getElementById('sessionStatus');
        sessionStatus.textContent = `状态: ${status}`;
        
        if (status.includes('成功') || status.includes('已设置')) {
            sessionStatus.style.backgroundColor = '#d4edda';
            sessionStatus.style.borderColor = '#c3e6cb';
            sessionStatus.style.color = '#155724';
        } else if (status.includes('失败') || status.includes('未检测到')) {
            sessionStatus.style.backgroundColor = '#f8d7da';
            sessionStatus.style.borderColor = '#f5c6cb';
            sessionStatus.style.color = '#721c24';
        } else {
            sessionStatus.style.backgroundColor = '#fff3cd';
            sessionStatus.style.borderColor = '#ffeaa7';
            sessionStatus.style.color = '#856404';
        }
    }

    // cURL风格的Salesforce API请求
    async curlRequest(url, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        // 合并选项
        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        console.log('SOQL Creator: cURL请求:', {
            url: url,
            method: finalOptions.method,
            headers: finalOptions.headers
        });

        try {
            const response = await fetch(url, finalOptions);
            
            console.log('SOQL Creator: cURL响应状态:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('SOQL Creator: cURL请求失败:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('SOQL Creator: cURL请求成功，数据长度:', JSON.stringify(data).length);
            return data;
            
        } catch (error) {
            console.error('SOQL Creator: cURL请求异常:', error);
            throw error;
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new SOQLCreator();
});
