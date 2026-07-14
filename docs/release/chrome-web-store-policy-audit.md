# Chrome Web Store 官方政策审计

核对日期：2026-07-15（Asia/Shanghai）

范围：仅使用 Google/Chrome 官方一手资料；结论以当前仓库源代码和 `.output/chrome-mv3` 构建产物为证据。

| 页面标题 | 官方 URL | 与 SearchLens 有关的要求 | 当前满足 | 仓库证据 | 必要修正 |
| --- | --- | --- | --- | --- | --- |
| Chrome Web Store - Program Policies | https://developer.chrome.com/docs/webstore/program-policies | 全部产品体验、代码和营销材料应安全、诚实、有用并遵守 Developer Agreement | 是 | 本审计、`PRIVACY.md`、发布文案、测试与素材 | 无 |
| Program Policies | https://developer.chrome.com/docs/webstore/program-policies/policies | 准确元数据；测试无崩溃；单一用途说明；有效联系方式；用户数据合规 | 部分 | `wxt.config.ts`、`docs/release/`、既有 smoke 结论 | 公开联系方式需用户提供 |
| Quality guidelines | https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines | 扩展必须有狭窄、易理解的单一用途；应辅助而非劫持浏览/搜索体验 | 是 | 仅在百度网页搜索结果页显示可关闭面板；不改默认搜索引擎 | 无 |
| Privacy Policies | https://developer.chrome.com/docs/webstore/program-policies/privacy | 处理任何用户数据时必须提供准确、最新且完整披露收集、使用、共享对象的隐私政策 | 部分 | `PRIVACY.md` 与代码数据流一致 | 发布前补公开联系信息和公网 URL |
| Limited Use | https://developer.chrome.com/docs/webstore/program-policies/limited-use | 数据仅用于披露的单一用途；浏览活动仅可用于显著描述的用户可见功能；禁止不当传输、出售和广告用途 | 是 | 页面数据只在本地用于当前页推荐；无传输、共享、广告或画像 | 无 |
| Updated Privacy Policy & Secure Handling Requirements | https://developer.chrome.com/docs/webstore/program-policies/user-data-faq | 即使仅本地处理也需披露；处理用户数据需隐私政策；填写 Limited Use 认证 | 部分 | `PRIVACY.md`、privacy disclosure | 后台认证和 URL 由用户完成 |
| Fill out the privacy fields | https://developer.chrome.com/docs/webstore/cws-dashboard-privacy | 填写单一用途、逐项权限说明、remote code、数据类型、Limited Use 和隐私政策链接 | 部分 | `chrome-web-store-privacy-disclosure.md` | 用户登录后台后按文档填写 |
| Prepare your extension | https://developer.chrome.com/docs/webstore/prepare | 检查 name/version/icons/description；ZIP 根目录直接含 manifest | 部分 | 构建 manifest 已检查；图标已补齐 | 用户输入完成后才提升版本并生成最终 ZIP |
| Publish in the Chrome Web Store | https://developer.chrome.com/docs/webstore/publish | 上传 ZIP，填写 Listing/Privacy/Distribution/Test instructions，再提交审核；可 deferred publishing | 用户操作 | `chrome-web-store-release-checklist.md`、review notes | 不由 Codex 执行 |
| Supplying Images | https://developer.chrome.com/docs/webstore/images | 128 PNG 图标需合理透明边距；截图 1280×800、方角、全出血；小型宣传图 440×280，品牌优先、少文字 | 是 | `public/icons/`、`assets/release/`、inventory | 无 |
| Creating a great listing page | https://developer.chrome.com/docs/webstore/best-listing | 标题简洁准确；摘要不超过 132 字符；说明准确；截图反映最新真实体验；避免关键词堆砌 | 是 | listing、三张真实 UI 状态素材 | 无 |
| Chrome Web Store review process | https://developer.chrome.com/docs/webstore/review-process | 审核检查政策、权限与代码；宽泛主机权限、敏感权限或难审代码会增加审查 | 是 | 已移除无调用方的宽泛 `host_permissions`；无敏感权限、混淆或远程代码 | 无 |
| Google Chrome Web Store Developer Agreement | https://developer.chrome.com/docs/webstore/program-policies/terms | 发布者需有有效账号、接受协议、具有授权并不侵犯隐私或知识产权 | 用户操作 | 原创素材与第三方 notice 已准备 | 开发者本人接受协议并确认发布权利 |
| Use of Permissions | https://developer.chrome.com/docs/webstore/program-policies/permissions | 只请求实现当前功能所需的最窄权限，不为未来功能预留权限 | 是 | 仅 `storage`；content script 仅匹配两条百度 `/s*` URL | 无 |
| Additional Requirements for Manifest V3 | https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements | 功能逻辑需包含在包内；禁止从远程来源加载或执行逻辑 | 是 | 无外部脚本、动态远程逻辑、`eval` 或远程配置；构建为 MV3 | 无 |

## SearchLens 结论

- 单一用途：在百度网页搜索结果页本地分析公开搜索结果，并提供辅助性的可信度参考、推荐排序和用户偏好控制。
- 体验边界：不替换搜索引擎、不隐藏原始结果、不宣称安全检测、认证、AI 或云端分析。
- 政策修正：删除没有运行时调用方且宽于 content script 范围的 `host_permissions`；补齐图标、披露、隐私、许可证和商店材料。
- 未完成项：公开支持邮箱、开发者名称、隐私政策公网 URL 和开发者后台操作。
