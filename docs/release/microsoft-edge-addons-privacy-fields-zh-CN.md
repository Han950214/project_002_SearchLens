# Microsoft Edge Partner Center 隐私字段填写稿（zh-CN）

以下文本按 Microsoft 2026 年新版独立 Privacy 页面准备，同时保留旧版 Properties UI 可能出现的字段。应由用户在 Partner Center 中逐项核对并粘贴；Codex 不登录、不代填、不上传、不提交。

## Single Purpose Description

可直接粘贴：

> SearchLens CN 在百度网页搜索结果页本地分析当前公开显示的搜索结果，并提供辅助性的可信度参考、推荐排序和用户主动设置的域名提升、降低、隐藏偏好控制。它不替换搜索引擎，不阻断原始结果，不提供与该用途无关的功能。

## Permission justification

### storage

可直接粘贴：

> `storage` 仅用于在当前 Microsoft Edge 配置文件中保存显示设置，以及用户主动设置的域名 promote、demote、hide 偏好。扩展不把搜索词、搜索结果、浏览历史或点击记录保存到 storage，也不上传任何设置或偏好。该权限是设置页和域名偏好功能所必需的最小权限。

### Content script site access

若 Partner Center 显示站点范围说明，可直接粘贴：

> 内容脚本只在 `https://baidu.com/s*` 和 `https://www.baidu.com/s*` 运行，用于读取当前页面公开显示的搜索词和搜索结果，并在同一页面显示 SearchLens 辅助面板。扩展不申请额外 `host_permissions` 或 `<all_urls>`。

## Remote code

选择：

> No, I am not using remote code.

依据：

- 所有可执行代码均包含在上传 ZIP 中；
- 无远程脚本、远程模块、动态远程 import 或 CDN 可执行代码；
- 无 `eval`、`new Function` 或字符串代码执行器；
- 无远程配置或服务器下发规则；
- WXT modulepreload helper 只处理包内同源模块，不连接外部代码端点。

## Data usage

Microsoft 当前页面询问 “What user data do you plan to collect from users now or in the future?”。为避免因为“不上传”而隐瞒页面访问，采用保守披露：

### 应选择

- **Website content**：选择。扩展读取当前百度搜索结果页公开显示的搜索词、标题、链接、域名、摘要、排名和页面标记，在本地生成当前页面板。
- **Web history**：选择（保守口径）。扩展感知当前匹配页 URL 与当前“网页”Tab，以提供显著展示的当前页功能；它不读取或建立完整浏览历史。

### 不应选择

- Personally identifiable information：不选择；不处理姓名、地址、邮箱、年龄或身份证明号码。
- Health information：不选择。
- Financial and payment information：不选择。
- Authentication information：不选择；无账号、密码、凭据或 PIN。
- Personal communications：不选择。
- Location：不选择；不读取精确位置或设备附近信息。
- User activity：不选择；不记录点击、鼠标位置、滚动、按键或网络监控数据。用户对 promote/demote/hide 按钮的选择是本地功能状态，不形成行为追踪或画像。

### 本地访问与收集/传输的区分

搜索词、公开结果和当前页 URL 只在页面内存中即时访问和处理，不写入持久化存储，不传输给开发者、Microsoft 或其他第三方。显示设置和域名偏好只存入当前 Edge Profile 的 `chrome.storage.local`；这是 Chromium 扩展 API 名称，不表示数据发送到 Chrome 或 Google。

### 必须勾选的三项认证

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

补充事实：不出售、不共享、不用于广告、信用、贷款或保险，不用于与单一用途无关的个性化，不建立用户画像；无开发者服务器端人工读取通道。

## Privacy Policy URL

> https://han950214.github.io/project_002_SearchLens/privacy/

提交前在未登录窗口确认 URL 可直接访问、内容最新且支持邮箱可见。

## 旧版 Properties UI 填写稿

### Privacy policy requirements

选择：

> Yes

原因：Microsoft 旧字段把 access、collect、transmit 并列。SearchLens 会访问当前页面中的搜索词和公开结果，因此应保守选择 Yes；这不表示数据会被上传。

### Privacy policy URL

> https://han950214.github.io/project_002_SearchLens/privacy/

### Website

> https://han950214.github.io/project_002_SearchLens/

### Support contact detail

> 826124445@qq.com

### Mature content

> No
