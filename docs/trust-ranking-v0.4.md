# v0.4 Trust Ranking Foundation

## v0.4-A 目标

v0.4-A 在现有本地确定性排序上建立可扩展的信任排序基础，不改变百度 adapter、存储 key 或域名偏好格式，也不引入 AI、远程 API、遥测或数据上传。品牌实体和增强意图规则推迟到 v0.4-B。

## 运行职责

推荐流程依次执行意图识别、Trust Policy Gate、Soft Scoring、稳定排序和结构化解释。

- Trust Policy Gate 只处理能够确定执行的本地策略。当前实际动作是 `allow` 或 `exclude`；用户保存的 `hide` 是显式本地排除，先于评分执行。
- Soft Scoring 处理官网域名特征、来源特征、意图、用户提升或降低、文档与仓库、推广、第三方下载、SEO 营销和可疑域名等信号，输出 0–100 分。
- 推广、第三方下载、SEO 特征和可疑域名等启发式判断只扣分，不会仅凭低置信度判断直接隐藏结果。
- 排序按分数降序，同分按 `originalRank` 升序，保证确定性。

## 权重与解释

`scoreResult()` 在入口将 `DEFAULT_WEIGHTS` 与调用方的 `Partial<ScoringWeights>` 合并一次。所有 signal 函数只读取解析后的权重，未指定字段继续使用默认值，同一 signal 只计算一次。

每条评分原因包含稳定 `code`、中文 `label`、`category`、`effect`、实际生效的 `weight`、相对中性值的 `scoreImpact` 和置信度。类别区分正向信号、负向信号、用户偏好和策略动作；展示文本与机器代码分离。

这些分数和启发式原因只用于本地排序辅助，不代表官方认证、绝对安全、病毒检测或其他安全结论。
