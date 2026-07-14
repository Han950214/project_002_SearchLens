# Chrome Web Store 素材清单

全部素材由仓库内 `assets/release/source/generate-store-assets.ps1`、SVG/HTML 源文件离线生成。未使用在线生成服务、竞品素材、匿名评价或第三方 Logo 文件。

| 文件 | 尺寸 | 用途 | 来源 | 原创 | 第三方标识 | 脱敏检查 |
| --- | --- | --- | --- | --- | --- | --- |
| `public/icons/searchlens-16.png` | 16×16 PNG | manifest 小图标 | SearchLens 自有镜片/SL 视觉源 | 是 | 无 | 通过 |
| `public/icons/searchlens-32.png` | 32×32 PNG | manifest 图标 | 同上 | 是 | 无 | 通过 |
| `public/icons/searchlens-48.png` | 48×48 PNG | manifest 扩展管理页图标 | 同上 | 是 | 无 | 通过 |
| `public/icons/searchlens-128.png` | 128×128 PNG | Chrome Web Store 图标 | 同上；方形主体约 96×96，四周 16 px 透明边距 | 是 | 无 | 通过 |
| `assets/release/screenshots/01-trust-reference.png` | 1280×800 PNG | 搜索结果可信度参考与推荐排序 | 当前 SearchLens 面板 DOM 结构与实际 CSS；受控公开测试词 | 是（编排） | 仅页面结果文字，无 Logo | 无账号、历史、Cookie、头像或私人信息 |
| `assets/release/screenshots/02-reason-details.png` | 1280×800 PNG | 评分原因与来源说明 | 当前“查看原因”展开状态与实际 CSS | 是（编排） | 仅页面结果文字，无 Logo | 通过 |
| `assets/release/screenshots/03-local-preferences.png` | 1280×800 PNG | 提升、降低、隐藏和本地偏好设置 | 当前 options DOM 结构与实际 CSS | 是（编排） | 无第三方标识 | 通过 |
| `assets/release/promo/searchlens-small-promo-440x280.png` | 440×280 PNG | 小型宣传图 | SearchLens 自有图标、配色和简短文字 | 是 | 无 | 通过 |

截图是由真实 SearchLens UI 结构和项目 CSS 在离线受控页面中渲染的商店展示素材，不是对线上搜索排名的断言，也不包含未实现功能。宣传图不是截图复用，以 SearchLens 自有品牌为主。
