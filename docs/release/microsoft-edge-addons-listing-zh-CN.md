# Microsoft Edge Add-ons 商店文案（zh-CN）

## Extension name

SearchLens CN

名称来自构建 manifest；如需更改必须重新构建并上传 ZIP。本轮保持不变。

## Short description

在百度网页搜索结果页本地提供可信度参考、推荐排序与偏好控制。

简短说明来自构建 manifest；不包含 Chrome 专用、第三方官方、AI、云端评分或安全认证表述。

## Description

SearchLens CN 是一款独立的百度网页搜索结果辅助工具。它只在百度“网页”搜索结果页读取当前公开显示的搜索词、标题、链接、域名、摘要、原始顺序和页面标记，并在设备本地进行启发式分析。分析结果以可关闭的 SearchLens 面板呈现，不替换默认搜索引擎，不隐藏或阻断百度原始结果。

当前功能包括：

- 根据当前搜索词、公开结果信号和本地规则提供辅助推荐顺序；
- 展示可信度参考、主要原因、来源域名和百度原始排名；
- 识别页面可见的推广及第三方下载站信号，并提示继续核对官网或官方应用商店；
- 允许用户提升、降低或隐藏域名，偏好只保存在当前 Microsoft Edge 配置文件的扩展本地存储中；
- 在设置页控制推荐数量、可信度、评分理由和第三方下载站提示；
- 对多实体查询保持保守，不在品牌冲突时强猜官网。

SearchLens CN 只支持百度网页搜索结果路径 `baidu.com/s*` 与 `www.baidu.com/s*`。搜索词和公开结果仅在当前页面内存中即时处理，不写入持久化存储；扩展只保存显示设置和用户主动配置的域名提升、降低、隐藏偏好。SearchLens CN 不上传搜索词、搜索结果、浏览记录、点击记录或域名偏好，不运营远程服务器，不出售或共享数据，不使用 analytics、telemetry、广告、远程代码、AI 云端排序或服务器评分。

SearchLens CN 不是百度、腾讯、微信、QQ、Google、Microsoft 或其他第三方的官方产品，不代表授权、合作、认证或背书。可信度与推荐仅供辅助参考，不构成安全检测、杀毒、官方认证或绝对可信承诺。请继续核对百度原始结果、真实域名和下载来源。

## Category 选择建议

优先选择 Partner Center 当前下拉列表中最接近“Productivity / 生产力”的分类；若该名称不存在，选择最接近浏览辅助或搜索工具的分类。最终选择由用户依据后台实际选项确认。

## Website

https://han950214.github.io/project_002_SearchLens/

## Support contact

826124445@qq.com

## Privacy policy

https://han950214.github.io/project_002_SearchLens/privacy/

## Mature content

No / 否

## Visibility 建议

Public。Public 允许用户通过搜索、浏览或 Listing URL 发现扩展；Hidden 不出现在商店搜索与浏览中，只能通过 Listing URL 分发。最终选择由用户完成。

## Markets 建议

建议默认所有市场：会覆盖当前及未来新增市场，发布管理最简单。若只选择目标市场，可以限制首发范围，但已安装用户在市场撤销后仍保留扩展且不能获得未来更新。最终 Markets 由用户结合语言、支持能力与合规要求选择。

## Search terms

最多 7 项，每项不超过 30 字符，总计不超过 21 个词：

1. 搜索结果
2. 可信度参考
3. 推荐排序
4. 百度搜索
5. 域名偏好
6. 本地分析
7. 来源核对

## Logo 文件

`assets/release/edge/searchlens-edge-logo-300x300.png`

## Small promotional tile

`assets/release/promo/searchlens-small-promo-440x280.png`

## Screenshots

1. `assets/release/screenshots/01-trust-reference.png`
2. `assets/release/screenshots/02-reason-details.png`
3. `assets/release/screenshots/03-local-preferences.png`

## Certification notes

复制 `microsoft-edge-addons-certification-notes.md` 中“可直接粘贴”部分。无需账号、密码、付费或特殊地理位置。
