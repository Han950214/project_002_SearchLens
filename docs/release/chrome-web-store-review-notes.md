# Chrome Web Store 审核说明

## 产品与单一用途

SearchLens CN 在百度网页搜索结果页本地分析当前公开结果，显示辅助性的可信度参考、推荐排序和用户偏好控制。它不替换默认搜索引擎，不隐藏或阻断百度原始结果，也不声称安全检测、认证、AI 或云端分析。

## 测试环境

- Chrome for Testing 150.0.7871.24
- Puppeteer 25.3.0
- 隔离 TEMP Profile
- 单一 SearchLens 扩展实例
- 已完成真实百度四批 smoke；SearchLens console errors = 0，service worker errors = 0
- 最终构建最小 package smoke：扩展加载成功；受控百度网页搜索页单面板；query/推荐正确；设置页从面板打开；SearchLens 错误为 0
- 记录口径：`automation_harness_error=yes`、`product_runtime_error=no`、`live_baidu_verified=yes`

早期自动化重试中的百度验证码、`ERR_BLOCKED_BY_ORB`、Mixed Content warning 和 harness FAIL 不属于 SearchLens 产品运行时故障，不应作为代码修复依据。

## 审核员复现步骤

1. 安装扩展并确认工具栏中出现 SearchLens CN。
2. 打开 `https://www.baidu.com/`，使用非敏感公开测试词（例如 `Python download`）进行网页搜索。
3. 确认页面最多出现一个 SearchLens 面板，且百度原始结果仍可正常使用。
4. 检查面板中的当前搜索词、推荐条目、可信度参考和“查看原因”。
5. 对某个域名依次尝试“提升”“降低”或“隐藏”，确认当前面板更新。
6. 从扩展弹窗打开设置页，调整推荐数量或显示选项；返回搜索页确认设置生效。
7. 关闭面板后触发页面局部变化，确认本页不会自动重新打开面板。

无需账号、付费、外部服务、测试凭据或特殊地理位置。

## 权限与数据

- `storage`：只保存本地显示设置和用户主动配置的域名偏好。
- content script：只匹配 `https://www.baidu.com/s*` 和 `https://baidu.com/s*`。
- 不申请额外 host permissions 或敏感权限。
- 搜索词、结果标题/链接/域名/摘要/顺序和页面标记只在本地即时处理。
- 不上传搜索词、浏览记录或点击记录；不共享或出售数据；无 analytics、广告、remote code 或远程配置。

Privacy practices 的逐项填写稿见 `chrome-web-store-privacy-disclosure.md`。公开隐私政策 URL 与支持邮箱必须由开发者在后台填写，Codex 不登录或代填。

## 数据披露建议

保守披露 Website content 与当前匹配页的 Web history；User activity 选择否。选择“No remote code”，并完成 Limited Use 全部认证。后台字段名称若更新，应以当前真实代码行为为准，不得弱化本地页面内容处理披露。
