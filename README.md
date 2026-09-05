# AI novel

一个以 Pi 为运行基座的本地互动小说引擎。当前实验用《龙族：东京出走》验证“故事包 + 主 Agent + 情节、人物、环境三个子 Agent”的完整流程。

## 当前能力

- 开场依次展示前情提要、18 页漫画、4 个可选角色、8 个不可选 NPC 和角色确认。
- 故事包拆分保存原著事实、角色知识、七节点主干、人物灵魂、地点说明和预生成场景图。
- 四个角色共用一份 vendored Pi SDK 和一个模型运行时，但各自拥有独立 Session、提示词和工具契约。
- 情节、人物、环境 Agent 并行提交结构化提案；主 Agent 合并冲突、完成连续性判断并输出唯一的最终正文。
- 玩家合理阻止原著节点时，节点永久标为 `blocked`，剧情走替代路线并只接入兼容的后续节点；无法接回时进入偏离结局。
- 每回合只加载当前分支摘要、最近 4 回合、涉及人物记忆、当前场景和相邻主干节点。
- 正文按完整句子流式展示。已经显示的句子不会复核、改写或撤回；正文后的状态与记忆一次性原子提交。
- 回合是服务端持久化作业。关闭浏览器不停止生成，刷新后通过事件序号继续；只有 `prepared` 前可以取消。
- 只有用户明确保存平行路线时才创建物理分支，普通绕路只更新当前分支的路线状态。

浏览器只收到玩家当前应当知道的人物、线索和状态。原著隐藏事实、NPC 私有知识、人物私有动机和内部主干条件不会通过故事接口返回。

## 运行

需要 Node.js 22.19 或更高版本。

```bash
npm run setup
npm start
```

默认读取 `~/.pi/agent` 中的模型和鉴权配置，四个角色统一使用 `pi-gateway/deepseek-v4-flash:cloud`。也可用 `PI_STORY_PROVIDER`、`PI_STORY_MODEL` 或各角色专属的 `PI_MAIN_MODEL`、`PI_PLOT_MODEL`、`PI_CHARACTER_MODEL`、`PI_ENVIRONMENT_MODEL` 覆盖。

服务默认监听 `0.0.0.0:4317`，本机访问 <http://127.0.0.1:4317>。

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

## Pi 参考

- [项目内 Pi 源码](./vendor/pi)
- [Pi 上游源码（v0.84.1）](https://github.com/earendil-works/pi/tree/v0.84.1)
- [Pi SDK 文档](https://pi.dev/docs/latest/sdk)
