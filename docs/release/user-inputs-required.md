# Chrome Web Store 用户输入清单

状态：`release_ready=no`。以下信息不能由 Codex 编造，且完成前不得提升版本号或生成最终发布 ZIP。

| 内部令牌 | 必须由用户提供并核验的内容 | 使用位置 |
| --- | --- | --- |
| `USER_INPUT_REQUIRED_SUPPORT_EMAIL` | 可公开接收支持请求的邮箱 | 隐私政策、商店支持信息、开发者账号联系信息 |
| `USER_INPUT_REQUIRED_PRIVACY_POLICY_URL` | 可公网访问、内容与仓库 `PRIVACY.md` 一致的 HTTPS URL | Developer Dashboard Privacy practices |
| `USER_INPUT_REQUIRED_DEVELOPER_NAME` | 有权发布本扩展的个人或组织公开名称 | 商店开发者身份与隐私政策署名 |

用户还需亲自完成：注册/维护开发者账号、接受 Developer Agreement、设置 2-Step Verification、选择发布国家/地区和可见范围、填写后台字段、上传 ZIP、提交审核、选择自动或 deferred publishing。Codex 不登录、不代填、不提交。
