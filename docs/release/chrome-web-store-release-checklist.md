# Chrome Web Store 发布检查清单

更新日期：2026-07-15

## 本地发布候选已完成

- [x] 接受真实 Chrome 四批 smoke：`live_baidu_verified=yes`，产品运行时错误为 0。
- [x] Manifest V3 可构建、可解析；版本 `0.1.0`，该版本从未上传 Chrome Web Store。
- [x] 权限最小：仅 `storage`；无 `optional_permissions`、额外 `host_permissions` 或 `web_accessible_resources`。
- [x] content script 仅匹配 `https://baidu.com/s*` 和 `https://www.baidu.com/s*`。
- [x] 单一用途、数据流、浏览活动和 Limited Use 披露与实现一致。
- [x] 无 remote code、未披露网络端点、analytics、telemetry、广告或远程配置。
- [x] 隐私政策仓库稿和 `docs/privacy/index.md` 已写入开发者 SearchLens、支持邮箱 `826124445@qq.com`。
- [x] 依赖许可证及 `THIRD_PARTY_NOTICES` 已审计，无发布阻塞。
- [x] 16/32/48/128 PNG 图标、三张 1280×800 截图和一张 440×280 宣传图已验证。
- [x] zh-CN 商店文案、Privacy practices 填写稿和审核员复现步骤已准备。
- [x] 正式 build 通过；输出不含 source map、测试、fixture、日志、凭据、Puppeteer、Chrome for Testing 或 Profile。
- [x] 最终 ZIP 根目录直接包含 `manifest.json`，16 个文件逐项与 `.output/chrome-mv3` 哈希一致。
- [x] 本地发布包：`release/searchlens-cn-0.1.0-chrome-web-store.zip`。
- [x] SHA-256：`68c32ac32bf33c93cd0fd58da0b93b2eabde871a1c3cf80a7a587c0f01314633`。
- [x] 包级 smoke 使用 TEMP 中 Puppeteer 25.3.0 与 bundled Chrome for Testing 150.0.7871.24：headed、`pipe: true`、`enableExtensions`、隔离 Profile、单扩展实例、单面板、query 正确、5 条推荐、设置页打开、两类 SearchLens 错误均为 0、残留进程为 0。
- [x] TEMP Puppeteer、Chrome for Testing、cache 和 Profile 已删除；未改 `package-lock.json`，未加入项目依赖。
- [x] 回滚材料：Git 历史、基线 commit、构建脚本、notice 与 SHA-256 可重建和核验发布包。

## USER ACTION REQUIRED：GitHub Pages

- [ ] 将本地提交 push 到远端；Codex 不执行 push。
- [ ] 打开 GitHub Settings → Pages。
- [ ] 选择 Deploy from branch → `main` → `/docs`，然后 Save。
- [ ] 等待部署完成后，在未登录窗口访问 `https://han950214.github.io/project_002_SearchLens/privacy/`。
- [ ] 核验页面可直接访问、内容与 `PRIVACY.md` 一致、支持邮箱可见；在此之前不得声称公网隐私政策已上线。

## USER ACTION REQUIRED：Developer Dashboard

- [ ] 注册或维护开发者账号，启用 2-Step Verification。
- [ ] 接受 Developer Agreement 并确认有权发布代码与原创素材。
- [ ] 填写开发者名称 SearchLens、支持邮箱 `826124445@qq.com` 与已公开核验的隐私政策 URL。
- [ ] 填写 Single purpose、逐项权限说明、Website content/Web history 披露、No remote code 与 Limited Use certification。
- [ ] 选择 Distribution 国家/地区、可见范围和免费/付费状态。
- [ ] 上传最终 ZIP，填写 Listing 与 Test instructions。
- [ ] 提交审核。
- [ ] 建议选择 deferred publishing；审核通过后由开发者复核公开页面并手动发布。

Codex 不执行 push、GitHub Pages 设置、Developer Dashboard 登录、代填、上传、提交或发布操作。
