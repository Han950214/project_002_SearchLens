# 依赖与许可证审计

审计日期：2026-07-15

## 依赖结构

`package.json` 没有 `dependencies`，只有开发依赖。`package-lock.json` 锁定的顶层实际版本如下：

| 包 | 锁定版本 | 许可证 | 用途 | 是否作为独立运行时组件分发 | 风险结论 |
| --- | --- | --- | --- | --- | --- |
| `@types/chrome` | 0.1.43 | MIT | 类型检查 | 否 | 允许商业开发与分发 |
| `esbuild` | 0.25.12 | MIT | 测试打包 | 否 | 允许商业开发与分发 |
| `linkedom` | 0.18.12 | ISC | 离线 DOM 测试 | 否 | 允许商业开发与分发 |
| `typescript` | 5.9.3 | Apache-2.0 | 类型检查 | 否 | 允许商业开发与分发；不进入包 |
| `wxt` | 0.19.29 | MIT | 扩展构建 | 部分生成运行时代码 | 允许商业分发；保留 MIT notice |

WXT 解析并打包 `webextension-polyfill` 0.12.0（MPL-2.0）。构建产物中的通用 chunk 含该 polyfill；它是实际分发的第三方代码。MPL-2.0 允许商业分发，但需保留许可证信息并使对应 Source Code Form 可获得。`THIRD_PARTY_NOTICES.md` 已记录准确版本、许可证和源代码地址，发布包应包含该 notice。

## 构建产物核对

- `.output/chrome-mv3` 只包含 manifest、background、content script、popup、options、CSS、内部 chunks 和图标。
- 无 source map、测试、fixture、日志、开发配置、Chrome for Testing、Puppeteer 或 profile。
- `webextension-polyfill` 是唯一明确识别出的第三方运行时库；WXT 还生成少量包内启动代码。
- 所有外部 URL 字符串都来自用户当前页面的结果链接或包内 license/文档；代码中没有固定远程 API、analytics、字体、图片、CDN 或配置端点。

## 素材与 fixture 来源

- 发布图标、截图画布和宣传图由仓库内脚本和 HTML/SVG 源文件原创生成，不使用在线生成服务或竞品素材。
- 截图使用 SearchLens 当前 DOM 结构和实际 CSS，在脱敏、受控的公开测试词/示例结果页面中呈现。
- 测试 fixture 为项目测试输入，不进入发布包；商店截图不使用真实账号、Cookie、历史记录或用户数据。
- 未发现外部字体、第三方图片或品牌 Logo 文件。

## 结论

未发现未知许可证、source-available 限制或不允许商业分发的依赖。MPL-2.0 是文件级 copyleft，不扩展到 SearchLens 原创代码；发布时必须随包保留 `THIRD_PARTY_NOTICES.md`，并保持所列 exact-version source 可访问。许可证阻塞项：无。
