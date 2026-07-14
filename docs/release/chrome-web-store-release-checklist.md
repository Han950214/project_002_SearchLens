# Chrome Web Store 发布检查清单

更新日期：2026-07-15

## 已完成

- [x] 真实 Chrome smoke 已接受：四批 PASS；`live_baidu_verified=yes`；产品运行时错误为 0。
- [x] Manifest V3 可构建、可解析，name/description/icons 已检查。
- [x] 权限最小：仅 `storage`。
- [x] 无额外 `host_permissions`；content script 仅匹配两条百度 `/s*` 路径。
- [x] 单一用途狭窄且与实现一致。
- [x] 无 remote code、远程配置、外部脚本、字体、图片或 CDN。
- [x] 数据流、浏览活动、本地存储和 Limited Use 已审计。
- [x] 隐私政策仓库稿与代码行为一致，无虚假邮箱或 URL。
- [x] 依赖许可证已审计，第三方 notice 已准备。
- [x] 16/32/48/128 PNG 图标已准备，128 图标有透明边距。
- [x] 三张 1280×800 商店截图已准备并脱敏。
- [x] 一张 440×280 小型宣传图已准备。
- [x] zh-CN 商店文案与审核说明已准备。
- [x] 测试说明与审核员复现步骤已准备。
- [x] Chrome for Testing 150.0.7871.24 最终构建最小 smoke 通过：扩展加载、单面板、设置页、错误为 0。
- [x] 回滚材料：Git 历史、基线 commit、构建脚本和 notice 可重建发布包。

## 发布包形成前

- [ ] USER ACTION REQUIRED：提供并核验公开支持邮箱。
- [ ] USER ACTION REQUIRED：提供并核验开发者公开名称。
- [ ] USER ACTION REQUIRED：将 `PRIVACY.md` 发布到稳定 HTTPS URL，并提供该 URL。
- [ ] 完成上述输入后冻结公开文案和隐私政策。
- [ ] 选择最小合理新版本并同步 manifest/package/CHANGELOG。
- [ ] 运行正式 build，生成根目录直接含 `manifest.json` 的最终 ZIP。
- [ ] 验证 ZIP 不含 source map、测试、fixture、日志、临时文件、配置、凭据、用户数据、Puppeteer、Chrome for Testing 或 profile。
- [ ] 验证 ZIP 解压、manifest、图标、版本、文件清单和 `THIRD_PARTY_NOTICES`。
- [ ] 计算并记录 SHA-256。
- [ ] 使用最终发布包执行最小本地安装 smoke：扩展加载、单面板、设置页、无 SearchLens 错误。

## Developer Dashboard

- [ ] USER ACTION REQUIRED：注册/维护开发者账号并启用 2-Step Verification。
- [ ] USER ACTION REQUIRED：接受 Developer Agreement 并确认有权发布代码与素材。
- [ ] USER ACTION REQUIRED：填写开发者邮箱和支持方式。
- [ ] USER ACTION REQUIRED：填写 Privacy practices、Limited Use 和隐私政策 URL。
- [ ] USER ACTION REQUIRED：选择 Distribution 国家/地区、可见范围和免费/付费状态。
- [ ] USER ACTION REQUIRED：上传最终 ZIP，填写 Listing 与 Test instructions。
- [ ] USER ACTION REQUIRED：提交审核。
- [ ] USER ACTION REQUIRED：建议选择 deferred publishing；审核通过后由开发者手动发布。

Codex 不执行任何 Developer Dashboard 登录、代填、上传、提交或发布操作。
