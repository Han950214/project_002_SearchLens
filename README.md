# SearchLens CN

SearchLens CN 是面向百度网页搜索结果的独立浏览器扩展，用本地评分和用户偏好辅助识别官网、可信来源、第三方下载站、推广及百度系内容。它不是百度、微信、腾讯或 Google 的官方产品，也不代表这些公司的授权或立场。

## v0.4-C 当前能力

- 在搜索页显示紧凑推荐面板；默认保留标题、域名、可信度、关键标签和操作，评分理由、规则命中、原始百度排名及用户偏好状态按需展开。
- 推荐标题可点击；域名可提升、降低或隐藏，操作后立即刷新当前推荐并保存到 `chrome.storage.local`。
- 提供加载、空、错误和轻量操作反馈；第三方下载站提示用户优先核对官网或官方应用商店。
- Options 页面管理推荐数量、可信度、评分理由、下载站提示，以及提升、降低、隐藏三类域名偏好。
- 百度 adapter 排除 SearchLens 自身 DOM，并保持固定 fixture 多次解析结果一致。
- 推荐链路先执行确定性的 Trust Policy Gate，再对允许结果执行 Soft Scoring；用户明确隐藏会被排除，启发式风险仅作扣分，不会被表述为安全检测结论。
- 自定义 `ScoringWeights` 在评分入口合并一次并传递给全部信号；评分理由包含稳定代码、类别、效果和实际分值影响。
- 查询意图和最多 12 个本地实体规则在推荐入口各解析一次；官网信号必须同时匹配查询实体、结果域名和意图，多实体冲突时保守地不产生官网加分，同一实体域名证据不重复计入可信来源。
- 百度动态页面生命周期已加固：重复初始化保持单面板，结果区嵌套更新会防抖刷新，`#content_left` 替换后会重新绑定，旧异步刷新不会覆盖新 query，离开“网页”Tab 时面板会删除并在返回后恢复。

可信度只用于辅助判断，不构成“绝对安全”承诺。用户仍应核对原始搜索结果、真实域名和下载来源。

## 本地开发

```powershell
npm install
npm run lint
npm run test:all
npm run build
```

常用脚本还包括 `npm test`、`npm run test:m3`、`npm run test:extractor` 和 `npm run test:storage`。WXT 构建产物位于 `.output/`，不提交到 Git。

v0.4-C 百度动态页面回归可单独运行 `npm run test:v0.4-c`；发布前人工 smoke 清单见 [docs/qa/baidu-runtime-smoke.md](docs/qa/baidu-runtime-smoke.md)。

## 数据与边界

当前版本默认本地处理，不使用 AI，不上传或出售搜索词、浏览记录、点击记录和域名偏好；不包含账号、云同步、统计上传、付费系统、多搜索引擎或 dashboard。详情见 [合规边界](docs/compliance.md)、[v0.3 产品面板架构](docs/product-panel-v0.3.md) 与 [v0.4 Trust Ranking 架构](docs/trust-ranking-v0.4.md)。

## Chrome Web Store 发布准备

发布准备材料位于 `docs/release/`，原创商店素材位于 `assets/release/`，扩展图标位于 `public/icons/`。公开开发者名称为 SearchLens，支持邮箱为 `826124445@qq.com`。隐私政策目标地址为 <https://han950214.github.io/project_002_SearchLens/privacy/>；该地址仅在仓库推送并由用户启用 GitHub Pages（`main` → `/docs`）且完成公开访问核验后才可视为已上线。

包级发布 smoke 使用临时安装的 Puppeteer 25.3.0 与其 bundled Chrome for Testing，并强制 TEMP 隔离 Profile、`pipe: true` 和 `enableExtensions`。仓库不引入 Puppeteer 依赖，也不使用用户稳定版 Chrome 或用户 Profile。运行入口为 `npm run release:package-smoke`，具体临时环境要求见发布检查清单。
