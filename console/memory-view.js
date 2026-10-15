import { graphBrowserQuery, browserURL } from './graph-browser.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const kinds = { narrative: '正文细节', canon: '故事设定', 'world-rule': '世界规则', outcome: '回合结果', 'narrator-note': '主创备注', 'character-memory': '人物认知', 'perspective-report': '认知记录', 'environment-memory': '环境经历', 'state-transition': '状态变化', 'personal-transition': '自身变化', 'relationship-memory': '关系变化', 'known-fact': '已知事实', ledger: '正文账本', 'open-loop': '未兑现事项' };
const indexLabels = { indexed: '已入库', pending: '等待入库', receipt: '有入库回执', unknown: '暂未核对', disabled: '记忆未启用', mismatch: '内容待核对' };
const scopeLabels = { added: '本轮新增', retained: '截至本轮', recalled: '本轮调用' };
const scopeDescriptions = {
  added: '这一轮成功保存后产生的记忆。角色条目分别计数，候选提案不计入。',
  retained: '沿当前存档历史，保留到这一轮为止的记忆；不包含后续轮次。',
  recalled: '写这一轮之前，实际交给各 Agent 的记忆。它与本轮新产生的记忆不同。',
};

function failureView(trace, names) {
  if (!trace?.degraded) return '';
  if (!trace.failures?.length) return '<details class="memory-failure-details"><summary>这条历史记录未保存具体失败原因</summary><p>当时只记录了降级状态和总耗时，没有保存底层错误。新的交互会记录失败环节和超时预算。</p></details>';
  const labels = { MEMORY_RECALL_TIMEOUT: '超过本轮检索等待预算', MEMORY_INDEX_UNREADABLE: '本地索引不可读' };
  const groups = new Map();
  for (const failure of trace.failures) {
    const key = [failure.code, failure.message, failure.timeoutMs].join('|');
    if (!groups.has(key)) groups.set(key, { ...failure, views: [] });
    groups.get(key).views.push(failure.view === 'global' ? '全局' : failure.view === 'environment' ? '环境' : names[failure.view?.slice(10)] ?? failure.view);
  }
  return '<details class="memory-failure-details"><summary>查看降级原因</summary>' + [...groups.values()].map((failure) => '<div><strong>' + escape(labels[failure.code] ?? '记忆查询失败') + '</strong><p>影响视角：' + escape(failure.views.join('、')) + '</p><p>' + (failure.timeoutMs ? '允许等待 ' + (failure.timeoutMs / 1000).toFixed(1) + ' 秒；' : '') + (failure.httpStatus ? 'HTTP ' + failure.httpStatus + '；' : '') + (failure.attempts?.length ? '请求 ' + failure.attempts.length + ' 次' : '') + '</p><p class="memory-error-message">' + escape(failure.message) + '</p></div>').join('') + '</details>';
}

function textView(card, names) {
  const cut = card.text.indexOf('：{');
  if (cut >= 0) {
    try {
      const fields = JSON.parse(card.text.slice(cut + 1));
      const labels = { characterId: '人物', targetCharacterId: '关联人物', locationId: '位置', status: '状态', amount: '变化', reason: '原因' };
      const statuses = { active: '正常行动', missing: '下落不明', injured: '受伤', dead: '死亡', departed: '已离开' };
      return '<p class="memory-prefix">' + escape(card.text.slice(0, cut)) + '</p><dl class="memory-fields">' + Object.entries(fields).map(([key, value]) => '<div><dt>' + escape(labels[key] ?? key) + '</dt><dd>' + escape(names[value] ?? statuses[value] ?? value) + '</dd></div>').join('') + '</dl>';
    } catch { /* Preserve the exact text if it is not a structured transition. */ }
  }
  return '<p class="memory-text">' + escape(card.text) + '</p>';
}

function cardHTML(card, mode, names) {
  const tone = card.view === 'global' ? 'global' : card.view === 'environment' ? 'environment' : 'character';
  const round = card.sourceRound ? '第 ' + String(card.sourceRound).padStart(2, '0') + ' 轮' : '初始设定';
  const state = indexLabels[card.indexState] ?? '暂未核对';
  const id = mode + ':' + card.view + ':' + card.id;
  return '<article class="memory-card ' + tone + '">' +
    '<div class="memory-card-top"><span class="memory-owner ' + tone + '"><i></i>' + escape(card.ownerLabel) + '</span><span class="memory-kind">' + escape(kinds[card.kind] ?? card.kind ?? '记忆') + '</span></div>' +
    textView(card, names) + (mode === 'recalled' && card.retrievalSources?.includes('graphiti') ? '<p class="memory-prefix">Graphiti 关联召回 · 原文来源已核验</p>' : '') + (mode === 'recalled' && card.matchedTerms?.length ? '<div class="memory-matched-terms">命中词：' + card.matchedTerms.map((term) => '<span>' + escape(term) + '</span>').join('') + '</div>' : '') +
    '<footer class="memory-card-footer"><span>' + escape(round) + (card.truncated ? ' · 本轮使用了节选' : '') + '</span><span class="memory-index ' + escape(card.indexState) + '"><i></i>' + escape(state) + '</span></footer>' +
    '<details class="memory-source" data-memory-preserve="' + escape(id) + '"><summary>来源与入库详情</summary><dl>' +
    '<div><dt>来源轮次</dt><dd>' + escape(round) + (card.sourceRunId ? ' <button type="button" data-memory-run="' + escape(card.sourceRunId) + '">查看这一轮 ↗</button>' : '') + '</dd></div>' +
    '<div><dt>当时行动</dt><dd>' + escape(card.sourceAction) + '</dd></div>' +
    '<div><dt>记录类型</dt><dd>' + escape(kinds[card.kind] ?? card.kind) + '</dd></div>' +
    '<div><dt>来源定位</dt><dd><code>' + escape(card.source ?? '') + '</code></dd></div>' +
    '<div><dt>入库核对</dt><dd>' + escape(state) + (card.indexedAt ? ' · ' + escape(new Date(card.indexedAt).toLocaleString('zh-CN', { hour12: false })) : '') + '</dd></div>' +
    (mode === 'recalled' ? '<div><dt>调用来源</dt><dd>' + (card.sourceVerified ? '与本地来源一致' : '来源暂未核对，请结合原始调用记录查看') + '</dd></div>' : '') +
    '</dl><div class="memory-raw-label">' + (mode === 'recalled' ? '实际调用文本' : '记忆原文') + '</div><pre>' + escape(card.text) + '</pre></details></article>';
}

export function renderMemoryPanel(model, filters) {
  if (!model) return '<div class="memory-loading" role="status">正在读取这一轮的记忆…</div>';
  const summary = model.summary;
  const mode = filters.scope;
  const source = model[mode] ?? [];
  const query = filters.query.trim().toLocaleLowerCase('zh-CN');
  const records = source.filter((card) => (filters.owner === 'all' || card.view === filters.owner) && (!query || [card.text, card.ownerLabel, kinds[card.kind]].join(' ').toLocaleLowerCase('zh-CN').includes(query)));
  const visible = records.slice(0, filters.limit);
  const enabled = model.index?.state !== 'disabled';
  let indexText = '原文来源已保留';
  if (model.index?.state === 'available') indexText = '本地 BM25 已收录 ' + summary.indexed + ' 条' + (summary.pending ? ' · ' + summary.pending + ' 条等待后台写入' : ' · 已核对实际索引');
  else if (model.index?.state === 'unavailable') indexText = '索引暂不可读 · 当前显示本地来源及已有回执，不将其标为实时入库';
  else if (model.index?.state === 'partial') indexText = '索引核对尚未完整 · 部分条目的状态暂未确认';
  else if (!enabled) indexText = '长期记忆未启用 · 以下为存档中的来源记录';
  const graphStates = { ready: '已同步', pending: '等待同步', indexing: '正在关联', failed: '等待重试', snapshot_mismatch: '当前图对应其他回合，历史查询使用原文' };
  const graphNote = model.graphiti?.enabled ? '<details class="memory-source" data-memory-preserve="graphiti-progress"><summary>Graphiti / Neo4j 同步进度' + (model.graphiti.reachable ? '' : ' · 服务暂不可用，使用本地记忆') + '</summary><p>按角色分别构图；图谱尚未追上时使用本地原文。这里显示后台任务进度。</p><dl>' + (model.graphiti.streams ?? []).map((s) => '<div><dt>' + escape(s.view === 'global' ? '全局' : s.view === 'environment' ? '环境' : model.names?.[s.view.slice(10)] ?? s.view) + '</dt><dd>' + escape(graphStates[s.status] ?? s.status) + ' · ' + escape(s.indexed) + '/' + escape(s.total) + ' 个来源回合' + (typeof s.statesReady === 'boolean' && s.status !== 'snapshot_mismatch' ? (s.statesReady ? ' · 持有/位置有效期已核验' : ' · 持有/位置有效期核对 ' + escape(s.stateIndexed) + '/' + escape(s.total)) : '') + '</dd></div>').join('') + '</dl></details>' : '';
  const initial = model.initial ? '<div class="memory-intro"><strong>新的故事，从这里开始</strong><p>当前没有交互记录。这里仅保留初始故事设定；完成第一轮后，就能逐轮查看新增与调用的 memory。</p></div>' : !model.committed ? '<div class="memory-intro pending"><strong>这一轮尚未保存</strong><p>没有新增的长期记忆。下方累计记录截止到上一轮，尚未采纳的内容不会混入。</p></div>' : '';
  const retrieval = mode === 'recalled' && model.retrievalTrace ? '<div class="memory-retrieval-note"><span>' + (model.retrievalTrace.degraded ? '本轮使用了本地降级检索' : model.retrievalTrace.backend === 'bm25+graphiti' ? '本轮使用 BM25 与 Graphiti 关联记忆' : model.retrievalTrace.backend === 'bm25' ? '本轮通过本地 BM25 检索' : '历史检索方式：' + escape(model.retrievalTrace.backend ?? '未记录')) + '</span><span>耗时 ' + escape(model.retrievalTrace.elapsedMs) + ' ms</span><details><summary>查看查询条件</summary><p>' + escape(model.retrievalTrace.query) + '</p></details></div>' : '';
  let empty = '没有符合筛选条件的记忆。';
  if (!source.length && mode === 'added') empty = model.committed ? '这一轮没有产生新的记忆条目。' : '本轮尚未成功保存，没有新增记忆。';
  if (!source.length && mode === 'recalled') empty = model.retrievalRecorded ? '这一轮未选用长期记忆。' : '没有已保存的调用记录；这不代表角色没有记忆。';
  if (!model.available) empty = '还没有故事记录。到小说页面开始一次交互后，这里会自动更新。';
  return initial + graphBrowser(model, filters.graphView) + '<section class="memory-metrics" aria-label="本轮记忆统计">' +
    [['本轮新增', summary.added, '成功保存后产生'], ['累计记录', summary.retained, model.initial ? '初始故事设定' : '保留到这一轮'], ['角色视角', summary.characters, '分别保留认知'], ['本轮调用', summary.recalled, '生成正文前使用']].map(([label, value, note]) => '<div><span>' + label + '</span><strong>' + value + '<small>' + (label === '角色视角' ? '人' : '条') + '</small></strong><p>' + note + '</p></div>').join('') + '</section>' +
    '<section class="memory-library" aria-label="记忆条目"><div class="memory-library-top"><div class="memory-scope-tabs" role="tablist" aria-label="记忆范围">' + Object.entries(scopeLabels).map(([id, label]) => '<button type="button" role="tab" data-memory-scope="' + id + '" aria-selected="' + (mode === id) + '">' + (model.initial && id === 'retained' ? '初始记忆' : label) + '<span>' + (summary[id] ?? 0) + '</span></button>').join('') + '</div><span class="memory-auto">每 3 秒同步</span></div>' +
    '<p class="memory-scope-note">' + escape(scopeDescriptions[mode]) + '</p>' + (mode === 'recalled' && !model.graphiti?.enabled && model.index?.backend === 'bm25' && model.retrievalTrace?.backend && model.retrievalTrace.backend !== 'bm25' ? '<p class="memory-scope-note">这一轮保留的是当时的检索记录。当前统一使用本地 BM25，新的交互会使用当前检索方式。</p>' : '') + retrieval + (mode === 'recalled' ? failureView(model.retrievalTrace, model.names ?? {}) : '') +
    '<div class="memory-filters"><label>记忆归属<select id="memory-owner" data-memory-owner aria-label="记忆归属"><option value="all">全部视角</option>' + (model.owners ?? []).map((owner) => '<option value="' + escape(owner.id) + '"' + (filters.owner === owner.id ? ' selected' : '') + '>' + escape(owner.label) + '</option>').join('') + '</select></label><label class="memory-search">搜索记忆<input id="memory-search" data-memory-search type="search" value="' + escape(filters.query) + '" placeholder="人物、事件、物品或约定…" autocomplete="off"></label><span class="memory-results" role="status">' + records.length + ' 条记录</span></div>' +
    '<div class="memory-index-banner ' + escape(model.index?.state ?? '') + '"><i></i><span>' + escape(indexText) + '</span></div>' + graphNote +
    (visible.length ? '<div class="memory-grid">' + visible.map((card) => cardHTML(card, mode, model.names ?? {})).join('') + '</div>' : '<div class="memory-empty"><span>◌</span><h2>' + escape(empty) + '</h2><p>这里展示实际记录，未保存的候选内容不会显示成已保留。</p></div>') +
    (records.length > visible.length ? '<button class="memory-more" type="button" data-memory-more>再显示 60 条（还有 ' + (records.length - visible.length) + ' 条）</button>' : '') +
    '<p class="memory-author-note">这是作者视角的观察台。全局记录包含隐藏设定，并不代表所有角色都知道。</p></section>';
}

function graphBrowser(model, view = 'global') {
  if (!model.graphiti?.enabled) return '';
  const streams = model.graphiti.streams ?? [];
  const selected = streams.find((s) => s.view === view);
  const query = graphBrowserQuery(selected);
  const label = (id) => id === 'global' ? '全局视角' : id === 'environment' ? '环境视角' : `${model.names?.[id.slice(10)] ?? id.slice(10)}视角`;
  return '<section class="graph-browser-panel" aria-label="查看实体关系图"><div><h3>实体关系图</h3><p>每次只查看一个视角。同名实体可分属不同人物的记忆；节点摘要是模型概括，完整证据见下方原文。</p></div>' +
    '<div class="graph-browser-actions"><label>图谱视角<select data-graph-view aria-label="图谱视角">' +
    [...new Set(['global', ...streams.map((s) => s.view)])].map((id) => '<option value="' + escape(id) + '"' + (id === view ? ' selected' : '') + '>' + escape(label(id)) + '</option>').join('') + '</select></label>' +
    (query ? '<a href="' + escape(browserURL(query)) + '" target="_blank" rel="noreferrer">在 Neo4j 查看此视角 ↗</a>' : '<span role="status">' + (selected?.status === 'snapshot_mismatch' ? '图已更新到其他回合，当前历史页不混入后续图。' : '此视角的图尚不可用。') + '</span>') +
    '</div><details data-memory-preserve="graph-caption-help"><summary>节点没有显示视角？</summary><p>在 Neo4j 图结果右侧点击节点标签（如 Character 或 Entity），将 Caption 选择为 displayName。显示名称例如“源稚生｜上杉绘梨衣视角”；name 仍保留原名。</p></details>' +
    '<p>打开后执行编辑器中的命令。图展示该分组当前已索引的关系（含历史关系）；切换回合或视角后，请从这里重新打开查询。</p>' +
    (query ? '<details data-memory-preserve="graph-query"><summary>查看限定范围的查询</summary><pre>' + escape(query) + '</pre></details>' : '') + '</section>';
}
