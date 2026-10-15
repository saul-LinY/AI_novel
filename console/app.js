import { renderMemoryPanel } from './memory-view.js';
import { metricChips, metricsDetail, renderPerformance } from './performance-view.js';
import { renderGate, renderNarrativePanel } from './narrative-view.js';
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = {
  shared: '<path d="M12 3v5M5 15v-4h14v4M12 8v7"/><rect x="2" y="15" width="6" height="6" rx="1.5"/><rect x="9" y="15" width="6" height="6" rx="1.5"/><rect x="16" y="15" width="6" height="6" rx="1.5"/>',
  environment: '<path d="m3 19 6-13 4 8 3-5 5 10H3Z"/><path d="m7 10 2 2 2-2"/>',
  character: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
  plot: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M18 7v2c0 4-12 1-12 6"/>',
  decision: '<path d="m12 3 9 9-9 9-9-9 9-9Z"/><path d="m8 12 3 3 5-6"/>',
  prose: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6ZM12 21h9"/>',
  commit: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  brief: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  recorder: '<path d="M4 19V5a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h12"/><path d="M9 8h5M9 11h3"/>',
  ledger: '<path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/>',
};
const icon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id] ?? icons.shared}</svg>`;
const labels = {
  action: "玩家行动", worldState: "本轮开始时的世界状态", relevant: "筛选出的相关信息", unknowns: "未确定的信息", environment: "环境资料", character: "人物资料", plot: "情节资料",
  currentLocation: "当前地点", relevantLocations: "相关地点", items: "相关物品", inventory: "持有物品", activeCharacters: "现场人物", worldRules: "世界规则", memory: "已有记忆",
  characters: "人物资料", relationshipGraph: "人物关系", facts: "相关事实", currentStage: "当前剧情节点", spineWindow: "相邻剧情节点", route: "当前路线", openThreads: "未结束的支线", branchMemory: "分支记忆", recentEvents: "最近的故事",
  currentNodeId: "当前节点", recommendedNodeId: "建议节点", causalChain: "因果分析", routeMode: "建议路线", shouldBlockCurrentNode: "是否阻止当前节点", rejoinTargetId: "回归节点", rejoinConditions: "回归条件", forbiddenOutcomes: "不能出现的结果", memoryNotes: "建议保存的记忆", candidateChanges: "候选变化",
  involvedCharacterIds: "涉及的人物", reactions: "人物反应", characterId: "人物", currentIntent: "当前意图", knowledgeUsedFactIds: "使用的已知事实", observableReaction: "可见反应", privateReason: "反应背后的原因", forbiddenBehaviors: "不能出现的行为",
  locationId: "地点", sceneStateId: "场景状态", timeAdvanceMinutes: "推进时间（分钟）", transitionReason: "环境变化的原因", availableResources: "可用资源", constraints: "环境限制",
  description: "说明", evidence: "依据", kind: "类型", delta: "最终状态变化", ending: "结局", npcIntents: "人物行动安排", normalizedAction: "对玩家行动的理解", outcome: "行动结果", storyProgress: "剧情进度", characterMemoryNotes: "人物记忆", environmentMemoryNotes: "环境记忆", choices: "下一轮建议行动", choicePlan: "选项设计",
  intent: "意图", steps: "行动步骤", stoppedAtStep: "执行到第几步", stopReason: "本轮停止的原因", type: "类型", summary: "结果描述", reasons: "判断依据", note: "记忆内容", reason: "原因",
  name: "名称", title: "名称", id: "标识", aliases: "别名", role: "角色", status: "状态", attitude: "态度", knowledgeFactIds: "已知事实", personality: "人格", goal: "目标", speech: "说话方式", abilities: "能力", soul: "人物设定", knownToPlayer: "玩家已知", nodes: "人物", edges: "关系", from: "起点", to: "终点", value: "值",
  truth: "真实情况", revealText: "揭示内容", text: "内容", narrativePurpose: "叙事作用", currentStateId: "当前场景", states: "可用场景", progress: "进度", actionResult: "行动结果", prose: "正文", timeMinutes: "世界时间（分钟）", version: "版本",
  characterIds: "相关人物", locationIds: "相关地点", itemIds: "相关物品", factIds: "相关事实", threadIds: "相关支线", stageIds: "相关节点", generatedFacts: "新产生的事实", threads: "支线", relationships: "关系",
  learnFactIdsByCharacter: "人物新获知的事实", inventoryChanges: "物品变化", characterChanges: "人物变化", threadChanges: "支线变化", relationshipChanges: "关系变化", completeGoalIds: "完成的目标", blockCurrentNode: "阻止当前节点", nextNodeId: "下一节点", routeNote: "路线说明", eventId: "事件", currentStageId: "当前节点", blockedNodeIds: "被阻止的节点", stages: "节点进度",
  narrative: "叙事摘要", directive: "节奏指令", arc: "张力曲线", seeds: "伏笔", ledger: "事实账本", ledgerByCharacter: "各人物亲历的账本", continuityNotes: "连续性提醒", hard: "硬性约束", advice: "建议", avoidBeats: "禁用节拍", flatTension: "持平的张力", mustEscalate: "必须升级", mustAddressSeedIds: "必须处理的伏笔", curve: "最近曲线", lastBeat: "上一节拍", lastTension: "上一张力", staleLoopIds: "悬置过久的事项", timing: "回收时机", surfaced: "正文已露面", reinforced: "强化次数", plantedTurn: "埋下回合", window: "回收窗口", age: "已过回合", origin: "来源", openedTurn: "开启回合", who: "相关人物", turn: "回合",
  dramaturgy: "节奏设计", beat: "节拍", tension: "张力", valueShift: "价值翻转", axis: "价值维度", turningPoint: "转折点", hook: "结尾悬念", callbacks: "呼应的账本条目", foreshadowing: "伏笔处理", plant: "埋下", reinforce: "强化", payoff: "回收", retire: "放弃", seedId: "伏笔", surfaceDetail: "表面细节", hiddenMeaning: "真实含义", payoffIdea: "回收设想", payoffWindow: "回收窗口", howItPaysOff: "回收方式", detail: "细节", earlier: "前文", continuity: "连续性提醒", entries: "账本条目", quote: "正文原句", knownByIds: "知情人物", importance: "重要度", openLoops: "新增未兑现事项", closeLoops: "了结的事项", supersede: "被取代的条目", foreshadowCheck: "伏笔露面核对", appeared: "已出现", contradictions: "矛盾", problem: "问题", resolution: "了结方式", loopId: "事项", ledgerId: "账本条目", ownerIds: "相关人物", source: "来源", pacing: "节奏建议", twistIdeas: "反转点子", foreshadow: "伏笔建议", dropMemoryNoteIndexes: "删除的记忆笔记", error: "降级原因",
  keyChoice: "关键选择", coreQuestionResponse: "对故事核心问题的回应", directConsequences: "直接后果", longTermConsequences: "长期后果", costs: "代价", resolvedQuestions: "已解决的问题", unresolvedQuestions: "尚未解决的问题", label: "选项", actionText: "行动内容", risk: "风险", cost: "代价", mode: "方式", returnConditions: "回归条件", rejoinNodeId: "回归节点", completedGoalIds: "已完成目标", startedAtEventId: "开始于事件", completedAtEventId: "完成于事件", blockedAtEventId: "阻止于事件", completed: "已完成", blocked: "已阻止", flags: "标记", quantity: "数量", itemId: "物品", relatedCoreFactIds: "关联核心事实", sourceEventId: "来源事件", knownToCharacterIds: "知情人物", attitudeDelta: "态度变化", statusAfter: "变化后状态", triggers: "触发条件", goals: "目标", next: "后续节点", allowedEndings: "允许的结局", entryConditions: "进入条件", completionConditions: "完成条件", order: "顺序", purpose: "作用", allowDeviation: "允许偏离", blockedReason: "阻止原因",
};
const enums = { not_yet: "未到窗口", due: "可回收", overdue: "已逾期", package: "故事包", planted: "已埋下", dormant: "休眠", paid_off: "已回收", retired: "已放弃", setup: "铺垫", complication: "施压", reversal: "反转", revelation: "揭示", climax: "高潮", release: "喘息", aftermath: "余波", agent: "记录员", deterministic: "确定性兜底", success: "成功", success_with_cost: "成功，但付出了代价", failure_with_gain: "失败，但有所收获", failure: "失败", action_not_allowed: "行动不成立", mainline: "主线", detour: "绕路", deviation: "偏离", active: "活跃", open: "未结束", closed: "已结束", relationship: "关系变化", knowledge: "知识变化", branch_seed: "支线创意", route_change: "路线变化", causal_risk: "因果风险", normal: "普通结局" };
const statuses = { complete: "已完成", failed: "失败", cancelled: "已取消", rejected: "未成立", queued: "排队中", running: "进行中", prepared: "准备完成", recovering: "恢复中", paused: "已中断", waiting: "等待中", stopped: "未完成", missing: "未记录", partial: "部分正文" };
Object.assign(labels, { trace: '检索记录', backend: '检索方式', degraded: '本地检索已降级', elapsedMs: '检索耗时（毫秒）', recalledAt: '检索时间', failures: '本地检索异常', retrievalBudgetMs: '本地检索超时预算（毫秒）', rejectedHits: '剔除的无效证据', query: '实际查询', scope: '分支范围', sourceHeadEventId: '检索截止事件', counts: '各视角证据数量', graphiti: '图检索情况', global: '全局视角', state: '处理状态', ranking: '排序方式', matched: '匹配数量', rejected: '剔除数量', indexedThroughEventId: '图索引截止事件', sourceOffset: '原文起始位置', retrievalSources: '召回来源', cardId: '记忆卡片', contentHash: '内容校验', truncated: '已截取片段', enqueuedAt: '入队时间', enabled: '已启用', recalling: '历史记忆检索' });
const state = { listing: null, detail: null, selected: new URLSearchParams(location.search).get("run"), signature: "", busy: false };
const requestedView = new URLSearchParams(location.search).get('view');
state.graphView = 'global';
Object.assign(state, { performance: null, view: requestedView === 'workflow' || requestedView === 'performance' ? requestedView : new URLSearchParams(location.search).has('node') ? 'workflow' : 'memory', memory: null, memoryKey: null, memoryRequest: 0, memoryScope: 'added', memoryOwner: 'all', memoryQuery: '', memoryLimit: 60 });
function displayScalar(value, names = state.detail?.names ?? {}) {
  if (value == null) return '<span class="muted">无</span>';
  if (value === true || value === false) return `<span class="value-bool">${value ? "是" : "否"}</span>`;
  const name = names[value];
  return name ? `<span title="${esc(value)}">${esc(name)} <code class="entity-id">${esc(value)}</code></span>` : esc(enums[value] ?? value);
}
function readable(value, depth = 0) {
  if (value == null || typeof value !== "object") return `<div class="text-value">${displayScalar(value)}</div>`;
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="muted">无</span>';
    if (value.every((v) => v == null || typeof v !== "object")) return `<ul class="value-list">${value.map((v) => `<li>${displayScalar(v)}</li>`).join("")}</ul>`;
    return `<div class="object-list">${value.map((v, i) => `<div class="list-entry"><span class="entry-number">${String(i + 1).padStart(2, "0")}</span><div>${readable(v, depth + 1)}</div></div>`).join("")}</div>`;
  }
  if (!Object.keys(value).length) return '<span class="muted">无</span>';
  return `<dl class="fields depth-${Math.min(depth, 3)}">${Object.entries(value).map(([key, v]) => `<div class="field${v && typeof v === "object" ? " field-complex" : ""}"><dt title="${esc(key)}">${esc(labels[key] ?? state.detail?.names?.[key] ?? key)}</dt><dd>${readable(v, depth + 1)}</dd></div>`).join("")}</dl>`;
}
function badge(status) { return `<span class="badge ${esc(status)}"><i></i>${esc(statuses[status] ?? status)}</span>`; }
function clockTime(time) { return time ? new Date(time).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" }) : "—"; }
function duration(run) {
  if (!run.updatedAt || !run.createdAt) return "—";
  const seconds = Math.max(0, Math.round((Date.parse(run.updatedAt) - Date.parse(run.createdAt)) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}
function renderRuns() {
  const runs = state.listing.runs;
  $("#run-count").textContent = `${runs.length} 次`;
  $("#runs").innerHTML = runs.length ? runs.map((r) => `<button class="run-item ${r.id === state.selected ? "selected" : ""}" data-run="${esc(r.id)}" aria-current="${r.id === state.selected ? "true" : "false"}"><span class="run-top"><strong>第 ${String(r.number).padStart(2, "0")} 轮</strong><span class="run-state ${esc(r.status)}">${esc(statuses[r.status] ?? r.status)}</span></span><span class="run-action">${esc(r.action)}</span><span class="run-bottom"><span>${esc(r.branchName)}</span><time>${clockTime(r.createdAt)}</time></span></button>`).join("") : '<div class="sidebar-empty">没有匹配的运行记录</div>';
}
function pathLabel(path) { return path.split(".").map((key) => labels[key] ?? state.detail.names[key] ?? key).join(" / "); }
function renderOutput(step) {
  if (step.output == null) {
    const text = step.status === "running" ? "正在生成，保存的内容会自动出现在这里。" : ["waiting", "stopped"].includes(step.status) ? "这一步还没有产出已通过校验的内容。" : "这次运行没有保存这一步的输出。";
    return `<div class="no-output"><span>${step.status === "running" ? "◌" : "—"}</span><p>${text}</p></div>`;
  }
  if (step.id === "prose") return `<div class="prose-output">${step.output.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
  if (step.id === "commit") return `<div class="diff-intro">${step.output.changes ? `实际保存了 <strong>${step.output.changes.length}</strong> 项字段变化` : "缺少上一轮状态，无法对比"}</div>${step.output.changes?.length ? `<div class="diff-table"><div class="diff-head"><span>变化内容</span><span>本轮之前</span><span>本轮之后</span></div>${step.output.changes.map((c) => `<div class="diff-row"><div title="${esc(c.path)}">${esc(pathLabel(c.path))}</div><div class="before">${readable(c.before)}</div><div class="after">${readable(c.after)}</div></div>`).join("")}</div>` : ""}<details class="full-state"><summary>查看保存后的完整世界状态</summary>${readable(step.output.stateAfter)}</details>`;
  return readable(step.output);
}
function feedbackView(feedback) {
  const marker = feedback.indexOf("Received arguments:");
  if (marker < 0) return `<p class="feedback">${esc(feedback)}</p>`;
  return `<p class="feedback">${esc(feedback.slice(0, marker).trim())}</p><details class="validation-raw"><summary>查看完整校验返回</summary><pre class="raw-output">${esc(feedback)}</pre></details>`;
}
// Back half of the loop: the proposal gate checks causality, pacing,
// foreshadowing and callbacks (bouncing pacing issues back once); narration
// writes from a beat sheet; the recorder grounds memory in the published
// prose; one atomic commit updates the world and the narrative ledger, which
// feeds the next turn's pacing directive and ledger digest.
const graphNodes = [
  { id: 'action', title: '用户行动', caption: '本轮故事的起点', x: 24, y: 205, w: 122, h: 76, color: 'shared' },
  { id: 'recall', title: '历史记忆检索', caption: 'BM25 + Graphiti · 混合召回', x: 175, y: 53, w: 178, h: 96, color: 'memory', icon: 'shared' },
  { id: 'shared', title: '上下文与知识检查', caption: '视角裁剪 · 节奏指令 · 账本', x: 175, y: 197, w: 178, h: 92, color: 'shared' },
  { id: 'plot', title: '情节 agent', caption: '因果、支线与节奏建议', x: 385, y: 39, w: 193, h: 104, color: 'plot', domain: true },
  { id: 'environment', title: '环境 agent', caption: '环境事实、限制与候选变化', x: 385, y: 190, w: 193, h: 104, color: 'environment', domain: true },
  { id: 'character', title: '人物 agent', caption: '依亲历账本作出反应', x: 385, y: 341, w: 193, h: 104, color: 'character', domain: true },
  { id: 'reports', title: '三份领域报告', caption: '候选变化尚未生效', x: 625, y: 202, w: 137, h: 82, color: 'shared' },
  { id: 'decision', title: '主创裁决', caption: '定结果、节拍、转折与伏笔', x: 807, y: 197, w: 153, h: 92, color: 'decision' },
  { id: 'gate', title: '提案闸门', x: 1002, y: 211, w: 64, h: 64, color: 'decision', diamond: true },
  { id: 'beatsheet', title: '写作简报', caption: '节拍 · 转折 · 悬念 · 伏笔', x: 1110, y: 53, w: 150, h: 88, color: 'decision', icon: 'brief' },
  { id: 'prose', title: '写作与质量检查', caption: '逐句展示 · 中断续写 · 选项', x: 1300, y: 53, w: 174, h: 98, color: 'prose' },
  { id: 'recorder', title: '连续性记录', caption: '逐字摘录事实与伏笔', x: 1300, y: 205, w: 150, h: 88, color: 'ledger', icon: 'recorder' },
  { id: 'commit', title: '原子提交', caption: '世界状态 + 叙事账本', x: 1300, y: 354, w: 150, h: 88, color: 'commit' },
  { id: 'ledger', title: '叙事账本', caption: '张力 · 伏笔 · 事实 · 未兑现', x: 1110, y: 354, w: 150, h: 88, color: 'ledger', icon: 'ledger' },
  { id: 'next', title: '确认保存 / 下一轮', caption: '正文已逐句显示 · 可继续行动', x: 847, y: 354, w: 181, h: 88, color: 'prose' },
  { id: 'rejected', title: '调整行动 / 结束本轮', caption: '不成立时不写入新事实', x: 1110, y: 214, w: 150, h: 74, color: 'rejected' },
  { id: 'failure', title: '技术异常 / 恢复', caption: '保留失败步骤 · 区分行动不成立', x: 24, y: 365, w: 290, h: 88, color: 'rejected' },
  { id: 'index', title: '提交后的记忆快照', caption: '仅已提交内容 · 分支与视角隔离', x: 1120, y: 590, w: 260, h: 94, color: 'memory', icon: 'brief' },
  { id: 'bm25', title: 'BM25 本地索引', caption: '关键词召回 · 图不可用时兜底', x: 790, y: 560, w: 240, h: 86, color: 'memory', icon: 'shared' },
  { id: 'graphiti', title: 'Graphiti 后台处理', caption: '抽取实体关系 · 持有 / 位置有效期', x: 790, y: 700, w: 260, h: 86, color: 'memory', icon: 'plot' },
  { id: 'neo4j', title: 'Neo4j 故事记忆图', caption: '事实证据 · 当前关系 · 历史流转', x: 430, y: 700, w: 260, h: 86, color: 'memory', icon: 'commit' },
];
const graphEdges = [
  ['action','recall','M146 243H158V101H175'],
  ['recall','shared','M264 149V197'],
  ['shared','plot','M353 243H366V91H385'],
  ['shared','environment','M353 243H385'],
  ['shared','character','M353 243H366V393H385'],
  ['plot','reports','M578 91H602V243H625'],
  ['environment','reports','M578 243H625'],
  ['character','reports','M578 393H602V243H625'],
  ['reports','decision','M762 243H807'],
  ['decision','gate','M960 243H989'],
  ['gate','decision','M1034 288V322H883V289', 'alternate'],
  ['gate','beatsheet','M1034 198V97H1110'],
  ['beatsheet','prose','M1260 97H1300'],
  ['prose','recorder','M1375 151V205'],
  ['recorder','commit','M1375 293V354'],
  ['commit','ledger','M1300 398H1260'],
  ['commit','next','M1375 442V462H1020V442'],
  ['next','action','M938 442V478H85V281'],
  ['ledger','shared','M1185 442V498H257V289', 'feedback'],
  ['gate','rejected','M1079 243H1110'],
  ['rejected','action','M1110 251H1088V478H85V281', 'alternate'],
  ['shared','rejected','M264 289V310H1185V288', 'alternate'],
  ['commit','index','M1450 398H1476V637H1380', 'async'],
  ['index','bm25','M1120 620H1078V603H1030', 'async'],
  ['index','graphiti','M1250 684V743H1050', 'async'],
  ['graphiti','neo4j','M790 743H690', 'async'],
  ['bm25','recall','M790 603H16V19H264V53', 'feedback'],
  ['neo4j','recall','M430 743H16V19H264V53', 'feedback'],
];
const graphWidth = 1500, graphHeight = 825;
Object.assign(statuses, { ready: '可查看', skipped: '未走此路径', overview: '流程说明', submitted: '已入队', untracked: '进度未记录', disabled: '未启用', degraded: '已降级' });
Object.assign(state, { node: new URLSearchParams(location.search).get('node'), manualNode: !!new URLSearchParams(location.search).get('node') });

function nodeData(id) {
  const data = recordedNodeData(id);
  return state.detail.overview ? { ...data, status: 'overview' } : data;
}
function recordedNodeData(id) {
  const run = state.detail;
  const step = run.steps.find((s) => s.id === id);
  if (step) return state.detail.status === 'paused' && step.status === 'running' ? { ...step, status: 'paused' } : step;
  const get = (key) => run.steps.find((s) => s.id === key);
  const proposal = get('decision').output;
  const committed = get('commit').output;
  const stopped = ['failed','cancelled','rejected'].includes(run.status);
  const base = { id, title: graphNodes.find((n) => n.id === id)?.title ?? id, attempts: [], kind: '流程数据', input: null, inputNote: '此处关联已有记录，不是额外的 agent 调用。', output: null, status: 'waiting' };
  if (id === 'action') return { ...base, description: '触发这一轮工作流的原始行动', output: run.action, status: 'complete' };
  if (id === 'recall') {
    const recall = run.memoryRecall;
    const trace = recall?.result?.trace;
    const graphDegraded = Object.values(trace?.graphiti ?? {}).some((view) => !['ready', 'empty', 'disabled'].includes(view.state));
    const recalling = run.timeline?.findLast((entry) => entry.type === 'phase')?.phase === 'recalling';
    return { ...base, kind: '历史证据检索', description: '以玩家行动为查询，先按当前分支、已提交回合和人物知情范围过滤；BM25 提供关键词候选，Graphiti 补充图关系与语义候选，按向量相似度与关键词名次融合，不调用精排模型。返回的原文、来源和快照需再次核验；图同步中会等待重试，预算耗尽或服务不可用时使用本地结果。',
      input: { action: run.action }, inputNote: '检索发生在领域分析之前；中断续写沿用已准备的上下文，不重新检索。',
      output: recall?.result ?? (recall?.status === 'degraded' ? { '情况': '检索异常，本轮继续使用当前状态与已有上下文。' } : null),
      status: recall ? (trace?.degraded || graphDegraded ? 'degraded' : recall.status) : !stopped && run.status !== 'complete' && recalling ? 'running' : get('shared').output || stopped || run.status === 'complete' ? 'missing' : 'waiting' };
  }
  if (['index', 'bm25', 'graphiti', 'neo4j'].includes(id)) {
    const descriptions = {
      index: '故事存档保存成功后，按当前分支与各人物视角生成记忆快照，分别交给本地索引和 Graphiti 队列。游戏可以继续，不等待图索引完成。启动、切换分支或角色时也会同步相应快照。',
      bm25: '本地 BM25 更新已提交记忆卡片的关键词索引。下一轮先从可见卡片中召回候选；Graphiti 还在更新、超时或离线时，本地检索仍可工作。',
      graphiti: '持久队列在后台抽取实体、关系和事实，生成向量，并校验物品持有者与实体位置的有效时间区间。计划、猜测不能当成全局已发生事实；失败会重试。当前专项状态投影覆盖持有与位置，并非所有属性都已实现自动状态管理。',
      neo4j: 'Neo4j 保存 Graphiti 的实体、关系、事件证据及有效时间。历史关系保留供流转查询；由 Graphiti 服务管理图更新。游戏世界的权威状态仍由已提交存档决定，手动修改图不会反向改写游戏存档。',
    };
    const update = run.memoryUpdate;
    const disabled = update && (!update.enabled || ['graphiti', 'neo4j'].includes(id) && !update.graphiti);
    return { ...base, kind: '提交后异步更新', description: descriptions[id], inputNote: '只接收已保存的内容；与本轮正文生成、原子提交分开执行。',
      output: committed ? { '已保存到故事存档': true, '本轮队列记录': update ?? '旧回合未记录入队信息', '索引完成情况': '本节点不把“已提交”当成“已完成索引”。当前各视角的进度请到「回合记忆」查看。' } : null,
      status: disabled ? 'disabled' : committed ? id === 'index' && update ? 'submitted' : 'untracked' : stopped ? 'skipped' : 'waiting' };
  }
  if (id === 'failure') return { ...base, description: '适用于任一步技术异常。结构化结果连续 3 次校验失败会停止；节奏与伏笔问题单独退回一次后可按警告放行。已准备的正文遇到可恢复中断时保留前缀续写；取消、不可恢复错误或重试耗尽时停止，不提交新世界事实。',
    output: ['failed', 'paused', 'cancelled'].includes(run.status) ? { '状态': statuses[run.status], '停止阶段': run.timeline?.findLast((entry) => entry.type === 'phase')?.phase, '原因': run.error } : null,
    status: ['failed', 'paused', 'cancelled'].includes(run.status) ? run.status : 'skipped' };
  if (id === 'reports') {
    const reports = Object.fromEntries(['plot','environment','character'].map((key) => [key,get(key).output]));
    return { ...base, description: '三个领域给出的建议；这些候选变化尚未成为世界事实。', output: Object.values(reports).some(Boolean) ? reports : null, status: Object.values(reports).every(Boolean) ? 'complete' : stopped ? 'stopped' : 'waiting' };
  }
  const narrative = run.narrative ?? {};
  if (id === 'gate') return { ...base, kind: '提案闸门', description: '世界因果与推荐行动必须通过；节奏曲线、伏笔账本与前文呼应不通过时退回主创修正一次，仍未修正则记为警告放行。', input: proposal, inputNote: '主创提交的提案；修改记录见下方。', attempts: get('decision').attempts,
    output: narrative.gate ?? (proposal ? { '提案是否通过': proposal.outcome?.type !== 'action_not_allowed', '行动结果': proposal.outcome } : null),
    html: narrative.gate ? renderGate(narrative.gate) : null,
    status: get('decision').status };
  if (id === 'beatsheet') return { ...base, kind: '程序处理', description: '由通过闸门的提案推导出的写作简报。只含伏笔的表面细节，不含真实含义，正文不会把伏笔说破。',
    input: proposal ? { dramaturgy: proposal.dramaturgy ?? null, foreshadowing: proposal.foreshadowing ?? null } : null, inputNote: '提案中的节奏设计与伏笔处理',
    output: narrative.beatSheet ?? null, status: narrative.beatSheet ? 'complete' : get('prose').status === 'running' ? 'complete' : stopped ? 'stopped' : 'waiting' };
  if (id === 'ledger') return { ...base, kind: '叙事账本', description: '本轮提交后的张力曲线、伏笔账本、未兑现事项与事实账本。下一轮的信息共享层从这里生成节奏指令和按人物视角裁剪的账本摘要。',
    input: null, inputNote: '', output: narrative.after ?? null, html: narrative.after ? renderNarrativePanel(narrative.after, run.names) : null,
    status: narrative.after ? 'complete' : get('commit').status === 'complete' ? 'missing' : stopped ? 'stopped' : 'waiting' };
  if (id === 'next') return { ...base, description: '本轮供阅读的正文和后续选项。这里只查看结果，不会触发新一轮。',
    output: committed ? { '正文': get('prose').output, '后续选项': proposal?.choices ?? [], '结局': proposal?.ending ?? null } : null,
    status: committed ? 'ready' : 'waiting' };
  if (id === 'rejected') return { ...base, description: '自由行动可能在知识边界预检时被拒绝，也可能在主创裁决时判定不成立。说明原因并让玩家修改行动，不生成新正文、不写入新事实。',
    output: run.status === 'rejected' ? { '运行状态': statuses[run.status], '原因': run.error ?? proposal?.outcome?.summary } : null, status: run.status === 'rejected' ? 'rejected' : 'skipped' };
  return base;
}
function graphHTML() {
  return `<div class="graph-scroll" aria-label="完整 Agent Loop 工作流" tabindex="0"><div class="graph-spacer"><div class="graph-world">
    <div class="parallel-area"><span>三个领域 · 并行分析</span></div>
    <div class="memory-area"><span>提交后异步记忆更新 · 不阻塞下一轮</span></div>
    <svg class="graph-edges" width="${graphWidth}" height="${graphHeight}" viewBox="0 0 ${graphWidth} ${graphHeight}" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker></defs>${graphEdges.map(([from,to,d,kind]) => `<path data-edge-from="${from}" data-edge-to="${to}" d="${d}" marker-end="url(#arrow)" class="${kind ?? ''}"/>`).join('')}</svg>
    <span class="edge-label yes-label">通过 · 写作</span><span class="edge-label no-label">不成立</span><span class="edge-label bounce-label">节奏/伏笔未过 · 退回一次</span><span class="edge-label return-label">下一轮用户行动 · 继续循环</span><span class="edge-label feedback-label">叙事账本 → 下一轮节奏指令与账本摘要</span><span class="edge-label knowledge-label">知识边界预检不通过</span><span class="edge-label recall-label">检索证据供下一轮使用 · 当前状态以存档为准</span>
    ${graphNodes.map((n) => { const data = nodeData(n.id); return `<button data-node="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px" class="graph-node ${n.color} ${n.diamond ? 'diamond' : ''} ${n.id === state.node ? 'selected' : ''} ${progress().active.includes(n.id) ? 'is-running' : ''} ${data.status === 'skipped' ? 'inactive' : ''}" aria-pressed="${n.id === state.node}" aria-label="查看${n.title}，${statuses[data.status] ?? data.status}">${n.diamond ? `<span>${n.title}</span>` : `<div class="node-top"><span class="node-icon">${icon(n.icon ?? (n.color === 'rejected' ? 'decision' : n.color))}</span><span class="node-status ${data.status}" title="${statuses[data.status]}">${data.status === 'complete' ? '✓ 已完成' : data.status === 'running' ? '● 运行中' : data.status === 'failed' ? '! 失败' : statuses[data.status] ?? data.status}</span></div><strong>${n.title}</strong><small>${n.caption}</small>${metricChips(data.metrics)}${n.domain ? '<div class="node-stages">读取 <span>→</span> 分析 <span>→</span> 输出</div>' : ''}`}</button>`; }).join('')}
  </div></div></div>`;
}
function graphSelection() {
  document.querySelectorAll('.graph-node[data-node]').forEach((button) => { button.classList.toggle('selected',button.dataset.node === state.node); button.setAttribute('aria-pressed',button.dataset.node === state.node); });
  document.querySelectorAll('[data-edge-from]').forEach((edge) => edge.classList.toggle('highlighted',[edge.dataset.edgeFrom,edge.dataset.edgeTo].includes(state.node)));
}
function progress() {
  const run = state.detail;
  if (run.overview) return { text: '流程总览', detail: '尚无运行记录；开始行动后显示实际进度', active: [], node: 'recall', status: 'overview' };
  const phase = run.timeline?.findLast((entry) => entry.type === 'phase')?.phase;
  const phaseNames = { recalling: '历史记忆检索', analyzing: '三个领域 agent 分析', synthesizing: '主创裁决与提案闸门', narrating: '正文写作', recovering: '正文续写', choosing: '生成推荐行动', recording: '连续性记录', committing: '原子提交' };
  const phaseNode = { recalling: 'recall', analyzing: 'environment', synthesizing: 'decision', narrating: 'prose', recovering: 'prose', choosing: 'prose', recording: 'recorder', committing: 'commit' };
  const active = run.steps.filter((step) => step.status === 'running').map((step) => step.id);
  if (nodeData('recall').status === 'running') active.unshift('recall');
  if (run.status === 'complete') return { text: '本轮已完成', detail: '正文、世界状态与叙事账本已保存', active: [], node: 'prose', status: 'complete' };
  if (['failed','rejected','cancelled','paused'].includes(run.status)) return { text: `${statuses[run.status]}${phaseNames[phase] ? ` · ${phaseNames[phase]}` : ''}`, detail: run.error ?? '本轮已停止运行', active: [], node: run.status === 'rejected' ? 'rejected' : phaseNode[phase] ?? 'failure', status: run.status };
  const titles = active.map((id) => run.steps.find((step) => step.id === id).title);
  return { text: titles.length ? `正在运行 · ${titles.join('、')}` : phaseNames[phase] ? `正在运行 · ${phaseNames[phase]}` : '等待开始', detail: '工作情况自动更新', active, node: active[0] ?? phaseNode[phase] ?? 'action', status: 'running' };
}
function resizeGraph() {
  const scroll = $('.graph-scroll'); if (!scroll) return;
  const fit = Math.min(1.15, (scroll.clientWidth - 32) / graphWidth, (scroll.clientHeight - 24) / graphHeight);
  const zoom = state.graphZoom ?? fit;
  const label = $('[data-graph-scale]'); if (label) label.textContent = `${Math.round(zoom * 100)}%`;
  $('.graph-world').style.transform = `scale(${zoom})`;
  $('.graph-world').style.left = `${Math.max(16,(scroll.clientWidth-graphWidth*zoom)/2)}px`;
  $('.graph-world').style.top = `${Math.max(12,(scroll.clientHeight-graphHeight*zoom)/2)}px`;
  $('.graph-spacer').style.width = `${graphWidth * zoom + 32}px`;
  $('.graph-spacer').style.height = `${graphHeight * zoom + 24}px`;
}
function inputHTML(data) {
  const hasInput = data.input != null && (!Array.isArray(data.input) || data.input.length > 0);
  return `<section class="work-input" aria-labelledby="work-input-title"><h3 class="work-column-title" id="work-input-title">收到的输入</h3>${data.inputNote ? `<p class="pane-description">${esc(data.inputNote)}</p>` : ''}${hasInput ? (Array.isArray(data.input) ? data.input.map((m,i)=>`<div class="prompt-message"><div class="prompt-label">输入 ${i+1}</div><pre>${esc(m.text)}</pre></div>`).join('') : readable(data.input)) : '<p class="work-empty">本节点没有记录输入内容。</p>'}</section>`;
}
function renderInspector(preserve = false) {
  const data = nodeData(state.node);
  const scroll = preserve ? window.scrollY : null;
  const open = preserve ? [...document.querySelectorAll('#inspector details[open][data-preserve]')].map(el=>el.dataset.preserve) : [];
  const attempts = data.attempts ?? [];
  const latest = attempts.at(-1);
  const failures = attempts.filter(a=>a.status==='failed').length;
  let output = '';
  if (data.html) output = data.html;
  else if (data.output != null) output = data.id==='shared' ? readable(data.output) : renderOutput(data);
  else if (latest) output = `<p class="work-pending">最近一次提交尚未通过校验。</p>${readable(latest.output)}`;
  else output = `<div class="no-output"><p>${data.status==='overview' ? '当前为流程说明。开始一次行动后，这里会显示实际保存的输出。' : data.status==='running' ? '正在工作，输出会自动显示在这里。' : data.status==='skipped' ? '本轮没有走到这条路径。' : data.status==='waiting' ? '等待上游步骤完成。' : '本轮没有产出这一步的内容。'}</p></div>`;
  const history = failures && attempts.length>1 ? `<details class="work-history" data-preserve="history"><summary>之前的提交记录（${attempts.length-1} 次）</summary>${attempts.slice(0,-1).map((a,i)=>`<details class="attempt" data-preserve="attempt-${i}"><summary>第 ${i+1} 次 · ${a.status==='accepted'?'校验通过':a.status==='failed'?'校验未通过':'等待校验'}</summary>${feedbackView(a.feedback)}${readable(a.output)}</details>`).join('')}</details>` : '';
  $('#inspector').innerHTML = `<header class="work-header"><span class="step-icon ${graphNodes.find(n=>n.id===state.node)?.color ?? data.id}">${icon(graphNodes.find(n=>n.id===state.node)?.icon ?? graphNodes.find(n=>n.id===state.node)?.color ?? data.id)}</span><div><h2>${esc(data.title)}</h2><p>${esc(data.description ?? '')}</p></div>${badge(data.status)}</header><div id="work-content" class="work-content" role="region" aria-label="${esc(data.title)}的工作情况">${data.metrics !== undefined ? `<details class="work-metrics" data-preserve="metrics" ${data.metrics ? 'open' : ''}><summary>耗时与用量</summary>${metricsDetail(data.metrics)}</details>` : ''}${latest ? `<div class="work-submission">已提交 ${attempts.length} 次${latest.status==='accepted'?' · 最近一次校验通过':latest.status==='failed'?' · 最近一次校验未通过':' · 等待校验'}${failures ? `，其中 ${failures} 次未通过` : ''}</div>${latest.status==='failed'?feedbackView(latest.feedback):''}` : ''}<div class="work-columns">${inputHTML(data)}<section class="work-result" aria-labelledby="work-output-title"><h3 class="work-column-title" id="work-output-title">${data.id==='commit'||data.id==='ledger'?'保存结果':'工作输出'}</h3><div class="work-output">${output}</div>${history}</section></div></div>`;
  for (const key of open) { const element = [...document.querySelectorAll('#inspector [data-preserve]')].find(el=>el.dataset.preserve===key); if(element) element.open=true; }
  if (scroll !== null) window.scrollTo(0, scroll);
  $('#inspector').dataset.node=state.node;
}
function selectNode(id) {
  if (!graphNodes.some(n=>n.id===id)) return;
  state.node=id; state.manualNode=true;
  graphSelection();renderInspector();
  const url=new URL(location.href);url.searchParams.set('node',id);history.replaceState(null,'',url);
}
function renderDetail(preserve = false) {
  if (state.view === 'memory') return renderMemoryScreen(preserve);
  if (state.view === 'performance') return renderPerformanceScreen();
  const run=state.detail, current=progress();
  if (!state.manualNode || !graphNodes.some(n=>n.id===state.node)) state.node=current.node;
  const oldNode=$('#inspector')?.dataset.node;
  const oldScroll=preserve?window.scrollY:0;
  const canvasScroll=preserve ? { left: $('.graph-scroll')?.scrollLeft ?? 0, top: $('.graph-scroll')?.scrollTop ?? 0 } : null;
  const open=preserve&&oldNode===state.node?[...document.querySelectorAll('#inspector details[open][data-preserve]')].map(el=>el.dataset.preserve):[];
  $('#breadcrumb').textContent=run.overview ? '流程总览' : `${run.branchName} / 第 ${String(run.number).padStart(2,'0')} 轮`;
  $('#workspace').className='simple-workflow';
  $('#workspace').innerHTML=`<div class="workflow-heading"><div><div class="eyebrow">${run.overview ? 'WORKFLOW' : `RUN ${String(run.number).padStart(2,'0')}`} / ${esc(run.story.title)}</div><h1>创作工作流</h1></div><div class="current-progress ${current.status}" role="status"><i></i><div><strong>${esc(current.text)}</strong><span>${esc(current.detail)}</span></div></div></div><div class="action-strip"><span>${run.overview ? '流程说明' : '用户行动'}</span><p>${run.overview ? '上方生成并保存故事，下方异步更新记忆。点击节点查看职责；画布可横向、纵向滚动。' : esc(run.action)}</p></div><section class="canvas-panel" aria-label="工作流画布"><div class="canvas-toolbar"><strong>故事生成与记忆闭环</strong><div class="zoom-tools"><button type="button" data-graph-zoom="out" aria-label="缩小工作流">−</button><span data-graph-scale></span><button type="button" data-graph-zoom="in" aria-label="放大工作流">＋</button><button type="button" data-graph-zoom="fit">适应全图</button></div></div>${graphHTML()}<div class="simple-legend"><span><i class="legend-running"></i>正在运行</span><span><i class="legend-complete"></i>已完成</span><span><i class="legend-waiting"></i>等待中</span><span class="legend-async">虚线：后台更新 / 下轮反馈</span><small>点击节点查看详情 · 可滚动画布</small></div></section><section id="inspector" data-node="${state.node}" aria-label="节点工作情况"></section>`;
  renderInspector();graphSelection();resizeGraph();
  if (canvasScroll) $('.graph-scroll').scrollTo(canvasScroll.left, canvasScroll.top);
  for(const key of open){const el=[...document.querySelectorAll('#inspector [data-preserve]')].find(el=>el.dataset.preserve===key);if(el)el.open=true;}
  if(preserve) window.scrollTo(0,oldScroll);
}

function updateConsoleURL() {
  const url = new URL(location.href);
  url.searchParams.set('view', state.view);
  if (state.selected) url.searchParams.set('run', state.selected); else url.searchParams.delete('run');
  if (state.view !== 'workflow') url.searchParams.delete('node');
  history.replaceState(null, '', url);
  document.querySelectorAll('[data-console-view]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.consoleView === state.view)));
}

function renderMemoryScreen(preserve = false) {
  if (preserve && state.memoryComposing) return;
  const scroll = preserve ? window.scrollY : 0;
  const focus = document.activeElement?.id;
  const selection = focus === 'memory-search' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const opened = preserve ? [...document.querySelectorAll('[data-memory-preserve][open]')].map((element) => element.dataset.memoryPreserve) : [];
  const run = state.detail;
  $('#breadcrumb').textContent = run ? run.branchName + ' / 第 ' + String(run.number).padStart(2, '0') + ' 轮' : '初始状态';
  $('#workspace').className = 'memory-workspace';
  $('#workspace').innerHTML = '<div class="memory-heading"><div><div class="eyebrow">MEMORY / ' + esc(state.listing?.story.title ?? '互动小说') + '</div><h1>这一轮，故事记住了什么</h1><p>查看新增内容、角色归属，以及写作时真正用到的记忆。</p></div><div class="memory-round-stamp"><span>' + (run ? '第 ' + String(run.number).padStart(2, '0') + ' 轮' : '初始状态') + '</span><small>' + (run ? esc(statuses[run.status] ?? run.status) : '等待第一轮交互') + '</small></div></div>' + (run ? '<div class="action-strip memory-action"><span>本轮行动</span><p>' + esc(run.action) + '</p></div>' : '') + renderMemoryPanel(state.memory, { scope: state.memoryScope, owner: state.memoryOwner, graphView: state.graphView, query: state.memoryQuery, limit: state.memoryLimit });
  for (const key of opened) { const element = [...document.querySelectorAll('[data-memory-preserve]')].find((item) => item.dataset.memoryPreserve === key); if (element) element.open = true; }
  if (preserve && ['memory-search', 'memory-owner'].includes(focus)) {
    const element = document.getElementById(focus); element?.focus({ preventScroll: true });
    if (selection && element) element.setSelectionRange(...selection);
  }
  window.scrollTo(0, scroll);
  updateConsoleURL();
}

async function loadMemory(preserve = false) {
  const runId = state.selected;
  const request = ++state.memoryRequest;
  const key = runId ?? 'initial';
  if (state.memoryKey !== key) {
    if (key === 'initial') state.memoryScope = 'retained';
    else if (state.memoryKey === 'initial') state.memoryScope = 'added';
    state.memory = null; state.memoryKey = key; state.memorySignature = ''; state.memoryLimit = 60;
    if (state.view === 'memory') renderMemoryScreen();
  }
  try {
    const memory = await api(runId ? '/api/console/memory/runs/' + encodeURIComponent(runId) : '/api/console/memory');
    if (request !== state.memoryRequest || state.selected !== runId) return;
    const signature = JSON.stringify({ ...memory, index: memory.index ? { ...memory.index, checkedAt: null } : null, graphiti: memory.graphiti ? { ...memory.graphiti, checkedAt: null } : null });
    const changed = signature !== state.memorySignature;
    state.memory = memory; state.memorySignature = signature;
    if (state.memoryOwner !== 'all' && !memory.owners?.some((owner) => owner.id === state.memoryOwner)) state.memoryOwner = 'all';
    if (state.view === 'memory' && (changed || !preserve)) renderMemoryScreen(preserve);
  } catch (error) {
    if (request !== state.memoryRequest || state.view !== 'memory') return;
    const target = $('#workspace .memory-loading') ?? $('#workspace');
    target.innerHTML = '<div class="memory-empty"><h2>暂时无法读取记忆</h2><p>' + esc(error.message) + '</p><button type="button" class="export-button" data-memory-refresh>重新读取</button></div>';
  }
}

function renderPerformanceScreen() {
  $('#breadcrumb').textContent = '最近回合';
  $('#workspace').className = 'memory-workspace';
  $('#workspace').innerHTML = '<div class="memory-heading"><div><div class="eyebrow">PERFORMANCE / ' + esc(state.listing?.story.title ?? '互动小说') + '</div><h1>每一轮花在了哪里</h1><p>按 Agent 拆分的耗时、token 用量、校验失败与正文质量问题。点击一行查看该轮工作流。</p></div></div>' + renderPerformance(state.performance);
  updateConsoleURL();
}
async function loadPerformance() {
  try {
    const data = await api('/api/console/performance');
    const changed = JSON.stringify(data) !== JSON.stringify(state.performance);
    state.performance = data;
    if (state.view === 'performance' && changed) renderPerformanceScreen();
  } catch (error) {
    if (state.view === 'performance') $('#workspace').innerHTML = '<div class="memory-empty"><h2>暂时无法读取性能记录</h2><p>' + esc(error.message) + '</p></div>';
  }
}
async function setConsoleView(view) {
  state.view = view;
  if (view !== 'workflow' && state.detail?.overview) state.detail = null;
  updateConsoleURL();
  if (view === 'performance') { renderPerformanceScreen(); await loadPerformance(); return; }
  if (view === 'memory') await loadMemory();
  else if (state.detail) renderDetail();
  else { state.signature = ''; await refresh(); }
}

async function api(path) {
  const response = await fetch(path);
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || "读取失败"); }
  return response.json();
}
async function selectRun(id) {
  if (state.selected !== id) state.manualNode = false;
  state.selected = id; state.signature = "";
  history.replaceState(null, "", `?run=${encodeURIComponent(id)}`);
  renderRuns();
  $("#workspace").innerHTML = '<div class="initial-state"><span class="empty-symbol">↳</span><h1>正在读取这一轮</h1><p>整理各 agent 的输出与提交记录</p></div>';
  window.scrollTo(0, 0);
  try {
    const detail = await api(`/api/console/runs/${encodeURIComponent(id)}`);
    if (state.selected !== id) return;
    state.detail = detail; state.signature = JSON.stringify(detail);
    updateConsoleURL();
    if (state.view === 'memory') await loadMemory(); else renderDetail();
  } catch (error) {
    if (state.selected !== id) return;
    state.detail = null;
    $("#workspace").innerHTML = `<div class="initial-state"><h1>暂时无法读取这一轮</h1><p>${esc(error.message)}</p><button class="export-button" id="retry-detail">重新读取</button></div>`;
  }
}
async function refresh(manual = false) {
  if (state.busy) return;
  state.busy = true;
  try {
    state.listing = await api("/api/console/runs");
    $("#story-title").textContent = state.listing.story.title;
    renderRuns();
    $("#connection").textContent = `已同步 · ${clockTime(state.listing.refreshedAt)}`;
    document.body.classList.remove("disconnected");
    if (state.view === 'performance') await loadPerformance();
    if (!state.listing.runs.length) {
      if (state.view === 'workflow' && state.detail?.overview) return;
      state.selected = null; state.detail = null; state.signature = "";
      updateConsoleURL();
      if (state.view === 'memory') { await loadMemory(true); return; }
      if (state.view === 'workflow') {
        state.detail = { overview: true, story: state.listing.story, status: 'overview', action: '下一次玩家行动', names: {}, steps: ['shared', 'environment', 'character', 'plot', 'decision', 'prose', 'recorder', 'commit'].map((id) => ({ id, title: graphNodes.find((n) => n.id === id)?.title, output: null, status: 'waiting', attempts: [], description: {
          shared: '检索后先检查自由行动的知识边界，再将世界状态、最近四段故事、分支摘要、记忆证据与叙事账本，按领域及人物知情范围组装上下文。',
          plot: '分析因果、剧情目标、支线与节奏，输出候选建议。', environment: '分析场景、物品、时间与行动限制，输出候选变化。', character: '根据各人物自己的知识、记忆、动机和关系分析反应。',
          decision: '主创合并三份报告，提出行动结果、状态变化、节拍、伏笔和后续选项；候选提案通过校验后才锁定。',
          prose: '主创按写作简报续写，逐句展示正文；程序检查重复、长度与连续性，必要时补写或记录警告。当前默认选项随提案生成，可配置为单独并行生成。',
          recorder: '依据已发布正文提取事实、承诺和伏笔露面，结合提案与旧账本核对；逐字引文必须存在。记录员超时或失败时使用确定性兜底。',
          commit: '确认分支没有变化后，将本轮正文、最终状态变化、记忆笔记与叙事账本一并保存；之后才进入后台索引。',
        }[id] })) };
        renderDetail(true);
        return;
      }
      $("#workspace").innerHTML = '<div class="initial-state"><span class="empty-symbol">↳</span><h1>等故事的第一步</h1><p>在小说页面进行一次行动，运行记录会自动出现在这里。</p><a class="export-button" href="http://127.0.0.1:4317" target="_blank" rel="noreferrer">打开小说 ↗</a></div>';
    } else if (!state.listing.runs.some((r) => r.id === state.selected)) {
      await selectRun(state.listing.runs[0].id);
    } else if (!state.detail || state.detail.id !== state.selected) {
      await selectRun(state.selected);
    } else {
      const id = state.selected;
      const detail = await api(`/api/console/runs/${encodeURIComponent(id)}`);
      if (state.selected === id && JSON.stringify(detail) !== state.signature) {
        state.detail = detail; state.signature = JSON.stringify(detail); renderDetail(true);
      }
      if (state.selected === id && state.view === 'memory') await loadMemory(true);
    }

  } catch (error) {
    $("#connection").textContent = "连接中断 · 正在重试";
    document.body.classList.add("disconnected");

    if (!state.listing) $("#workspace").innerHTML = '<div class="initial-state"><h1>暂时无法读取记录</h1><p>请检查控制台服务，连接恢复后会自动重试。</p></div>';
  } finally { state.busy = false; }
}
document.addEventListener('click', (event) => {
  const zoom = event.target.closest('[data-graph-zoom]');
  if (zoom) {
    const current = Number($('.graph-world')?.style.transform.match(/scale\(([^)]+)\)/)?.[1]) || 1;
    state.graphZoom = zoom.dataset.graphZoom === 'fit' ? null : Math.max(.4, Math.min(1.5, current + (zoom.dataset.graphZoom === 'in' ? .15 : -.15)));
    resizeGraph(); return;
  }
  const view = event.target.closest('[data-console-view]');
  if (view) return setConsoleView(view.dataset.consoleView);
  const scope = event.target.closest('[data-memory-scope]');
  if (scope) { state.memoryScope = scope.dataset.memoryScope; state.memoryLimit = 60; return renderMemoryScreen(true); }
  const sourceRun = event.target.closest('[data-memory-run]');
  if (sourceRun) return selectRun(sourceRun.dataset.memoryRun);
  if (event.target.closest('[data-memory-more]')) { state.memoryLimit += 60; return renderMemoryScreen(true); }
  if (event.target.closest('[data-memory-refresh]')) return loadMemory(true);
  const perfRow = event.target.closest('.perf-row[data-run]');
  if (perfRow) { state.view = 'workflow'; return selectRun(perfRow.dataset.run); }
  const run = event.target.closest('[data-run]');
  if (run) return selectRun(run.dataset.run);
  const node = event.target.closest('.graph-node[data-node]');
  if (node) return selectNode(node.dataset.node);
  if (event.target.closest('#retry-detail')) return selectRun(state.selected);
});
document.addEventListener('input', (event) => { if (event.target.matches('[data-memory-search]') && !event.isComposing && !state.memoryComposing) { state.memoryQuery = event.target.value; state.memoryLimit = 60; renderMemoryScreen(true); } });
document.addEventListener('compositionstart', (event) => { if (event.target.matches('[data-memory-search]')) state.memoryComposing = true; });
document.addEventListener('compositionend', (event) => { if (event.target.matches('[data-memory-search]')) { state.memoryComposing = false; state.memoryQuery = event.target.value; state.memoryLimit = 60; if (state.view === 'memory') renderMemoryScreen(true); } });
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-graph-view]')) { state.graphView = event.target.value; renderMemoryScreen(true); }
  if (event.target.matches('[data-memory-owner]')) { state.memoryOwner = event.target.value; state.memoryLimit = 60; renderMemoryScreen(true); }
});
window.addEventListener('resize', resizeGraph);

updateConsoleURL();
await refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 3000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
