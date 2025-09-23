// SOQL查询执行器和相关工具类模块

/**
 * SOQL查询执行器
 * 负责执行SOQL查询、SOSL搜索和对象描述操作
 */
class SOQLExecutor {
    constructor(sfConn) {
        this.sfConn = sfConn;
        this.apiVersion = window.apiVersion || "64.0"; // 使用全局API版本
    }

    // 执行SOQL查询
    async executeSOQL(query, options = {}) {
        const {
            useToolingApi = false,
            includeDeleted = false
        } = options;

        let endpoint;
        if (useToolingApi) {
            endpoint = `/services/data/v${this.apiVersion}/tooling/query/`;
        } else if (includeDeleted) {
            endpoint = `/services/data/v${this.apiVersion}/queryAll/`;
        } else {
            endpoint = `/services/data/v${this.apiVersion}/query/`;
        }

        const url = `${endpoint}?q=${encodeURIComponent(query)}`;
        
        try {
            const result = await this.sfConn.rest(url);
            return result;
        } catch (error) {
            throw error;
        }
    }

    // 执行SOSL搜索
    async executeSOSL(searchQuery) {
        const url = `/services/data/v${this.apiVersion}/search/?q=${encodeURIComponent(searchQuery)}`;
        
        try {
            const result = await this.sfConn.rest(url);
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * 获取对象字段列表
     * Transfer-Encoding: chunked 
     * Content-Type: application/json; 
     * charset=UTF-8 Server:
     * {
     *     "name" : "Account",
     *     "fields" : [
     *         {
     *             "length" : 18,
     *             "name" : "Id",
     *             "type" : "id",
     *             "defaultValue" : { "value" : null },
     *             "updateable" : false,
     *             "label" : "Account ID",
     *             ...
     *         },
     *         ...
     *     ],
     *     "updateable" : true,
     *     "label" : "Account",
     *     ...
     *     "urls" : {  
     *         "uiEditTemplate" : "https://MyDomainName.my.salesforce.com/{ID}/e",  
     *         "sobject" : "/services/data/v65.0/sobjects/Account",  
     *         "uiDetailTemplate" : "https://MyDomainName.my.salesforce.com/{ID}",  
     *         "describe" : "/services/data/v65.0/sobjects/Account/describe",  
     *         "rowTemplate" : "/services/data/v65.0/sobjects/Account/{ID}",  
     *         "uiNewRecord" : "https://MyDomainName.my.salesforce.com/001/e"
     *     },
     *     "childRelationships" : [ 
     *         {  
     *             "field" : "ParentId",  
     *             "deprecatedAndHidden" : false,  
     *             ...
     *         }, 
     *         ...
     *     ],
     *     "createable" : true,
     *     "customSetting" : false,
     *     ...
     * }
     * @returns {Array} 对象字段列表
     */
    async getObjectFields(sobjectName) {
        const url = `/services/data/v${this.apiVersion}/sobjects/${sobjectName}/fields/`;
        
        try {
            const result = await this.sfConn.rest(url);
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * 获取对象描述信息
     * Transfer-Encoding: chunked 
     * Content-Type: application/json; 
     * charset=UTF-8 Server:
     * {
     *  "name" : "Account",
     *  "fields" : [
     *     {
     *       "length" : 18,
     *       "name" : "Id",
     *       "type" : "id",
     *       "defaultValue" : { "value" : null },
     *       "updateable" : false,
     *       "label" : "Account ID",
     *       ...
     *     },
     *     ...
     *   ],
     *   "updateable" : true,
     *   "label" : "Account",
     *   ...
     *   "urls" : {  
     *     "uiEditTemplate" : "https://MyDomainName.my.salesforce.com/{ID}/e",  
     *     "sobject" : "/services/data/v65.0/sobjects/Account",  
     *     "uiDetailTemplate" : "https://MyDomainName.my.salesforce.com/{ID}",  
     *     "describe" : "/services/data/v65.0/sobjects/Account/describe",  
     *     "rowTemplate" : "/services/data/v65.0/sobjects/Account/{ID}",  
     *     "uiNewRecord" : "https://MyDomainName.my.salesforce.com/001/e"
     *   },
     *   "childRelationships" : [ 
     *     {  
     *       "field" : "ParentId",  
     *       "deprecatedAndHidden" : false,  
     *       ...
     *     }, 
     *     ...
     *   ],
     *   "createable" : true,
     *   "customSetting" : false,
     *   ...
     * }
     */
    async describeSObject(sobjectName) {
        const url = `/services/data/v${this.apiVersion}/sobjects/${sobjectName}/describe/`;
        
        try {
            const result = await this.sfConn.rest(url);
            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * 获取所有对象列表
     * Transfer-Encoding: chunked 
     * Content-Type: application/json; 
     * charset=UTF-8 Server:
     * {
     *  "encoding" : "UTF-8",
     *  "maxBatchSize" : 200,
     *  "sobjects" : [ {
     *     "name" : "Account",
     *     "label" : "Account",
     *     "custom" : false,
     *     "keyPrefix" : "001",
     *     "updateable" : true,
     *     "searchable" : true,
     *     "labelPlural" : "Accounts",
     *     "layoutable" : true,
     *     "activateable" : false,
     *     "urls" : { "sobject" : "/services/data/v65.0/sobjects/Account",
     *     "describe" : "/services/data/v65.0/sobjects/Account/describe",
     *     "rowTemplate" : "/services/data/v65.0/sobjects/Account/{ID}" },
     *     "createable" : true,
     *     "customSetting" : false,
     *     "deletable" : true,
     *     "deprecatedAndHidden" : false,
     *     "feedEnabled" : false,
     *     "mergeable" : true,
     *     "queryable" : true,
     *     "replicateable" : true,
     *     "retrieveable" : true,
     *     "undeletable" : true,
     *     "triggerable" : true },
     *    },
     * ...
     * }
     * @returns {Array} 对象列表
     */
    async getSObjects() {
        const url = `/services/data/v${this.apiVersion}/sobjects/`;
        
        try {
            const result = await this.sfConn.rest(url);
            return result;
        } catch (error) {
            throw error;
        }
    }
}


// 导出类
window.SOQLExecutor = SOQLExecutor;
