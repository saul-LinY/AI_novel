# 用户前端：Interactive Novel Frontend Design 模板接入

## 设计来源与实现

2026-09-30，将用户提供的 `Interactive Novel Frontend Design.zip` 导入 `frontend/`。采用模板的 React、TypeScript、Vite、Tailwind CSS 技术栈，保留墨黑/黄铜色、衬线字体、水墨、光尘、玻璃浮层、浮动行动区、角色确认和结局回顾的 UI/UX。

模板原本使用《雾港旧事》的固定剧情、模拟生成计时器和 localStorage 存档。接入后，所有故事、角色、漫画、正文、推荐行动、状态和结局来自当前项目的公开 HTTP 接口。使用项目现有《龙族：东京出走》的封面、人物与场景素材，不加载模板的外部演示图片。字体沿用模板配置，并保留本地中文字体回退。

## 2026-10 重设计

**等待期**：提交后正文末尾立即回显「你」的行动卡。行动区由光球和进度弧，改为四个写作步骤卡片——「查看现场」「揣摩人物」「推演剧情」「定稿执笔」，每张写明这一步在做什么，并用文字标出等待中 / 进行中 / 已完成。环境、人物 Agent 交来的一句感官描写在步骤上方淡入，主创裁决后显示结果基调（如「得偿所愿，代价随行」）。计时显示真实秒数，不显示百分比。场景在裁决完成时立即换图，不必等第一句正文。

**正文**：流式段落改为按句淡入，不再为每个字创建节点；写作中的段落使用 `aria-live` 播报。推荐行动点击后立即发出请求，墨迹动画与请求并行。

**美术**：所有新图由 `stories/dragon-raja/art/` 下的美术圣经与清单生成（`npm run art:generate`、`npm run art:comic`），用人物设定稿作为参考，保证跨图一致。

| 素材 | 位置 | 用途 |
|---|---|---|
| 横、竖两版封面 | `public/assets/covers/` | 入口页按视口比例选择 |
| 四位主角的角色主视觉 | `public/assets/roles/dragon-raja/` | 选角页 |
| 八位 NPC 立绘 | `public/assets/portraits/dragon-raja/` | 序幕人物页、卷宗头像（不在场者置灰） |
| 十张地点状态图 | `public/assets/scenes/dragon-raja/<地点>-<状态>.png` | 环境 Agent 通过 `sceneStateId` 选择，如雨夜、搜索、危机、黎明 |
| 四张结局插图 | `public/assets/endings/dragon-raja/` | 结局页按 `ending.type` 选择 |
| 18 页序幕漫画 | `public/assets/comic/dragon-raja/` | 由 `art/comic-script.json` 分镜脚本生成，四幕连贯，每页参考上一页成图；旧图保留在 `onboarding/` |

**性能**：`npm run assets:optimize` 为每张 PNG 生成 WebP（约 175 MB 降至约 14 MB），服务端按 `Accept` 头自动返回 WebP，故事数据仍引用 PNG。字体改为自托管、按需加载的 Noto Serif SC 分片，不再依赖 Google Fonts。

**细节**：卷宗与场景欣赏使用不同图标；章节和选项编号支持任意数字；漫画支持左右键、触屏滑动翻页、整页放大和预加载；角色压力按钮带 `aria-expanded`；提高次要文字对比度，恢复细滚动条；标语、卷名和类型标签改为从故事包读取。

## 目录与构建

- `frontend/src/components/`：模板页面、侧幕、确认框和视觉效果。
- `frontend/src/story/data.ts`：公开接口类型与展示数据映射。
- `frontend/src/story/api.ts`：HTTP 错误处理、NDJSON 解码和有序事件归并。
- `frontend/src/story/useGame.ts`：真实故事加载、选角、提交、恢复、重置和阅读偏好。
- `public/ui/`：生成的前端资源，不纳入源码管理。
- `scripts/publish-frontend.js`：发布生成的入口至 `public/index.html`，正在运行的旧静态服务器也可以在刷新后展示新前端。

根目录采用 npm workspace 统一安装依赖。`npm start` / `npm run dev` 自动先构建前端。独立热更新使用 `npm run dev:frontend`，访问 `http://localhost:5173/ui/`，同时运行原有 `4317` 后端。发布时无需单独运行 Vite。

## 保留的行为

- 四个角色全部来自故事包；预览和确认分离，预览不产生写入。
- 18 页漫画、完整背景、四个角色与八位 NPC 均可查看。无肖像的 NPC 使用姓名档案。
- 保留自动存档、继续当前故事、回看全篇及带确认的重新开始。
- 推荐选项发送真实 `choiceId`，保留后端可信选项路径；显示短标签和实际行动说明。
- 自由行动沿用 300 字接口限制，对话模式将输入包装为角色发言；中文输入法确认不会意外提交。
- 正文按服务端完整句流展示，保持原有短段合并和首行缩进；行动记录放在回看导航，不插入正文。
- 人物状态、在场情况、物品数量、已知线索、未解事项和关系强度由公开状态映射，不编造数值或发送私有记忆。
- 字号、剧场/专注和动效偏好保存在浏览器；迁移旧版 `ai-novel:reading` 设置，尊重系统减弱动态偏好。
- 场景支持加载完成后交叉淡入、过期加载取消、失败回退和欣赏场景。
- 各类侧幕和确认框采用原生 dialog，支持焦点隔离、Escape 关闭和焦点归还。

## 生成、取消与恢复

正式存档完全由服务端管理，不读取模板的 `wugang.save.v1`，也不创建本地模拟剧情。

通过 `POST /api/turn` 创建回合。通过 `GET /api/turns/active` 发现仍在进行的回合，通过 `GET /api/turns/:turnId/stream?afterSeq=N` 恢复。事件序号防止网络重放导致正文重复。连接故障保留已显示内容；重试前重新核对服务端，避免重复提交已接受的行动。

取消严格沿用现有边界：`prepared` 之前可以停止；正文锁定后不可取消，继续到保存或可恢复暂停。页面离开或刷新只断开客户端连接，不取消服务端作业。生成中不显示虚假的完成百分比，只展示真实阶段、各 Agent 的完成状态、真实耗时和已收到的字数。

后端故事序列化为历史事件增加公开地点、时间和场景字段，供回看定位使用；不暴露 `stateAfter`、原著私有事实、内部 Agent 报告或会话标识。已有运行中的后端需在下次重启后提供新增历史场景字段；前端兼容旧响应。

## 验证

~~~bash
npm test
npm run test:frontend
npm run test:ui
~~~

端到端测试需要本机 Chrome。`playwright-core` 为开发依赖。测试使用真正的 HTTP、持久化与回合作业管理，在临时目录运行确定性剧情，不访问或更改正式存档、不调用 AI 模型。覆盖真实角色、18 页漫画、手机确认、推荐行动与自由对话、中文输入法、取消、拒绝、失败重试、断线与刷新恢复、历史滚动、场景切换、真实结局与重置。

截图与结果默认写入 `dogfood-output/redesign-20261008/`，可通过 `NOVEL_QA_OUTPUT` 指定目录。也可运行 `node test/frontend-preview.mjs` 打开独立的临时预览（默认 `4319`），仅用于 UI 检查；正式产品始终使用原有 `4317` 服务。
