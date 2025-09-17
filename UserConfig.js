// 用户配置管理类
// 使用Chrome Storage API保存和读取用户配置

class UserConfig {
    constructor() {
        this.defaultConfig = {
            // 对象白名单配置
            objectWhitelist: {
                // 完整的白名单对象列表（从 constants.js 动态获取）
                allObjects: [],
                // 选中的对象列表（会显示在侧边栏）
                selectedObjects: []
            },
            // 默认打开方式配置
            defaultOpenMode: {
                // 默认打开方式：'sidepanel' | 'tab'
                mode: 'sidepanel'
            }
        };
    }

    // 获取配置
    async getConfig(key = null) {
        try {
            const result = await chrome.storage.sync.get(key || Object.keys(this.defaultConfig));
            
            if (key) {
                // 返回单个配置项，如果不存在则返回默认值
                return result[key] !== undefined ? result[key] : this.defaultConfig[key];
            } else {
                // 返回所有配置，合并默认值
                return { ...this.defaultConfig, ...result };
            }
        } catch (error) {
            console.error('获取配置失败:', error);
            return key ? this.defaultConfig[key] : this.defaultConfig;
        }
    }

    // 保存配置
    async setConfig(key, value) {
        try {
            const config = {};
            config[key] = value;
            await chrome.storage.sync.set(config);
            console.log(`配置已保存: ${key} = ${JSON.stringify(value)}`);
            return true;
        } catch (error) {
            console.error('保存配置失败:', error);
            return false;
        }
    }

    // 批量保存配置
    async setConfigs(configs) {
        try {
            await chrome.storage.sync.set(configs);
            console.log('批量配置已保存:', configs);
            return true;
        } catch (error) {
            console.error('批量保存配置失败:', error);
            return false;
        }
    }

    // 删除配置
    async removeConfig(key) {
        try {
            await chrome.storage.sync.remove(key);
            console.log(`配置已删除: ${key}`);
            return true;
        } catch (error) {
            console.error('删除配置失败:', error);
            return false;
        }
    }


    // 监听配置变化
    onConfigChanged(callback) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                callback(changes);
            }
        });
    }
}

// 创建全局配置实例
const userConfig = new UserConfig();
