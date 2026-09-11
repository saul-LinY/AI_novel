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
  keyChoice: "关键选择", coreQuestionResponse: "对故事核心问题的回应", directConsequences: "直接后果", longTermConsequences: "长期后果", costs: "代价", resolvedQuestions: "已解决的问题", unresolvedQuestions: "尚未解决的问题", label: "选项", actionText: "行动内容", risk: "风险", cost: "代价", mode: "方式", returnConditions: "回归条件", rejoinNodeId: "回归节点", completedGoalIds: "已完成目标", startedAtEventId: "开始于事件", completedAtEventId: "完成于事件", blockedAtEventId: "阻止于事件", completed: "已完成", blocked: "已阻止", flags: "标记", quantity: "数量", itemId: "物品", relatedCoreFactIds: "关联核心事实", sourceEventId: "来源事件", knownToCharacterIds: "知情人物", attitudeDelta: "态度变化", statusAfter: "变化后状态", triggers: "触发条件", goals: "目标", next: "后续节点", allowedEndings: "允许的结局", entryConditions: "进入条件", completionConditions: "完成条件", order: "顺序", purpose: "作用", allowDeviation: "允许偏离", blockedReason: "阻止原因",
};
const enums = { success: "成功", success_with_cost: "成功，但付出了代价", failure_with_gain: "失败，但有所收获", failure: "失败", action_not_allowed: "行动不成立", mainline: "主线", detour: "绕路", deviation: "偏离", active: "活跃", open: "未结束", closed: "已结束", relationship: "关系变化", knowledge: "知识变化", branch_seed: "支线创意", route_change: "路线变化", causal_risk: "因果风险", normal: "普通结局" };
const statuses = { complete: "已完成", failed: "失败", cancelled: "已取消", rejected: "未成立", queued: "排队中", running: "进行中", prepared: "准备完成", recovering: "恢复中", paused: "已中断", waiting: "等待中", stopped: "未完成", missing: "未记录", partial: "部分正文" };
const state = { listing: null, detail: null, selected: new URLSearchParams(location.search).get("run"), signature: "", busy: false };
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
const graphNodes = [
  { id: 'action', title: '用户行动', caption: '本轮故事的起点', x: 24, y: 205, w: 122, h: 76, color: 'shared' },
  { id: 'shared', title: '信息共享', caption: '筛选并分发本轮上下文', x: 183, y: 197, w: 153, h: 92, color: 'shared' },
  { id: 'plot', title: '情节 agent', caption: '因果影响、支线与候选变化', x: 385, y: 39, w: 193, h: 104, color: 'plot', domain: true },
  { id: 'environment', title: '环境 agent', caption: '环境事实、限制与候选变化', x: 385, y: 190, w: 193, h: 104, color: 'environment', domain: true },
  { id: 'character', title: '人物 agent', caption: '人物反应、依据与候选变化', x: 385, y: 341, w: 193, h: 104, color: 'character', domain: true },
  { id: 'reports', title: '三份领域报告', caption: '候选变化尚未生效', x: 625, y: 202, w: 137, h: 82, color: 'shared' },
  { id: 'decision', title: '主创裁决', caption: '解决冲突，决定最终结果', x: 807, y: 197, w: 153, h: 92, color: 'decision' },
  { id: 'gate', title: '提案通过？', x: 1002, y: 211, w: 64, h: 64, color: 'decision', diamond: true },
  { id: 'prose', title: '主创写作', caption: '承接上文，生成正文', x: 1114, y: 53, w: 146, h: 88, color: 'prose' },
  { id: 'final', title: '最终正文与提案', caption: '正文 + 确认发生的变化', x: 1305, y: 53, w: 160, h: 88, color: 'decision' },
  { id: 'commit', title: '各领域状态回写', caption: '环境 · 人物 · 情节', x: 1305, y: 207, w: 160, h: 88, color: 'commit' },
  { id: 'world', title: '共享信息汇总', caption: '下一轮统一世界状态', x: 1114, y: 354, w: 160, h: 88, color: 'shared' },
  { id: 'next', title: '阅读结果 / 下一轮', caption: '查看正文，继续用户行动', x: 847, y: 354, w: 181, h: 88, color: 'prose' },
  { id: 'rejected', title: '调整行动 / 结束本轮', caption: '未通过时不写入新事实', x: 1114, y: 214, w: 154, h: 74, color: 'rejected' },
];
const graphEdges = [
  ['action','shared','M146 243H183'],
  ['shared','plot','M336 243H358V91H385'],
  ['shared','environment','M336 243H385'],
  ['shared','character','M336 243H358V393H385'],
  ['plot','reports','M578 91H602V243H625'],
  ['environment','reports','M578 243H625'],
  ['character','reports','M578 393H602V243H625'],
  ['reports','decision','M762 243H807'],
  ['decision','gate','M960 243H989'],
  ['gate','prose','M1034 198V97H1114'],
  ['prose','final','M1260 97H1305'],
  ['final','commit','M1385 141V207'],
  ['commit','world','M1385 295V398H1274'],
  ['world','next','M1114 398H1028'],
  ['next','action','M938 442V478H85V281'],
  ['gate','rejected','M1079 243H1114'],
  ['rejected','action','M1114 251H1088V478H85V281'],
];
const graphWidth = 1500, graphHeight = 505;
Object.assign(statuses, { ready: '可查看', skipped: '未走此路径' });
Object.assign(state, { node: new URLSearchParams(location.search).get('node'), manualNode: !!new URLSearchParams(location.search).get('node') });

function nodeData(id) {
  const run = state.detail;
  const step = run.steps.find((s) => s.id === id);
  if (step) return state.detail.status === 'paused' && step.status === 'running' ? { ...step, status: 'paused' } : step;
  const get = (key) => run.steps.find((s) => s.id === key);
  const proposal = get('decision').output;
  const committed = get('commit').output;
  const stopped = ['failed','cancelled','rejected'].includes(run.status);
  const base = { id, title: graphNodes.find((n) => n.id === id)?.title ?? id, attempts: [], kind: '流程数据', input: null, inputNote: '此处关联已有记录，不是额外的 agent 调用。', output: null, status: 'waiting' };
  if (id === 'action') return { ...base, description: '触发这一轮工作流的原始行动', output: run.action, status: 'complete' };
  if (id === 'reports') {
    const reports = Object.fromEntries(['plot','environment','character'].map((key) => [key,get(key).output]));
    return { ...base, description: '三个领域给出的建议；这些候选变化尚未成为世界事实。', output: Object.values(reports).some(Boolean) ? reports : null, status: Object.values(reports).every(Boolean) ? 'complete' : stopped ? 'stopped' : 'waiting' };
  }
  if (id === 'gate') return { ...base, description: '查看主创提案的校验结果及修改记录', input: proposal, attempts: get('decision').attempts,
    output: proposal ? { '提案是否通过': proposal.outcome?.type !== 'action_not_allowed', '行动结果': proposal.outcome } : null,
    status: get('decision').status };
  if (id === 'final') return { ...base, description: '把已保存的正文与最终提案放在一起查看；不是独立生成步骤。',
    output: get('prose').output || proposal ? { '最终正文': get('prose').output, '最终提案': proposal } : null,
    status: get('prose').status };
  if (id === 'world') return { ...base, description: '状态回写后保存的统一世界状态；下一轮会以它为基础重新筛选上下文。',
    output: committed?.stateAfter ?? null, input: proposal, status: get('commit').status };
  if (id === 'next') return { ...base, description: '本轮供阅读的正文和后续选项。这里只查看结果，不会触发新一轮。',
    output: committed ? { '正文': get('prose').output, '后续选项': proposal?.choices ?? [], '结局': proposal?.ending ?? null } : null,
    status: committed ? 'ready' : 'waiting' };
  if (id === 'rejected') return { ...base, description: '流程图中的未通过分支；实际失败原因保留在此处。',
    output: stopped ? { '运行状态': statuses[run.status], '原因': run.error ?? '本次运行已停止' } : null, status: stopped ? run.status : 'skipped' };
  return base;
}
function graphHTML() {
  return `<div class="graph-scroll" aria-label="完整 Agent Loop 工作流" tabindex="0"><div class="graph-spacer"><div class="graph-world">
    <div class="parallel-area"><span>三个领域 · 并行分析</span></div>
    <svg class="graph-edges" width="${graphWidth}" height="${graphHeight}" viewBox="0 0 ${graphWidth} ${graphHeight}" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker></defs>${graphEdges.map(([from,to,d]) => `<path data-edge-from="${from}" data-edge-to="${to}" d="${d}" marker-end="url(#arrow)" class="${[from,to].includes('rejected') ? 'alternate' : ''}"/>`).join('')}</svg>
    <span class="edge-label yes-label">是 · 继续写作</span><span class="edge-label no-label">否</span><span class="edge-label return-label">下一轮用户行动 · 继续循环</span>
    ${graphNodes.map((n) => { const data = nodeData(n.id); return `<button data-node="${n.id}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px" class="graph-node ${n.color} ${n.diamond ? 'diamond' : ''} ${n.id === state.node ? 'selected' : ''} ${progress().active.includes(n.id) ? 'is-running' : ''} ${data.status === 'skipped' ? 'inactive' : ''}" aria-pressed="${n.id === state.node}" aria-label="查看${n.title}，${statuses[data.status] ?? data.status}">${n.diamond ? `<span>${n.title}</span>` : `<div class="node-top"><span class="node-icon">${icon(n.color === 'rejected' ? 'decision' : n.color)}</span><span class="node-status ${data.status}" title="${statuses[data.status]}">${data.status === 'complete' ? '✓ 已完成' : data.status === 'running' ? '● 运行中' : data.status === 'failed' ? '! 失败' : statuses[data.status] ?? data.status}</span></div><strong>${n.title}</strong><small>${n.caption}</small>${n.domain ? '<div class="node-stages">读取 <span>→</span> 分析 <span>→</span> 输出</div>' : ''}`}</button>`; }).join('')}
  </div></div></div>`;
}
function graphSelection() {
  document.querySelectorAll('.graph-node[data-node]').forEach((button) => { button.classList.toggle('selected',button.dataset.node === state.node); button.setAttribute('aria-pressed',button.dataset.node === state.node); });
  document.querySelectorAll('[data-edge-from]').forEach((edge) => edge.classList.toggle('highlighted',[edge.dataset.edgeFrom,edge.dataset.edgeTo].includes(state.node)));
}
function progress() {
  const run = state.detail;
  const phase = run.timeline?.findLast((entry) => entry.type === 'phase')?.phase;
  const phaseNames = { analyzing: '三个领域 agent 分析', synthesizing: '主创裁决', narrating: '正文写作', recovering: '正文续写', committing: '保存世界状态' };
  const phaseNode = { analyzing: 'environment', synthesizing: 'decision', narrating: 'prose', recovering: 'prose', committing: 'commit' };
  const active = run.steps.filter((step) => step.status === 'running').map((step) => step.id);
  if (run.status === 'complete') return { text: '本轮已完成', detail: '正文与世界状态已保存', active: [], node: 'prose', status: 'complete' };
  if (['failed','rejected','cancelled','paused'].includes(run.status)) return { text: `${statuses[run.status]}${phaseNames[phase] ? ` · ${phaseNames[phase]}` : ''}`, detail: run.error ?? '本轮已停止运行', active: [], node: phaseNode[phase] ?? 'rejected', status: run.status };
  const titles = active.map((id) => run.steps.find((step) => step.id === id).title);
  return { text: titles.length ? `正在运行 · ${titles.join('、')}` : phaseNames[phase] ? `正在运行 · ${phaseNames[phase]}` : '等待开始', detail: '工作情况自动更新', active, node: active[0] ?? phaseNode[phase] ?? 'action', status: 'running' };
}
function resizeGraph() {
  const scroll = $('.graph-scroll'); if (!scroll) return;
  const zoom = Math.min(1.15, (scroll.clientWidth - 32) / graphWidth, (scroll.clientHeight - 24) / graphHeight);
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
  if (data.output != null) output = data.id==='shared' ? readable(data.output) : renderOutput(data);
  else if (latest) output = `<p class="work-pending">最近一次提交尚未通过校验。</p>${readable(latest.output)}`;
  else output = `<div class="no-output"><p>${data.status==='running' ? '正在工作，输出会自动显示在这里。' : data.status==='skipped' ? '本轮没有走到这条路径。' : data.status==='waiting' ? '等待上游步骤完成。' : '本轮没有产出这一步的内容。'}</p></div>`;
  const history = failures && attempts.length>1 ? `<details class="work-history" data-preserve="history"><summary>之前的提交记录（${attempts.length-1} 次）</summary>${attempts.slice(0,-1).map((a,i)=>`<details class="attempt" data-preserve="attempt-${i}"><summary>第 ${i+1} 次 · ${a.status==='accepted'?'校验通过':a.status==='failed'?'校验未通过':'等待校验'}</summary>${feedbackView(a.feedback)}${readable(a.output)}</details>`).join('')}</details>` : '';
  $('#inspector').innerHTML = `<header class="work-header"><span class="step-icon ${graphNodes.find(n=>n.id===state.node)?.color ?? data.id}">${icon(graphNodes.find(n=>n.id===state.node)?.color ?? data.id)}</span><div><h2>${esc(data.title)}</h2><p>${esc(data.description ?? '')}</p></div>${badge(data.status)}</header><div id="work-content" class="work-content" role="region" aria-label="${esc(data.title)}的工作情况">${latest ? `<div class="work-submission">已提交 ${attempts.length} 次${latest.status==='accepted'?' · 最近一次校验通过':latest.status==='failed'?' · 最近一次校验未通过':' · 等待校验'}${failures ? `，其中 ${failures} 次未通过` : ''}</div>${latest.status==='failed'?feedbackView(latest.feedback):''}` : ''}<div class="work-columns">${inputHTML(data)}<section class="work-result" aria-labelledby="work-output-title"><h3 class="work-column-title" id="work-output-title">${data.id==='commit'||data.id==='world'?'保存结果':'工作输出'}</h3><div class="work-output">${output}</div>${history}</section></div></div>`;
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
  const run=state.detail, current=progress();
  if (!state.manualNode || !graphNodes.some(n=>n.id===state.node)) state.node=current.node;
  const oldNode=$('#inspector')?.dataset.node;
  const oldScroll=preserve?window.scrollY:0;
  const open=preserve&&oldNode===state.node?[...document.querySelectorAll('#inspector details[open][data-preserve]')].map(el=>el.dataset.preserve):[];
  $('#breadcrumb').textContent=`${run.branchName} / 第 ${String(run.number).padStart(2,'0')} 轮`;
  $('#workspace').className='simple-workflow';
  $('#workspace').innerHTML=`<div class="workflow-heading"><div><div class="eyebrow">RUN ${String(run.number).padStart(2,'0')} / ${esc(run.story.title)}</div><h1>创作工作流</h1></div><div class="current-progress ${current.status}" role="status"><i></i><div><strong>${esc(current.text)}</strong><span>${esc(current.detail)}</span></div></div></div><div class="action-strip"><span>用户行动</span><p>${esc(run.action)}</p></div><section class="canvas-panel" aria-label="工作流画布">${graphHTML()}<div class="simple-legend"><span><i class="legend-running"></i>正在运行</span><span><i class="legend-complete"></i>已完成</span><span><i class="legend-waiting"></i>等待中</span><small>点击节点，查看它的工作情况</small></div></section><section id="inspector" data-node="${state.node}" aria-label="节点工作情况"></section>`;
  renderInspector();graphSelection();resizeGraph();
  for(const key of open){const el=[...document.querySelectorAll('#inspector [data-preserve]')].find(el=>el.dataset.preserve===key);if(el)el.open=true;}
  if(preserve) window.scrollTo(0,oldScroll);
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
    state.detail = detail; state.signature = JSON.stringify(detail); renderDetail();
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
    if (!state.listing.runs.length) {
      state.selected = null; state.detail = null; state.signature = "";
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
    }

  } catch (error) {
    $("#connection").textContent = "连接中断 · 正在重试";
    document.body.classList.add("disconnected");

    if (!state.listing) $("#workspace").innerHTML = '<div class="initial-state"><h1>暂时无法读取记录</h1><p>请检查控制台服务，连接恢复后会自动重试。</p></div>';
  } finally { state.busy = false; }
}
document.addEventListener('click', (event) => {
  const run = event.target.closest('[data-run]');
  if (run) return selectRun(run.dataset.run);
  const node = event.target.closest('.graph-node[data-node]');
  if (node) return selectNode(node.dataset.node);
  if (event.target.closest('#retry-detail')) return selectRun(state.selected);
});
window.addEventListener('resize', resizeGraph);

await refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 3000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
