# Microsoft Edge Add-ons 认证审核说明

## 可直接粘贴

SearchLens CN 是独立开发的浏览器扩展，不是百度、腾讯、微信、QQ、Google、Microsoft 或其他第三方的官方产品。扩展无账号、无付费功能、无隐藏功能、无远程服务器、无 analytics、无远程代码，也不需要用户名、密码或测试凭据。

扩展只在百度网页搜索结果路径 `https://baidu.com/s*` 与 `https://www.baidu.com/s*` 运行。它读取当前页面公开显示的搜索词和结果，在设备本地生成可关闭的可信度参考与推荐面板；百度原始搜索结果始终保持可用。扩展仅使用 `storage` 权限保存显示设置和用户主动配置的域名提升、降低、隐藏偏好，不保存或上传搜索词、搜索结果、浏览历史或点击记录。

候选包已在 Microsoft Edge 150.0.4078.65 的 Windows TEMP 隔离 Profile 中完成原生加载与最小真实页面测试：扩展单实例、service worker 正常、load errors 为 0；查询 `微信官网` 时只有一个面板，query 正确并显示 5 条推荐，SearchLens console errors 与 service worker errors 均为 0。后续完整四批 Edge 自动 smoke 因百度安全验证码未完成；首次尝试和唯一一次新 TEMP Profile 重试均被阻塞，未绕过、破解或识别验证码。验证码属于外部页面限制，不是 SearchLens 产品错误。

同一运行时代码与构建逻辑已在 Chrome for Testing 150 完成四批真实百度 smoke，覆盖 query 更新、Tab 生命周期、偏好与 storage、关闭状态、多实体查询和第三方下载站边界；自动化回归测试也已通过。Edge 与 Chrome 共用同一 `entrypoints`、`src`、WXT MV3 构建、permissions、content script、评分、实体、推荐、storage、UI 和 runtime，不存在 Edge 专用运行时分叉。发布证据采用上述 Edge 最小实机证据、跨浏览器等价证据与自动化证据的组合；这不表示 Microsoft 已审核或认证，也不表示验证码已解决。

建议测试步骤：

1. 安装扩展后打开百度网页搜索，搜索 `微信官网`；确认页面最多有一个 SearchLens 面板，面板 query 与搜索词一致，推荐数量大于 0。
2. 使用百度页面自己的搜索框改为 `微信官方下载`；确认 query 与推荐更新，旧 query 不覆盖新 query，页面没有持续 loading、闪烁或重复初始化。
3. 搜索 `微信登录`；切换到百度“图片”Tab，确认网页面板不悬挂；返回“网页”Tab 后确认面板恢复且最多一个。再搜索 `微信文档`，确认面板更新。
4. 搜索 `QQ 下载`；在推荐卡片上依次测试“提升”“降低”“隐藏”，确认操作对象正确且面板刷新。通过面板“设置”打开 options，调整推荐数量或显示选项，再恢复原值。
5. 关闭当前页 SearchLens 面板后触发页面局部变化，确认本页不会自动重新打开面板。
6. 搜索 `微信 QQ`；该多实体冲突查询不应强猜官网，微信与 QQ 不应发生跨品牌官网误判。
7. 搜索 `Python download`；官网信号只允许属于实际匹配的 `python.org` 或 `docs.python.org`，第三方下载站不应标记为官网。

预期结果：单面板、query 与页面一致、推荐大于 0、设置与偏好保存在本地、无 SearchLens console error、无 service worker error、无持续 mutation 刷新。可信度与推荐只供辅助参考，不构成安全检测、杀毒、官方认证或绝对可信承诺。

百度可能偶发显示验证码。验证码不是 SearchLens 功能，也不会被扩展绕过；如出现验证码，审核员可更换上述公开测试词或稍后重试，并继续按完整手动步骤验证。无需提供账号或密码。
