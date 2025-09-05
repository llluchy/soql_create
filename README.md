# SOQL Creator - Salesforce 查询生成器

一个基于 Salesforce Inspector Reloaded 最佳实践的 Chrome 浏览器扩展，帮助 Salesforce 开发者快速生成 SOQL 查询语句。

## 功能特性

- 🔍 **智能对象检测** - 自动检测 Salesforce 页面并获取可用对象
- 📋 **字段管理** - 动态加载对象字段，支持批量选择
- ⚡ **SOQL 生成** - 根据选择的字段自动生成 SOQL 查询
- 🔐 **多种认证方式** - 支持 Cookie 会话和 OAuth2 认证
- 📚 **查询历史** - 保存和快速加载历史查询
- 🎨 **现代化界面** - 美观的侧边栏界面设计

## 安装方法

### 开发者模式安装

1. 下载或克隆此项目到本地
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 启用右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目文件夹

### 生产环境安装

1. 在 Chrome Web Store 搜索 "SOQL Creator"
2. 点击"添加至 Chrome"

## 使用方法

### 基本使用

1. 打开任意 Salesforce 页面（如 Lightning 界面）
2. 点击浏览器工具栏中的 SOQL Creator 图标
3. 在侧边栏中选择要查询的对象
4. 选择需要的字段
5. 复制生成的 SOQL 查询语句

### 高级设置

#### 手动设置 Session ID

如果自动检测失败，可以手动设置 Session ID：

1. 在 Salesforce 页面按 `F12` 打开开发者控制台
2. 在 Console 中输入：
   ```javascript
   console.log('Session ID:', document.cookie.split(';').find(c => c.trim().startsWith('sid='))?.split('=')[1]);
   ```
3. 复制输出的 Session ID
4. 在插件的高级设置中粘贴并点击"设置"

#### OAuth2 认证（可选）

1. 在 Salesforce 中创建 Connected App
2. 配置 OAuth 设置
3. 在插件中使用 OAuth 流程进行认证

## 技术架构

### 核心模块

- **`salesforce-api.js`** - Salesforce API 调用模块
- **`sidepanel.js`** - 主界面逻辑
- **`background.js`** - 后台服务脚本
- **`sidepanel.html`** - 界面模板
- **`sidepanel.css`** - 样式文件

### API 调用机制

基于 Salesforce Inspector Reloaded 的最佳实践：

1. **会话获取** - 使用 `chrome.cookies` API 从后台脚本获取 Session ID
2. **API 调用** - 使用 `XMLHttpRequest` 和正确的认证头
3. **错误处理** - 完善的错误分类和处理机制
4. **OAuth 支持** - 支持 Connected App 集成

### 权限配置

```json
{
  "permissions": [
    "activeTab",
    "storage", 
    "sidePanel",
    "scripting",
    "tabs",
    "cookies"
  ],
  "host_permissions": [
    "https://*.salesforce.com/*",
    "https://*.salesforce-setup.com/*",
    "https://*.force.com/*",
    "https://*.cloudforce.com/*",
    "https://*.visualforce.com/*",
    "https://*.lightning.force.com/*"
  ]
}
```

## 开发指南

### 本地开发

1. 克隆项目到本地
2. 在 Chrome 中加载扩展
3. 修改代码后刷新扩展
4. 使用 Chrome 开发者工具调试

### 调试技巧

- 在 `chrome://extensions/` 中点击"检查视图"查看侧边栏控制台
- 使用 `chrome://extensions/` 中的"检查视图: service worker"调试后台脚本
- 在 Salesforce 页面使用 F12 查看网络请求

### 常见问题

#### Q: 无法获取对象列表？
A: 检查是否在 Salesforce 页面，确认 Session ID 有效，检查用户权限。

#### Q: Session ID 过期怎么办？
A: 重新登录 Salesforce 或使用 OAuth 认证。

#### Q: 权限不足错误？
A: 确保用户有访问元数据的权限，联系 Salesforce 管理员。

## 更新日志

### v1.0.0
- 基于 Salesforce Inspector Reloaded 重构
- 改进权限获取机制
- 优化 API 调用逻辑
- 添加 OAuth2 支持
- 完善错误处理

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 致谢

感谢 Salesforce Inspector Reloaded 项目提供的技术参考和最佳实践。
