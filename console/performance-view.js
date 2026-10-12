const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const seconds = (ms) => Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : '—';
const tokens = (count) => !count ? '—' : count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);

// Order and colours match the agent nodes on the workflow canvas.
export const ROLE_SEGMENTS = [
  { key: 'environment', label: '环境', color: 'var(--environment, #4f8a8b)' },
  { key: 'character', label: '人物', color: 'var(--character, #b26b7a)' },
  { key: 'plot', label: '情节', color: 'var(--plot, #8a7bb3)' },
  { key: 'main:prepare', label: '主创裁决', color: 'var(--decision, #c49a3c)' },
  { key: 'main:narration', label: '正文', color: 'var(--prose, #5f7fb5)' },
  { key: 'choices', label: '选项', color: '#7c9a5e' },
  { key: 'recorder', label: '连续性记录', color: '#9a6a5e' },
];
const qualityLabels = { collapsed_repeat: '整段重复已折叠', too_short: '正文偏短', too_long: '正文偏长', duplicate_previous: '与上一回合重复', repeated_sentence: '重复句已截停', length_cap: '超长已截停', fallback_choices: '使用兜底选项', extended_short_prose: '已补写短正文', fallback_record: '连续性记录用了兜底', continuity_conflict: '正文与账本冲突', narrative_waived: '节奏问题按警告放行', reasoning_stripped: '已滤除模型推理文字' };

// Chips shown on a workflow node and at the top of the inspector.
export function metricChips(metrics) {
  if (!metrics) return '';
  const chips = [
    `<span class="metric-chip" title="耗时">⏱ ${seconds(metrics.durationMs)}</span>`,
    metrics.tokens ? `<span class="metric-chip" title="输入 ${metrics.inputTokens} · 输出 ${metrics.outputTokens} · 缓存命中 ${metrics.cacheRead}">◇ ${tokens(metrics.tokens)}</span>` : '',
    metrics.toolFailures ? `<span class="metric-chip warn" title="结构化校验未通过次数">↻ ${metrics.toolFailures}</span>` : '',
    metrics.autoRetries ? `<span class="metric-chip warn" title="模型请求自动重试">⚡ ${metrics.autoRetries}</span>` : '',
  ];
  return `<span class="metric-chips">${chips.join('')}</span>`;
}

export function metricsDetail(metrics) {
  if (!metrics) return '<p class="pane-description">这一轮运行在遥测上线之前，没有耗时与用量记录。</p>';
  const rows = [
    ['耗时', seconds(metrics.durationMs)], ['首个 token', seconds(metrics.firstTokenMs)], ['模型', metrics.model ?? '—'],
    ['输入 tokens', tokens(metrics.inputTokens)], ['输出 tokens', tokens(metrics.outputTokens)], ['缓存命中', tokens(metrics.cacheRead)],
    ['校验未通过', metrics.toolFailures], ['自动重试', metrics.autoRetries],
  ];
  return `<dl class="metric-grid">${rows.map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl>${metrics.validationErrors.length ? `<details class="metric-errors"><summary>校验未通过的原因（${metrics.validationErrors.length}）</summary><ol>${metrics.validationErrors.map((e) => `<li>${escape(e)}</li>`).join('')}</ol></details>` : ''}`;
}

export function renderPerformance(data) {
  if (!data) return '<div class="memory-loading"><p>正在读取性能记录…</p></div>';
  const { summary, turns } = data;
  if (!turns.length) return '<div class="memory-empty"><h2>还没有性能记录</h2><p>遥测从本次升级后开始记录。完成一轮交互后，这里会显示每个 Agent 的耗时与用量。</p></div>';
  const max = Math.max(...turns.map((turn) => Object.values(turn.byRole).reduce((a, b) => a + b, 0)), 1);
  const cards = [
    ['首句正文 · P50', seconds(summary.firstProseP50)], ['首句正文 · P95', seconds(summary.firstProseP95)],
    ['整轮耗时 · P50', seconds(summary.totalP50)], ['整轮耗时 · P95', seconds(summary.totalP95)],
  ];
  const legend = ROLE_SEGMENTS.map((segment) => `<span><i style="background:${segment.color}"></i>${segment.label}</span>`).join('');
  const rows = turns.map((turn) => {
    const bars = ROLE_SEGMENTS.filter((segment) => turn.byRole[segment.key]).map((segment) => `<span class="perf-seg" style="width:${(turn.byRole[segment.key] / max) * 100}%;background:${segment.color}" title="${segment.label} ${seconds(turn.byRole[segment.key])}"></span>`).join('');
    const issues = [...turn.quality.map((issue) => qualityLabels[issue.code] ?? issue.code), ...(turn.arc?.beat ? [`节拍 ${{ setup: '铺垫', complication: '施压', reversal: '反转', revelation: '揭示', climax: '高潮', release: '喘息', aftermath: '余波' }[turn.arc.beat]} · 张力 ${turn.arc.tension}`] : []), ...(turn.failures.length ? [`校验失败 ${turn.failures.length} 次`] : [])];
    return `<li class="perf-row" data-run="${escape(turn.id)}">
      <div class="perf-meta"><strong>第 ${String(turn.number).padStart(2, '0')} 轮</strong><span>${escape(turn.action)}</span></div>
      <div class="perf-bar">${bars}</div>
      <div class="perf-numbers"><span title="首句正文">首句 ${seconds(turn.firstProseMs)}</span><span title="整轮">共 ${seconds(turn.totalMs)}</span><span title="tokens">${tokens(turn.totals?.usage?.totalTokens)}</span></div>
      ${issues.length ? `<div class="perf-issues">${issues.map((issue) => `<span>${escape(issue)}</span>`).join('')}</div>` : ''}
    </li>`;
  }).join('');
  const failures = turns.flatMap((turn) => turn.failures.map((failure) => ({ ...failure, number: turn.number })));
  return `<div class="perf-cards">${cards.map(([k, v]) => `<div class="perf-card"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>
    <section class="perf-panel"><header><h2>每轮耗时构成</h2><div class="perf-legend">${legend}</div></header><ol class="perf-rows">${rows}</ol></section>
    ${failures.length ? `<section class="perf-panel"><header><h2>结构化校验失败</h2><p>Agent 提交未通过校验、随后自行修正的记录。频繁出现的原因值得调整提示词。</p></header><ol class="perf-failures">${failures.slice(0, 40).map((f) => `<li><span>第 ${String(f.number).padStart(2, '0')} 轮 · ${escape(f.role)}</span><p>${escape(f.error)}</p></li>`).join('')}</ol></section>` : ''}`;
}
