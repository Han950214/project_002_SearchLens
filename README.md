# SearchLens CN

SearchLens CN 是面向百度网页搜索结果的独立浏览器扩展，用本地评分和用户偏好辅助识别官网、可信来源、第三方下载站、推广及百度系内容。它不是百度、微信、腾讯或 Google 的官方产品，也不代表这些公司的授权或立场。

## v0.3.1 能力

- 在搜索页显示紧凑推荐面板；默认保留标题、域名、可信度、关键标签和操作，评分理由、规则命中、原始百度排名及用户偏好状态按需展开。
- 推荐标题可点击；域名可提升、降低或隐藏，操作后立即刷新当前推荐并保存到 `chrome.storage.local`。
- 提供加载、空、错误和轻量操作反馈；第三方下载站提示用户优先核对官网或官方应用商店。
- Options 页面管理推荐数量、可信度、评分理由、下载站提示，以及提升、降低、隐藏三类域名偏好。
- 百度 adapter 排除 SearchLens 自身 DOM，并保持固定 fixture 多次解析结果一致。

可信度只用于辅助判断，不构成“绝对安全”承诺。用户仍应核对原始搜索结果、真实域名和下载来源。

## 本地开发

```powershell
npm install
npm run lint
npm run test:all
npm run build
```

常用脚本还包括 `npm test`、`npm run test:m3`、`npm run test:extractor` 和 `npm run test:storage`。WXT 构建产物位于 `.output/`，不提交到 Git。

## 数据与边界

当前版本默认本地处理，不上传或出售搜索词、浏览记录、点击记录和域名偏好；不包含账号、云同步、统计上传、付费系统、多搜索引擎或 dashboard。详情见 [合规边界](docs/compliance.md) 与 [v0.3 产品面板架构](docs/product-panel-v0.3.md)。
