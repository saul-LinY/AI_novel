# Graphiti + Neo4j 细节记忆

Graphiti 0.30.2 已接入回合记忆流程。每次回合成功保存后，程序把各视角允许看到的正文、状态变化和连续性记录送入持久化后台队列；Graphiti 抽取时序关系并保存到现有 Neo4j。写下一回合时，BM25 与 Graphiti 分别寻找证据，合并后仍从本地原文取回内容。

## 已实现的边界

- 全局、环境、每个角色使用独立的 Graphiti `group_id`，不同角色的错误认知与秘密不会合并成同一张图。
- 同一物品的每次出现、交出、归还分别保留来源记录。`NovelOccurrence` 不参与 Graphiti 的语义去重，重复流转仍可追溯。
- 持有与位置另存为 `NovelState` 有效时间段。模型只提出带逐字引文的变化；程序检查实体类型和来源，关闭旧区间并创建新区间。归还给旧持有人会建立新 ID，否定旧持有人不会清除新持有人，计划与回忆不修改当前状态。角色信念仍只属于对应角色图。
- 连续性记录员可用 `entityIds` 引用已有物品、人物和地点；引用会校验，提交时保存进事实账本。Graphiti 也可从正文中发现尚未进入故事包的对象。
- 只有分支事件序列中的已提交资料进入图。NPC 未采纳意图、失败作业和孤立回合不入库。角色认知记录保留其认知语义。
- 图谱的事实与摘要用于寻找来源，不直接作为新事实写入小说。召回结果必须通过本地卡片 ID、内容哈希、来源事件与视角核验。
- 当前状态由原有引擎负责。检索历史事实不代表该事实现在仍有效；物品归还后，旧持有记录仍可作为历史证据被找回。
- 查询的来源快照与图索引指纹不一致时，暂不使用该视角的 Graphiti 结果，保留 BM25 原文召回。这样旧回合不会读到融合了未来事件的节点摘要。
- 图尚未追上时，BM25 直接读取当前已提交卡片；数据库、模型或图服务失败不会阻止小说提交与本地记忆检索。

## 运行环境

| 组件 | 当前选择 |
| --- | --- |
| Graphiti | `graphiti-core==0.30.2`，Python 3.11 虚拟环境 |
| 图数据库 | 已部署的 Neo4j 5.26.32 Community + APOC |
| 抽取模型 | 从现有 Pi 配置初始化的 OpenAI 兼容网关，默认 `deepseek-v4.1-flash:cloud` |
| 向量模型 | 本地 CPU 上的 `BAAI/bge-small-zh-v1.5`，512 维 |
| 检索 | Graphiti 的 RRF 混合检索与最多两跳遍历发现来源，按 embedding 相似度返回证据，与 BM25 名次融合 |
| 精排 | 已关闭，不加载或调用 cross-encoder；保留历史评测代码 |
| 服务 | `http://127.0.0.1:4320`，所有接口需要本地服务 token |
| 后台队列 | `.ai-novel/graphiti/queue.sqlite3`，WAL 模式 |

向量模型首次使用时下载，之后保存在本地；历史精排模型缓存不再由服务加载。Graphiti 的关系抽取、以及符合条件的回合的持有/位置识别会调用模型网关；查询向量在本地计算。模型响应会经过 schema 校验，不合格时有限重试。

检索以当前行动/问题为主要查询。图与关键词候选使用 embedding 相似度进行基础排序，再与 BM25 名次融合；不再进行 cross-encoder 精排或精排片段切选。客户端仍核验原文、来源和快照，历史带 sourceOffset 的节选仍可展示。默认单次 Graphiti 请求 timeoutMs=10000；同步中 pending/indexing/initializing/updating 会在 readyWaitMs=10000 的总就绪等待窗口内重试。单次请求受剩余等待预算限制；已就绪时立即返回，不固定等待十秒。快照不一致、服务错误及已失败的索引不会无限等待，预算耗尽保留 BM25。角色视角并发等待，不按角色人数累加十秒。等待检索时可取消回合，取消后不会进入生成。

运行配置：

```text
.ai-novel/graphiti/
├── config.json                 # 开关、服务 URL、查询超时和 topK
├── service.env                 # 服务 token、模型网关、模型名和 API key（600 权限）
├── queue.sqlite3               # 期望快照、进度、失败及重试状态
├── models/                     # 本地中文向量与 INT8 重排模型
├── venv/                       # Python 运行环境
├── service.out.log
├── service.err.log
└── live-verification.json      # 显式运行真实模型验证后生成
```

Neo4j 连接始终从 `.ai-novel/neo4j/connection.env` 读取，沿用已经设置的 `saul` 用户。服务不会把数据库密码和模型密钥发送到控制台或小说前端。

## 命令

在项目根目录执行：

```bash
# 首次配置：需要 uv，安装固定依赖并读取现有 Pi 网关配置
npm run graphiti:setup

# 前台运行（已有后台服务时不要重复启动）
npm run graphiti:serve

# 服务健康与各视角的实际后台进度
npm run graphiti:status

# 为当前存档补建；只等待任务持久化，不等待所有模型抽取完成
npm run graphiti:index

# 查看交流本、绘梨衣的来源历程
npm run graphiti:history -- erii-notebook
npm run graphiti:history -- 绘梨衣的本子
npm run graphiti:history -- erii
npm run graphiti:history -- erii character:lu-mingfei
```

当前机器已安装 `com.ai-novel.graphiti` 用户 LaunchAgent，登录后运行并在异常退出后恢复。它只管理 Graphiti；Neo4j 容器仍依赖 Docker Desktop 启动。

```bash
launchctl kickstart -k gui/$(id -u)/com.ai-novel.graphiti
```

停用图记忆：把 `.ai-novel/graphiti/config.json` 的 `enabled` 改为 `false`，再重启小说服务。`AI_NOVEL_GRAPHITI=off` 可覆盖此配置。BM25 仍可单独工作。更换向量模型或维数需要创建新的图投影，不能混用旧向量。

## 在控制台与 Neo4j 中查看

[创作控制台](http://127.0.0.1:4318)的“回合记忆”显示各角色图的后台同步进度；实际经图谱找回的卡片标注“Graphiti 关联召回 · 原文来源已核验”。显示过去回合时，若当前图已前进，会说明快照不一致，不把后来的图当作历史状态。

持有/位置区间的补齐进度单独显示。旧图按原始事件顺序修复，不需要重新抽取全部 Graphiti 实体。每一回合的区间、原生支持关系的时间修正和完成标记在同一个 Neo4j 事务中写入。修复中断后会从标记继续；尚未完成时 `/states` 返回 `states_pending`，不会把半完成的结果当作当前状态。

只读实体历程接口：

```text
GET /api/console/graph/history?entity=erii-notebook&view=global
GET /api/console/graph/history?entity=erii&view=character:lu-mingfei
```

可附加 `runId` 查看某轮；图版本不匹配时返回空结果与明确状态。该接口属于仅监听本机的作者控制台。历史列表读取已接受的来源快照，并非声称 LLM 已完成所有关系抽取；返回的 `state` 区分 `ready`、`pending`、`indexing`、`failed` 等状态。

`entity` 支持故事包实体 ID，以及 Graphiti 原生实体的名称或 UUID。旧正文只写“本子”而未明确对应哪个登记物品时，不会擅自认定它就是 `erii-notebook`；可以按图中实际抽取的“本子”查询。原生实体通过来源回合关联，返回的是相关回合中的证据卡，并不保证每张卡的每句话都谈论该实体。

在 [Neo4j Browser](http://localhost:7474/browser/) 中先查看活动图：

```cypher
MATCH (s:NovelMemoryStream)
WHERE s.active = true
RETURN s.scope AS storyScope, s.view AS perspective, s.group_id AS graphGroup;
```

从 `npm run graphiti:status` 或上面的查询取得当前存档全局视角的 `graphGroup`，设置参数后查看流转。各命名空间会包含相同人物的不同视角副本，这是认知隔离的结果。

```cypher
:param group => '替换为当前全局视角的 graphGroup'

MATCH (o:NovelOccurrence)-[:INVOLVES]->(n:NovelEntity)
WHERE n.group_id = $group AND n.entityId = 'erii-notebook'
RETURN o.ordinal AS turn, o.kind AS kind, o.text AS evidence,
       o.sourceEventId AS sourceEventId
ORDER BY turn, o.cardId;

MATCH p=(o:NovelOccurrence)-[:IN_EPISODE]->(ep:NovelEpisode)
        -[:EXTRACTED_AS]->(:Episodic)-[:MENTIONS]->(:Entity)
WHERE o.group_id = $group
RETURN p LIMIT 100;

MATCH p=(a:Entity)-[r:RELATES_TO]->(b:Entity)
WHERE r.group_id = $group
RETURN p LIMIT 100;

// 当前已识别的持有/位置断言；普通 RELATES_TO 还包含计划、信念和历史。
MATCH p=(a:Entity)-[r:RELATES_TO]->(b:Entity)
WHERE r.group_id = $group AND r.novel_managed = true
  AND r.invalid_at IS NULL
RETURN p;

// 完整持有历程，包括归还后新增的时间段。
MATCH (s:NovelState {group_id: $group})-[:SUBJECT]->(item:Entity)
MATCH (s)-[:VALUE]->(holder:Entity)
WHERE s.property = 'holder'
RETURN item.name, holder.name, s.validAt, s.invalidAt, s.startedTurn, s.startedSequence
ORDER BY s.startedTurn, s.startedSequence;
```

`NovelEntity` 是已登记的稳定实体；`Entity` 是 Graphiti 抽取/解析的实体。`NovelOccurrence` 保存精确来源，`NovelEpisode` 连接回合与原生 `Episodic`。模型推导出的关系不替代引擎当前状态。不要直接编辑模型向量或来源哈希；正文/记录修订应先进入存档，再重建对应图版本。

带 token 的本地服务还提供 `GET /states?scope=...&view=global&fingerprint=...&entity=实体名称`，加 `history=true` 返回已结束区间。通过同一视角的 `/status` 取得指纹；指纹不匹配时拒绝返回状态。区间采用 `[validAt, invalidAt)`，同一分钟的多次变化额外用回合与序号排序。空结果表示没有可提供的状态断言，不等于物品无主或实体不存在；实体识别和指代判断仍依赖模型。

## 恢复与版本

Node 服务会在启动及每次提交后扫描当前已提交事件，补送未确认的快照。接收端先持久化队列，再后台索引。同一视角按顺序推进；重复提交相同内容不会反复调用模型。

追加回合复用图。修改既有内容、截短历史时创建新图版本。模型写入失败或处理中断可能留下半完成数据，重试会在新命名空间重建；仍在使用的故事范围内，旧版本保留但不用于当前召回。`active` 仅表示同一范围、视角的有效版本，并不表示这个范围仍被当前存档引用。

需要选角的故事在选角完成前不创建 Graphiti 图。正常同步同时提交稳定的工作区/故事 owner 和所有已保存分支的 activeScopes；切换分支不会退休其他分支。重置或重新选角后，服务将该 owner 已登记、但不再被存档引用的范围标记为退休，移出索引队列，并后台删除其所有 Neo4j 版本。其他工作区、故事或独立测试范围不参与回收。

退休标记和待清理分组保存在 SQLite，先落盘再清图。清理与模型写入、检索使用同一组锁；旧任务结束后不能发布结果，晚到的旧快照返回 409，不能复活已退休范围。数据库暂不可用时重试，重启后继续；应用启动会再次提交当前分支清单，覆盖 Graphiti 离线期间发生的重置。`/health` 的 `cleanupPending` 表示等待回收的范围数量。退休标记保留为轻量防重放记录。

升级前没有 owner 信息的图不会被自动认领或批量删除。本次已核验并回收选角前的默认开局范围，当前两轮存档及所有视角保持原节点与关系标识。仍被存档引用的范围内部，旧投影版本的独立保留策略尚未增加。

SQLite、Neo4j 和小说存档不是跨数据库原子事务；以已提交小说事件为可重建来源。`indexing` 标记在服务重启后触发新版本重放，避免假定一次中断的模型操作“恰好执行一次”。首次补建多个视角会产生多轮模型调用，可能需要数分钟；索引期间可以正常使用本地记忆。

## 验证

```bash
npm test
npm run test:graphiti

# 显式真实模型验证：会调用模型，写入独立测试故事的三个视角图
npm run graphiti:probe
```

普通测试不调用模型。真实验证检查物品交出/归还分别保留、中文语义召回、角色秘密隔离、旧快照拒绝、重复入队幂等，结果保存到 `.ai-novel/graphiti/live-verification.json`。测试图使用独立 scope，不进入正式小说的查询范围。

自动抽取仍可能漏掉细节、误解指代或推断错误。当前实现通过原文核验限制其对写作的影响；召回量、中文关联效果和模型成本仍需在更长的故事中持续评估。

首次接入的旧版本验证见[原始记录](evaluations/graphiti-verification-2026-10-14.json)。有效期与精排修复后的结果见[修复报告](evaluations/graphiti-repair-results.md)：冻结存档的精确证据命中由 3/12 升为 11/12，交出、归还、放入容器与计划未执行均完成真实模型验证。耗时样本不代表长期延迟分布，仍需更多故事和更长历史的评估。

## 按故事与视角查看 Neo4j

在控制台「回合记忆 → 实体关系图」选择一个视角，默认全局视角。入口生成的 Browser 查询同时限定当前故事 scope、视角和有效 graph group，并仅返回 Graphiti 的 Entity / RELATES_TO，避免把其他人物的记忆、旧开局以及内部来源索引一起画出。历史回合的 fingerprint 与当前图不一致时不提供该历史图入口；链接对应分组当前已索引的关系，包含历史关系，并非冻结快照。

Entity 和 NovelEntity 新增 `view`、`viewLabel`、`scope`、`displayName` 展示属性，例如 `源稚生｜上杉绘梨衣视角`。服务启动时补齐已有节点，新来源入库后继续维护；不改变 `name`、UUID、摘要或向量，也不按名称合并视角。`summary` 是模型摘要，不等于角色完整的知识清单，应结合来源原文理解。

Neo4j Browser 在结果面板点击 Entity / Character 等标签，将 Caption 设为 `displayName`。该样式保存在浏览器侧；换浏览器时需再设置一次。内置 Browser 的相关标签已在本次修复中设置。

参考：[Neo4j Browser 节点样式](https://neo4j.com/docs/browser/operations/browser-styling/)、[预填查询链接](https://neo4j.com/docs/browser/operations/browser-url-parameters/)。
