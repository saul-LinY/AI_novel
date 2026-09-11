# AI novel 重构方案评审入口

本次交付为设计评审稿，尚未修改应用运行代码。

- [完整设计文档](./REVIEW.zh-CN.md)
- [Figma 全流程画布](https://www.figma.com/board/5D1fARzVy0b5CrVZJifITf?node-id=5-156)

## 先看这五点

| 审核主题 | 提案 |
| --- | --- |
| 核心体验 | 保留「用户行动 → 下一段正文」，审核通过后展示定稿 |
| 有限等待 | 常规目标 15 秒左右，P95 ≤ 30 秒，服务端每轮预算 45 秒，42 秒停止发布准入 |
| 防止循环 | 首稿加一次修订，最多八次模型请求，刷新、断线和重启不重置预算 |
| 小说质量 | 十二项指标逐项评价，人物与因果缺陷不能被文笔高分抵消；上线需要真人盲评 |
| 重构范围 | 导入、来源核对、故事包版本、人物与因果记忆、Agent、前端、事务存档及迁移 |

性能与质量数字是拟定验收条件，不是已测结果。单轮未达标时结束并保留原存档，不能通过放行问题正文缩短等待。

## Figma 分区

| 分区 | 打开 |
| --- | --- |
| 00 全流程总览 | [查看](https://www.figma.com/board/5D1fARzVy0b5CrVZJifITf?node-id=5-156) |
| 01 故事包导入与发布 | [查看](https://www.figma.com/board/5D1fARzVy0b5CrVZJifITf?node-id=8-119) |
| 02 Agent 协作与一次修订 | [查看](https://www.figma.com/board/5D1fARzVy0b5CrVZJifITf?node-id=12-243) |
| 03 截止时间与恢复 | [查看](https://www.figma.com/board/5D1fARzVy0b5CrVZJifITf?node-id=16-291) |
| 04 页面与阅读交互 | [查看](https://www.figma.com/board/5D1fARzVy0b5CrVZJifITf?node-id=16-381) |
| 05 质量评价与上线门槛 | [查看](https://www.figma.com/board/5D1fARzVy0b5CrVZJifITf?node-id=16-461) |
| 06 事实 记忆与原子提交 | [查看](https://www.figma.com/board/5D1fARzVy0b5CrVZJifITf?node-id=16-539) |

画布是可编辑工作流，前端页面的布局、视觉方向、状态与交互规格见完整文档第 9 节；本次不包含高保真组件库或产品代码。
