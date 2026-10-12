# GitHub AI 小说架构调研：结合 AI_novel 的演进建议

调研日期：2026-09-28（Asia/Shanghai）。本地代码基线：91d59d32f69f5e22b9d484fd601507ee9e3e9615。

## 1. 判断与适用范围

**建议继续以 Pi 为运行基座，把当前系统演进为“有明确世界状态、人物知情边界和发布校验的互动叙事引擎”。优先投入上下文、状态与成文之间的一致性。**

本项目的 [PRD](../../INTERACTIVE_NOVEL_PRD.zh-CN.md) 定位是玩家扮演角色的短篇互动小说。每轮行动会改变世界，系统还必须允许合理偏离、失败和结局。长篇写作工具能够提供记忆、创作方法和生产流程参考，但其整章批处理、作者审核和既定卷纲不能直接套进读者在线回合。

当前实现已经具备三个子 Agent 并行提案、主 Agent 统一裁决、结构化状态变更、阻止原剧情节点、作业持久化和断线重放。建议在这些基础上递进落地，不因其他项目采用新框架而替换 Pi。

已有 [生产化评审稿](../production-workflow/REVIEW.zh-CN.md) 对记忆、审核、事务和超时的方向基本正确。本调研补充外部实现证据、版本差异和更小的实施顺序；评审稿里的功能与性能数字仍属于方案及验收目标。

## 2. 样本与热度

热度依据 GitHub API 当天查询的 Star 数，结合任务相关性与近期维护选样，不宣称是穷尽排名。Stars 表示关注度，不能代替生成质量评测。时间列为本次读取的默认分支提交日期（UTC），不是仓库任意分支的 pushed_at，也不是正式发布日期。

| 项目 | Stars | 默认分支提交 | 架构类型 | 对本项目的用途 |
|---|---:|---|---|---|
| [Narcooo/inkos][S1] | 10,066 | 2026-09-26 | Pi 统一执行层、互动世界、状态与检索 | 最接近的运行架构参考；本次默认分支标注 2.0 开发版 |
| [zenstory-ai/oh-story-claudecode][S2] | 7,145 | 2026-09-27 | Skills、专业角色、文件化创作、程序检查 | 作者侧工作流、人物与伏笔状态、确定性派生视图 |
| [YILING0013/AI_NovelGenerator][S3] | 6,133 | 2026-06-25 | 设定与章纲、逐章生成、摘要与人物状态、向量检索 | 简洁的长程记忆基线 |
| [xiamuceer-j/MuMuAINovel][S4] | 3,087 | 2026-09-18 | 作者工作台、分层上下文、数据库与向量记忆 | 上下文优先级、人物与伏笔管理 |
| [ExplosiveCoderflome/AI-Novel-Writing-Assistant][S5] | 3,030 | 2026-09-23 | 统一章节执行、质量策略、RAG、后台资产更新 | 在线路径减负、修订预算和可观测上下文 |
| [RhythmicWave/NovelForge][S6] | 1,216 | 2026-09-23 | Schema 卡片、上下文引用、关系图、代码式工作流 | 故事包作者编辑器与可复用创作资产 |
| [SillyTavern/SillyTavern][S7] | 33,856 | 未固定源码提交 | 角色互动前端、World Info 条件注入 | 相邻赛道参考，不与自动小说生产引擎混排 |

另外查看了 RecurrentGPT（1,001 stars）和 Novel-OS（46 stars）的元数据。前者适合作为记忆循环的历史参考，后者不宜称为热门代表。没有把名字含 novel 的通用富文本编辑器纳入小说引擎比较。

核查深度：前六个项目阅读仓库文档和选定实现文件，并固定源码提交；SillyTavern 主要核查仓库与官方 World Info 文档。未运行第三方完整应用，未做相同模型下的文学质量、成本或延迟实测。API 元数据和下载源码文件的哈希见 [来源快照](./github-ai-novel-sources-2026-09-28.json)。

## 3. 几种值得理解的架构

### 3.1 章节流水线与检索记忆

AI_NovelGenerator 的流程为：设定 → 章节蓝图 → 当前章上下文 → 正文 → 定稿后的摘要、角色状态和向量库更新。代码将近期章节、全局摘要、人物状态与 Chroma 检索结果组合。MuMu 则把章纲及衔接锚点、人物信息、检索记忆与伏笔分出优先级。[AI_NovelGenerator 源码][S3-code]、[MuMu 上下文源码][S4-code]

对本项目：把“当前章”替换成“当前场景/回合”，把已确认事实作为必需输入。相似度检索用于补充往事，不承担人物是否存活、物品属于谁、角色是否知道秘密的最终判断。

### 3.2 文件化创作与 Skills

Oh Story 按需加载创作方法，以 _tracking-state.json 保存追踪权威状态，人物、伏笔和时间线 Markdown 从中派生。其协议区分作者真相与读者已知，并通过修订号防止旧事务覆盖新状态。[S2-state]

对本项目：适合迁移为故事包编写、导入核对和离线试演方法。在线读者回合保留程序控制的固定协议；创作 Skill 的指令本身不能获得直接写存档的权限。

### 3.3 统一执行层与状态结算

InkOS 当前开发分支整合 Pi、上下文编译、工具能力和恢复机制；检索采用可重建的 SQLite FTS5/BM25 索引。Play 先取得场景与变更，再由 reducer 应用状态，并用快照处理后续写入失败。[上下文编译][S1-context]、[检索实现][S1-retrieval]、[Play 回合][S1-play]

两处边界必须看代码：章节审稿函数会将审稿异常转为 unavailable 观察结果，继续返回正文；Play 中数据库事务与文件快照恢复也不能等同于所有存储介质的一笔事务。本项目可以借鉴执行边界，并自行明确严格发布条件。[审稿函数][S1-review]、[Play 回合][S1-play]

### 3.4 统一正文执行与后台投影

AI-Novel-Writing-Assistant 当前文档采用“轻预检 → 整章写作 → 接收检查 → 可选局部修订 → 终态与后台资产更新”。不同控制入口汇入统一运行时；它还说明 Context Broker 的预算与过滤，以及向量/关键词检索融合。[章节生产链][S5-chain]、[上下文说明][S5-context]

对本项目：摘要、回顾、搜索索引可放到后台。**人物生死、持物、已知秘密和行动后果必须随本轮提交完成**，下一次玩家行动不能依赖尚未完成的后台抽取。这是互动回合与作者批量写章的关键差异。

### 3.5 创作资产与角色互动

NovelForge 以 Schema 卡片组织设定、章节和审核结果，通过上下文引用与关系信息辅助生成；README 明确说明已转向代码式工作流，不能再按旧版描述为 DAG 编辑器。适合参考故事包工作台。[S6]

SillyTavern 的 World Info 根据关键词等条件注入背景信息，适合学习人物卡与设定召回；本调研未把它核实为拥有本项目所需的原著节点阻止、因果结算和严格提交协议。[S7-world]

从这些样本归纳出的设计取向是：明确创作资产、显式构造上下文、由程序管理状态与执行。Agent 的数量不能单独说明架构成熟度。

## 4. 你的项目现在实际如何运行

~~~text
玩家行动
  → 持久化回合作业与基础状态检查
  → 情节 / 人物 / 环境三个角色并行给出结构化报告
  → main 合并报告并提交回合提案
  → 程序校验状态变更和下一步选项
  → prepared：从此禁止取消
  → 同一个 main Session 写正文，完整句立即展示
  → 保存事件、分支状态和记忆
~~~

依据：[运行时](../../src/pi-story-runtime.js)、[服务端回合处理](../../src/server.js)、[状态裁决](../../src/story-engine.js)。

这里有四个 Session，但正常链路有五项高层生成任务：三个领域报告、一次主裁决、一次正文。真实网络请求数还受工具循环、结构失败和 SDK 重试影响。三个报告并行可以降低该阶段等待，裁决与正文仍在其后串行执行。

### 当前值得保留的设计

- TURN_PROPOSAL_SCHEMA 与 applyTurnProposal：模型提议、程序应用状态的边界已形成。
- 人格 soul.md 与运行状态分开；知识使用有事实 ID 校验；公开接口做信息裁剪。
- 原剧情节点允许永久 blocked，玩家偏离不被无条件拉回。
- 事件、Session 锚点、持久化作业和事件序号为恢复与复盘提供基础。
- 选项有推进目标与行为方案，结束状态会阻止继续生成。

### 优先解决的缺口

| 优先级 | 静态代码证据 | 影响与建议 |
|---|---|---|
| P0 | src/pi-story-runtime.js:531 起先 prepared 再输出正文；test/pi-story-runtime.test.js:70 明确测试正文不复核 | 提案通过后，正文仍可能增加新事实、泄露秘密或改变行动。加入正文与提案对照检查，调整发布协议 |
| P0 | src/pi-story-runtime.js:168 的人物调用包含多人的知识；正文复用 main Session | ID 校验不能保证自然语言不串角色秘密。写手需要干净、视角限定的上下文；高风险人物反应可分开审查 |
| P0 | src/story-store.js:128 起顺序保存 branch、memory、events、状态文件；第 22 行为单文件 rename | 单文件原子替换不构成整轮事务。事件、当前状态、分支头与作业终态需要同一提交边界 |
| P1 | src/story-domain.js:104 起按末尾行截断；分支 1600 字符、人物/环境各 800 | 没有持久结构的早期承诺、关系变化理由和伏笔可能退出显式记忆。补事件与叙事承诺，摘要作派生视图 |
| P1 | src/server.js:106 仅装配最近四回合；Pi 又持久化 Session 并启用 compaction | 不能认定模型只看到四轮：显式上下文与 Session 历史同时起作用。事实来源应可重建，Session 不当作额外权威 |
| P1 | story-context.js 筛选相关信息，但 runtime 的 plot、environment 提示词仍附加较大目录/全量信息 | 统一 ContextBuilder，记录输入块来源、预算和裁剪原因，减少重复拼接 |
| P1 | generateProse 最多三次尝试，SDK 另有重试，结构校验也可重试 | 应用层保存总截止时间、总调用额度、已用额度及取消状态，重连沿用同一预算 |
| P2 | story-package.js、stories 目录与现有手工资产 | 增加作者侧导入、证据定位、冲突确认、不可变版本和发布前试演 |

补充两个实施细节：

1. src/story-quality.js:25 的 validateTurnQuality 没有接入当前生产调用链；它只检查长度、重复和选项，而且无条件要求 2–4 个选项。直接接回会错误阻止合法结局，必须先对齐进行中/结束协议，再增加正文事实审查。
2. StoryStore.saveBranch 每次还会遍历并写出已有事件。改成增量事件写入可减少随历史增长的 IO，迁移时需保留既有分支和 Session 恢复映射。

这些是代码风险判断。本次没有故障注入，也没有声称已复现数据损坏或实际秘密泄露。

## 5. 建议的目标架构

离线作者链与在线读者链分别优化。创作知识可以持续丰富，在线路径保持可预测的边界。

~~~text
作者链：素材 → 来源与冲突核对 → StoryPackage → 固定脚本试演 → 发布版本

在线链：玩家行动
          ↓
        ContextBuilder（权威状态 + 人物权限 + 当前交接 + 相关历史）
          ↓
        Director（行动、人物动机、场景推进、状态提案）
          ↓
        RuleValidator（引用、物品、地点、时间、知识、路线）
          ↓
        Writer（隔离上下文，只生成候选正文与呈现）
          ↓
        Review（正文与计划对照，问题附位置和证据）
          ├─ 未通过且有预算 → 一次修订 → 再检查
          ├─ 未通过且无预算 → 结束作业，保留上一已提交回合
          └─ 通过 → Commit → 发布定稿
                              ↓
                    后台摘要、回顾、可重建索引、离线评估
~~~

这是一项推荐设计，不是声称已经实现或实测最优。

### 5.1 角色分工与 Pi 的边界

Pi 继续处理模型适配、受控工具调用和执行记录。应用层拥有调度、权威事实、截止时间和提交权。Director、Writer、Review 是逻辑职责，不必对应三个永不结束的聊天 Session。

第一轮可保留三个分析角色，集中修复状态与发布边界。之后用同一评测集比较：保留三领域并行，或将情节与人物收敛到 Director、把可枚举环境判断下沉为程序。对重大信念冲突、身份揭示和死亡场景，按需要启用更细的人物复核。

独立 Writer 的含义是：即使使用同一模型，也不复用已包含私有动机、全部秘密和未采纳提案的 main 历史。它只得到允许叙述的事实、行为节拍、前文衔接和风格样稿。

### 5.2 权威状态、记忆与检索

首版建议用 SQLite 保存少量明确对象：

| 对象 | 作用与建议字段 |
|---|---|
| story_packages | 固定故事包版本、来源和发布哈希 |
| turn_events | 已提交行动与后果；parentEventId、原因、证据、正文版本 |
| character_state / character_knowledge | 人物状态、信念、知情事实、获知事件 |
| narrative_threads | 伏笔、承诺、债务；建立依据、兑现条件、状态 |
| turn_jobs / turn_candidates | 总截止时间、调用额度、候选正文与状态变更、审核绑定 |

保留当前 threads、generatedFacts 和 storyProgress 的有用语义，通过 schema 迁移扩充，不平行复制成第二套状态。

上下文优先级：不可丢的世界约束和当前状态 → 本轮人物与交互 → 临期承诺 → 最近正文 → 历史检索。关键事实必须可确定查询，历史回忆再做全文或向量召回。先实现实体 ID、事件 ID、别名和全文检索，再根据固定查询集决定是否加入向量库与 reranker。中文分词、切片和 token 预算要实测，避免直接沿用英文字符估算。

即使读者暂时不能切平行分支，检索也必须限定当前故事版本、存档祖先事件、故事时点和人物知情范围。不能仅用整本书 ID 过滤。

### 5.3 发布协议与事务

现有“句子一显示就不可撤回”和“完整正文审核通过才发布”是两种不同契约。建议采用既有生产化评审稿的定稿发布方向：等待时显示真实阶段，通过审核后展示本轮正文；若希望逐句出现，可对已经审核的文本做展示动画。网络 NDJSON、恢复与阶段事件仍可保留。

若未来保留即时模型流式体验，应另行定义逐句/分段校验的有限保证，不能声称整轮正文已经提前审核。

提交时校验 baseEventId，将已确认正文、事件、硬状态、分支头和作业终态在同一事务中完成。客户端的“完成”对应已持久化版本；发布事件可采用事务内 outbox。Markdown 和检索索引在提交后派生，带版本号并可重建。

### 5.4 审查与预算

程序检查引用、持物变化、人物状态、时间、知识范围和终态。模型补充审查动机、因果铺垫、越权控制玩家、未授权事实，以及正文是否实现计划。问题附正文位置、严重程度和事实/事件 ID。

把事实/权限必过项与文风建议分开：文风建议可以不阻断，秘密泄露和互斥事实不能用文笔分数抵消。修订稿绑定新的正文哈希，旧审核不能复用。

建议首版最多一次修订；调用上限和截止时间由基线测试决定。既有方案的 15 秒、P95 30 秒和 45 秒总预算均为拟定目标，本次没有验证这些数字。

## 6. 结合现有文件的落地顺序

### 第一步：补齐一轮故事的可信边界

- 在 src/pi-story-runtime.js 分离候选生成与对外发布，Writer 使用独立且可重建的上下文。
- 扩充 src/story-quality.js，先修复结束状态的选项契约，再接入正文与状态的对照检查。
- 在 src/server.js、src/turn-job-manager.js 保存统一预算，调整取消和重连协议。
- 为 src/story-store.js 增加单一事务存储，保留既有事件、分支与作业迁移路径。
- 更新 test/pi-story-runtime.test.js:70 的旧协议断言，检查前端 prepared、正文展示和终态处理。

验收看：秘密泄露是否阻断、取消后是否无新事实、重连是否只完成一次、结局是否不再要求选项、提交中断是否能恢复完整版本。

### 第二步：补记忆，再衡量调用复杂度

- 以 src/story-domain.js 的事件与状态为基础，记录人物变化依据和叙事承诺。
- 在 src/story-context.js 统一分层装配，清理 runtime 内重复附加的目录。
- 对比三领域分析与精简 Director，记录真实请求、输入输出 tokens、重试、首段和终稿时延。

验收看：早期约定能否在关键场景召回、不同人物秘密是否隔离、已阻止节点是否不再被换名强推、选择是否产生可追溯差异。

### 第三步：验证故事包复用

参考 Oh Story 的创作方法、NovelForge 的结构化资产和 MuMu 的作者管理方式，增加导入、证据核对、试演与版本发布。用第二个原创故事包检验引擎是否依赖《龙族》的特定字段和提示词。作者链可多步骤，读者链保持明确上限。

现阶段没有充分证据要求更换 LangGraph/CrewAI、为每位 NPC 常驻一个 Agent、部署独立图数据库，或同时引入多套向量检索设施。先以短篇互动目标验证所需能力，再按测量结果扩展。

## 7. 评估方式

本次只做调研与静态核查。后续应在同一故事包版本、相同模型配置下保留基线与改造结果：

| 维度 | 有用的验证任务 |
|---|---|
| 状态 | 物品转移、伤亡、时间推进、跨场景行动、提交中断 |
| 知识 | NPC 独知秘密、错误信念、玩家提前猜中真相 |
| 玩家作用 | 阻止原剧情、拒绝建议、多步行动边界、失败与提前结局 |
| 记忆 | 早期承诺兑现、离场人物再现、伏笔跨场景回收 |
| 小说质量 | 承接、人物声音、动机、冲突与节奏；盲评补充模型诊断 |
| 运行 | 请求与 tokens、首段和终稿时延、P50/P95、修订率、取消率、重复提交率 |

覆盖完整短篇及重复故障点后，再考虑更长连载。代码测试可以证明部分协议不变量，不能证明文笔或长程可读性。

## 8. 可复查来源

源码链接固定到本次检查的提交；仓库首页和在线文档会继续变化。精确采样时间保存在 JSON 快照。

仓库与版本：

- [Narcooo/inkos][S1]：10066 stars；提交 8fc2ae57080b9821257dee3e37cc677e2b6f389a。
- [zenstory-ai/oh-story-claudecode][S2]：7145 stars；提交 4a50d5583590eb7f207037e35136c1168bc02201。
- [YILING0013/AI_NovelGenerator][S3]：6133 stars；提交 f9aefef90b1493c579d7f72547efb4a3d8a0da25。
- [xiamuceer-j/MuMuAINovel][S4]：3087 stars；提交 749186d40894b40b9fd0589791fec243d42e60c9。
- [ExplosiveCoderflome/AI-Novel-Writing-Assistant][S5]：3030 stars；提交 2c035ac70f2639be46b9e77feb60028181bf7b65。
- [RhythmicWave/NovelForge][S6]：1216 stars；提交 a485814411546b3980df0a1696a0fb6a043d56ce。
- [SillyTavern/SillyTavern][S7]：33856 stars；仅仓库与官方文档核查。

关键实现索引：

- [Narcooo/inkos / packages/core/src/harness/context-compiler.ts][S1-context]
- [Narcooo/inkos / packages/core/src/retrieval/local-search.ts][S1-retrieval]
- [Narcooo/inkos / packages/core/src/play/play-runner.ts][S1-play]
- [Narcooo/inkos / packages/core/src/pipeline/chapter-review.ts][S1-review]
- [zenstory-ai/oh-story-claudecode / skills/story-long-write/references/tracking-transaction.md][S2-state]
- [YILING0013/AI_NovelGenerator / novel_generator/chapter.py][S3-code]
- [xiamuceer-j/MuMuAINovel / backend/app/services/chapter_context_service.py][S4-code]
- [ExplosiveCoderflome/AI-Novel-Writing-Assistant / docs/wiki/workflows/chapter-production-chain.md][S5-chain]
- [ExplosiveCoderflome/AI-Novel-Writing-Assistant / docs/wiki/rag/knowledge-and-context-assembly.md][S5-context]
- [SillyTavern World Info 官方说明][S7-world]

[S1]: https://github.com/Narcooo/inkos
[S2]: https://github.com/zenstory-ai/oh-story-claudecode
[S3]: https://github.com/YILING0013/AI_NovelGenerator
[S4]: https://github.com/xiamuceer-j/MuMuAINovel
[S5]: https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant
[S6]: https://github.com/RhythmicWave/NovelForge
[S7]: https://github.com/SillyTavern/SillyTavern
[S1-context]: https://github.com/Narcooo/inkos/blob/8fc2ae57080b9821257dee3e37cc677e2b6f389a/packages/core/src/harness/context-compiler.ts
[S1-retrieval]: https://github.com/Narcooo/inkos/blob/8fc2ae57080b9821257dee3e37cc677e2b6f389a/packages/core/src/retrieval/local-search.ts
[S1-play]: https://github.com/Narcooo/inkos/blob/8fc2ae57080b9821257dee3e37cc677e2b6f389a/packages/core/src/play/play-runner.ts
[S1-review]: https://github.com/Narcooo/inkos/blob/8fc2ae57080b9821257dee3e37cc677e2b6f389a/packages/core/src/pipeline/chapter-review.ts
[S2-state]: https://github.com/zenstory-ai/oh-story-claudecode/blob/4a50d5583590eb7f207037e35136c1168bc02201/skills/story-long-write/references/tracking-transaction.md
[S3-code]: https://github.com/YILING0013/AI_NovelGenerator/blob/f9aefef90b1493c579d7f72547efb4a3d8a0da25/novel_generator/chapter.py
[S4-code]: https://github.com/xiamuceer-j/MuMuAINovel/blob/749186d40894b40b9fd0589791fec243d42e60c9/backend/app/services/chapter_context_service.py
[S5-chain]: https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/blob/2c035ac70f2639be46b9e77feb60028181bf7b65/docs/wiki/workflows/chapter-production-chain.md
[S5-context]: https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/blob/2c035ac70f2639be46b9e77feb60028181bf7b65/docs/wiki/rag/knowledge-and-context-assembly.md
[S7-world]: https://docs.sillytavern.app/usage/core-concepts/worldinfo/
