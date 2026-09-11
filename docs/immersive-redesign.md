# 东京出走：异闻漫画剧场

## 体验

- 以墨黑、旧纸白与朱红统一界面。封面使用斜切东京月台画面、倾斜大字、印章与单程车票；车票悬停抬起，箭头指向出发方向。首次启程直接选角，已有身份则继续存档，封面也可单独进入人物预览。
- 四个角色可以先预览再确认；确认前不会写入身份。角色预览使用对应的初始地点背景，搭配纸面档案、网点底色、立绘切入与各自的角色短句。角色按钮支持左右方向键和 Home / End；手机上同一个确认按钮移入底部固定操作区，避免长档案把确认入口挤出屏幕。
- 序幕按背景、漫画、人物和入场分组，保留全部 18 页漫画、四个角色档案和八位 NPC。
- 阅读采用旧纸书页与全屏场景，搭配朱红书签、回合页码和场景便笺；便笺只显示玩家已知的在场人物。服务端的 `scene` 事件驱动环境切换，正文继续按原有完整句流协议追加。行动选项同时给出简短名称和将要执行的具体行动，悬停或键盘聚焦时切换为墨黑与朱红的强调样式。
- 正文按书页排版，不显示玩家选择记录，段间与回合之间均不留额外空行，首行缩进两字。新续写通常组织为 2～3 段；已有正文与流式续写共用合段规则：短段累积到约 140 字后才在下一个原有换段处分段，避免一句一段，也不改写存档文字。
- 人物与线索通过右侧随行手记打开，呈现为照片档案、关系印记和物品纸签。界面已移除正文分支图标、顶部岔路入口和创建分支弹窗。
- 阅读设置保存字号、剧场或专注视图，以及减弱动态偏好。欣赏场景可以暂时收起正文。
- 向上回看正文时，新句子不会强制滚动；“回到此刻”可以返回最新段落。

## 图片

本次视觉改造复用项目已有的 `public/assets/tokyo-departure.png`、人物、漫画与场景图片，没有新增生成图片或前端依赖。斜切、纸张纹理、网点、印章、车票与条码均由 HTML / CSS 构建。

东京月台图片在前一版使用内置 imagegen 生成，原图保存在 Codex 的 generated_images 目录，最终副本已经放入项目。没有运行时生图依赖。

生成提示词原文：

```text
Use case: illustration-story. Asset type: full-bleed entrance background for a sophisticated Chinese interactive novel, Dragon Raja: Tokyo Escape. Create one exquisite widescreen 16:9 cinematic anime environment painting, mature hand-painted feature-film background quality, detailed architecture and believable light. View from the covered open doorway of a vintage Tokyo train, glistening rails receding into a dense Tokyo city at rain-clearing dusk. A red commuter train is visible on the far right, and beside the open doorway, two small distant young-adult figures, a dark-haired young man and long dark-red-haired young woman in a white coat, are standing together facing the city, seen from behind, occupying less than 15 percent of the frame on the RIGHT HALF. Deep layers of dark foreground train door jambs, detailed reflective platform middle ground, illuminated skyscrapers and a pale luminous peach and silver-mint sky. Restrained vermilion signage, ivory station lighting, jade green glass, and rain reflections. Left half is quieter dark architectural negative space, with enough real texture, reserved for large white Chinese title rendered later by HTML; do NOT put text into the image. The city is clearly visible and sharp, not hidden by darkness, fog, or blur. Emotional atmosphere: a fleeting ordinary evening before a fateful escape, wistful, quietly magical. Wide compositional depth, rich light and shadow, premium art direction. No typography, no logos, no watermarks, no floating particles, no bokeh, no UI, no collage. Deliver a single wide landscape image.
```

## 浏览器验证

`test/immersive-ui.mjs` 启动使用真实 HTTP、故事包与存档逻辑的隔离测试服务，使用确定性的测试运行时替代模型调用；数据写入临时目录，结束后清理。测试不访问默认剧情存档。

需要本机 Chrome 与 `playwright-core`。可使用项目以外的测试依赖：

```bash
npm install --prefix /tmp/novel-ui-tools --no-package-lock --no-save playwright-core
NOVEL_PLAYWRIGHT_MODULE=/tmp/novel-ui-tools/node_modules/playwright-core/index.mjs NOVEL_QA_OUTPUT=/tmp/novel-ui-qa node test/immersive-ui.mjs
```

覆盖封面人物入口、键盘选角、手机确认按钮可达性、选项实际行动说明、选角预览与确认、七处场景切换、图片乱序加载与失败回退、动态雨幕、流式正文回看、取消回合、漫画回看、偏好持久化、侧幕焦点管理，以及系统减弱动态设置。纸页入场和立绘切入也遵守减弱动态偏好。

自动生成桌面 1440 × 900、手机 390 × 844 和小屏 320 × 568 的截图，并检查控件溢出及图片加载。截图等待场景淡入结束后拍摄。结果位于指定输出目录的 `verification.json`。

核心引擎回归检查仍使用 `npm test`。
