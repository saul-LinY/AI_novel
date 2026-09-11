# AI novel 代码与架构分析

分析日期：2026-09-05。源码快照：`97c6d9e`。故事包哈希：`b474f5ebec386a1c`。

本文依据当前源码、故事包、Pi SDK 接入路径和本地验证结果。现有产品设计文档只作为背景，不作为“已经实现”的证据。本次交付新增分析文档和 imagegen 架构图，没有修改业务实现。

## 1. 项目实际是什么

**这是一个以结构化世界状态为基础、由四个 Pi 会话协作生成正文的本地互动小说应用。** 浏览器提交玩家行动；服务端组织三个分析 Agent 提交报告；主 Agent 提交可校验的状态提案；程序先验证提案，再允许正文流出；正文结束后，服务端保存事件、状态和记忆。

项目最重要的设计是把“模型判断”“确定性状态更新”“玩家看到的文字”分成不同环节。模型可以提出剧情变化，但真正改变存档的是 `applyTurnProposal` 和 `appendTurn`。这为分支隔离、失败回滚和剧情规则提供了明确的代码边界。

当前运行形态是一个 Node.js 进程、一个全局故事实例、一套本地文件存档。它已经支持较完整的单人互动流程，但跨文件提交、并发准入和部分恢复窗口仍存在缺口，不能据此推断具有生产级事务保证。

### 实际规模

| 项目 | 当前代码中的值 |
| --- | --- |
| 应用 | `ai-novel@0.1.0`，ES Modules |
| Node 要求 / 本次验证 | `>=22.19.0` / `v22.23.1` |
| 项目后端 | `src/` 下 8 个 JS 文件，共 2,651 行 |
| 前端行为代码 | `app.js` 854 行，`ambient.js` 451 行 |
| 当前加载故事 | `dragon-raja`，标题“龙族”，副标题“东京出走 · 绘梨衣线” |
| 故事内容 | 12 个人物，4 个可选角色，8 个开场 NPC，18 页漫画 |
| 世界数据 | 7 个地点、7 个场景状态、9 个固定事实、10 种物品、4 条剧情问题 |
| 情节结构 | 7 个主干节点 |
| AI 角色 | main、plot、character、environment，共 4 个 Session |
| 根目录依赖 | `lucide@1.31.0`、`typebox@1.3.7` |
| 模型基础设施 | 内置 `vendor/pi` v0.84.1 |

这里的“四个 AI 角色”与“四个可扮演人物”是两套概念。选择绘梨衣或路明非，会改变玩家知识、开场和初始状态；不会把四个 AI Session 改成四个小说人物各自运行。

## 2. 架构图

![AI novel 项目架构](/Users/saul/Documents/ChatGPT/AI_novel/docs/architecture/ai-novel-architecture.png)

图使用内置 imagegen 生成，并针对初稿的存储连线进行一次校正。上半部分表示主要模块协作，下方四栏是依赖与存储清单，最下方是回合时序。部分跨模块操作由 `server.js` 的回调协调，图中省略了绕行连线，以下代码调用关系是精确依据。

生图记录：[初始提示词](/Users/saul/Documents/ChatGPT/AI_novel/docs/architecture/imagegen-prompt.txt)、[连线校正提示词](/Users/saul/Documents/ChatGPT/AI_novel/docs/architecture/imagegen-refinement-prompt.txt)。

## 3. 模块职责与边界

| 模块 | 职责 | 关键入口 |
| --- | --- | --- |
| 浏览器 | 选角、前情展示、正文阅读、行动输入、分支操作、流恢复 | [app.js](/Users/saul/Documents/ChatGPT/AI_novel/public/app.js:554) |
| HTTP 与应用协调 | 启动依赖、API 路由、执行回合、最后提交存档 | [server.js](/Users/saul/Documents/ChatGPT/AI_novel/src/server.js:67) |
| 回合作业 | 作业记录、事件序号、持久化事件流、监听者、终态 | [turn-job-manager.js](/Users/saul/Documents/ChatGPT/AI_novel/src/turn-job-manager.js:18) |
| AI 编排 | 创建四个 Session、组装上下文、工具提交、逐句生成与续写 | [pi-story-runtime.js](/Users/saul/Documents/ChatGPT/AI_novel/src/pi-story-runtime.js:229) |
| 规则引擎 | TypeBox 契约、引用验证、知识门槛、状态增量、节点和结局约束 | [story-engine.js](/Users/saul/Documents/ChatGPT/AI_novel/src/story-engine.js:464) |
| 故事领域 | 事件树、分支、记忆更新、玩家可见状态投影 | [story-domain.js](/Users/saul/Documents/ChatGPT/AI_novel/src/story-domain.js:59) |
| 存档适配 | 内存缓存、本地分支文件读写、旧格式归档、包版本检查 | [story-store.js](/Users/saul/Documents/ChatGPT/AI_novel/src/story-store.js:33) |
| 故事包加载 | 聚合 JSON/Markdown、校验组件引用、计算哈希、解析玩家角色 | [story-package.js](/Users/saul/Documents/ChatGPT/AI_novel/src/story-package.js:291) |
| 文本质量辅助 | 重复正文、短正文、重复选项检测；当前未接入正式生成链路 | [story-quality.js](/Users/saul/Documents/ChatGPT/AI_novel/src/story-quality.js:25) |

精确依赖关系是：`server.js` 调用 Runtime 生成结果，再调用 Domain 形成新事件，最后调用 Store 保存。Runtime 和 Domain 都会调用 Engine；Runtime 的调用是预演校验，Domain 的调用产生正式事件里的 `stateAfter`。作业管理器不负责推理剧情，也不直接修改人物状态。

前端使用原生 DOM、Fetch、CSS 和 Lucide，没有 React/Vue，也没有前端打包器。`ambient.js` 使用 Canvas、指针事件和动画帧处理视觉效果，不参与模型请求和剧情状态更新。后端基于 `node:http`，没有 Express、Redis 或独立队列服务。

### 启动路径

1. `npm start` 执行 `node src/server.js`。
2. `createAppServer` 固定加载 `dragon-raja`，随后读取或初始化存档。
3. 根据已保存的玩家角色调用 `resolvePlayableRole`，确定本次运行的故事配置。
4. 创建 `PiStoryRuntime`，初始化四个 Pi Session，保存对应会话文件路径。
5. 加载所有 `turn-jobs`，把非终态作业重新交给 `executeJob`。
6. HTTP 服务开始监听，默认 `0.0.0.0:4317`。

Pi SDK 通过相对路径直接导入 `vendor/pi/packages/coding-agent/dist/index.js`，因此必须先有本地构建产物。[setup-local-pi.js](/Users/saul/Documents/ChatGPT/AI_novel/scripts/setup-local-pi.js:24) 负责安装 vendored 依赖、准备模型目录数据、离线构建 Pi，再安装应用依赖。

## 4. 一个回合的完整执行过程

### 4.1 接收行动与建立作业

浏览器通过 `POST /api/turn` 发送自由文本，或发送当前选项的 `choiceId`。服务端检查角色是否已选、分支是否仍为当前分支、选项是否存在、行动是否为 1 到 300 个字符。

推荐选项的实际 `action` 由服务端从当前事件中读取，不信任客户端提交的选项文本。命中的选项会设置 `trustedChoice=true`，跳过准确秘密词门槛，并要求主 Agent 不再以“行动不允许”为由拒绝该选项，但实际执行结果仍可能失败。

创建作业时预先分配两个 ID：`turnId` 用于生成与事件流，`eventId` 用于最终剧情事件。记录还包含 `branchId` 和旧 `headEventId`，用于提交前检测分支变化。参见 [回合入口](/Users/saul/Documents/ChatGPT/AI_novel/src/server.js:274)。

### 4.2 恢复对应分支的上下文

`executeJob` 从当前头事件取得完整状态，从分支事件中取最近 4 段正文，并读取分支摘要、人物记忆、环境记忆。

Runtime 用事件记录中的四个 `piEntryIds` 把各 Session 导航到对应历史节点。若没有历史节点，则重置当前叶节点并重建消息上下文。它没有为每个物理故事分支重新创建四个会话文件，而是在已有四棵 Pi 会话树上对齐位置。参见 [alignSession](/Users/saul/Documents/ChatGPT/AI_novel/src/pi-story-runtime.js:346)。

### 4.3 三个分析 Agent 并行

`generateTurn` 中的 `Promise.all` 同时请求情节、人物、环境报告，三份报告全部返回后才进入主 Agent。并行发生在同一进程内的模型请求层面。参见 [generateTurn](/Users/saul/Documents/ChatGPT/AI_novel/src/pi-story-runtime.js:424)。

| Agent | 实际收到的主要信息 | 唯一提交工具 | 报告用途 |
| --- | --- | --- | --- |
| 情节 | 原始行动、分支记忆、路线状态、当前附近主干、全部固定事实真相、全体人物简表 | `submit_plot_analysis` | 因果链、阻止节点、推荐节点、替代路线与禁止结果 |
| 人物 | 原始行动、最近正文、最多 8 个涉及人物的灵魂和记忆、按人物分组的已知事实 | `submit_character_analysis` | 可观察反应、私有原因、当前意图、知识引用、记忆建议 |
| 环境 | 原始行动、地点、场景、时间、物品、环境记忆、全部地点目录 | `submit_environment_analysis` | 可达性判断、耗时、资源限制、已有场景选择 |
| 主 Agent | 原始行动、当前状态、当前节点、相关人物、事实 ID 目录、三份报告、最近正文 | `prepare_story_turn` | 最终行动裁决、状态提案、下一步选项和需要保存的记忆 |

注意：虽然主 Agent 系统提示称自己是唯一接收玩家原始输入的角色，实际三个子 Agent 的提示构造函数也都嵌入了 `context.action`。真实拓扑是“程序分发玩家行动，再让主 Agent 汇总”，不是“主 Agent 先把行动规范化后才发给子 Agent”。

### 4.4 主 Agent 先提交结构化提案

主 Agent 首先调用 `prepare_story_turn`，提案包含：

| 字段 | 含义 |
| --- | --- |
| `normalizedAction` | 行动意图、拆解步骤、停止位置、停止原因 |
| `outcome` | 成功、付出代价的成功、有所得的失败、完全失败、行动不允许 |
| `choices` | 通常为 2 到 4 个下一步行动；结局和拒绝行动为零 |
| `storyProgress` | 目标完成、节点阻止、兼容跳转、绕路说明 |
| `delta` | 地点、时间、物品、人物知识、关系、身体状态、剧情问题的变化 |
| `npcIntents` | NPC 后续意图，不允许包含玩家角色 |
| `memoryNotes` 等 | 分支、人物、环境需要保留的记忆 |
| `ending` | 可选的结局类型、选择、后果、代价与未解问题 |

工具执行时调用 `applyTurnProposal(activeState, params, ..., "preview")`。通过才把参数放入 `pendingReports`，并返回 `terminate: true` 结束当前工具提交轮；失败则把校验错误返回给模型。若整个请求结束仍无结构化结果，`requestStructured` 还会补发一次“只调用工具”的提示。

三个子 Agent 的报告不是自动应用的状态差异。主 Agent 决定最终采纳哪些内容；子 Agent 提出的记忆也只有进入主提案的对应记忆字段后，才进入分支记忆。原始报告仍会保存在最终事件的 `agentReports` 中。

### 4.5 prepared 是展示承诺的边界

提案通过后，Runtime 设置 `preparedLocked=true`。服务端先持久化提案、场景、报告和会话节点，再发送 `prepared` 与 `scene` 事件。此时取消接口返回 409，但业务存档仍保持上一回合。

主 Agent 随后在同一个 Session 中进行第二次请求，只写正文。提示显式包含紧邻上一段正文、已准备提案和叙述要求，要求生成 300 到 520 个中文字符、5 到 7 段。这个长度是提示要求，不是程序强制的长度校验。

### 4.6 完整句输出与故障续写

`SentenceStream` 用 `Intl.Segmenter("zh-CN", {granularity:"sentence"})` 和句末标点判断缓冲区中的完整句。每次输出都同步追加到 `events.ndjson`，再写给浏览器监听者。这里的句子边界是语言分句与标点启发式，不是语义完整性审查。

浏览器以 `textContent += event.text` 追加正文。断线只移除监听者，不会调用模型取消。重连传入 `afterSeq`，服务端只重放更大序号的事件；整页刷新则先获取已提交故事，再从 `afterSeq=0` 重建未完成回合。

Runtime 在正文错误后丢弃尚未显示的残句，用已显示句子构造 `immutable_prefix`，最多进行 3 次应用层生成尝试；Pi 自身还启用了重试。若最终仍失败，prepared 作业进入 `paused`，下次连接或启动时继续。模型被要求不重复前缀，但代码没有对续写内容做语义去重。

参见 [SentenceStream](/Users/saul/Documents/ChatGPT/AI_novel/src/pi-story-runtime.js:186)、[generateProse](/Users/saul/Documents/ChatGPT/AI_novel/src/pi-story-runtime.js:393)、[前端事件处理](/Users/saul/Documents/ChatGPT/AI_novel/public/app.js:626)。

### 4.7 正文完成才形成正式故事事件

服务端先把完整生成结果放入 `job.completedTurn` 并落盘，再检查分支头是否仍与作业开始时一致。然后克隆 Store，调用 `appendTurn`，再次运行提案规则，形成事件和 `stateAfter`，更新记忆，调用 `StoryStore.save`，最后发送 `complete`。

因此，在正常运行期间，“已经看见本回合若干句子”和“人物知识、物品、分支头已经更新”是不同状态。完整正文之后才提交业务状态，有利于避免半回合状态进入下一回合；其崩溃一致性限制见第 9 节。

## 5. 故事包、规则和分支

### 内容组织

`manifest.json` 是当前内容入口，引用背景、漫画、事实、知识文件和主干节点。人物拆成公开档案 `profile.json`、稳定人格 `soul.md`、初始可变状态 `initial-state.json`；地点拆成描述与场景状态目录。

加载器把这些文件聚合成一个对象，使用 TypeBox 校验，并检查重要 ID 唯一性和交叉引用。所有被加载的 JSON/Markdown 原文参与包哈希；图片二进制不参与这个哈希。`stories/dragon-raja/story.json` 是迁移脚本使用的旧源文件，不是当前运行时的加载入口。

`scripts/imagegen.js` 是开发时的生图工具，可向配置的图片网关请求图片。小说回合运行时不会调用它，也不会动态生成漫画或地点图片；环境 Agent 只从现有场景状态目录选取资源。

### 规则引擎能确定性保证什么

`applyTurnProposal` 会克隆旧状态后应用变化。校验失败不会修改传入的旧状态。主要程序约束包括：

- 地点、场景、物品、人物、剧情问题、事实引用必须合法。
- 每回合耗时与关系增量有范围，关系最终限制在 -5 到 5。
- 不允许移除不存在的物品，不允许同回合获得并移除同一物品。
- 死亡不能逆转，死亡人物不能产生新行动意图。
- 模型不能在 `npcIntents` 中替玩家角色填写意图。
- 完全失败不能同时发放线索、物品、正向关系等收益。
- 拒绝行动不能携带状态变化，也不能写入正式事件。
- 临时事实必须提供来历并关联既有核心事实；运行时没有修改固定事实的接口。
- 普通结局必须等最后阶段完成；其他结局也必须满足触发约束并提供结算字段。

这些主要是结构和状态不变量。它们不能机械证明某段对话符合人物性格、某次移动符合完整物理条件，或某份证据真的足以支撑剧情判断。

### 主干节点和物理分支是两套机制

当前主干依次是：看见倒计时、谁来决定、为时间付费、治疗记录的缺口、不可逆的路线、红井之前、孤独者的回答。

常规推进通过 `completeGoalIds` 标记当前目标完成，达到目标数量后自动进入数组中的下一节点。阻止节点需要证据；若要继续，下一节点必须出现在当前节点的 `compatibleRejoinNodeIds` 中，同时提供替代因果说明；否则需要提交符合契约的结局。

被阻止节点记为 `blocked` 并加入 `blockedNodeIds`，程序只允许向后跳转。`route.mode="detour"` 表示当前分支中发生了绕路，不会自动创建新的物理存档分支。

显式保存平行路线才调用 `createBranch`。新分支复制分叉点之前的事件 ID 序列，并依据该历史重新计算记忆，不把来源分支在分叉点之后的记忆带过去。下一次生成时再把四个 Pi Session 对齐到分叉点记录的节点。参见 [createBranch](/Users/saul/Documents/ChatGPT/AI_novel/src/story-domain.js:143)。

`prerequisites` 会验证引用是否存在，但运行时不是按依赖图求解；`rejoinConditions` 是保存和传递给模型的文本，没有通用条件执行器。因此这是“有规则限制的顺序主干与兼容跳转”，不是完整的声明式剧情规划器。

## 6. 状态、事件和记忆如何保存

```text
.ai-novel/
  stories/dragon-raja/
    index.json
    branches/<branchId>/
      branch.json
      memory.md
      plot-state.json
      environment-state.json
      environment-state.memory.md
      characters/<characterId>/
        state.json
        memory.md
      turns/<eventId>/event.json
    turn-jobs/<turnId>/
      job.json
      events.ndjson
  pi-sessions/dragon-raja/
    main/...
    plot/...
    character/...
    environment/...
  archive/...
```

业务存档 schema 是 v4，故事包 schema 是 v2，两者版本不是同一个概念。

每个正式事件包含行动、正文、选项、完整 `stateAfter`、提案、报告、父事件 ID 和四个 Pi 节点 ID。因此它是“事件历史加每回合全量快照”的结构。恢复时主要从 `event.json` 中取头状态，不会重新执行所有历史提案，也不会把 `plot-state.json` 或人物 `state.json` 当作独立的权威源读取。

内存里分支可共享祖先事件对象，保存时每个分支目录又会写入自己的事件历史副本。因此逻辑共享不等于磁盘去重。

| 记忆 | 更新方式 | 当前上限 |
| --- | --- | --- |
| 分支记忆 | 行动和结果摘要 + 主 Agent 的 `memoryNotes` | 1,600 字符 |
| 每个人物记忆 | 主 Agent 的 `characterMemoryNotes` | 800 字符 |
| 环境记忆 | 主 Agent 的 `environmentMemoryNotes` | 800 字符 |
| Pi 会话历史 | SessionManager 保存工具调用与模型消息 | 由 Pi 上下文与压缩机制管理 |

前三类记忆是从末尾向前保留完整行的截断，不是模型重新总结。旧的关键事件可能随容量限制退出这些文本，但正式事件历史仍保存。

`StoryStore.load` 有进程内缓存，外部修改磁盘后不会自动刷新。版本或哈希不兼容会归档索引并重建初始 Store，不是把玩家历史迁移到新包。旧 v2/v3 单文件存档也会归档后初始化 v4。

## 7. Pi 在这个项目中承担什么

应用使用的是 Pi SDK：`createAgentSession`、`SessionManager`、`ModelRuntime`、`SettingsManager`、`defineTool`。SDK 在内部创建 Agent，把模型调用交给共享的 ModelRuntime；Agent Core 负责消息与工具执行循环，pi-ai 提供模型和 Provider 抽象。参见 [Pi SDK 会话创建](/Users/saul/Documents/ChatGPT/AI_novel/vendor/pi/packages/coding-agent/src/core/sdk.ts:169)。

四个 Session 共享一个 ModelRuntime，但各自有提示词、允许调用的工具和会话树。运行时关闭内置文件和 shell 工具，只开放各角色的结构化提交工具；自定义 ResourceLoader 也返回空的技能、扩展、AGENTS 文件集合。这使小说 Agent 的权限范围集中在提案提交。

配置目录优先使用构造参数，其次 `PI_AGENT_DIR`，最后 `~/.pi/agent`。从该目录读取 `auth.json` 和 `models.json`。本次分析没有读取或输出鉴权文件内容。

模型选择优先级是角色专用环境变量，再到全局环境变量，最后代码默认值：

```text
PI_MAIN_MODEL / PI_PLOT_MODEL / PI_CHARACTER_MODEL / PI_ENVIRONMENT_MODEL
  > PI_STORY_MODEL
  > deepseek-v4-flash:cloud

各角色 PI_<ROLE>_PROVIDER
  > PI_STORY_PROVIDER
  > pi-gateway
```

正常无重试路径通常包含 5 次应用层 `session.prompt`：三个并行报告、主 Agent 一次准备、主 Agent 一次正文。工具校验失败、补交报告、自动压缩和底层重试可能增加实际模型调用次数。首句延迟大致取决于最慢的子 Agent，加主 Agent 准备，再加正文首句生成时间；并行只缩短三个子 Agent 串行相加的那一段。

## 8. 浏览器接口与信息边界

| 接口 | 作用 |
| --- | --- |
| `GET /api/health` | 当前故事 ID、服务状态、是否有未结束作业 |
| `GET /api/story` | 当前分支正文及经过序列化的玩家可见状态 |
| `POST /api/roles/select` | 正式互动前选择人物并重建开场和会话 |
| `POST /api/turn` | 建立作业并返回 HTTP NDJSON 流 |
| `GET /api/turns/active` | 查询当前非终态作业 |
| `GET /api/turns/:turnId/stream?afterSeq=N` | 重放缺失事件并继续监听 |
| `POST /api/turns/:turnId/cancel` | 准备完成前取消 |
| `POST /api/cancel` | 保留的当前作业取消接口 |
| `POST /api/branches` | 从指定事件创建分支 |
| `POST /api/branches/select` | 切换当前分支 |
| `POST /api/reset` | 重置故事 |

主路径事件为 `start`、若干 `phase`、`prepared`、`scene`、若干 `prose_delta`、`complete`。其他路径包括 `rejected`、`cancelled`、`failed`、可恢复的 `error`。这是 Fetch 读取 `application/x-ndjson`，不是 SSE，也不是 WebSocket。

`serializeStore` 按玩家知识过滤事实，只返回已认识人物的有限字段，不输出 NPC 私有目标、知识列表、人物灵魂、完整提案或内部主干条件。静态文件服务只从 `public/` 返回资源，并单独开放 Lucide 文件。参见 [serializeStore](/Users/saul/Documents/ChatGPT/AI_novel/src/story-domain.js:184)。

但该边界有三项实际限制：一是正文与选项文本直接来自模型，未经过秘密语义过滤；二是一个人物 Agent 同时看到多个人物的分组知识，隔离主要靠标注和事实 ID 校验；三是接口没有用户身份体系，所有浏览器共享当前故事和分支。默认监听全部网卡，因此运行在可被其他设备访问的环境时，这些设备也可操作同一份状态。

## 9. 已验证的问题与架构限制

### 9.1 已复现：提交成功但作业未完成，会卡在恢复状态

触发窗口是 [保存故事之后](/Users/saul/Documents/ChatGPT/AI_novel/src/server.js:162)，但 `complete` 事件与作业终态落盘之前。此时正式事件已经改变分支头，作业记录仍指向旧头。

下次启动，`executeJob` 在检查 `job.completedTurn` 之前先比较旧头，抛出“故事分支在作业恢复前已经变化”。因为该作业有 prepared 数据，错误被统一转成 `paused`。`activeJob` 仍认为它未结束，后续新回合被 busy 门槛阻挡；刷新再次恢复也会遇到同一冲突。

本次在临时目录构造这一落盘状态，通过真实 `createAppServer` 恢复得到：

```json
{
  "probe": "restart-after-story-commit",
  "savedHead": "committed-event",
  "jobStatus": "paused",
  "activeJob": "committed-but-unfinished",
  "recoveryError": "故事分支在作业恢复前已经变化"
}
```

修复应利用已经分配的 `job.eventId` 做提交幂等判断：恢复时先识别这个事件是否已成功写入、是否属于预期父节点，再补齐完成状态。不可恢复的分支冲突也应与模型瞬时错误分开处理。

### 9.2 已复现：并发建立作业可绕过单回合限制

[TurnJobManager.create](/Users/saul/Documents/ChatGPT/AI_novel/src/turn-job-manager.js:60) 先检查 `activeJob()`，中间等待目录和文件创建，随后才把新作业加入 Map。两个并发调用都可以在 Map 为空时通过检查。

本次用真实管理器并发调用两次 `create`，结果两个 Promise 都成功，非终态作业数为 2。验证针对作业管理器准入层，没有实际调用外部模型。HTTP 层也没有覆盖完整异步生命周期的互斥锁，不能依靠浏览器禁用按钮来保证服务端串行。

两个作业若同时执行，会共享 Runtime 的 `activeState`、`pendingReports`、`preparedLocked` 和四个 Session；可能导致模型会话争用、报告串扰或其中一个作业错误暂停。需要在任何异步操作前建立有效的互斥保留，并把切分支、选角、重置等状态变更纳入同一协调边界。

### 9.3 源码确认：单文件原子写不等于回合事务

`atomicWrite` 的临时文件加 rename 可以避免一个文件被读到半份 JSON。但 [saveBranch](/Users/saul/Documents/ChatGPT/AI_novel/src/story-store.js:128) 先写新的 `branch.json`，再写记忆和回合事件，最后才在 `save` 中更新全局索引。

若新分支头写入后、对应事件落盘前中断，重启可能读到指向缺失事件的分支。`load` 外层对 `ENOENT` 的处理会走新建初始 Store，意味着存档损坏有机会被当成“尚无存档”。本项是依据写入和异常处理顺序确认的故障窗口，本次未执行逐个文件边界的崩溃注入。

最小改进是先写不可变事件与一代完整状态，再原子发布提交指针，并严格区分“没有索引”和“索引引用损坏”。若后续有并发或多人场景，再考虑把事件、分支头和作业完成状态纳入同一事务存储。

### 9.4 源码确认：正文连续性与秘密语义仍由模型承担

[story-quality.js](/Users/saul/Documents/ChatGPT/AI_novel/src/story-quality.js:25) 有重复检测函数和独立测试，但当前生产代码没有导入它。`generateProse` 不会强制检查字符数、整段重复、正文是否偏离提案或泄露私有原因。续写只通过提示要求模型避开已有前缀。

这与项目“不撤回已显示句子”的交互契约有关。后续加强质量时，应优先验证准备结果、筛选给正文模型的可写事实，并考虑发布句子之前的约束；不能简单在全文显示后调用旧校验器，再要求整回合重写。旧质量函数还强制要求 2 到 4 个选项，直接接入会拒绝合法结局回合。

### 9.5 源码确认：“最近 4 回合”不是模型总上下文上限

每次提示携带最近 4 回合，但四个 Pi Session 自身继续积累消息。SDK 会恢复 `existingSession.messages`，应用启用的是 Pi 自动压缩，没有逐回合清空全部历史。

此外，情节提示包含全部固定事实与人物简表，环境提示包含完整地点目录。主干窗口大致为上一节点、当前节点及后两个节点，人物上下文最多 8 人。随着故事内容和历史增长，真实 token 使用仍会增加，不能把显式摘要上限当作实际请求 token 上限。

### 9.6 源码确认：部分故事包字段没有完整进入执行路径

`canon/knowledge.json` 被加载并参与哈希，但初始知识实际取自人物 `initial-state.json`，知识门槛实际取自 `facts[].knowledgeGateTerms`。若作者只更新汇总知识文件，不会自动改变人物的真实初始知识。

`storyContextForModel` 包含世界规则、伏笔和结局约束，但当前 Runtime 没有调用这个函数；现用提示构造函数也未完整传入 `world.rules`、`foreshadows` 和 `ending.constraints`。这些内容的存在，不等于它们已被所有 Agent 读取或程序执行。

改进重点是建立“故事包字段 -> 初始状态 / 提示 / 程序规则”的映射，消除重复知识源，并为确实必须生效的约束加入契约检查。

### 9.7 源码确认：长篇和多分支会增加磁盘与内存成本

`StoryStore.save` 每次遍历所有分支，并重写每个分支的所有历史事件；事件本身又含完整状态快照。即使只是切换当前分支，也调用同样的保存路径。在状态大小近似不变的单分支场景，累计写入量随回合数呈平方增长趋势。

`TurnJobManager.initialize` 把所有历史作业及其事件读入内存，没有保留期限；`complete` 事件还保存了当时序列化的整段分支历史。再加上同步 `appendFileSync` 与未处理的 HTTP 写入背压，这套实现适合小规模本地使用，长篇场景需要按新增事件增量写入、按需加载历史和作业归档。

## 10. 验证范围

本次运行根目录 `npm test`：**34 项通过，0 项失败，0 项跳过**。测试覆盖分布：

| 测试文件 | 数量 | 主要覆盖 |
| --- | --- | --- |
| `pi-story-runtime.test.js` | 5 | 四会话回退、并行顺序、紧邻正文、取消、完整句输出 |
| `server.test.js` | 5 | 回合事件顺序、断线重放、提交时机、隐藏字段、准备后重启续写 |
| `story-domain.test.js` | 12 | 状态约束、知识、生成事实、阶段与结局、分支、玩家投影 |
| `story-package.test.js` | 3 | 包契约、资源引用、不同角色配置 |
| `story-quality.test.js` | 6 | 质量辅助函数，不代表生产链路已启用 |
| `story-store.test.js` | 3 | 旧格式归档、分支文件、包版本与哈希 |

额外执行了两项临时边界验证：并发作业准入，以及故事已提交、作业未完成时的启动恢复。均使用临时目录与模拟运行时，未使用真实玩家存档或外部文本模型；临时数据已清理。

现有 Runtime/Server 测试使用模拟 Session 或 FakeRuntime，其中部分直接替换 `requestStructured`。这些测试证明程序约定的调用顺序和特定状态行为，不能证明真实模型会持续遵守人物知识、300 到 520 字要求、故事因果或正文不重复。已有“重启只提交一次”测试覆盖的是提交前的 prepared 恢复，没有覆盖第 9.1 节的提交后窗口。

本次没有重新执行浏览器视觉 QA，也没有运行 vendored Pi 的完整测试套件。图片经过可视检查并修正连线；分析引用的实现与测试结果均来自当前工作区。

## 11. 对当前项目的判断与后续切入点

对于当前“本地单人、一个预制故事包、可回退和保存平行路线”的目标，模块拆分已经具有清楚的职责：内容包定义世界，模型提出候选变化，规则引擎守住结构与状态约束，事件保存分支历史，HTTP 事件流维持阅读体验。保留这一分层，比增加新的 Agent 数量更能维持可调试性。

最应优先处理的是已有承诺中的可靠性缺口：恢复幂等、作业准入互斥、存档提交顺序。它们直接关系到玩家正文和进度能否继续。之后再处理故事包知识源一致性、正文可写事实范围和上下文实际开销。

如果继续开发，按功能定位代码即可：改人物知识和世界约束主要看 `story-engine.js` 与故事包；改 AI 分工和提示看 `pi-story-runtime.js`；改重连与持久化看 `server.js`、`turn-job-manager.js`、`story-store.js`；改阅读、选角和分支交互看 `public/app.js`。扩展到多个独立玩家之前，需要先把现在全局的 StoryStore、Runtime 和 JobManager 按玩家或游戏实例隔离。
