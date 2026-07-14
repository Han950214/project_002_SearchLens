# v0.4-C Baidu Dynamic Runtime Smoke Checklist

适用阶段：v0.4-C Baidu Dynamic Runtime Reliability。此清单用于发布前人工 Chrome smoke，不替代离线自动测试；云端 linkedom/fixture 测试不能视为真实百度页面验收。

## 本地安装

1. 运行 `npm ci`（仅在依赖未安装时）和 `npm run build`。
2. 打开 Chrome 扩展管理页，启用开发者模式。
3. 选择“加载已解压的扩展程序”，加载 `.output/chrome-mv3`。
4. 确认未加载其他 SearchLens CN 开发副本，避免重复 content script 干扰。

## 建议测试词

可使用：微信官网、微信官方下载、微信登录、微信文档、微信、QQ 下载、Python download、微信 QQ。

不得依赖百度固定排名、固定广告数量或固定页面内容；只检查运行时不变量。

## Smoke 项

1. 首次加载：打开百度网页搜索结果页，确认最多一个 `#searchlens-panel`，原始百度结果仍可正常使用。
2. 站内重新搜索：在百度搜索框输入新词并提交，确认面板显示当前 query，推荐来自当前页面结果。
3. query 变化：连续切换不同测试词，确认旧 query 的推荐不会覆盖新 query。
4. 网页 Tab 切换：从“网页”切到图片、视频或其他 Tab，面板应删除；返回“网页”后只恢复一个面板。
5. 动态结果更新：百度结果区发生局部刷新后，面板应刷新，且不会无限加载或重复注入。
6. 面板重复注入：刷新页面、后退前进或站内搜索后，检查 DOM 中最多一个 `#searchlens-panel`。
7. promote、demote、hide：对同一域名分别保存偏好，确认当前推荐重排或隐藏生效。
8. 用户关闭本页面板：点击关闭后，本页后续 DOM 更新不应自动恢复面板；重新打开页面可重新显示。
9. options 设置：修改推荐数量、可信度、理由展示、下载站提示，回到搜索页后确认设置生效。
10. 控制台错误：打开 DevTools Console，操作过程中不应出现未捕获异常或持续重复错误。
11. adapter diagnostics：可查看 `[SearchLens] Adapter diagnostics`，确认 query、候选数量、接受数量与当前页面大体一致。
12. 多实体词：例如“微信 QQ”，确认不产生错误官网信号；只接受保守排序结果。
13. 推广与普通结果：若页面存在推广标志，确认仅作为本地辅助提示，不宣称安全认证。
14. 第三方下载站：若出现下载站，确认提示为核对来源，不声称病毒检测。

## 失败记录模板

- 日期：
- Chrome 版本：
- SearchLens commit：
- 测试词：
- 百度 Tab：
- 复现步骤：
- 期望不变量：
- 实际现象：
- Console 错误：
- adapter diagnostics 摘要：
- 是否包含个人数据：否/是（如是，不提交截图或 HTML）

## 脱敏规则

- 截图前遮挡账号头像、昵称、登录状态、搜索历史、个性化推荐和任何个人信息。
- 不提交完整百度页面 HTML、HAR、Cookie、账号截图、搜索历史或包含个人数据的素材。
- 如需记录 DOM，只保留 `#kw`、必要 Tab、`#content_left`、标题、URL/display URL、snippet 和最小推广标识。
- 禁止通过 curl、wget、自动保存网页或页面快照收集器采集真实百度页面。

## 结论口径

人工 smoke 只记录“不变量是否满足”。不要写成 Chrome Web Store 发布结论，不要声称百度固定排名已验证，也不要把自动测试描述为真实百度浏览器验收。
