/**
 * 统一的对象和字段管理服务类
 * 负责管理Salesforce对象和字段的获取、筛选和缓存
 */
class ObjectService {
    constructor(sfConn, soqlExecutor) {
        this.sfConn = sfConn;
        this.soqlExecutor = soqlExecutor;
        this.fieldsCache = {}; // 字段数据缓存，按对象API名称索引
    }

    /**
     * 获取应用级筛选后的对象列表
     * 只进行应用级筛选：白名单筛选、权限筛选、数据清洗
     * @param {string} sfHost - Salesforce主机名
     * @returns {Promise<Array>} 应用级筛选后的对象列表
     */
    async getApplicationFilteredObjects(sfHost) {
        try {
            // 1. 设置Salesforce连接信息
            this.sfConn.instanceHostname = sfHost;
            
            // 2. 实时获取Session
            console.log('ObjectService: 实时获取Session for host:', sfHost);
            await this.sfConn.getSession(sfHost);
            
            if (!this.sfConn.sessionId) {
                throw new Error('无法获取有效的Salesforce会话，请检查登录状态');
            }
            
            console.log('ObjectService: Session获取成功，开始调用API');
            
            // 3. 调用Salesforce API获取对象列表
            const result = await this.soqlExecutor.getSObjects();
            
            if (!result || !result.sobjects || result.sobjects.length === 0) {
                return [];
            }
            
            // 4. 获取用户配置的白名单设置
            const userConfig = await this.getUserConfig();
            const whitelistConfig = userConfig.objectWhitelist || {
                allObjects: [],
                selectedObjects: []
            };
            
            console.log('ObjectService: 白名单配置:', whitelistConfig);
            
            // 5. 应用级筛选：权限筛选 - 只保留可查询的对象，并按name字母顺序排序
            const queryableObjects = result.sobjects
                .filter(obj => obj.queryable === true && obj.retrieveable === true)
                .map(obj => ({
                    name: obj.name,
                    label: obj.label || obj.name,
                    apiName: obj.name,
                    description: obj.description || '',
                    createable: obj.createable || false,
                    updateable: obj.updateable || false,
                    deletable: obj.deletable || false,
                    custom: obj.custom || false // 是否是自定义对象
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
            // 6. 应用级筛选：白名单筛选
            const whitelistFilteredObjects = queryableObjects.filter(obj => {
                // 首先判断是否有白名单，如果没有白名单，那么筛选也就不生效了
                if (whitelistConfig.selectedObjects.length === 0) {
                    return true;
                } else {
                    // 如果有白名单，那么判断数据是否是标准对象
                    const isStandardObject = obj.custom === false;
                    // 如果是标准对象，那么进行筛选
                    if (isStandardObject) {
                        return whitelistConfig.selectedObjects.includes(obj.name);
                    } else {
                        // 如果是自定义对象，那么直接显示所有自定义对象
                        return true;
                    }
                }
            });
            
            // 7. 应用级筛选：数据清洗 - 过滤掉Share对象
            const cleanedObjects = whitelistFilteredObjects.filter(obj => {
                const objectType = this.getObjectType(obj);
                return objectType !== 'share';
            });
            
            console.log(`ObjectService: 应用级筛选结果: ${cleanedObjects.length}/${queryableObjects.length} 个对象`);
            
            // 8. 按标签排序
            return cleanedObjects.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));
            
        } catch (error) {
            console.error('ObjectService: 获取对象列表失败:', error);
            throw error;
        }
    }

    /**
     * 获取用户配置
     * @returns {Promise<Object>} 用户配置对象
     */
    async getUserConfig() {
        try {
            const result = await chrome.storage.sync.get(Object.keys(SOQL_CONSTANTS.DEFAULT_CONFIG));
            // 合并默认配置
            return { ...SOQL_CONSTANTS.DEFAULT_CONFIG, ...result };
        } catch (error) {
            console.error('ObjectService: 获取用户配置失败:', error);
            return SOQL_CONSTANTS.DEFAULT_CONFIG;
        }
    }

    /**
     * 分类对象类型
     * @param {string} objectName - 对象名称
     * @returns {string} 对象类型
     */
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

    /**
     * 获取指定对象的字段列表
     * @param {string} objectApiName - 对象的API名称
     * @returns {Promise<Object>} 字段数据映射
     */
    async getObjectFields(objectApiName) {
        try {
            // 检查缓存
            if (this.fieldsCache[objectApiName]) {
                console.log(`ObjectService: 从缓存获取字段 ${objectApiName}`);
                return this.fieldsCache[objectApiName];
            }
            
            console.log(`ObjectService: 获取对象字段 ${objectApiName}`);
            
            // 调用Salesforce API获取对象字段描述
            const result = await this.soqlExecutor.describeSObject(objectApiName);
            
            if (result && result.fields && result.fields.length > 0) {
                // 过滤出可查询的字段
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
                this.fieldsCache[objectApiName] = fieldsMap;
                
                console.log(`ObjectService: 成功获取 ${Object.keys(fieldsMap).length} 个字段`);
                return fieldsMap;
            }
            
            return {};
        } catch (error) {
            console.error(`ObjectService: 获取字段失败 ${objectApiName}:`, error);
            throw error;
        }
    }

    /**
     * 页面级筛选对象列表
     * 只处理页面级筛选：搜索筛选、类型筛选
     * @param {Array} objects - 应用级筛选后的对象列表
     * @param {Object} filters - 页面级筛选条件
     * @returns {Array} 页面级筛选后的对象列表
     */
    filterObjectsForPage(objects, filters = {}) {
        let filteredObjects = [...objects];
        
        // 页面级筛选：按对象类型筛选
        if (filters.objectType && filters.objectType !== 'all') {
            filteredObjects = filteredObjects.filter(obj => {
                const objectType = this.getObjectType(obj);
                return objectType === filters.objectType;
            });
        }
        
        // 页面级筛选：按搜索关键词筛选
        if (filters.searchTerm) {
            const searchTerm = filters.searchTerm.toLowerCase().trim();
            filteredObjects = filteredObjects.filter(obj => {
                const labelMatch = obj.label.toLowerCase().includes(searchTerm);
                const apiMatch = obj.name.toLowerCase().includes(searchTerm);
                return labelMatch || apiMatch;
            });
        }
        
        // 按标签名称排序
        return filteredObjects.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));
    }

    /**
     * 筛选字段列表
     * @param {Object} fields - 字段映射
     * @param {Object} filters - 筛选条件
     * @returns {Array} 筛选后的字段列表
     */
    filterFields(fields, filters = {}) {
        let fieldList = Object.values(fields);
        
        // 按字段类型筛选
        if (filters.fieldType && filters.fieldType !== 'all') {
            fieldList = fieldList.filter(field => {
                if (filters.fieldType === 'custom') {
                    return field.custom === true;
                } else if (filters.fieldType === 'standard') {
                    return field.custom === false;
                } else if (filters.fieldType === 'required') {
                    return field.required === true;
                }
                return true;
            });
        }
        
        // 按搜索关键词筛选
        if (filters.searchTerm) {
            const searchTerm = filters.searchTerm.toLowerCase().trim();
            fieldList = fieldList.filter(field => {
                const nameMatch = field.name.toLowerCase().includes(searchTerm);
                const labelMatch = field.label.toLowerCase().includes(searchTerm);
                return nameMatch || labelMatch;
            });
        }
        
        // 按字段名称排序
        return fieldList.sort((a, b) => a.label.localeCompare(b.label));
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
     * 获取常用字段列表
     * @param {string} objectApiName - 对象API名称
     * @returns {Array} 常用字段名称列表
     */
    getCommonFields(objectApiName) {
        // 通用常用字段
        const commonFields = ['Id', 'Name'];
        
        const fieldMap = {
            'Account': ['Type', 'Industry', 'Phone', 'Website'],
            'Contact': ['FirstName', 'LastName', 'Email', 'Phone', 'AccountId'],
            'Opportunity': ['StageName', 'Amount', 'CloseDate', 'AccountId'],
            'Case': ['Status', 'Priority', 'Origin', 'Subject', 'AccountId'],
            'Lead': ['Status', 'Company', 'Email', 'Phone', 'FirstName', 'LastName'],
            'Task': ['Subject', 'Status', 'Priority', 'ActivityDate', 'WhoId', 'WhatId'],
            'Event': ['Subject', 'StartDateTime', 'EndDateTime', 'WhoId', 'WhatId'],
            'User': ['Username', 'Email', 'FirstName', 'LastName', 'IsActive', 'ProfileId']
        };
        
        // 根据对象类型添加特定常用字段
        const specificFields = fieldMap[objectApiName] || [];
        
        return [...commonFields, ...specificFields];
    }

    /**
     * 清除字段缓存
     * @param {string} objectApiName - 对象API名称，如果不指定则清除所有缓存
     */
    clearFieldsCache(objectApiName = null) {
        if (objectApiName) {
            delete this.fieldsCache[objectApiName];
            console.log(`ObjectService: 清除字段缓存 ${objectApiName}`);
        } else {
            this.fieldsCache = {};
            console.log('ObjectService: 清除所有字段缓存');
        }
    }

    /**
     * 初始化用户白名单配置
     * 首次使用时，将硬编码的默认值保存到云配置
     * @returns {Promise<boolean>} 是否成功初始化
     */
    async initializeUserWhitelist() {
        try {
            const currentConfig = await this.getUserConfig();
            
            // 检查是否已经初始化过
            if (currentConfig.objectWhitelist && 
                currentConfig.objectWhitelist.selectedObjects && 
                currentConfig.objectWhitelist.selectedObjects.length > 0) {
                console.log('ObjectService: 用户白名单已初始化，跳过');
                return true;
            }
            
            // 使用硬编码的默认值初始化
            const whitelistConfig = {
                allObjects: SOQL_CONSTANTS.STANDARD_OBJECT_WHITELIST,
                selectedObjects: SOQL_CONSTANTS.DEFAULT_SELECTED_OBJECTS
            };
            
            // 直接保存到云配置
            await chrome.storage.sync.set({
                objectWhitelist: whitelistConfig
            });
            
            console.log('ObjectService: 用户白名单初始化完成:', whitelistConfig);
            return true;
            
        } catch (error) {
            console.error('ObjectService: 初始化用户白名单失败:', error);
            return false;
        }
    }
}

// 导出类
window.ObjectService = ObjectService;
