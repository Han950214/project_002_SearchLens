# Microsoft Edge Add-ons 测试证据

测试日期：2026-07-15；zh_CN 定点修复复核日期：2026-07-16（Asia/Shanghai）

## 测试范围

- Microsoft Edge：正式版 `150.0.4078.65`。
- executable path：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。
- Profile：每次测试使用新的 Windows TEMP 隔离 Profile；未访问用户现有 Edge 或 Chrome Profile。
- 0.1.0 真实页面 smoke 候选包来源：`main @ ae79f837b86d5d994f58a6085157926170b6e95c` 执行 `npm.cmd run build` 产生的 `.output/chrome-mv3`，以独立 Microsoft Edge Add-ons ZIP 保存，并从 TEMP 解压目录侧载。
- 加载方式：Puppeteer `pipe: true`、`enableExtensions`，未开放 TCP CDP。
- extension ID：`elhmgnkggfcdlcjkajlkennfgjiljlpl`。

## 0.1.1 zh_CN 本地化加载证据

- 0.1.0 是已上传但未发布的 Partner Center 草稿包；0.1.1 是待用户替换上传的新包。
- 0.1.1 manifest：version 为 `0.1.1`，`default_locale=zh_CN`，name 为 `__MSG_extensionName__`，description 为 `__MSG_extensionDescription__`。
- locale 文件：`_locales/zh_CN/messages.json`；解析结果为 `SearchLens CN` 与 `在百度网页搜索结果页本地提供可信度参考、推荐排序与偏好控制。`。
- 正式版 Microsoft Edge 使用新的 Windows TEMP Profile，从最终 0.1.1 ZIP 的 TEMP 解压目录加载；未访问用户现有 Profile。
- 加载结果：扩展名显示 `SearchLens CN`，单一扩展实例、service worker 正常、load errors 为 0、service worker errors 为 0。
- 本轮没有访问百度，没有触发或操作验证码，也没有改写下方既有真实页面证据。
- 包：`release/searchlens-cn-0.1.1-microsoft-edge-addons.zip`；17 个文件；SHA-256：`38f621fe4fb8028206d104c892bf40528bc6031a7017e3a6e797b0bd8143aa9d`；禁止文件为 0。

## 已完成的 Edge 实机证据

- 候选扩展成功加载；single extension instance 为 yes。
- service worker 正常；load errors 为 0。
- Manifest V3 正常；`runtime`、`storage` 与 `tabs.create` API 兼容。
- permissions 仅 `storage`；host permissions 为空；`update_url` 与 `key` 均缺失。
- 最小真实页面查询：`微信官网`。
- panel count：1。
- query：`微信官网`。
- recommendations：5。
- SearchLens console errors：0。
- service worker errors：0。

## 外部阻塞

- 后续查询出现百度安全验证码；首次尝试与唯一一次允许的新 TEMP Profile 重试均被阻塞。
- 未绕过或破解验证码，未使用验证码识别，也未继续制造请求。
- 验证码由百度外部环境触发，与 SearchLens 产品逻辑无关，未记为 SearchLens error。

```text
external_captcha_blocked=yes
captcha_attempts=2
fresh_profiles=2
captcha_bypass_attempted=no
searchlens_product_error=no
```

## 补充证据

Chrome for Testing 150 已对同一运行时代码和构建逻辑完成四批真实百度 smoke：

1. `微信官网` → `微信官方下载`。
2. `微信登录` → 图片 Tab → 返回网页 → `微信文档`。
3. `QQ 下载`：promote、demote、hide、options 与关闭状态。
4. `微信 QQ`、`Python download`：实体和官网边界。

四批均通过：单面板、query 更新且无旧 query 覆盖、Tab 生命周期正常、偏好与 storage 正常、多实体查询和第三方下载站无官网误判、SearchLens errors 与 service worker errors 均为 0、continuous refresh 为 no。

Edge 候选包与 Chrome 完整 smoke 共享同一 `entrypoints`、`src`、WXT 构建、MV3 manifest 来源、permissions、content script、评分、实体、推荐、storage、UI 和 runtime；不存在浏览器专用运行时分叉。`test:all`、lint、build、manifest 与 API 静态检查构成额外证据。

## 风险判断

- Edge 浏览器 API、扩展加载、真实页面 content script 注入和基本业务链路已验证。
- 后续生命周期与偏好功能由同代码 Chrome 完整 smoke 和自动化测试覆盖。
- 剩余风险为完整场景中的低风险浏览器差异；没有证据表明存在 Edge 专属产品故障。
- Partner Center 审核员仍可按认证说明执行完整手动测试。
- 本结论不表示 Microsoft 已审核或认证，也不表示百度验证码已解决。

## 最终状态

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
