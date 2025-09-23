/**
 * 错误处理类
 * 负责统一处理各种错误情况
 */
class ErrorHandler {
    static handle(error, context = "") {
        
        if (error.message.includes("Unauthorized")) {
            this.showTokenError();
        } else if (error.message.includes("Forbidden")) {
            this.showPermissionError();
        } else if (error.message.includes("Network error")) {
            this.showNetworkError();
        } else {
            this.showGenericError(error.message);
        }
    }

    static showTokenError() {
        const message = "访问令牌已过期，请重新生成";
        this.showNotification(message, "warning");
    }

    static showPermissionError() {
        const message = "没有足够的权限执行此操作";
        this.showNotification(message, "error");
    }

    static showNetworkError() {
        const message = "网络连接失败，请检查网络连接";
        this.showNotification(message, "error");
    }

    static showGenericError(message) {
        this.showNotification(`操作失败: ${message}`, "error");
    }

    static showNotification(message, type = "info") {
        if (window.soqlCreator) {
            window.soqlCreator.showMessage(message, type);
        }
    }
}

window.ErrorHandler = ErrorHandler;