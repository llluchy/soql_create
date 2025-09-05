// SOQL Creator 常量配置类
// 统一管理所有筛选数组和配置常量
// 注意：后台脚本(background.js)需要单独定义ALLOWED_ORIGINS，因为service worker无法访问此文件

class SOQLCreatorConstants {
    constructor() {
        // 标准对象白名单 - 只有在此数组中的标准对象才会显示
        this.STANDARD_OBJECT_WHITELIST = [
            'Account', 
            // 'Activity', 'AlternativePaymentMethod', 'ApiAnomalyEventStore',
            // 'ApprovalSubmission', 'ApprovalSubmissionDetail', 'ApprovalWorkItem',
            // 'Asset', 'AssetAction', 'AssetActionSource', 'AssetRelationship', 'AssetStatePeriod',
            // 'AssociatedLocation', 'AuthorizationForm', 'AuthorizationFormConsent',
            // 'AuthorizationFormDataUse', 'AuthorizationFormText', 'BusinessBrand',
            // 'Campaign', 'CampaignMember', 'CardPaymentMethod', 'Case', 'CaseRelatedIssue',
            // 'ChangeRequest', 'ChangeRequestRelatedItem', 'CommSubscription',
            // 'CommSubscriptionChannelType', 'CommSubscriptionConsent', 'CommSubscriptionTiming',
            // 'ConsumptionRate', 'ConsumptionSchedule', 'Contact', 'ContactPointAddress',
            // 'ContactPointConsent', 'ContactPointEmail', 'ContactPointPhone',
            // 'ContactPointTypeConsent', 'ContactRequest', 'ContentVersion', 'Contract',
            // 'ContractLineItem', 'CredentialStuffingEventStore', 'CreditMemo',
            // 'CreditMemoInvApplication', 'CreditMemoLine', 'Customer', 'DandBCompany',
            // 'DataMaskCustomValueLibrary', 'DataUseLegalBasis', 'DataUsePurpose',
            // 'DigitalWallet', 'DuplicateRecordItem', 'DuplicateRecordSet', 'EmailMessage',
            // 'EngagementChannelType', 'Entitlement', 'EntitlementContact', 'EntityMilestone',
            // 'Event', 'FinanceBalanceSnapshot', 'FinanceTransaction', 'FlowOrchestrationInstance',
            // 'FlowOrchestrationLog', 'FlowOrchestrationStageInstance', 'FlowOrchestrationStepInstance',
            // 'FlowOrchestrationWorkItem', 'GuestUserAnomalyEventStore', 'Image', 'Incident',
            // 'IncidentRelatedItem', 'Individual', 'Invoice', 'InvoiceLine', 'Lead',
            // 'LegalEntity', 'ListEmail', 'Location', 'LocationGroup', 'LocationGroupAssignment',
            // 'Macro', 'MessagingEndUser', 'MessagingSession', 'Opportunity',
            // 'OpportunityContactRole', 'OpportunityLineItem', 'Order', 'OrderItem',
            // 'PartyConsent', 'Payment', 'PaymentAuthAdjustment', 'PaymentAuthorization',
            // 'PaymentGateway', 'PaymentGroup', 'PaymentLineInvoice', 'Pricebook2',
            // 'PricebookEntry', 'PrivacyRTBFRequest', 'Problem', 'ProblemIncident',
            // 'ProblemRelatedItem', 'ProcessException', 'Product2', 'ProductConsumptionSchedule',
            // 'QuickText', 'Recommendation', 'Refund', 'RefundLinePayment', 'ReportAnomalyEventStore',
            // 'Scorecard', 'ScorecardAssociation', 'ScorecardMetric', 'Seller',
            // 'ServiceContract', 'SessionHijackingEventStore', 'SocialPersona', 'Task',
            // 'User', 'UserProvisioningRequest', 'WorkOrder', 'WorkOrderLineItem',
            // 'WorkPlan', 'WorkPlanTemplate', 'WorkPlanTemplateEntry', 'WorkStep',
            // 'WorkStepTemplate'
        ];

        // 允许启用侧边栏的网站域名列表
        this.ALLOWED_ORIGINS = [
            'https://login.salesforce.com',
            'https://test.salesforce.com',
            'https://na1.salesforce.com',
            'https://na2.salesforce.com',
            'https://eu1.salesforce.com',
            'https://eu2.salesforce.com',
            'https://ap1.salesforce.com',
            'https://ap2.salesforce.com'
        ];

        // 其他配置常量
        this.DEFAULT_OBJECT_TYPE = 'business';
        this.DEFAULT_SIDEBAR_BEHAVIOR = 'auto';
    }

    // 检查域名是否在允许列表中
    isAllowedOrigin(origin) {
        return this.ALLOWED_ORIGINS.some(allowedOrigin => 
            origin === allowedOrigin || 
            origin.endsWith('.salesforce.com') ||
            origin.endsWith('.force.com') ||
            origin.endsWith('.lightning.force.com')
        );
    }

    // 检查对象是否在白名单中
    isStandardObjectInWhitelist(objectName) {
        return this.STANDARD_OBJECT_WHITELIST.includes(objectName);
    }
}

// 创建全局常量实例
const SOQL_CONSTANTS = new SOQLCreatorConstants();
