# Chrome Web Store Privacy practices 填写稿

## Single purpose

中文：在百度网页搜索结果页本地分析公开搜索结果，并提供辅助性的可信度参考、推荐排序和用户偏好控制。

English: Locally analyzes public results on Baidu web search pages to provide assistive trust references, recommendation ordering, and user preference controls.

## 权限与主机范围说明

| 项目 | 真实调用方 | 必要性与可否删除/缩小 | 中文说明 | English justification |
| --- | --- | --- | --- | --- |
| `storage` | `src/storage/chrome-local-storage-adapter.ts`；`entrypoints/options/main.ts` | 保存设置和用户主动配置的域名偏好；当前功能必需，不能删除；使用 `local` 而非 `sync`，已最小 | 用于在当前浏览器中保存显示设置和用户主动设置的域名提升、降低、隐藏偏好。不会保存搜索词、浏览记录或点击记录。 | Stores display settings and user-selected domain promote, demote, and hide preferences in this browser only. It does not store search queries, browsing history, or click history. |
| content script `https://www.baidu.com/s*` | `entrypoints/baidu.content/index.ts` | 读取当前网页搜索结果并插入面板；单一用途必需；已缩小到 `/s*` | 仅在 `www.baidu.com` 的网页搜索结果路径读取当前公开结果并显示 SearchLens 面板。 | Runs only on `www.baidu.com` web-search result paths to read the currently visible public results and show the SearchLens panel. |
| content script `https://baidu.com/s*` | `entrypoints/baidu.content/index.ts` | 支持不带 `www` 的等价搜索结果 URL；单一用途必需；已缩小到 `/s*` | 仅在不带 `www` 的百度网页搜索结果路径执行同一项本地功能。 | Runs the same local feature only on equivalent Baidu web-search result paths without `www`. |
| `host_permissions` | 无 | 无调用方；已从构建来源删除 | 不申请额外主机权限。 | No additional host permissions are requested. |
| `optional_permissions` | 无 | 不需要 | 不申请。 | None requested. |
| `web_accessible_resources` | 无 | 不需要 | 不申请。 | None declared. |
| background service worker | `entrypoints/background.ts` | 仅封装本地存储消息和打开设置页；不联网 | 后台仅处理本地设置与打开扩展设置页。 | The service worker only handles local settings messages and opens the extension's options page. |

`browser.tabs.create()` 只在 `openOptionsPage()` 失败时创建扩展自身的设置页，不读取标签页信息，因此不需要也不申请 `tabs` 权限。

## Remote code

选择：No, I am not using remote code.

说明：所有逻辑都包含在扩展包中。无远程脚本、CDN、远程模块、`eval`、字符串执行器或远程配置。构建产物中的 modulepreload helper 只加载扩展包内同源模块，不连接外部端点。

## 数据类型勾选建议

基于 Chrome 对“本地处理也属于 handling”的口径，建议在 Privacy practices 中披露：

- Website content：是。处理当前百度网页搜索结果页中公开显示的搜索词、标题、链接、域名、摘要、排名和页面标记。
- Web history：是（保守口径）。仅处理当前匹配页 URL/内容以提供显著展示的当前页功能，不读取或保存完整浏览历史。
- User activity：否。扩展不记录点击、键盘、滚动或网络活动；用户点击链接只触发普通导航。
- Personal communications、Authentication information、Financial and payment information、Health information、Location：否。

后台实际分类名称可能调整；若界面用词变化，以“如实披露当前页网站内容和当前匹配页浏览活动、无传输”为原则。

## Limited Use certification

- 数据只用于上述单一用途：是。
- 数据不会用于与单一用途无关的广告、画像、信用判断或市场研究：是。
- 不向第三方转移或出售数据：是。
- 不允许人工读取用户数据：是；开发者没有服务器端数据可读。
- 不上传搜索词、搜索结果、浏览记录、点击记录或域名偏好：是。
- 不使用 analytics、telemetry 或 crash reporting：是。

## 浏览活动说明

扩展只在用户访问匹配的百度网页搜索结果页时读取当前页面的公开搜索词和结果，以在同一页面显示辅助面板。数据在设备本地即时处理，不建立跨页面浏览记录，不保存点击记录，不传输给开发者或第三方。

## 隐私政策与后台操作

开发者名称：SearchLens。支持邮箱：`826124445@qq.com`。

隐私政策目标 URL：`https://han950214.github.io/project_002_SearchLens/privacy/`。仓库已准备 `docs/privacy/index.md`，但只有用户 push、在 GitHub Pages 选择 Deploy from branch → `main` → `/docs`，并在未登录窗口确认目标 URL 可直接访问后，才可把它作为已上线 URL 填入 Privacy policy 字段。

随后由用户逐项填写并复核 single purpose、permission justifications、remote code、data usage 和 Limited Use certification。Codex 不登录、不代填、不上传、不提交。
