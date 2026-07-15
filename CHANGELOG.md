# Changelog

## Unreleased

- 收窄 Chrome 权限：移除没有运行时调用方的宽泛 `host_permissions`，仅保留百度网页搜索结果页的静态 content script 匹配。
- 补齐原创扩展图标、Chrome Web Store 截图和小型宣传图。
- 补齐隐私、政策、权限、许可证、商店文案、审核说明和发布检查清单。
- 补充公开开发者名称、支持邮箱及 GitHub Pages 隐私政策静态页面准备稿。
- 将包级 smoke 改为 TEMP 中的 Puppeteer 25.3.0 与 bundled Chrome for Testing，使用 pipe transport、隔离 Profile 和 `enableExtensions`。
- 保持版本 `0.1.0`：该版本从未上传 Chrome Web Store，本轮只完成首发候选包准备，不表示已经发布或提交审核。

## 0.1.0

- 建立 SearchLens CN 本地搜索结果解析、可信度参考、推荐排序和域名偏好能力。
