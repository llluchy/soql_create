// 对象白名单设置页面逻辑
class WhitelistSettingsManager {
    constructor() {
        this.config = null;
        this.allObjects = []; // 所有对象数据
        this.filteredObjects = []; // 筛选后的对象
        this.currentFilter = 'all'; // 当前筛选类型
        this.searchText = ''; // 搜索文本
        this.init();
    }

    async init() {
        // 加载当前配置
        await this.loadSettings();
        
        // 加载对象列表
        await this.loadObjects();
        
        // 绑定事件
        this.bindEvents();
        
        // 初始化界面状态
        this.initializeUI();
        
        // 监听配置变化
        this.setupConfigListener();
    }

    // 加载设置
    async loadSettings() {
        try {
            this.config = await userConfig.getConfig();
            // 确保配置结构正确
            if (!this.config.objectWhitelist) {
                this.config.objectWhitelist = {
                    allObjects: [],
                    selectedObjects: []
                };
            }
            if (!this.config.defaultOpenMode) {
                this.config.defaultOpenMode = {
                    mode: 'sidepanel'
                };
            }
            console.log('设置已加载:', this.config);
        } catch (error) {
            console.error('加载设置失败:', error);
            this.showMessage('加载设置失败', 'error');
        }
    }

    // 加载对象列表
    async loadObjects() {
        try {
            // 从 constants.js 获取标准对象列表
            this.allObjects = await this.fetchObjectsFromSalesforce();
            
            // 更新白名单中的完整对象列表
            this.config.objectWhitelist.allObjects = this.allObjects.map(obj => obj.name);
            
            // 如果用户配置中的 allObjects 为空，使用 constants.js 中的列表
            if (!this.config.objectWhitelist.allObjects || this.config.objectWhitelist.allObjects.length === 0) {
                this.config.objectWhitelist.allObjects = this.allObjects.map(obj => obj.name);
            }
            
            this.filteredObjects = [...this.allObjects];
            this.renderObjectList();
            this.updateStats();
        } catch (error) {
            console.error('加载对象列表失败:', error);
            this.showError('加载对象列表失败');
        }
    }

    // 从 constants.js 获取标准对象列表
    async fetchObjectsFromSalesforce() {
        // 使用 constants.js 中定义的标准对象白名单
        const standardObjects = SOQL_CONSTANTS.STANDARD_OBJECT_WHITELIST;
        
        // 为每个对象创建显示信息，直接使用对象名称作为标签
        return standardObjects.map(objectName => ({
            name: objectName,
            label: objectName, // 直接使用对象名称，不再使用硬编码的标签映射
            type: 'standard'
        }));
    }


    // 渲染对象列表
    renderObjectList() {
        const container = document.getElementById('objectList');
        
        if (this.filteredObjects.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🔍</div>
                    <div>没有找到匹配的对象</div>
                </div>
            `;
            return;
        }

        const html = this.filteredObjects.map(obj => {
            const isSelected = this.config.objectWhitelist.selectedObjects.includes(obj.name);
            const typeClass = obj.type;
            const typeText = this.getTypeText(obj.type);
            
            return `
                <div class="object-item">
                    <input type="checkbox" 
                           class="object-checkbox" 
                           data-object-name="${obj.name}"
                           ${isSelected ? 'checked' : ''}>
                    <div class="object-info">
                        <div class="object-name">${obj.name}</div>
                    </div>
                    <span class="object-type ${typeClass}">${typeText}</span>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    // 获取对象类型文本
    getTypeText(type) {
        switch (type) {
            case 'standard': return '标准';
            case 'custom': return '自定义';
            case 'system': return '系统';
            default: return '未知';
        }
    }

    // 更新统计信息
    updateStats() {
        const totalCount = this.allObjects.length;
        const whitelistCount = this.config.objectWhitelist.allObjects.length;
        const selectedCount = this.config.objectWhitelist.selectedObjects.length;

        document.getElementById('totalCount').textContent = `总计: ${totalCount} 个对象`;
        document.getElementById('whitelistCount').textContent = `白名单: ${whitelistCount} 个对象`;
        document.getElementById('visibleCount').textContent = `选中: ${selectedCount} 个对象`;
    }

    // 筛选对象
    filterObjects() {
        this.filteredObjects = this.allObjects.filter(obj => {
            // 类型筛选
            if (this.currentFilter !== 'all' && obj.type !== this.currentFilter) {
                return false;
            }
            
            // 搜索筛选
            if (this.searchText) {
                const searchLower = this.searchText.toLowerCase();
                return obj.name.toLowerCase().includes(searchLower);
            }
            
            return true;
        });
        
        this.renderObjectList();
    }

    // 绑定事件
    bindEvents() {
        // 默认打开方式选择
        document.querySelectorAll('input[name="defaultOpenMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.handleOpenModeChange(e.target.value);
            });
        });

        // 搜索输入
        document.getElementById('objectSearch').addEventListener('input', (e) => {
            this.searchText = e.target.value;
            this.filterObjects();
        });

        // 筛选按钮
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // 移除所有活动状态
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                // 添加当前活动状态
                e.target.classList.add('active');
                // 设置筛选类型
                this.currentFilter = e.target.dataset.type;
                this.filterObjects();
            });
        });

        // 对象复选框变化
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('object-checkbox')) {
                this.handleObjectToggle(e.target);
            }
        });

        // 全选按钮
        document.getElementById('selectAllBtn').addEventListener('click', () => {
            this.selectAll();
        });

        // 全不选按钮
        document.getElementById('deselectAllBtn').addEventListener('click', () => {
            this.deselectAll();
        });

        // 重置设置
        document.getElementById('resetSettingsBtn').addEventListener('click', () => {
            this.resetSettings();
        });

        // 返回按钮
        document.getElementById('backBtn').addEventListener('click', () => {
            this.goBack();
        });
    }

    // 初始化界面状态
    initializeUI() {
        // 设置默认打开方式的选中状态
        const currentMode = this.config.defaultOpenMode.mode;
        const modeRadio = document.querySelector(`input[name="defaultOpenMode"][value="${currentMode}"]`);
        if (modeRadio) {
            modeRadio.checked = true;
        }
    }

    // 处理默认打开方式变化
    async handleOpenModeChange(mode) {
        // 检查是否真的发生了变化
        if (this.config.defaultOpenMode.mode === mode) {
            return;
        }
        
        // 直接更新配置
        this.config.defaultOpenMode.mode = mode;
        await this.autoSaveSettings();
        
        // 延迟后重新加载扩展程序
        chrome.runtime.reload();
        console.log('扩展程序已重新加载');
    }

    // 处理对象切换
    async handleObjectToggle(checkbox) {
        const objectName = checkbox.dataset.objectName;
        const isSelected = checkbox.checked;
        
        if (isSelected) {
            // 添加到选中列表
            if (!this.config.objectWhitelist.selectedObjects.includes(objectName)) {
                this.config.objectWhitelist.selectedObjects.push(objectName);
            }
        } else {
            // 从选中列表移除
            const index = this.config.objectWhitelist.selectedObjects.indexOf(objectName);
            if (index > -1) {
                this.config.objectWhitelist.selectedObjects.splice(index, 1);
            }
        }
        
        // 自动保存设置
        await this.autoSaveSettings();
        this.updateStats();
    }

    // 全选
    async selectAll() {
        this.filteredObjects.forEach(obj => {
            if (!this.config.objectWhitelist.selectedObjects.includes(obj.name)) {
                this.config.objectWhitelist.selectedObjects.push(obj.name);
            }
        });
        this.renderObjectList();
        await this.autoSaveSettings();
        this.updateStats();
    }

    // 全不选
    async deselectAll() {
        this.filteredObjects.forEach(obj => {
            const index = this.config.objectWhitelist.selectedObjects.indexOf(obj.name);
            if (index > -1) {
                this.config.objectWhitelist.selectedObjects.splice(index, 1);
            }
        });
        this.renderObjectList();
        await this.autoSaveSettings();
        this.updateStats();
    }

    // 自动保存设置（静默保存，不显示提示）
    async autoSaveSettings() {
        try {
            await userConfig.setConfigs({
                objectWhitelist: this.config.objectWhitelist,
                defaultOpenMode: this.config.defaultOpenMode
            });
            console.log('设置已自动保存');
        } catch (error) {
            console.error('自动保存设置失败:', error);
            this.showMessage('自动保存失败', 'error');
        }
    }


    // 重置设置
    async resetSettings() {
        if (confirm('确定要重置所有设置为默认值吗？此操作不可撤销。')) {
            try {
                this.config.objectWhitelist = {
                    allObjects: this.allObjects.map(obj => obj.name),
                    selectedObjects: ['Account', 'Contact', 'Opportunity', 'Case', 'Lead', 'Task', 'Event',
                    'User']
                };
                this.config.defaultOpenMode = {
                    mode: 'sidepanel'
                };
                this.renderObjectList();
                this.initializeUI();
                await this.autoSaveSettings();
                this.updateStats();
                this.showMessage('所有设置已重置为默认值', 'success');
            } catch (error) {
                console.error('重置设置失败:', error);
                this.showMessage('重置设置失败', 'error');
            }
        }
    }

    // 返回
    goBack() {
        window.close();
    }

    // 设置配置监听器
    setupConfigListener() {
        userConfig.onConfigChanged((changes) => {
            console.log('配置已更改:', changes);
            if (changes.objectWhitelist) {
                this.config.objectWhitelist = changes.objectWhitelist.newValue || {
                    allObjects: [],
                    selectedObjects: []
                };
                this.renderObjectList();
                this.updateStats();
            }
            if (changes.defaultOpenMode) {
                this.config.defaultOpenMode = changes.defaultOpenMode.newValue || {
                    mode: 'sidepanel'
                };
                this.initializeUI();
            }
        });
    }

    // 显示错误
    showError(message) {
        const container = document.getElementById('objectList');
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">❌</div>
                <div>${message}</div>
            </div>
        `;
    }

    // 显示消息
    showMessage(message, type = 'info') {
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
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new WhitelistSettingsManager();
});