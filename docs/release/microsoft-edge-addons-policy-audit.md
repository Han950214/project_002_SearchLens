# Microsoft Edge Add-ons 官方政策与兼容性审计

核对日期：2026-07-16（Asia/Shanghai）

范围：仅使用 Microsoft 官方一手资料；实现结论以当前仓库源码、正式构建和真实 Microsoft Edge 隔离测试为证据。

## 官方资料

| 页面标题 | 官方 URL | 与 SearchLens 有关的要求 | 当前满足 | 仓库证据 | 是否需要修正 |
| --- | --- | --- | --- | --- | --- |
| Publish a Microsoft Edge extension | https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension | 上传根目录含 manifest 的 ZIP；manifest 名称与简短说明进入 Listing；详细说明 250–10,000 字符；Logo 推荐 300×300；宣传图 440×280；截图 640×480 或 1280×800；填写 Properties、Privacy、Listing 与认证说明 | 是 | 构建 manifest、Edge 文案、Privacy 填写稿、认证说明、素材清单、发布清单 | 后台上传与选择仍由用户完成 |
| Port a Chrome extension to Microsoft Edge | https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension | 核对 API 支持；移除 `update_url`；名称或说明不得错误引用 Chrome；必须在 Edge 侧载测试 | 是 | `update_url` 缺失；manifest 无 Chrome 字样；使用正式版 Edge 对候选包测试 | 无 |
| Sideload an extension to install and test it locally | https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading | Developer mode 下从含 `manifest.json` 的目录加载 unpacked 扩展并测试 | 是 | 候选 ZIP 解压根目录直接含 manifest；正式版 Edge 以隔离 TEMP Profile 加载同一目录 | 无 |
| Developer policies for the Microsoft Edge Add-ons store | https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies | 单一狭窄用途；元数据准确；功能稳定可测试；最小权限；不误导、不冒充；准确披露页面与浏览活动；隐私政策保持最新 | 是 | 当前单一用途、仅 `storage`、两条百度 `/s*` matches、无敏感权限；隐私与认证稿；自动化和实机验证 | 无；共享隐私政策中的 `chrome.storage.local` 是 Chromium 扩展 API 名称，Edge 填写稿使用 Microsoft Edge 表述 |
| Curation and review process for extensions at Microsoft Edge Add-ons | https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/add-ons-curation | Listing 的描述、截图、发布者和隐私链接应准确；质量、相关性和体验影响展示与审核 | 是 | 固定文案、原创素材、发布者与隐私字段均已准备 | 无 |
| Submission states for extensions at Microsoft Edge Add-ons | https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/submission-states | Draft、In review、Waiting to publish、In the store、Review failed 等状态不得混淆 | 是 | 发布清单保留上传、Publish、审核反馈为用户操作 | 无；0.1.0 已上传但未发布，仍是草稿；0.1.1 尚未上传，不能声称已进入审核 |
| Overview and timelines for migrating to Manifest V3 | https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/manifest-v3 | 新扩展使用 MV3；后台采用 service worker；所有可执行逻辑在包内；禁止远程代码 | 是 | `manifest_version=3`、`background.service_worker`、无远程脚本或动态远程 import | 无 |
| Supported APIs for Microsoft Edge extensions | https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support | 核对实际使用的扩展 API 在 Edge MV3/Windows 上受支持 | 是 | 实际使用 `runtime`、`storage`、`tabs.create`；均在官方列表中支持 MV3 Windows | 无 |

Microsoft 当前发布文档与旧流程的主要变化是：Privacy 已从 Properties 的两个字段逐步迁移到独立 Privacy 页面，包含 Single Purpose、Permission justification、Remote code、Data usage 和 Privacy policy。本文档按新流程准备，同时保留旧 Properties 字段稿。

## Manifest 与 API 兼容性

- 构建目标：Chromium Manifest V3；`.output/chrome-mv3` 目录名不代表 Chrome 专属运行时。
- API：`chrome.storage.local`、`browser.runtime` 和 `browser.tabs.create` 均由 Microsoft Edge MV3 支持；`tabs.create` 只打开扩展自身 options，不读取标签信息，因此不申请 `tabs` 权限。
- `update_url`：缺失，符合从 Chrome 移植到 Edge 的官方要求。
- `key`：缺失；不固化开发机扩展 ID。
- `default_locale`：`zh_CN`；包内包含 `_locales/zh_CN/messages.json`，使 Partner Center 可从扩展 manifest 识别简体中文。
- CSP：未声明自定义 CSP，使用 MV3 默认扩展 CSP；无远程脚本、`eval` 或 `new Function`。
- permissions：仅 `storage`。
- host permissions：无。
- content script matches：`https://baidu.com/s*`、`https://www.baidu.com/s*`。
- `web_accessible_resources`、`optional_permissions`、`externally_connectable`：均无。
- name：`__MSG_extensionName__`；description：`__MSG_extensionDescription__`；在 `zh_CN` locale 中分别解析为 `SearchLens CN` 与 `在百度网页搜索结果页本地提供可信度参考、推荐排序与偏好控制。`，均无 Chrome 专用、第三方官方、AI、云端或安全认证表述。
- 网络：扩展源码没有 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、analytics、telemetry、crash reporting、远程配置、外部字体、外部图片或 CDN。构建 chunk 的 modulepreload helper 只可能读取包内同源模块，不是外部 endpoint。
- 结论：无需 Edge adapter、Edge scoring、Edge recommendation、Edge runtime registry 或第二套 manifest 生成框架；Chrome 与 Edge 共享同一套运行时代码、评分、实体/意图规则、推荐、storage、百度 adapter、UI 和 runtime 生命周期。

## 依赖与许可证

Edge 0.1.1 候选包相对既有 Chrome Web Store 0.1.0 包仅增加 `zh_CN` locale 并更新 manifest 元数据与版本，没有 Edge 专用运行时代码或新增依赖。复用 `dependency-license-audit.md`：WXT 0.19.29 为 MIT；实际分发的 `webextension-polyfill` 0.12.0 为 MPL-2.0；包内保留 `THIRD_PARTY_NOTICES.txt`。未发现未知许可证、禁止商业分发的依赖或未经授权品牌素材。

## 真实 Edge 证据

- Edge 路径：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。
- Edge 版本：`150.0.4078.65`。
- 实际启动进程：同一 `msedge.exe`。
- 加载方式：Puppeteer `pipe: true` 驱动正式版 Edge，以 unpacked development load 加载候选 ZIP 的 TEMP 解压目录；未开放 TCP CDP 端口。
- Profile：每次使用新的 Windows TEMP Profile；未访问用户现有 Edge Profile；结束后关闭进程并删除 Profile。
- Edge 150 的 `edge://extensions` WebUI 没有向 CDP DOM 暴露命令行加载项；这只影响自动读取管理页卡片，不影响一个 live service worker、固定 extension ID、content script 执行与业务行为证据。
- 原生加载：候选扩展成功加载，extension ID 为 `elhmgnkggfcdlcjkajlkennfgjiljlpl`，单实例，service worker 正常，load errors 为 0；MV3、`runtime`、`storage` 与 `tabs.create` API 在 Edge 中正常。
- 最小真实页面 smoke：`微信官网` 查询得到一个面板、query 为 `微信官网`、5 条推荐；SearchLens console errors 与 service worker errors 均为 0。
- 后续查询被百度安全验证码阻塞；首次尝试与唯一一次新的 TEMP Profile 重试均出现验证码。未绕过、破解或识别验证码，也未继续制造请求。该外部阻塞不是 SearchLens 产品错误。

## 0.1.1 zh_CN 定点修复证据

- 0.1.0 是已上传但未发布的 Partner Center 草稿包；0.1.1 是待用户替换上传的新包。
- 0.1.1 manifest 使用 `default_locale=zh_CN`、`__MSG_extensionName__` 和 `__MSG_extensionDescription__`，并包含 `_locales/zh_CN/messages.json`。
- 正式版 Edge 使用新的 Windows TEMP Profile 从 0.1.1 ZIP 的 TEMP 解压目录加载成功；扩展名解析为 `SearchLens CN`，单一扩展实例、service worker 正常、load errors 为 0、service worker errors 为 0。
- 本次加载检查未访问百度，不改变既有真实页面 smoke 与外部验证码证据。
- 新包：`release/searchlens-cn-0.1.1-microsoft-edge-addons.zip`；SHA-256：`38f621fe4fb8028206d104c892bf40528bc6031a7017e3a6e797b0bd8143aa9d`。

## 跨浏览器补充证据与发布判断

- Chrome for Testing 150 已对同一 `entrypoints`、`src`、WXT 构建、MV3 manifest 来源和 permissions 完成四批真实百度 smoke，覆盖 query 更新、Tab 生命周期、偏好与 storage、多实体边界、第三方下载站边界及关闭状态。
- Edge 候选包与 Chrome 包共享同一 content script、评分、实体、推荐、storage、UI 和 runtime，不存在 Edge 运行时分叉；`test:all`、lint、build 与静态兼容检查共同覆盖其余链路。
- Edge 浏览器 API、扩展加载、真实页面 content script 注入和基本业务链路已实机验证。剩余风险仅为完整生命周期与偏好场景中的低风险浏览器差异；没有证据表明存在 Edge 专属产品故障，审核员仍可按认证说明手动测试。
- 本结论不表示 Microsoft 已审核或认证，也不表示百度验证码已解决。

最终状态：

```text
full_edge_four_batch_smoke_completed=no
edge_minimum_live_smoke_passed=yes
chrome_full_runtime_smoke_inherited=yes
cross_browser_runtime_shared=yes
external_environment_blocked=yes
external_captcha_blocked=yes
captcha_bypass_attempted=no
searchlens_product_error=no
edge_release_evidence_accepted=yes
release_ready=yes_with_documented_external_limitation
```
