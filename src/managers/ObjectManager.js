/**
 * 对象管理器类
 * 统一管理Salesforce对象的获取、筛选、缓存等操作
 * 使用面向对象设计模式，封装对象相关的业务逻辑
 */
class ObjectManager {
    /**
     * 构造函数
     * @param {Object} objectService - 对象服务实例
     */
    constructor(objectService) {
        this.objectService = objectService;
        this.objectsCache = new Map(); // 对象缓存
        this.fieldsCache = new Map(); // 字段缓存
        this.lastUpdateTime = null; // 最后更新时间
        this.cacheExpiry = 5 * 60 * 1000; // 缓存过期时间（5分钟）
    }

    /**
     * 获取应用级筛选后的对象列表
     * @param {string} sfHost - Salesforce主机名
     * @returns {Promise<Array<SalesforceObject>>} 对象数组
     */
    async getApplicationFilteredObjects(sfHost) {
        try {
            // 检查缓存
            const cacheKey = `objects_${sfHost}`;
            if (this.isCacheValid(cacheKey)) {
                console.log('ObjectManager: 从缓存获取对象列表');
                return this.objectsCache.get(cacheKey);
            }

            console.log('ObjectManager: 从API获取对象列表');
            
            // 从API获取原始数据
            const rawObjects = await this.objectService.getApplicationFilteredObjects(sfHost);
            
            // 转换为SalesforceObject对象
            const objects = SalesforceObject.createArray(rawObjects);
            
            // 缓存结果
            this.objectsCache.set(cacheKey, objects);
            this.lastUpdateTime = Date.now();
            
            console.log(`ObjectManager: 成功获取 ${objects.length} 个对象`);
            return objects;
            
        } catch (error) {
            console.error('ObjectManager: 获取对象列表失败:', error);
            throw error;
        }
    }

    /**
     * 获取指定对象的字段列表
     * @param {string} objectApiName - 对象API名称
     * @returns {Promise<Array<SalesforceField>>} 字段数组
     */
    async getObjectFields(objectApiName) {
        try {
            // 检查缓存
            const cacheKey = `fields_${objectApiName}`;
            if (this.isCacheValid(cacheKey)) {
                console.log(`ObjectManager: 从缓存获取字段 ${objectApiName}`);
                return this.fieldsCache.get(cacheKey);
            }

            console.log(`ObjectManager: 从API获取字段 ${objectApiName}`);
            
            // 从API获取原始数据
            const rawFields = await this.objectService.getObjectFields(objectApiName);
            
            // 转换为SalesforceField对象数组
            const fields = SalesforceField.createArray(Object.values(rawFields));
            
            // 缓存结果
            this.fieldsCache.set(cacheKey, fields);
            
            console.log(`ObjectManager: 成功获取 ${fields.length} 个字段`);
            return fields;
            
        } catch (error) {
            console.error(`ObjectManager: 获取字段失败 ${objectApiName}:`, error);
            throw error;
        }
    }

    /**
     * 页面级筛选对象
     * @param {Array<SalesforceObject>} objects - 对象数组
     * @param {Object} filters - 筛选条件
     * @returns {Array<SalesforceObject>} 筛选后的对象数组
     */
    filterObjects(objects, filters = {}) {
        return SalesforceObject.filter(objects, filters);
    }

    /**
     * 页面级筛选字段
     * @param {Array<SalesforceField>} fields - 字段数组
     * @param {Object} filters - 筛选条件
     * @returns {Array<SalesforceField>} 筛选后的字段数组
     */
    filterFields(fields, filters = {}) {
        return SalesforceField.filter(fields, filters);
    }

    /**
     * 排序对象数组
     * @param {Array<SalesforceObject>} objects - 对象数组
     * @param {string} sortBy - 排序字段
     * @param {string} sortOrder - 排序顺序
     * @returns {Array<SalesforceObject>} 排序后的对象数组
     */
    sortObjects(objects, sortBy = 'label', sortOrder = 'asc') {
        return SalesforceObject.sort(objects, sortBy, sortOrder);
    }

    /**
     * 排序字段数组
     * @param {Array<SalesforceField>} fields - 字段数组
     * @param {string} sortBy - 排序字段
     * @param {string} sortOrder - 排序顺序
     * @returns {Array<SalesforceField>} 排序后的字段数组
     */
    sortFields(fields, sortBy = 'label', sortOrder = 'asc') {
        return SalesforceField.sort(fields, sortBy, sortOrder);
    }

    /**
     * 获取常用字段
     * @param {string} objectApiName - 对象API名称
     * @returns {Array<string>} 常用字段名称数组
     */
    getCommonFields(objectApiName) {
        return this.objectService.getCommonFields(objectApiName);
    }

    /**
     * 获取对象类型
     * @param {SalesforceObject} object - 对象实例
     * @returns {string} 对象类型
     */
    getObjectType(object) {
        return object.objectType;
    }

    /**
     * 获取字段类型
     * @param {SalesforceField} field - 字段实例
     * @returns {string} 字段类型
     */
    getFieldType(field) {
        return field.fieldType;
    }

    /**
     * 检查缓存是否有效
     * @param {string} cacheKey - 缓存键
     * @returns {boolean} 缓存是否有效
     */
    isCacheValid(cacheKey) {
        if (!this.lastUpdateTime) {
            return false;
        }
        
        const now = Date.now();
        const timeDiff = now - this.lastUpdateTime;
        
        if (timeDiff > this.cacheExpiry) {
            return false;
        }
        
        return this.objectsCache.has(cacheKey) || this.fieldsCache.has(cacheKey);
    }

    /**
     * 清除缓存
     * @param {string} cacheKey - 缓存键，如果不指定则清除所有缓存
     */
    clearCache(cacheKey = null) {
        if (cacheKey) {
            this.objectsCache.delete(cacheKey);
            this.fieldsCache.delete(cacheKey);
            console.log(`ObjectManager: 清除缓存 ${cacheKey}`);
        } else {
            this.objectsCache.clear();
            this.fieldsCache.clear();
            this.lastUpdateTime = null;
            console.log('ObjectManager: 清除所有缓存');
        }
    }

    /**
     * 获取缓存统计信息
     * @returns {Object} 缓存统计信息
     */
    getCacheStats() {
        return {
            objectsCacheSize: this.objectsCache.size,
            fieldsCacheSize: this.fieldsCache.size,
            lastUpdateTime: this.lastUpdateTime,
            cacheExpiry: this.cacheExpiry,
            isCacheValid: this.lastUpdateTime ? (Date.now() - this.lastUpdateTime) < this.cacheExpiry : false
        };
    }

    /**
     * 设置缓存过期时间
     * @param {number} expiryTime - 过期时间（毫秒）
     */
    setCacheExpiry(expiryTime) {
        this.cacheExpiry = expiryTime;
        console.log(`ObjectManager: 设置缓存过期时间为 ${expiryTime}ms`);
    }

    /**
     * 获取对象统计信息
     * @param {Array<SalesforceObject>} objects - 对象数组
     * @returns {Object} 统计信息
     */
    getObjectStats(objects) {
        if (!Array.isArray(objects)) {
            return {
                total: 0,
                byType: {},
                byPermission: {}
            };
        }

        const stats = {
            total: objects.length,
            byType: {},
            byPermission: {
                queryable: 0,
                createable: 0,
                updateable: 0,
                deletable: 0
            }
        };

        objects.forEach(obj => {
            // 按类型统计
            const type = obj.objectType;
            stats.byType[type] = (stats.byType[type] || 0) + 1;

            // 按权限统计
            if (obj.isQueryable()) stats.byPermission.queryable++;
            if (obj.isCreateable()) stats.byPermission.createable++;
            if (obj.isUpdateable()) stats.byPermission.updateable++;
            if (obj.isDeletable()) stats.byPermission.deletable++;
        });

        return stats;
    }

    /**
     * 获取字段统计信息
     * @param {Array<SalesforceField>} fields - 字段数组
     * @returns {Object} 统计信息
     */
    getFieldStats(fields) {
        if (!Array.isArray(fields)) {
            return {
                total: 0,
                byType: {},
                byPermission: {}
            };
        }

        const stats = {
            total: fields.length,
            byType: {},
            byPermission: {
                queryable: 0,
                createable: 0,
                updateable: 0,
                filterable: 0,
                sortable: 0,
                groupable: 0,
                aggregatable: 0
            }
        };

        fields.forEach(field => {
            // 按类型统计
            const type = field.fieldType;
            stats.byType[type] = (stats.byType[type] || 0) + 1;

            // 按权限统计
            if (field.isQueryable()) stats.byPermission.queryable++;
            if (field.isCreateable()) stats.byPermission.createable++;
            if (field.isUpdateable()) stats.byPermission.updateable++;
            if (field.isFilterable()) stats.byPermission.filterable++;
            if (field.isSortable()) stats.byPermission.sortable++;
            if (field.isGroupable()) stats.byPermission.groupable++;
            if (field.isAggregatable()) stats.byPermission.aggregatable++;
        });

        return stats;
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ObjectManager;
} else {
    window.ObjectManager = ObjectManager;
}
