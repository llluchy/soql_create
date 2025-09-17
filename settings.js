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
        
        // 为每个对象创建显示信息
        return standardObjects.map(objectName => ({
            name: objectName,
            label: this.getObjectLabel(objectName),
            type: 'standard'
        }));
    }

    // 获取对象的中文标签
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
            'AsyncApexJob': '异步Apex作业',
            'Activity': '活动',
            'AlternativePaymentMethod': '替代付款方式',
            'ApiAnomalyEventStore': 'API异常事件存储',
            'ApprovalSubmission': '审批提交',
            'ApprovalSubmissionDetail': '审批提交详情',
            'ApprovalWorkItem': '审批工作项',
            'AssetAction': '资产操作',
            'AssetActionSource': '资产操作源',
            'AssetRelationship': '资产关系',
            'AssetStatePeriod': '资产状态期间',
            'AssociatedLocation': '关联位置',
            'AuthorizationForm': '授权表单',
            'AuthorizationFormConsent': '授权表单同意',
            'AuthorizationFormDataUse': '授权表单数据使用',
            'AuthorizationFormText': '授权表单文本',
            'BusinessBrand': '业务品牌',
            'CampaignMember': '营销活动成员',
            'CardPaymentMethod': '卡付款方式',
            'CaseRelatedIssue': '案例相关问题',
            'ChangeRequest': '变更请求',
            'ChangeRequestRelatedItem': '变更请求相关项',
            'CommSubscription': '通信订阅',
            'CommSubscriptionChannelType': '通信订阅渠道类型',
            'CommSubscriptionConsent': '通信订阅同意',
            'CommSubscriptionTiming': '通信订阅时间',
            'ConsumptionRate': '消费率',
            'ConsumptionSchedule': '消费计划',
            'ContactPointAddress': '联系点地址',
            'ContactPointConsent': '联系点同意',
            'ContactPointEmail': '联系点邮箱',
            'ContactPointPhone': '联系点电话',
            'ContactPointTypeConsent': '联系点类型同意',
            'ContactRequest': '联系请求',
            'ContractLineItem': '合同行项目',
            'CredentialStuffingEventStore': '凭据填充事件存储',
            'CreditMemo': '贷项通知单',
            'CreditMemoInvApplication': '贷项通知单发票应用',
            'CreditMemoLine': '贷项通知单行',
            'Customer': '客户',
            'DandBCompany': 'D&B公司',
            'DataMaskCustomValueLibrary': '数据掩码自定义值库',
            'DataUseLegalBasis': '数据使用法律依据',
            'DataUsePurpose': '数据使用目的',
            'DigitalWallet': '数字钱包',
            'DuplicateRecordItem': '重复记录项',
            'DuplicateRecordSet': '重复记录集',
            'EmailMessage': '邮件消息',
            'EngagementChannelType': '参与渠道类型',
            'EntitlementContact': '权利联系人',
            'EntityMilestone': '实体里程碑',
            'FinanceBalanceSnapshot': '财务余额快照',
            'FinanceTransaction': '财务交易',
            'FlowOrchestrationInstance': '流程编排实例',
            'FlowOrchestrationLog': '流程编排日志',
            'FlowOrchestrationStageInstance': '流程编排阶段实例',
            'FlowOrchestrationStepInstance': '流程编排步骤实例',
            'FlowOrchestrationWorkItem': '流程编排工作项',
            'GuestUserAnomalyEventStore': '访客用户异常事件存储',
            'Image': '图像',
            'Incident': '事件',
            'IncidentRelatedItem': '事件相关项',
            'Invoice': '发票',
            'InvoiceLine': '发票行',
            'LegalEntity': '法律实体',
            'ListEmail': '列表邮件',
            'Location': '位置',
            'LocationGroup': '位置组',
            'LocationGroupAssignment': '位置组分配',
            'Macro': '宏',
            'MessagingEndUser': '消息传递最终用户',
            'MessagingSession': '消息传递会话',
            'OpportunityContactRole': '商机联系人角色',
            'OpportunityLineItem': '商机行项目',
            'OrderItem': '订单项',
            'PartyConsent': '参与方同意',
            'Payment': '付款',
            'PaymentAuthAdjustment': '付款授权调整',
            'PaymentAuthorization': '付款授权',
            'PaymentGateway': '付款网关',
            'PaymentGroup': '付款组',
            'PaymentLineInvoice': '付款行发票',
            'PricebookEntry': '价格手册条目',
            'PrivacyRTBFRequest': '隐私RTBF请求',
            'Problem': '问题',
            'ProblemIncident': '问题事件',
            'ProblemRelatedItem': '问题相关项',
            'ProcessException': '流程异常',
            'ProductConsumptionSchedule': '产品消费计划',
            'QuickText': '快速文本',
            'Recommendation': '推荐',
            'Refund': '退款',
            'RefundLinePayment': '退款行付款',
            'ReportAnomalyEventStore': '报告异常事件存储',
            'Scorecard': '记分卡',
            'ScorecardAssociation': '记分卡关联',
            'ScorecardMetric': '记分卡指标',
            'Seller': '销售员',
            'SessionHijackingEventStore': '会话劫持事件存储',
            'SocialPersona': '社交角色',
            'UserProvisioningRequest': '用户配置请求',
            'WorkOrderLineItem': '工作订单行项目',
            'WorkPlan': '工作计划',
            'WorkPlanTemplate': '工作计划模板',
            'WorkPlanTemplateEntry': '工作计划模板条目',
            'WorkStep': '工作步骤',
            'WorkStepTemplate': '工作步骤模板'
        };
        
        return labelMap[objectName] || objectName;
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
                return obj.name.toLowerCase().includes(searchLower) || 
                       obj.label.toLowerCase().includes(searchLower);
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
        this.config.defaultOpenMode.mode = mode;
        await this.autoSaveSettings();
        console.log('默认打开方式已更新:', mode);
        
        // 显示重启提示
        this.showMessage('设置已保存！请重启插件以应用新的启动方式。', 'info');
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