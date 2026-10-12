# 本地 BM25 记忆检索评估

时间：2026-09-29T10:30:56.665Z

80 个虚构回合，403 条记忆卡，沿用 48 条中文查询。测试期间禁止网络访问。

| 分组 | 命中 | BM25 Recall@5 | 原关键词 Recall@5 | 原摘要证据可见率 |
|---|---:|---:|---:|---:|
| all | 44/48 | 91.7% | 91.7% | 16.7% |
| long | 36/40 | 90.0% | 90.0% | 0.0% |
| recent | 8/8 | 100.0% | 100.0% | 100.0% |

- 单视角检索 P50/P95：0.07 / 1.18 ms。
- 完整五视角召回 P50/P95：1 / 3 ms。
- 外部请求：0；权限/历史隔离：15 次，越界 0 次。
- 索引持久化及重启读取：true。

## 未命中的查询

- 林舟要在什么时间归还首饰？
- 如何用声音通知林舟终止买卖？
- 林舟手里的地图还缺什么？
- 哪个地方有易燃气体聚集的危险？

## 对照与限制

- Lexical retrieval can miss paraphrases and implicit causal relationships.
- No test-specific synonym rules were added after inspecting missed queries.
- Recall@5 measures whether the annotated source event appears among the first five results.
- Per-view term indexes are reused, but query answers are not cached.
- No claims are made about final novel prose quality.