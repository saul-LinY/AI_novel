# AI novel

一个以 Pi 为运行基座的本地互动小说引擎。当前实验用《龙族：东京出走》验证“故事包 + 主 Agent + 情节、人物、环境三个子 Agent”的完整流程。

## 当前能力

- 从水墨与灯影的故事封面启卷，预览四份人物档案并确认身份后进入正文；已有存档可直接继续。完整前情、18 页漫画、人物介绍和 8 位 NPC 保留在可随时回看的序幕中。
- 用户前端采用导入的 React 设计模板：墨黑与黄铜色、衬线字、玻璃浮层、墨迹与光尘动效。正文保持连续阅读，选择附带具体行动说明；场景随地点交叉淡入。支持行动与对话输入、剧场与专注视图、字号调节、系统减弱动态、键盘选角与手机底部确认；人物、真实关系和线索通过卷宗查看。
- 故事包拆分保存原著事实、角色知识、七节点主干、人物灵魂、地点说明和预生成场景图。
- 四个角色共用一份 vendored Pi SDK 和一个模型运行时，但各自拥有独立 Session、提示词和工具契约。
- 情节、人物、环境 Agent 并行提交结构化提案；主 Agent 合并冲突、完成连续性判断并输出唯一的最终正文。
- 等待期不再空白：提交的行动立即回显，「查看现场 / 揣摩人物 / 推演剧情 / 定稿执笔」四个步骤实时显示进行中或已完成，环境与人物 Agent 提供经过泄密过滤的感官描写，裁决后立即换场并显示结果基调。
- 后半段链路围绕三本随分支走的叙事账本运转：张力曲线让程序算出每回合的节奏指令（同节拍/同张力不连用、低张力三回合必须升级、每回合必须有价值翻转）；伏笔账本跟踪埋下、正文露面、强化、窗口内回收；事实账本由连续性记录员从已发布正文逐字摘录，人物只记得自己亲历的条目。主创提案经「提案闸门」检查世界因果、节奏、伏笔与前文呼应，正文按只含伏笔表面细节的写作简报写作，世界状态与账本一次原子提交。详见 [Agent Loop 第 10 节](docs/current-workflow/agent-loop.md#10-后半段链路精准记忆跌宕节奏与伏笔)。
- 可选的选项 Agent 与正文并行生成下一步选项，由 `.ai-novel/pipeline.json` 开关，详见 [Agent Loop](docs/current-workflow/agent-loop.md#9-2026-10-重设计等待体验质量与可观测)。
- 每回合记录各 Agent 的耗时、token、重试与校验失败，在工作流控制台的「性能」视图中查看。
- 玩家合理阻止原著节点时，节点永久标为 `blocked`，剧情走替代路线并只接入兼容的后续节点；无法接回时进入偏离结局。
- 每回合只加载当前分支摘要、最近 4 回合、涉及人物记忆、当前场景和相邻主干节点。
- 正文按完整句子流式展示。已经显示的句子不会复核、改写或撤回；正文后的状态与记忆一次性原子提交。
- 每次续写通常为 2～3 个自然段，连续承接上一段的动作与对话；阅读正文不插入选择记录。已有正文与流式续写都会合并过短的碎段，段间不留空行，用首行缩进区分自然段。
- 回合是服务端持久化作业。关闭浏览器不停止生成，刷新后通过事件序号继续；只有 `prepared` 前可以取消。
- 页面沿当前存档继续故事，不提供创建或切换平行分支的操作；合理绕路只更新当前存档的路线状态。
- 推荐选项围绕尚未解决的公开线索或阶段目标展开，包含不同的行动手段、可能变化与代价。正文开始前校验内部推进计划，拦截目标失效、行动重复和缺失计划的选项；日常互动也须带动具体冲突。
- 最终阶段完成时生成结构化结局，停止追加选项；结局页面保留全篇回看，服务端阻止已完结存档继续创建回合。

浏览器只收到玩家当前应当知道的人物、线索和状态。原著隐藏事实、NPC 私有知识、人物私有动机和内部主干条件不会通过故事接口返回。

## 运行

需要 Node.js 22.19 或更高版本。

```bash
npm run setup
npm start
```

默认读取 `~/.pi/agent` 中的模型和鉴权配置，四个角色统一使用 `pi-gateway/deepseek-v4.1-flash:cloud`。也可用 `PI_STORY_PROVIDER`、`PI_STORY_MODEL` 或各角色专属的 `PI_MAIN_MODEL`、`PI_PLOT_MODEL`、`PI_CHARACTER_MODEL`、`PI_ENVIRONMENT_MODEL`、`PI_RECORDER_MODEL`、`PI_CHOICES_MODEL` 覆盖。

服务默认监听 `0.0.0.0:4317`，本机访问 <http://127.0.0.1:4317>。

## 用户前端（新 UI 模板）

源码位于 `frontend/`，保留上传的 `Interactive Novel Frontend Design.zip` 作为设计参考。模板的演示剧情和浏览器本地模拟存档已替换为现有 `/api` 接口；正式存档仍由后端保存在 `.ai-novel/`。

`npm run setup` 会安装整个工作区依赖，`npm start` / `npm run dev` 会先自动构建前端。已有依赖环境升级时先运行一次 `npm install`。

~~~bash
npm run build:frontend   # 构建到 public/ui，并发布 public/index.html
npm run dev:frontend     # Vite 热更新：http://localhost:5173/ui/；后端另行运行
npm run check:frontend   # TypeScript 检查
npm run test:frontend    # 公开数据映射与 NDJSON 回放测试
npm run test:ui          # Chrome 端到端测试：临时存档、确定性运行时，不调用模型
~~~

Vite 开发服务把 `/api` 和 `/assets` 代理到本地 `4317` 端口。后端端口或地址变化时，请同步调整 `frontend/vite.config.ts` 中的代理。生产运行只需原有 `4317` 服务，不依赖 Vite。

详细的模板适配说明与功能覆盖见 [界面设计说明](docs/immersive-redesign.md)。

## 美术资源

全部美术由 `stories/dragon-raja/art/` 中的美术圣经（`art-bible.md`）、人物设定稿和生成清单驱动，需在 `.env` 中配置 `SUB2API_BASE_URL` 与 `SUB2API_API_KEY`：

```bash
npm run art:generate     # 封面、角色主视觉、NPC 立绘、地点状态、结局插图、纹理（已存在的跳过）
npm run art:comic        # 由 art/comic-script.json 重建漫画数据并逐页生成 18 页序幕漫画
npm run assets:optimize  # 为所有 PNG 生成 WebP，服务端按浏览器支持自动返回
```

漫画分镜脚本 `art/comic-script.json` 是唯一事实源，`scripts/build-comic.js` 会由它生成 `comic/pages.json`、`background/beats.json` 和生图任务。

## 三层长期记忆（本地 BM25）

长期记忆统一使用本地 BM25：全局事件原文与事实、按角色隔离的认知记录，以及按当前行动/地点/目标选择的回忆。正文和状态仍由原有回合提交流程决定。检索包含中文分词、显式人物别名和词频/文档长度排序，无需外部服务、API 密钥或下载模型。

- 全局记录保留完整正文分段；角色视图来自明确的角色记忆和已知事实，同场出现不自动分享秘密。
- 查询先限定故事、存档历史和角色，再评分并核对来源，排除另一分支、未来回合、旧版本内容或伪造结果。
- 回合保存后后台索引，重启可补齐；索引尚未写入时直接检索已提交的记忆卡，不必等待后台。异常时仍只在允许的本地资料里回退查找。
- 本地 BM25 索引保存在 `.ai-novel/memory/bm25/`，后台写入、前台检索和控制台核对都无需网络。

配置：`.ai-novel/memory/config.json`。支持 `enabled`、固定值 `retriever: bm25`、`searchTimeoutMs`、`topK`、`maxContextChars`。配置文件不存在时默认关闭，兼容原有安装。

```bash
npm run memory:setup   # 启用本地记忆
npm run memory:status  # 查看启用状态和索引路径
npm run memory:probe   # 本地检索自检
npm run memory:index   # 为当前存档补齐索引
npm run memory:eval    # 禁止网络访问，运行本地 BM25 量化评估
```

运行状态：`GET /api/memory/status`。工作流控制台的共享上下文包含检索来源、角色分组及耗时。修改配置后重启服务；临时停用可设 `AI_NOVEL_MEMORY=off`。小说正文生成仍使用原有 Pi 模型配置，只有记忆链路完全在本地运行。

详见[记忆层设计](docs/memory-design.md)和[BM25 量化评估](docs/evaluations/memory-bm25-evaluation.md)。

## 工作流控制台

在另一个终端运行 `npm run console`，打开 <http://127.0.0.1:4318>。控制台独立读取本地存档，无需启动第二个小说服务或配置模型。

控制台包含「工作流」「回合记忆」和「性能」三个视图。工作流画布显示完整 Agent Loop，正在运行的节点会高亮；点击节点可并排查看输入与输出。回合记忆按左侧选择的轮次展示「本轮新增」「截至本轮」「本轮调用」，可按人物/全局/环境筛选，搜索记忆文本，并展开原始来源。每 3 秒同步，内容无变化时不重绘记忆正文。

记忆条目的「已入库」来自对 BM25 本地索引文件的核对；尚未写入、仅有回执、索引不可读和内容不一致会分别标记。累计记忆不会包含后续轮次；失败或未保存的回合没有新增记忆。BM25 调用可查看命中词；使用过其他检索方式的历史回合保留原始标记，不冒充当前 BM25 结果。查看控制台不会调用模型或生成新的记忆。

默认读取 `.ai-novel`，可用 `AI_NOVEL_DATA_DIR` 指定其他数据目录，`AI_NOVEL_STORY_ID` 指定故事 ID，`CONSOLE_PORT` 修改端口。控制台只读存档；历史运行没有保存的输入、系统提示词或上下文不会补造，页面会说明记录范围。故事重置前、已不在当前分支历史中的作业不会混入当前列表。

## 故事包

故事包位于 `stories/<storyId>/`：

```text
manifest.json
background/{summary.md,beats.json}
comic/pages.json
canon/{truths.json,knowledge.json}
plot/spine.json
characters/<character-id>/{profile.json,soul.md,initial-state.json}
locations/<location-id>/{description.md,states.json,images/}
```

`summary.md` 提供连贯前情，`beats.json` 把 18 页漫画连接为带因果和视觉锚点的事件链。`soul.md` 只保存稳定人格；经历、关系和身体状态进入分支存档。地点引用 `public/assets/scenes/<storyId>/` 中的预生成图片，运行时不生图。

## 存档

schema v4 存档位于 `.ai-novel/stories/<storyId>/`。全局 `index.json` 只保存分支索引，每个显式分支独立保存：

```text
branches/<branch-id>/
├── branch.json
├── memory.md
├── plot-state.json
├── environment-state.json
├── environment-state.memory.md
├── characters/<character-id>/{state.json,memory.md}
└── turns/<turn-id>/event.json
```

旧 schema v2/v3 单文件存档会移动到 `.ai-novel/archive/`，不会静默删除。四个 Pi Session 位于 `.ai-novel/pi-sessions/<storyId>/`，持久化回合作业位于 `.ai-novel/stories/<storyId>/turn-jobs/`。

## 回合接口

- `POST /api/turn`：创建作业并返回 NDJSON 流。
- `GET /api/turns/:turnId/stream?afterSeq=N`：精确重放缺失事件。
- `POST /api/turns/:turnId/cancel`：仅在 `prepared` 前有效。
- `GET /api/turns/active`：查询当前未结束作业。

事件顺序为 `start`、若干 `phase`、`prepared`、可选 `scene`、若干 `prose_delta`、`complete`。不可恢复错误通过正文之外的 `failed` 事件报告；`prepared` 后的可恢复故障保留作业和正文前缀，下次连接时继续。

## 测试

```bash
npm test
```

测试覆盖故事包引用、四 Session 并行、知识隔离、节点阻止与兼容回归、分支记忆隔离、场景切换、取消边界、断线重放、完整句缓冲、服务重启续写和完整正文后的原子提交。

选项推进规则、校验边界和真实模型样本见 [选项与结局说明](docs/choice-progression.md)。

沉浸式界面的设计、图片来源和独立浏览器测试方法见 [界面设计说明](docs/immersive-redesign.md)。

## Pi 参考

- [项目内 Pi 源码](./vendor/pi)
- [Pi 上游源码（v0.84.1）](https://github.com/earendil-works/pi/tree/v0.84.1)
- [Pi SDK 文档](https://pi.dev/docs/latest/sdk)
