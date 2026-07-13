# SearchLens v0.3 产品面板

## 目标与范围

v0.3 将既有 M3 技术面板升级为搜索页产品主面板，同时保持本地优先和轻量架构。本阶段只支持百度网页搜索，不包含云端、账号、付费、dashboard、多搜索引擎、移动端或完整暗色模式。

## 运行结构

1. 百度 content script 等待 `#content_left` 稳定，读取本地设置与域名偏好。
2. Baidu adapter 在主结果区提取、去重并排除 `[data-searchlens-root]` 内的扩展 DOM。
3. scoring engine 生成 0–100 的可信度辅助分数和可解释理由；recommendation engine 先排除 `hide`，再应用 `promote` / `demote` 信号并稳定排序。
4. 产品面板渲染推荐卡片、类型标签、原始百度 rank、评分理由、操作反馈及加载 / 空 / 错误状态。
5. Options 页面通过 background 消息管理 `chrome.storage.local` 中的设置和三类域名偏好。

面板 DOM、样式和按钮均使用 SearchLens 自有命名，不使用未经授权的 Logo、图标、截图或品牌素材，也不模仿百度官方组件。

## 稳定性与日志

- 结果只从 `#content_left` 的已知结果容器中扫描；嵌套容器仅保留最外层结果。
- 去重保留首次出现项和原始 rank；同一 fixture 多次解析应完全一致。
- SearchLens 面板插入、移除和内部更新不应成为候选结果或触发重复提取循环。
- 本地 console 调试只保留 `query`、`candidateCount`、`acceptedCount`、`topDomains`；不向远端发送日志。

## 验收标准

- 面板显示品牌、query、推荐数量、设置与关闭入口，以及完整推荐卡片信息。
- 提升 / 降低后当前排序或偏好状态立即更新；隐藏后当前结果立即移除；存储失败显示轻量错误。
- Options 可保存核心显示设置、删除单个域名偏好并清空全部域名偏好。
- adapter 错误不影响百度原始结果使用；空状态不夸大安全性。
- `npm run lint`、`npm test`、`npm run test:m3`、`npm run test:all`、`npm run build` 和 `git diff --check` 通过。

## 后续阶段

- v0.4：Options 与规则管理增强。
- v0.5：dashboard 与历史统计；开始前需重新评估数据最小化和用户同意。
- v0.6：多搜索引擎 adapter。
- v1.0：商业化上架准备，包括权限、隐私政策、素材与商店文案审核。

任何云同步、账号、反馈上传或远端统计都必须先补充隐私说明、用户同意和最小权限设计。
