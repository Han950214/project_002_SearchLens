# 真实实现与数据流审计

审计日期：2026-07-15

## 构建与入口

- `package.json`：版本 `0.1.0`；无 runtime `dependencies`；WXT 0.19.29 负责构建。
- `wxt.config.ts`：manifest 元数据、`storage` 权限、四档图标和 Chrome MV3 输出配置。
- `entrypoints/baidu.content/index.ts`：唯一页面 content script，匹配 `https://www.baidu.com/s*`、`https://baidu.com/s*`。
- `entrypoints/background.ts`：service worker，只处理本地存储消息和打开 options。
- `entrypoints/options/*`：本地设置、偏好导入/导出、清空和重置。
- `entrypoints/popup/*`：显示本地启用状态并打开 options。
- 构建 manifest：MV3；无 optional permissions、额外 host permissions、web accessible resources 或远程入口。

## 页面数据读取与本地处理

content script 只在百度“网页”搜索结果路径运行。它读取：

- `#kw` 中当前搜索词；
- `#content_left` 内公开显示的结果容器；
- 结果标题、`href`/页面数据属性、展示 URL、域名、摘要和原始顺序；
- 页面可见性、当前搜索 Tab、推广标记和百度系内容标记；
- SearchLens 自身面板状态，以避免重复解析和重复注入。

`src/adapters/baidu/*` 在 content script 上下文解析、去重并标准化结果；`src/scoring/*` 使用包内启发式规则、查询意图、实体匹配、页面信号和用户偏好执行评分与排序。结果直接渲染回当前页面。处理不离开用户设备。

## 保存内容与位置

只使用 `chrome.storage.local`：

- `searchlens:settings`：enabled、recommendationLimit、warnThirdPartyDownloadSites、showConfidence、showReasons、schemaVersion、updatedAt；
- `searchlens:domainPreferences`：用户主动配置的标准化域名到 `promote`/`demote`/`hide` 的映射。

不保存搜索词、搜索结果、页面摘要、浏览历史或点击记录。options 的导出操作仅在用户主动操作时生成本地 Blob 下载；导入只读取用户选择的本地 JSON 文件。

## 网络、共享与远程代码

- 扩展运行时源代码（`entrypoints/`、`src/`、`wxt.config.ts`）中没有 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、analytics、telemetry、crash reporting、远程配置、动态远程 import、外部脚本、外部字体、外部图片或 CDN。`assets/release/source/verify-package-smoke.mjs` 仅作为发布验证工具，使用 Puppeteer 与其 bundled Chrome for Testing，在 Windows TEMP 隔离 Profile 中通过 `pipe: true` 和 `enableExtensions: [extensionPath]` 加载当前构建，并访问真实公开百度搜索页验证扩展加载、单实例、面板、query、推荐、options 与错误状态；它不开放 TCP CDP 调试端口，不使用 WebSocket CDP 连接或 CDP `Fetch` 页面拦截，不访问用户现有 Chrome Profile，临时 Puppeteer、Chrome for Testing 与 Profile 均位于 TEMP，且该脚本及其临时通信不进入扩展构建或发布 ZIP，也不改变扩展无网络端点、无远程代码、无 analytics 的运行时结论。
- 构建 chunk 中的 `fetch(m.href)` 是 WXT/Vite 的 modulepreload helper，仅加载扩展包内同源模块；没有固定外部 endpoint。
- 推荐标题链接来自当前页面公开结果。只有用户主动点击时才由 Chrome 进行普通页面导航；SearchLens 不拦截、不记录、不上传该点击。
- 无账号、远程服务器、第三方共享、数据出售或人工读取通道。
- 所有可执行逻辑均包含在扩展 ZIP 中；无 `eval`、`new Function` 或从远程来源取得并执行的逻辑。

## 权限结论

- `storage` 有真实调用方且是本地偏好功能所必需，不能删除。
- 原 `host_permissions` 覆盖百度全站 `/*`，没有 fetch 或其他扩展 API 调用方，且宽于 content script 的 `/s*`；已删除。
- 两条 content script matches 对应带 `www` 与不带 `www` 的百度网页搜索路径，是当前单一用途的最小站点范围。
- `browser.tabs.create()` 只用于打开扩展自身 options 的 fallback，不读取标签页元数据，不需要 `tabs` 权限。

## 数据类型结论

- 搜索词：读取并在当前页本地处理；不持久化、不传输。
- 浏览活动：只感知当前匹配页及当前“网页”Tab，以提供面板；不读取或建立完整浏览历史，不传输。
- 点击记录：不收集；偏好按钮只保存用户选择的域名规则。
- 页面内容：读取公开结果并即时处理；不持久化、不传输。
- 用户偏好：保存到当前 Chrome profile 的 `chrome.storage.local`；不离开设备。

结论：`user_data_flow_verified=yes`、`remote_code=no`、未发现未披露网络请求。
