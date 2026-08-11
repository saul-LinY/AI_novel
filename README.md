# AI novel

一个基于 Pi 的本地互动小说 Demo。玩家每回合输入行动，Pi 负责续写正文；应用自己保存时间、地点、人物关系、物品和线索，并在写入前检查状态是否合法。

项目内已经包含完整的 Pi v0.84.1 源码，位置是 `vendor/pi`。AI novel 直接加载这份源码的本地构建结果，不依赖项目外的 Pi 源码目录，也不使用 npm 下载的 `pi-coding-agent` 运行包。

## 现在可以做什么

- 自由输入行动，或点击 2 到 4 个建议选项
- 流式显示每回合正文
- 查看当前地点、时间、人物、物品、线索和未解问题
- 从任意历史回合创建分支，并在分支之间切换
- 自动保存故事，刷新页面后继续
- 只向模型提供与当前行动相关的隐藏线索候选，避免完整设定泄露
- 原子提交正文与状态；磁盘写入失败或分支版本冲突时整回合回滚
- Pi 不可用时自动切换到内置演示剧情

## 运行

需要 Node.js 22.19 或更高版本。

```bash
npm run setup
npm run dev
```

`npm run setup` 会依次安装 `vendor/pi` 的依赖、从项目内源码构建 Pi，再安装 AI novel 自身依赖。第一次运行需要能够访问 npm；以后源码和构建产物都留在 AI novel 目录内。

打开 <http://127.0.0.1:4317>。

默认的 `auto` 模式会读取 `~/.pi/agent` 中现有的模型配置。模型配置可能包含密钥，因此不会自动复制进项目。若要把配置也放在项目目录，可以建立 `.pi/agent`，并这样启动：

```bash
PI_AGENT_DIR="$PWD/.pi/agent" npm run dev
```

也可以在启动时明确指定模式：

```bash
AI_NOVEL_MODE=pi npm run dev
AI_NOVEL_MODE=demo npm run dev
```

- `pi`：必须成功连接 Pi 和已配置模型，否则启动失败。
- `demo`：不调用模型，使用固定剧情，适合快速体验界面和分支功能。
- `auto`：优先使用 Pi，配置不可用时回退到演示模式。

可用环境变量见 [.env.example](./.env.example)。故事保存在 `.ai-novel/story.json`，Pi 会话保存在 `.ai-novel/pi-sessions/`。这两个目录都不会提交到 Git。

## 这个 Demo 怎样使用 Pi

Pi 只负责模型调用、流式输出、会话树和上下文压缩。应用只向 Pi 开放一个 `commit_story_turn` 工具，不开放终端或文件工具。模型写完正文后，通过这个工具提出状态变化；应用检查移动路径、线索发现条件、正文证据、人物是否在场和剧情问题收束原因，全部通过后才保存。

`src/story-context.js` 是确定性的回合上下文编译器。它从世界状态、玩家行动和最近事件中选择本回合可用的秘密、人物目标与记忆摘要；未选中的秘密不会进入模型提示。每个已提交事件还会记录上下文选择痕迹、提交前后状态哈希和提交状态，方便回放与定位一致性问题。

`StoryStore.commit()` 在状态副本上完成变更，先写临时文件并原子替换 `story.json`，成功后才更新内存状态。浏览器同时提交预期的分支头节点；如果生成期间故事已经前进，本回合会被拒绝而不是覆盖新状态。

AI novel 的导入入口是 `vendor/pi/packages/coding-agent/dist/index.js`。若修改了 `vendor/pi` 中的源码，执行 `npm run pi:build` 后重启服务即可生效。

故事分支同时保存在两处：应用保存可验证的世界状态，Pi 保存对应的对话分支。切换故事分支时，应用会把 Pi 会话移动到同一个历史节点，再从那里继续生成。

首个 MVP 暂时不接 Mem0 或向量数据库。当前剧情、最近回合和 Pi 的上下文压缩足以验证核心玩法；等长程测试确认真的出现“找不到旧线索”后，再补长期记忆检索。

## 测试

```bash
npm test
```

测试覆盖状态增量、不合法状态、分支隔离、上下文秘密选择、浏览器隐私边界，以及持久化失败时的事务回滚。

## 参考

- [项目内 Pi 源码](./vendor/pi)
- [Pi 上游源码（v0.84.1）](https://github.com/earendil-works/pi/tree/v0.84.1)
- [Pi SDK 文档](https://pi.dev/docs/latest/sdk)
- [Pi Session Format](https://pi.dev/docs/latest/session-format)
