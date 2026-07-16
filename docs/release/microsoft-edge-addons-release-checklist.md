# Microsoft Edge Add-ons 发布检查清单

更新日期：2026-07-16

## 本地发布准备

- [x] Microsoft 官方发布、移植、侧载、政策、策展、提交状态、MV3 和 API 支持页面已核对。
- [x] Manifest V3 可解析；版本 `0.1.1`；`default_locale=zh_CN`；名称和简短说明通过 `__MSG_...__` 从 `zh_CN` locale 准确解析。
- [x] 包含 `_locales/zh_CN/messages.json`；Partner Center 可据此识别简体中文。
- [x] `update_url`、`key`、额外 `host_permissions`、`optional_permissions`、`web_accessible_resources` 均无。
- [x] API 兼容 Microsoft Edge MV3 Windows；无需 Edge 运行时分叉。
- [x] permissions 仅 `storage`；content script 仅匹配 `https://baidu.com/s*` 与 `https://www.baidu.com/s*`。
- [x] 使用 MV3 默认 CSP；无 remote code、外部可执行代码、固定网络 endpoint、analytics、telemetry、广告或远程配置。
- [x] 数据处理、Single Purpose、Permission justification、Data usage 和旧版 Properties 隐私字段稿已准备。
- [x] 隐私政策 URL 已提供：`https://han950214.github.io/project_002_SearchLens/privacy/`。
- [x] Listing name、short description、250–10,000 字符详细说明、最多 7 个 search terms 已准备。
- [x] 认证审核说明和公开测试步骤已准备。
- [x] 300×300 Edge Listing Logo 已生成并核对为原创 SearchLens 视觉。
- [x] 440×280 promo tile 和三张 1280×800 截图可复用，尺寸、隐私和品牌检查通过。
- [x] 依赖许可证审计可复用；WXT MIT、webextension-polyfill MPL-2.0；包内保留 THIRD_PARTY_NOTICES；无 Edge 专用新增依赖。
- [x] `npm.cmd run test:all` 通过。
- [x] `npm.cmd run lint` 通过。
- [x] `npm.cmd run build` 通过。
- [x] 正式版 Microsoft Edge 从候选 ZIP 的 TEMP 解压目录成功加载；extension ID 为 `elhmgnkggfcdlcjkajlkennfgjiljlpl`，单实例、service worker 正常、load errors 为 0。
- [x] Edge 最小真实页面 smoke 通过：`微信官网` 为单面板、query 正确、5 条推荐，SearchLens console errors 与 service worker errors 均为 0。
- [x] 跨浏览器等价证据通过：Chrome for Testing 150 已对同一运行时代码完成四批真实百度 smoke，Edge 无运行时分叉。
- [x] 自动化回归、lint、build、Edge API 与 manifest 静态兼容检查通过。
- [x] Edge 0.1.1 ZIP 根目录、17 个文件、locale 文件、禁止文件和 manifest 引用检查通过。
- [x] Edge 0.1.1 ZIP 与 SHA-256 文件已生成并复核：`38f621fe4fb8028206d104c892bf40528bc6031a7017e3a6e797b0bd8143aa9d`；既有 Chrome 0.1.0 ZIP 未改变。
- [x] 正式版 Edge 使用新的 TEMP Profile 加载 0.1.1 候选包；名称显示为 `SearchLens CN`，单实例、service worker 正常、load errors 为 0，且未访问百度。
- [x] 0.1.0 readiness 的 `git diff --check`、范围检查、暂存检查、本地 commit 和独立只读复核已通过。

## 已记录的外部限制

- Edge 四批自动 smoke：未完成。首次尝试与唯一一次新 TEMP Profile 重试均被外部百度安全验证码阻塞。
- `full_edge_four_batch_smoke_completed=no`；`external_captcha_blocked=yes`；`captcha_bypass_attempted=no`；`searchlens_product_error=no`。
- 该外部限制不作为当前发布阻塞项；Edge 最小真实 smoke、Chrome 同运行时完整四批 smoke 与自动化回归构成已接受的发布证据组合。
- Partner Center 审核员仍可按认证说明人工验证；验证码没有被解决，也不表示 Microsoft 已审核或认证。

发布候选状态：`release_ready=yes_with_documented_external_limitation`。

## USER ACTION REQUIRED：Partner Center

- [ ] 用户使用 `release/searchlens-cn-0.1.1-microsoft-edge-addons.zip` 替换 Partner Center 中已上传但未发布的 0.1.0 草稿包。
- [ ] 用户选择 Visibility；建议 Public。
- [ ] 用户选择 Markets；比较“默认所有市场”与“仅选择目标市场”后决定。
- [ ] 用户选择 Category；建议当前最接近 Productivity / 浏览辅助 / 搜索工具的选项。
- [ ] 用户填写 Properties，包括 Website、Support contact 与 Mature content=No。
- [ ] 用户填写新版 Privacy，或旧版 Properties 中的隐私字段。
- [ ] 用户上传 `assets/release/edge/searchlens-edge-logo-300x300.png`。
- [ ] 用户上传 `assets/release/promo/searchlens-small-promo-440x280.png`。
- [ ] 用户上传三张 1280×800 screenshots。
- [ ] 用户粘贴 zh-CN Description 与 search terms。
- [ ] 用户粘贴 Certification notes。
- [ ] 用户复核所有页面后点击 Publish，提交认证。
- [ ] 用户处理 Microsoft 审核反馈。
- [ ] 用户本人决定并执行 Git push。

Codex 不执行 push、不登录或操作 Partner Center、不上传 ZIP 或素材、不点击 Publish、不提交审核。
