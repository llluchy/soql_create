/**
 * Salesforce对象模型类
 * 封装Salesforce对象的属性和行为
 * 使用面向对象设计模式，将API返回的原始数据转换为项目内部对象
 */
class SalesforceObject {
    /**
     * 构造函数
     * @param {Object} rawData - Salesforce API返回的原始对象数据
     */
    constructor(rawData) {
        // 基础属性
        this.name = rawData.name || '';
        this.label = rawData.label || rawData.name || '';
        this.apiName = rawData.name || '';
        this.description = rawData.description || '';
        
        // 权限属性
        this.createable = rawData.createable || false;
        this.updateable = rawData.updateable || false;
        this.deletable = rawData.deletable || false;
        this.queryable = rawData.queryable || false;
        this.retrieveable = rawData.retrieveable || false;
        
        // 对象类型属性 - 核心转换逻辑
        this.objectType = this._determineObjectType(rawData);
        
        // 其他属性
        this.custom = rawData.custom || false;
        this.keyPrefix = rawData.keyPrefix || '';
        this.labelPlural = rawData.labelPlural || '';
        this.activateable = rawData.activateable || false;
        this.undeletable = rawData.undeletable || false;
        this.mergeable = rawData.mergeable || false;
        this.replicateable = rawData.replicateable || false;
        this.triggerable = rawData.triggerable || false;
        this.searchable = rawData.searchable || false;
        this.feedEnabled = rawData.feedEnabled || false;
        this.retrieveable = rawData.retrieveable || false;
        this.deletable = rawData.deletable || false;
        this.createable = rawData.createable || false;
        this.updateable = rawData.updateable || false;
        this.deprecatedAndHidden = rawData.deprecatedAndHidden || false;
        this.associateEntityType = rawData.associateEntityType || '';
        this.associateParentEntity = rawData.associateParentEntity || '';
    }

    /**
     * 确定对象类型
     * 将Salesforce的custom属性转换为项目内部的对象类型
     * @param {Object} rawData - 原始数据
     * @returns {string} 对象类型
     */
    _determineObjectType(rawData) {
        const objectName = rawData.name || '';
        
        // 1. 自定义对象 (custom === true)
        if (rawData.custom === true) {
            return 'custom';
        }
        
        // 2. 自定义元数据类型 (以__mdt结尾)
        if (objectName.endsWith('__mdt')) {
            return 'custom_metadata';
        }
        
        // 3. Share对象 (以__Share结尾)
        if (objectName.endsWith('__Share')) {
            return 'share';
        }
        
        // 4. 系统对象 (以__开头的其他对象)
        if (objectName.startsWith('__')) {
            return 'system';
        }
        
        // 5. 标准对象 (custom === false 且不在上述分类中)
        if (rawData.custom === false) {
            return 'standard';
        }
        
        // 6. 默认分类
        return 'standard';
    }

    /**
     * 获取对象类型的中文描述
     * @returns {string} 中文描述
     */
    getObjectTypeDescription() {
        const typeMap = {
            'custom': '自定义对象',
            'custom_metadata': '自定义元数据类型',
            'share': '共享对象',
            'system': '系统对象',
            'standard': '标准对象'
        };
        return typeMap[this.objectType] || '未知类型';
    }

    /**
     * 获取对象类型的英文描述
     * @returns {string} 英文描述
     */
    getObjectTypeLabel() {
        const typeMap = {
            'custom': 'Custom Object',
            'custom_metadata': 'Custom Metadata Type',
            'share': 'Share Object',
            'system': 'System Object',
            'standard': 'Standard Object'
        };
        return typeMap[this.objectType] || 'Unknown Type';
    }

    /**
     * 判断是否为业务对象
     * @returns {boolean} 是否为业务对象
     */
    isBusinessObject() {
        return this.objectType === 'custom' || this.objectType === 'standard';
    }

    /**
     * 判断是否为系统对象
     * @returns {boolean} 是否为系统对象
     */
    isSystemObject() {
        return this.objectType === 'system' || this.objectType === 'share';
    }

    /**
     * 判断是否为元数据对象
     * @returns {boolean} 是否为元数据对象
     */
    isMetadataObject() {
        return this.objectType === 'custom_metadata';
    }

    /**
     * 判断是否可查询
     * @returns {boolean} 是否可查询
     */
    isQueryable() {
        return this.queryable === true && this.retrieveable === true;
    }

    /**
     * 判断是否可创建
     * @returns {boolean} 是否可创建
     */
    isCreateable() {
        return this.createable === true;
    }

    /**
     * 判断是否可更新
     * @returns {boolean} 是否可更新
     */
    isUpdateable() {
        return this.updateable === true;
    }

    /**
     * 判断是否可删除
     * @returns {boolean} 是否可删除
     */
    isDeletable() {
        return this.deletable === true;
    }

    /**
     * 获取对象的显示名称
     * @returns {string} 显示名称
     */
    getDisplayName() {
        return this.label || this.name || this.apiName;
    }

    /**
     * 获取对象的完整信息
     * @returns {Object} 完整信息对象
     */
    getFullInfo() {
        return {
            name: this.name,
            label: this.label,
            apiName: this.apiName,
            description: this.description,
            objectType: this.objectType,
            objectTypeDescription: this.getObjectTypeDescription(),
            objectTypeLabel: this.getObjectTypeLabel(),
            createable: this.createable,
            updateable: this.updateable,
            deletable: this.deletable,
            queryable: this.queryable,
            retrieveable: this.retrieveable,
            custom: this.custom,
            isBusinessObject: this.isBusinessObject(),
            isSystemObject: this.isSystemObject(),
            isMetadataObject: this.isMetadataObject(),
            isQueryable: this.isQueryable(),
            isCreateable: this.isCreateable(),
            isUpdateable: this.isUpdateable(),
            isDeletable: this.isDeletable(),
            displayName: this.getDisplayName()
        };
    }

    /**
     * 转换为JSON字符串
     * @returns {string} JSON字符串
     */
    toJSON() {
        return JSON.stringify(this.getFullInfo());
    }

    /**
     * 从JSON字符串创建对象
     * @param {string} jsonString - JSON字符串
     * @returns {SalesforceObject} 对象实例
     */
    static fromJSON(jsonString) {
        const data = JSON.parse(jsonString);
        return new SalesforceObject(data);
    }

    /**
     * 批量创建对象数组
     * @param {Array} rawDataArray - 原始数据数组
     * @returns {Array<SalesforceObject>} 对象数组
     */
    static createArray(rawDataArray) {
        if (!Array.isArray(rawDataArray)) {
            return [];
        }
        return rawDataArray.map(rawData => new SalesforceObject(rawData));
    }

    /**
     * 过滤对象数组
     * @param {Array<SalesforceObject>} objects - 对象数组
     * @param {Object} filters - 过滤条件
     * @returns {Array<SalesforceObject>} 过滤后的数组
     */
    static filter(objects, filters = {}) {
        if (!Array.isArray(objects)) {
            return [];
        }

        return objects.filter(obj => {
            // 按对象类型过滤
            if (filters.objectType && filters.objectType !== 'all') {
                if (obj.objectType !== filters.objectType) {
                    return false;
                }
            }

            // 按搜索关键词过滤
            if (filters.searchTerm) {
                const searchTerm = filters.searchTerm.toLowerCase().trim();
                const nameMatch = obj.name.toLowerCase().includes(searchTerm);
                const labelMatch = obj.label.toLowerCase().includes(searchTerm);
                if (!nameMatch && !labelMatch) {
                    return false;
                }
            }

            // 按权限过滤
            if (filters.requireQueryable && !obj.isQueryable()) {
                return false;
            }

            if (filters.requireCreateable && !obj.isCreateable()) {
                return false;
            }

            if (filters.requireUpdateable && !obj.isUpdateable()) {
                return false;
            }

            if (filters.requireDeletable && !obj.isDeletable()) {
                return false;
            }

            return true;
        });
    }

    /**
     * 排序对象数组
     * @param {Array<SalesforceObject>} objects - 对象数组
     * @param {string} sortBy - 排序字段
     * @param {string} sortOrder - 排序顺序 ('asc' | 'desc')
     * @returns {Array<SalesforceObject>} 排序后的数组
     */
    static sort(objects, sortBy = 'label', sortOrder = 'asc') {
        if (!Array.isArray(objects)) {
            return [];
        }

        return objects.sort((a, b) => {
            let aValue = a[sortBy] || '';
            let bValue = b[sortBy] || '';

            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
            }
            if (typeof bValue === 'string') {
                bValue = bValue.toLowerCase();
            }

            if (sortOrder === 'desc') {
                return bValue > aValue ? 1 : -1;
            } else {
                return aValue > bValue ? 1 : -1;
            }
        });
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SalesforceObject;
} else {
    window.SalesforceObject = SalesforceObject;
}
