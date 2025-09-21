/**
 * Salesforce字段模型类
 * 封装Salesforce字段的属性和行为
 * 使用面向对象设计模式，将API返回的原始数据转换为项目内部对象
 */
class SalesforceField {
    /**
     * 构造函数
     * @param {Object} rawData - Salesforce API返回的原始字段数据
     */
    constructor(rawData) {
        // 基础属性
        this.name = rawData.name || '';
        this.label = rawData.label || rawData.name || '';
        this.type = rawData.type || 'string';
        this.length = rawData.length || 0;
        this.precision = rawData.precision || 0;
        this.scale = rawData.scale || 0;
        
        // 字段类型属性 - 核心转换逻辑
        this.fieldType = this._determineFieldType(rawData);
        
        // 权限属性
        this.createable = rawData.createable || false;
        this.updateable = rawData.updateable || false;
        this.filterable = rawData.filterable || false;
        this.sortable = rawData.sortable || false;
        this.groupable = rawData.groupable || false;
        this.aggregatable = rawData.aggregatable || false;
        
        // 业务属性
        this.required = rawData.nillable === false;
        this.unique = rawData.unique || false;
        this.custom = rawData.custom || false;
        this.deprecatedAndHidden = rawData.deprecatedAndHidden || false;
        
        // 关系属性
        this.referenceTo = rawData.referenceTo || [];
        this.relationshipName = rawData.relationshipName || null;
        this.relationshipOrder = rawData.relationshipOrder || null;
        this.relationshipLabel = rawData.relationshipLabel || null;
        
        // 选择列表属性
        this.picklistValues = rawData.picklistValues || [];
        this.dependentPicklist = rawData.dependentPicklist || false;
        this.restrictedPicklist = rawData.restrictedPicklist || false;
        
        // 其他属性
        this.soapType = rawData.soapType || '';
        this.inlineHelpText = rawData.inlineHelpText || '';
        this.defaultValue = rawData.defaultValue || null;
        this.calculated = rawData.calculated || false;
        this.calculatedFormula = rawData.calculatedFormula || '';
        this.cascadeDelete = rawData.cascadeDelete || false;
        this.restrictedDelete = rawData.restrictedDelete || false;
        this.trackFeedHistory = rawData.trackFeedHistory || false;
        this.trackHistory = rawData.trackHistory || false;
        this.trackTrending = rawData.trackTrending || false;
        this.unique = rawData.unique || false;
        this.caseSensitive = rawData.caseSensitive || false;
        this.externalId = rawData.externalId || false;
        this.displayLocationInDecimal = rawData.displayLocationInDecimal || false;
        this.encrypted = rawData.encrypted || false;
        this.maskType = rawData.maskType || null;
        this.maskChar = rawData.maskChar || null;
        this.maskLength = rawData.maskLength || null;
        this.extraTypeInfo = rawData.extraTypeInfo || null;
    }

    /**
     * 确定字段类型
     * 将Salesforce的type属性转换为项目内部的字段类型
     * @param {Object} rawData - 原始数据
     * @returns {string} 字段类型
     */
    _determineFieldType(rawData) {
        const type = rawData.type || '';
        const custom = rawData.custom || false;
        
        // 1. 自定义字段
        if (custom === true) {
            return 'custom';
        }
        
        // 2. 标准字段
        if (custom === false) {
            return 'standard';
        }
        
        // 3. 根据类型进一步分类
        const typeMap = {
            'id': 'id',
            'string': 'text',
            'textarea': 'text',
            'longtextarea': 'text',
            'richtextarea': 'rich_text',
            'url': 'url',
            'email': 'email',
            'phone': 'phone',
            'int': 'number',
            'double': 'number',
            'currency': 'currency',
            'percent': 'percent',
            'date': 'date',
            'datetime': 'datetime',
            'time': 'time',
            'boolean': 'boolean',
            'picklist': 'picklist',
            'multipicklist': 'multipicklist',
            'combobox': 'combobox',
            'reference': 'lookup',
            'masterrecord': 'master_detail',
            'rollupsummary': 'rollup_summary',
            'location': 'location',
            'address': 'address',
            'base64': 'file',
            'blob': 'file'
        };
        
        return typeMap[type.toLowerCase()] || 'unknown';
    }

    /**
     * 获取字段类型的中文描述
     * @returns {string} 中文描述
     */
    getFieldTypeDescription() {
        const typeMap = {
            'custom': '自定义字段',
            'standard': '标准字段',
            'id': 'ID字段',
            'text': '文本字段',
            'rich_text': '富文本字段',
            'url': 'URL字段',
            'email': '邮箱字段',
            'phone': '电话字段',
            'number': '数字字段',
            'currency': '货币字段',
            'percent': '百分比字段',
            'date': '日期字段',
            'datetime': '日期时间字段',
            'time': '时间字段',
            'boolean': '布尔字段',
            'picklist': '选择列表',
            'multipicklist': '多选列表',
            'combobox': '组合框',
            'lookup': '查找关系',
            'master_detail': '主从关系',
            'rollup_summary': '汇总字段',
            'location': '位置字段',
            'address': '地址字段',
            'file': '文件字段',
            'unknown': '未知类型'
        };
        return typeMap[this.fieldType] || '未知类型';
    }

    /**
     * 获取字段类型的英文描述
     * @returns {string} 英文描述
     */
    getFieldTypeLabel() {
        const typeMap = {
            'custom': 'Custom Field',
            'standard': 'Standard Field',
            'id': 'ID Field',
            'text': 'Text Field',
            'rich_text': 'Rich Text Field',
            'url': 'URL Field',
            'email': 'Email Field',
            'phone': 'Phone Field',
            'number': 'Number Field',
            'currency': 'Currency Field',
            'percent': 'Percent Field',
            'date': 'Date Field',
            'datetime': 'DateTime Field',
            'time': 'Time Field',
            'boolean': 'Boolean Field',
            'picklist': 'Picklist',
            'multipicklist': 'Multi-Select Picklist',
            'combobox': 'Combobox',
            'lookup': 'Lookup Relationship',
            'master_detail': 'Master-Detail Relationship',
            'rollup_summary': 'Rollup Summary Field',
            'location': 'Location Field',
            'address': 'Address Field',
            'file': 'File Field',
            'unknown': 'Unknown Type'
        };
        return typeMap[this.fieldType] || 'Unknown Type';
    }

    /**
     * 判断是否为自定义字段
     * @returns {boolean} 是否为自定义字段
     */
    isCustomField() {
        return this.fieldType === 'custom';
    }

    /**
     * 判断是否为标准字段
     * @returns {boolean} 是否为标准字段
     */
    isStandardField() {
        return this.fieldType === 'standard';
    }

    /**
     * 判断是否为关系字段
     * @returns {boolean} 是否为关系字段
     */
    isRelationshipField() {
        return this.fieldType === 'lookup' || this.fieldType === 'master_detail';
    }

    /**
     * 判断是否为选择列表字段
     * @returns {boolean} 是否为选择列表字段
     */
    isPicklistField() {
        return this.fieldType === 'picklist' || this.fieldType === 'multipicklist' || this.fieldType === 'combobox';
    }

    /**
     * 判断是否为数字字段
     * @returns {boolean} 是否为数字字段
     */
    isNumberField() {
        return this.fieldType === 'number' || this.fieldType === 'currency' || this.fieldType === 'percent';
    }

    /**
     * 判断是否为文本字段
     * @returns {boolean} 是否为文本字段
     */
    isTextField() {
        return this.fieldType === 'text' || this.fieldType === 'rich_text' || this.fieldType === 'url' || 
               this.fieldType === 'email' || this.fieldType === 'phone';
    }

    /**
     * 判断是否为日期字段
     * @returns {boolean} 是否为日期字段
     */
    isDateField() {
        return this.fieldType === 'date' || this.fieldType === 'datetime' || this.fieldType === 'time';
    }

    /**
     * 判断是否可查询
     * @returns {boolean} 是否可查询
     */
    isQueryable() {
        return this.sortable === true && !this.deprecatedAndHidden;
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
     * 判断是否可过滤
     * @returns {boolean} 是否可过滤
     */
    isFilterable() {
        return this.filterable === true;
    }

    /**
     * 判断是否可排序
     * @returns {boolean} 是否可排序
     */
    isSortable() {
        return this.sortable === true;
    }

    /**
     * 判断是否可分组
     * @returns {boolean} 是否可分组
     */
    isGroupable() {
        return this.groupable === true;
    }

    /**
     * 判断是否可聚合
     * @returns {boolean} 是否可聚合
     */
    isAggregatable() {
        return this.aggregatable === true;
    }

    /**
     * 获取字段的显示名称
     * @returns {string} 显示名称
     */
    getDisplayName() {
        return this.label || this.name;
    }

    /**
     * 获取字段的完整信息
     * @returns {Object} 完整信息对象
     */
    getFullInfo() {
        return {
            name: this.name,
            label: this.label,
            type: this.type,
            fieldType: this.fieldType,
            fieldTypeDescription: this.getFieldTypeDescription(),
            fieldTypeLabel: this.getFieldTypeLabel(),
            length: this.length,
            precision: this.precision,
            scale: this.scale,
            required: this.required,
            unique: this.unique,
            custom: this.custom,
            createable: this.createable,
            updateable: this.updateable,
            filterable: this.filterable,
            sortable: this.sortable,
            groupable: this.groupable,
            aggregatable: this.aggregatable,
            deprecatedAndHidden: this.deprecatedAndHidden,
            referenceTo: this.referenceTo,
            relationshipName: this.relationshipName,
            picklistValues: this.picklistValues,
            inlineHelpText: this.inlineHelpText,
            isCustomField: this.isCustomField(),
            isStandardField: this.isStandardField(),
            isRelationshipField: this.isRelationshipField(),
            isPicklistField: this.isPicklistField(),
            isNumberField: this.isNumberField(),
            isTextField: this.isTextField(),
            isDateField: this.isDateField(),
            isQueryable: this.isQueryable(),
            isCreateable: this.isCreateable(),
            isUpdateable: this.isUpdateable(),
            isFilterable: this.isFilterable(),
            isSortable: this.isSortable(),
            isGroupable: this.isGroupable(),
            isAggregatable: this.isAggregatable(),
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
     * @returns {SalesforceField} 字段实例
     */
    static fromJSON(jsonString) {
        const data = JSON.parse(jsonString);
        return new SalesforceField(data);
    }

    /**
     * 批量创建字段数组
     * @param {Array} rawDataArray - 原始数据数组
     * @returns {Array<SalesforceField>} 字段数组
     */
    static createArray(rawDataArray) {
        if (!Array.isArray(rawDataArray)) {
            return [];
        }
        return rawDataArray.map(rawData => new SalesforceField(rawData));
    }

    /**
     * 过滤字段数组
     * @param {Array<SalesforceField>} fields - 字段数组
     * @param {Object} filters - 过滤条件
     * @returns {Array<SalesforceField>} 过滤后的数组
     */
    static filter(fields, filters = {}) {
        if (!Array.isArray(fields)) {
            return [];
        }

        return fields.filter(field => {
            // 按字段类型过滤
            if (filters.fieldType && filters.fieldType !== 'all') {
                if (filters.fieldType === 'custom' && !field.isCustomField()) {
                    return false;
                }
                if (filters.fieldType === 'standard' && !field.isStandardField()) {
                    return false;
                }
                if (filters.fieldType === 'required' && !field.required) {
                    return false;
                }
            }

            // 按搜索关键词过滤
            if (filters.searchTerm) {
                const searchTerm = filters.searchTerm.toLowerCase().trim();
                const nameMatch = field.name.toLowerCase().includes(searchTerm);
                const labelMatch = field.label.toLowerCase().includes(searchTerm);
                if (!nameMatch && !labelMatch) {
                    return false;
                }
            }

            // 按权限过滤
            if (filters.requireQueryable && !field.isQueryable()) {
                return false;
            }

            if (filters.requireCreateable && !field.isCreateable()) {
                return false;
            }

            if (filters.requireUpdateable && !field.isUpdateable()) {
                return false;
            }

            if (filters.requireFilterable && !field.isFilterable()) {
                return false;
            }

            if (filters.requireSortable && !field.isSortable()) {
                return false;
            }

            return true;
        });
    }

    /**
     * 排序字段数组
     * @param {Array<SalesforceField>} fields - 字段数组
     * @param {string} sortBy - 排序字段
     * @param {string} sortOrder - 排序顺序 ('asc' | 'desc')
     * @returns {Array<SalesforceField>} 排序后的数组
     */
    static sort(fields, sortBy = 'label', sortOrder = 'asc') {
        if (!Array.isArray(fields)) {
            return [];
        }

        return fields.sort((a, b) => {
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
    module.exports = SalesforceField;
} else {
    window.SalesforceField = SalesforceField;
}
