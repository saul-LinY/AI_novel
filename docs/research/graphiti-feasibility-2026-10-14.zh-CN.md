# Graphiti 用于互动小说世界管理的可行性研究

调研日期：2026-10-14。范围：官方文档、Graphiti 源码、当前 AI_novel 实现。此次为设计与源码评估，没有安装 Graphiti、启动图数据库或调用模型进行抽取测试。

当前接入重点已收敛为物品流转、人物历程等细节记忆，并直接使用 Neo4j 作为共享图存储。首期方案以[故事细节与历程记忆设计](/Users/saul/Documents/ChatGPT/AI_novel/docs/research/graphiti-detail-memory-design.zh-CN.md)为准；下文的全面实体管理可作为后续扩展，不是接入记忆图的前置条件。

**结论：技术上可行，适合承担时序关系、剧情关联和长期记忆检索；完整的世界管理仍需要本项目定义实体模型、状态变更规则和角色认知边界。** 建议以现有回合事件与状态快照为事实依据，逐步增加世界实体管理，再把已确认的变化和剧情证据投影到 Graphiti。用同一个查询服务向上层提供统一视图。

这里的“所有信息”应落实为：能登记所有需要持续追踪的实体，保存已经明确的信息与历史，允许扩展属性，并明确表示未知。自动阅读正文不能保证每个对象、每个属性都被完整且正确地抽取，更不能替故事补全尚未定义的信息。

**当前项目已经具备的基础与缺口**

| 领域 | 当前实现 | 为完整管理需要补充 |
| --- | --- | --- |
| 物品 | 故事包物品目录为 `id/name/description`；运行时 `inventory[itemId] = count`；提案只能增减目录内物品 | 物品类型与具体实例、NPC 持有物、所有者、实际持有者、放置位置、容器、消耗与损坏、动态新增物品 |
| 人物 | 人格、目标、背景、位置、状态、已知事实；支持生成新人物 | 可扩展属性、伤势/能力等细分状态、变化原因与有效时间 |
| 人物关系 | `relationshipGraph` 已有方向；当前提案主要修改 `attitude` 数值 | 亲属、组织归属、盟友、敌对、债务、承诺、信任等多种可共存关系 |
| 剧情 | 主干节点、路线、线索、伏笔、张力、未兑现事项、事实账本 | 把具体事件与参与人物、物品、地点、前因后果连接起来 |
| 历史 | 每回合保留 `event.json`、`stateAfter`、提案和正文，分支有事件序列 | 世界实体版本、细粒度事件、图同步版本与重放策略 |
| 认知 | `knowledgeFactIds`、`knownByIds`、角色记忆及检索来源验证 | 认知获得时间、误解/怀疑/谎言与客观事实分离，跨图检索仍执行这些规则 |

证据入口：[故事包 schema](/Users/saul/Documents/ChatGPT/AI_novel/src/story-package.js:145)、[初始状态](/Users/saul/Documents/ChatGPT/AI_novel/src/story-engine.js:250)、[提案应用](/Users/saul/Documents/ChatGPT/AI_novel/src/story-engine.js:508)、[回合提交](/Users/saul/Documents/ChatGPT/AI_novel/src/story-domain.js:59)、[事实账本](/Users/saul/Documents/ChatGPT/AI_novel/src/story-narrative.js:57)。

当前故事包登记了 12 位人物、7 个地点和 10 种物品。现阶段的主要问题是信息模型的表达能力与长程关联，不是这几十个实体的存储容量。

**Graphiti 的能力与实际边界**

| 需求 | 可行性判断 | 使用方式与边界 |
| --- | --- | --- |
| 人物、物品、地点、组织 | 高 | 自定义实体类型；项目维护稳定 ID 与别名，防止两个同名物品被合并 |
| 人物关系及物品归属的变化 | 高，但需要约束 | 自定义关系及有效时间；唯一持有、数量守恒由程序校验 |
| 剧情来源追踪 | 高 | Episode 保存输入及来源联系；项目保留事件 ID、原句与正文位置 |
| 语义召回、关联查询 | 值得验证 | 混合检索可结合关键词、向量及图结构；中文效果需要实测 |
| 精确当前状态、完整物品清单 | 需要自行实现 | 按 ID、类型、位置精确读取与分页，不能用 top-K 语义搜索代替完整清单 |
| 某回合的世界快照 | 部分支持 | 关系有时间字段；人物节点属性、摘要不能直接视为历史快照 |
| 秘密、误解与知情范围 | 需要自行实现 | 命名空间和查询过滤只是基础；需要角色认知模型和来源校验 |
| 存档回退、分支继承、重写 | 需要自行实现 | 新命名空间重放已接受事件；不能把删除 Episode 当作完整回滚 |
| 剧情推进、因果裁决 | 需要现有引擎 | 图保存线索、依赖与证据；行动能否成立、伏笔能否回收仍由小说规则决定 |

官方支持通过 Pydantic 自定义实体与关系类型，并将 Episode 与抽取出的实体、关系联系起来；查询支持混合检索与图距离排序。[自定义类型](https://help.getzep.com/graphiti/core-concepts/custom-entity-and-edge-types)、[Episode](https://help.getzep.com/graphiti/core-concepts/adding-episodes)、[检索](https://help.getzep.com/graphiti/working-with-data/searching)。

源码核查发现以下接入注意点：

1. **JSON Episode 仍然是抽取输入。** 默认模型路径会选择 JSON 抽取提示并调用模型，不会逐字段无损转换成图。因此，已经由引擎确认的 `holderId`、数量等状态，不应再依赖一次语义抽取来决定。[节点抽取源码](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/graphiti_core/utils/maintenance/node_operations.py)
2. **`add_triplet` 不是无模型参与的普通写入。** 它会生成必要的向量、解析实体，并进入关系去重和冲突处理路径；部分路径有快速返回，但整体不能作为确定性 upsert 使用。若要精确图投影，需要自有适配层调用底层存储、维护事务和索引。[Graphiti 主流程](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/graphiti_core/graphiti.py)、[关系解析](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/graphiti_core/utils/maintenance/edge_operations.py)
3. **自动作废是模型辅助的事实冲突处理。** 它不能替代“这支血清已经用过，不能再使用”“交给别人必须关闭原持有关系”等业务规则。不同人物的看法也不应该互相覆盖。
4. **历史能力主要体现在事实关系上。** `EntityEdge` 有 `valid_at/invalid_at` 与 `created_at/expired_at`；`EntityNode` 的摘要和属性是会更新的当前内容。需追踪的动态属性应保存为有时间的事实，或从项目快照重建。[关系模型](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/graphiti_core/edges.py)、[节点模型](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/graphiti_core/nodes.py)
5. **查询要显式限定时间。** 所查主流程未传过滤器时使用空 `SearchFilters`，不能假定默认查询只返回当前有效事实。适配层应构造有效区间条件，并以已提交事件序列再核验结果。[时间过滤源码](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/graphiti_core/search/search_filters.py)
6. **`group_id` 是命名空间，不是角色权限系统。** 由服务端从故事、存档、分支和视角派生，不能让模型自由指定；节点摘要、原始 Episode、社区摘要也必须受认知边界限制。[命名空间说明](https://help.getzep.com/graphiti/core-concepts/graph-namespacing)
7. **重试与回退需要项目负责。** 所查 `add_episode(uuid=...)` 路径先读取已有 Episode；不能直接把首次写入的事件 ID 传进去当作通用幂等键。`remove_episode` 做相关数据删除，不能据此推断它会恢复所有旧摘要、旧属性和曾被作废的关系。需要同步台账和可重建投影。[主流程源码](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/graphiti_core/graphiti.py)

**建议的小说数据模型（以下为本项目设计，不是 Graphiti 自带的小说功能）**

统一实体登记册先覆盖 `Character`、`ItemType`、`ItemInstance`、`Location`、`Organization`、`StoryEvent`、`PlotThread`。秘密、传闻、承诺等以 `Claim` 或专门实体表达，避免把复杂陈述压成一条无来源的字符串。

物品的“归属”需要拆开：

| 信息 | 例子 | 规则 |
| --- | --- | --- |
| 所有者 | 交流本属于绘梨衣 | 所有权变化与临时借用分开；共同所有等例外要有明确模型 |
| 实际持有者 | 路明非暂时拿着本子 | 对不可分割物品，在同一时刻限制唯一直接持有/放置关系 |
| 直接容器或放置处 | 血清放在行动包中；本子放在桌上 | 容器也可作为物品实例，禁止包含环 |
| 推导位置 | 行动包由路明非携带，他在旅馆 | 沿容器、持有者的位置推导，避免保存互相矛盾的位置副本 |
| 物理状态 | 完好、破损、空瓶、已消耗 | 消耗后保留历史；是否留下空瓶由领域规则决定 |
| 数量与使用次数 | 3 支普通药剂；最后一支血清仅可用一次 | 可叠加类型和唯一实例采用不同规则 |
| 可扩展属性 | 颜色、材质、页内内容、封印、有效期 | 未知就标记未知；文本细节需要来源 |

人物的稳定身份与动态属性分开。稳定 ID 沿用 `erii`、`lu-mingfei` 等；别名指向身份，隐藏身份的对应关系受权限控制。受伤、位置、装备、能力限制、关系强度都需要时间与来源。关系有方向：A 信任 B，不推导 B 同样信任 A；血缘和暂时敌对可以同时存在。

建议的关系包括：`OWNED_BY`、`HELD_BY`、`CONTAINED_IN`、`LOCATED_AT`、`MEMBER_OF`、`TRUSTS`、`HOSTILE_TO`、`PARTICIPATED_IN`、`USED_IN`、`REVEALS`、`SUPPORTS`、`BELIEVES`。只有依据明确时才记录 `CAUSES`，按时间相邻不能推断因果。动态数值可放在版本化事实或关系属性上，不必把每个数字都建立为实体节点。

一个多方事件应有自己的实体，例如“把血清交给绘梨衣”，连接交出者、接收者、血清、地点与来源回合。Graphiti Episode 负责输入来源；`StoryEvent` 负责小说内语义。同一回合发生交接、使用、丢弃时，可拆成多个有序子事件。

例如，以下是验证场景，不是当前存档中已发生的剧情：

| 回合 | 确认发生的变化 | 应能查询到的结果 |
| --- | --- | --- |
| 8 | 路明非拿起桌上的血清 | 物品持有者为路明非，位置随持有者推导 |
| 9 | 把血清交给绘梨衣 | 关闭旧持有区间，开启新持有区间；不会同时登记两名持有者 |
| 10 | 绘梨衣使用血清 | 可用剂量归零；物品历史仍可追溯 |
| 11 | 凯撒仍以为血清在桌上 | 客观事实与凯撒的错误认知并存，不互相作废 |

这能支持“药现在在哪里”“之前谁拿过”“谁知道已经用过”“这件事影响哪个撤离方案”等不同查询。

**时间、认知与原著设定必须分开处理**

至少记录三种顺序：故事中发生时间、系统记录时间、角色获知时间。系统今天补录昨天发生的事，不代表角色昨天就知道。建议保留 `storyTimeMinutes`、`turnIndex`、`subEventIndex`、`sourceEventId`、`recordedAt`、`learnedAtTurn`。

Graphiti 的 `reference_time` 需要 datetime；可由故事固定时间原点加累计分钟转换，或使用明确标记的逻辑时间编码。真实存档创建时间不等于小说发生时间。回忆、预言、计划中的未来事件要另行表示；时间未知时保留未知，不让模型凭空猜日期。相同故事时间里的先后仍由回合与子事件序号决定。

原著已发生事实、当前改编分支事实、作者计划、角色信念、他人口述应有不同来源类型。原著后续情节不自动成为当前分支的未来事实；主干与伏笔的计划也不能进入角色已知世界。图中可以管理这些信息，但读取权限和状态语义需要明确。

建议以 `story + save + branch + revision + view` 派生命名空间；`view` 可以是作者或特定角色。MVP 先只给作者控制台、主创与情节分析提供图能力。角色继续从既有授权记忆读取；后续角色图只用该角色允许看到的原始记录构建。不要把全知图的综合摘要过滤几条边后就交给角色。

查询历史回合时，当前节点摘要可能已经融合未来事件，所以即使边带时间过滤，也不能直接使用当前摘要。历史页面从当时快照、经过事件范围核验的事实与原文重建。

**接入现有回合流程的建议**

写入流程：

1. 从当前权威状态、允许的历史证据和图检索结果准备上下文。
2. 各 Agent 提交候选，主 Agent 输出结构化变化。
3. `applyTurnProposal` 校验状态变化，扩展物品转移、消耗、容器和关系规则。
4. 正文与连续性记录经过现有流程，提交回合与状态快照。
5. 提交成功后，后台按分支顺序同步图；失败重试，重启补齐。

具体可以在 [server.js 的提交后位置](/Users/saul/Documents/ChatGPT/AI_novel/src/server.js:222) 增加图同步，与现有 `memory.enqueue` 相邻。Graphiti 抽取接受已发布正文、已接受的结构化变化和已核验的事实记录；未采纳的候选、推演、失败作业不应进入已发生事实图。

建议有两条明确的数据通路：

- **精确状态通路**：引擎决定状态，实体登记册与快照保存结果；需要图查询时，由确定性投影生成对应关系。若使用 Graphiti 底层存储，适配层承担关闭旧关系、写新关系、嵌入与索引更新，属于额外开发。
- **语义记忆通路**：Graphiti 从允许的正文和记录抽取关联，用于检索、追溯和建议。新抽取的“事实”带 `candidate/confirmed/rejected` 状态；不能直接覆盖物品、人物生死或认知状态。

不要让两条通路在同一命名空间内无控制地修改同一批硬状态关系。初期可以只实现语义记忆图；精确世界状态仍通过同一查询服务从本地快照读取。后续确有复杂图遍历需求时，再增加确定性状态投影。

幂等与恢复建议：以 `(saveId, branchId, revision, sourceEventId, projectionVersion, view)` 建同步记录，维护 `pending/indexing/ready/failed` 和 `indexedThroughEventId`。同一分支串行消费；崩溃后比对已提交事件与投影记录，修复半完成任务。相同 Episode UUID 不应作为唯一重试保证；必要时在新 revision 命名空间重建，然后切换读指针。

当前存档使用逐文件原子替换，不能据此认为本地多个文件与图数据库能共同原子提交。图应作为可重建的派生数据；若实施 durable outbox，需将待同步信息纳入可靠提交协议，或由已提交事件扫描补齐，避免仅依赖内存队列。[存档写入](/Users/saul/Documents/ChatGPT/AI_novel/src/story-store.js:128)

正文新出现、但提案中未登记的物品，也需要实体发现机制：登记带原句的候选对象，判断是否影响后续行动；关键实体进入有校验的登记流程，所有权等未知字段保留未知。不要让后台模型在正文提交后静默改变已确认世界状态。

**读取接口与现有 BM25 的衔接**

建议提供两个不同用途的接口族：

- 精确查询：`getEntity(id, atTurn, view)`、`listItems(holder/location/status)`、`getRelationships(characterId, atTurn)`、`getEntityHistory(id)`。用于 UI、规则判断和完整清单。
- 关联查询：`findEvidence(query, entities, atTurn, view)`、`getRelatedEvents(entityId)`。用于找关联剧情、承诺、线索和原文证据。

这些是拟议接口，并非当前已有。精确查询通过稳定 ID 和确定性条件获得结果；语义查询不承担“找齐所有物品”的保证。

现有 [story-memory.js](/Users/saul/Documents/ChatGPT/AI_novel/src/memory/story-memory.js:129) 验证卡片 ID、内容哈希、来源事件，且要求返回文本与可信卡片原文一致。Graphiti 返回的关系事实通常是抽取后的改写，不能直接替换 BM25 backend 的结果。

MVP 可把 Graphiti 用作候选来源发现器：先找到相关 Episode/关系，映射到 `sourceEventId` 和记忆卡，再由现有逻辑从本地取回授权原文并核验。需要向 Agent 提供结构化关系时，新增独立 `graphContext` 契约，包含实体 ID、关系、时效、来源和确认状态；不要伪装成已经通过原文验证的记忆卡。

图尚未同步到当前回合时，当前状态仍从 `stateAfter` 读取；近期证据由本地事件补齐。图不可用时保留 BM25 回退。完整清单、历史回看和角色权限不会依赖索引是否及时更新。

**部署与成本判断**

最容易与当前 Node.js 项目分工的形态是：Node 小说引擎 + 一个封装 Graphiti Python SDK 的本地服务 + 图数据库。官方已有 REST 与 MCP 服务，适合参考和探索；面向游戏运行时，建议使用自己的窄接口封装固定的命名空间、时间和来源策略，MCP 可留给作者调试。[REST 服务](https://github.com/getzep/graphiti/tree/9b17e94c16457475f71d5cd2f8045649dd6f170c/server)、[MCP 服务](https://github.com/getzep/graphiti/tree/9b17e94c16457475f71d5cd2f8045649dd6f170c/mcp_server)

优先验证 Neo4j；FalkorDB 可作为另一个候选。Graphiti 需要 Python 环境和图存储，默认使用模型与 embedding 服务。现有 Pi 的模型配置不会自动传给 Python 服务；即使继续使用兼容接口，也需单独验证结构化输出、中文实体解析和 embedding。使用 RRF 的查询方案可以避免每次检索都调用 LLM 重排，但向量查询仍可能依赖 embedding 服务。[安装与配置](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/README.md)、[查询策略](https://help.getzep.com/graphiti/working-with-data/searching)

主要新增成本是每次入图的抽取、消歧、关系处理及 embedding，以及维护 Python 服务、数据库、同步与恢复。不能把“检索通常很快”理解为“整回合入图没有延迟”。建议记录每回合模型调用量、token、索引完成时间、查询 P50/P95、重试率与图版本滞后。此次没有测量，不能给出可信的单回合费用和吞吐承诺。

版本核查：调研时 GitHub latest release 与 PyPI 均为 **0.30.2**；核查的 main 提交为 `9b17e94c16457475f71d5cd2f8045649dd6f170c`，其 `pyproject.toml` 版本字段为 **0.32.0**。已额外对照 v0.30.2 的主流程；不要把 main 文档中的所有接口直接假定在已发布包中可用。试验应固定明确版本，逐项检查使用到的能力。[GitHub release](https://github.com/getzep/graphiti/releases/tag/v0.30.2)、[PyPI](https://pypi.org/project/graphiti-core/0.30.2/)、[main 项目元数据](https://github.com/getzep/graphiti/blob/9b17e94c16457475f71d5cd2f8045649dd6f170c/pyproject.toml)

**建议分三步验证**

1. **先扩展世界实体模型。** 从血清、交流本、加密手机、行动包入手，覆盖持有、归属、容器、消耗和状态；增加多类型人物关系及明确的状态变更命令。这一步不依赖 Graphiti，可以直接改善当前故事一致性。
2. **建立旁路图试验。** 用独立测试存档构造 20～30 回合，导入已确认数据并对照答案。先给作者查看实体详情、历史与相关剧情，不把未经验证的抽取结果放入正式写作上下文。
3. **达到质量门槛后接入 Agent 召回。** 与当前 BM25 对照，增加授权来源映射、降级、同步状态和审计展示，再逐步考虑角色图与确定性状态图。

试验要覆盖以下案例：

| 类别 | 必须验证的情形 | 建议通过标准 |
| --- | --- | --- |
| 身份 | 同名不同物品、人物别名、真假物件 | 测试集无错误合并；关键实体稳定 ID 一致 |
| 状态 | 交接、借用、遗失、移动容器、损坏、消耗 | 所有硬规则测试通过；精确查询与权威状态一致 |
| 时间 | 历史查询、相同分钟的连续动作、倒叙补录 | 不混入未来事件；有效区间与事件顺序一致 |
| 认知 | 谎言、误解、旁观但不知情、后来才被告知 | 角色/玩家泄密为零；错误信念不修改客观状态 |
| 分支 | 回退、重写、分叉、重置后相同 main 名称 | 无跨存档、跨版本、跨分支混入 |
| 剧情 | 计划未执行、条件句、假设、预言、取消行动 | 不误记为已发生事实；因果关系均有依据 |
| 恢复 | 重复消费、索引中断、数据库不可用、重启补齐 | 权威状态不受影响，恢复后投影可核对 |
| 检索 | 中文转述、跨人物/物品关联、找承诺或原因 | 报告证据召回率、事实准确率和无依据结果比例 |
| 完整性 | 登记册中的全部实体与变化是否都有对应投影 | 关键实体及已提交硬状态变更覆盖率 100%；自由文本另算抽取漏项率 |

已有 BM25 报告在 80 个虚构回合、403 条卡片、48 条问题上记录 Recall@5 为 91.7%，它是历史基线，不是本次重新实测，也不代表 Graphiti 必然优于它。应复用这组问题，并增加图关系与时序题；若新增图没有在这些题型上产生清楚收益，就先保留完善后的世界实体管理，延后扩大 Graphiti 使用范围。[既有评估](/Users/saul/Documents/ChatGPT/AI_novel/docs/evaluations/memory-bm25-evaluation.md)

推荐的落地目标是：**每件重要物品、每个人物及其变化都有精确记录，每条关联剧情都可追溯到已提交证据；Graphiti 为这些记录增加语义检索和关系探索能力。** 可行性较高，主要工作集中在本项目的数据建模、权限、同步与查询适配，不能仅靠安装一个依赖完成。
