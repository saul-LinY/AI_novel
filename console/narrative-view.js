// Narrative view for the workflow console: the tension curve, the
// foreshadowing ledger, open loops and the prose-grounded fact ledger as they
// stood after the selected turn. Author-facing: hidden meanings are shown.
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export const BEAT_LABELS = { setup: '铺垫', complication: '施压', reversal: '反转', revelation: '揭示', climax: '高潮', release: '喘息', aftermath: '余波' };
const SEED_STATUS = { dormant: '休眠', planted: '已埋下', paid_off: '已回收', retired: '已放弃' };
const LOOP_KINDS = { promise: '承诺', threat: '威胁', question: '疑问', plan: '计划', debt: '人情' };
const LEDGER_KINDS = { event: '事件', detail: '细节', dialogue: '对白', promise: '承诺', secret: '秘密', injury: '伤势', item: '物品', relationship: '关系', location: '地点' };
const LINE = '#7a68b0';

// One series (tension 1-10 per turn): a 2px line, ringed end markers, a
// crosshair-style hover per turn and beat labels under the axis.
export function tensionChart(arc, { width = 640, height = 168 } = {}) {
  const points = (arc ?? []).filter((item) => Number.isInteger(item.tension));
  if (!points.length) return '<p class="pane-description">这条存档还没有带节奏记录的回合。</p>';
  const pad = { top: 14, right: 18, bottom: 34, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (tension) => pad.top + innerH - ((tension - 1) / 9) * innerH;
  const grid = [1, 4, 7, 10].map((tick) => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}" class="tc-grid"/><text x="${pad.left - 8}" y="${y(tick) + 3}" class="tc-tick" text-anchor="end">${tick}</text>`).join('');
  const path = points.map((item, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(item.tension).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)} ${pad.top + innerH} L${x(0).toFixed(1)} ${pad.top + innerH} Z`;
  const step = Math.max(1, Math.ceil(points.length / 12));
  const marks = points.map((item, index) => {
    const label = `第 ${item.turn} 回合 · ${BEAT_LABELS[item.beat] ?? '未记录'} · 张力 ${item.tension}${item.valueShift ? ` · ${item.valueShift.axis}：${item.valueShift.from} → ${item.valueShift.to}` : ''}${item.hook ? ` · 悬念：${item.hook}` : ''}`;
    const band = innerW / Math.max(1, points.length - 1);
    const beatLabel = index % step === 0 || index === points.length - 1 ? `<text x="${x(index)}" y="${height - 14}" class="tc-beat" text-anchor="middle">${escape(BEAT_LABELS[item.beat] ?? '—')}</text><text x="${x(index)}" y="${height - 2}" class="tc-turn" text-anchor="middle">${item.turn}</text>` : '';
    return `<g class="tc-point" tabindex="0" aria-label="${escape(label)}"><title>${escape(label)}</title><rect x="${x(index) - band / 2}" y="${pad.top}" width="${band}" height="${innerH}" class="tc-hit"/><line x1="${x(index)}" x2="${x(index)}" y1="${pad.top}" y2="${pad.top + innerH}" class="tc-cross"/><circle cx="${x(index)}" cy="${y(item.tension)}" r="4" class="tc-dot"/>${beatLabel}</g>`;
  }).join('');
  const last = points.at(-1);
  return `<svg class="tension-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="张力曲线：${points.length} 个回合，最近为 ${last.tension}">${grid}<path d="${area}" fill="${LINE}" fill-opacity=".1"/><path d="${path}" fill="none" stroke="${LINE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${marks}<text x="${Math.min(x(points.length - 1) + 8, width - 4)}" y="${y(last.tension) - 8}" class="tc-end" text-anchor="${points.length > 1 ? 'end' : 'middle'}">${last.tension}</text></svg>`;
}

function seedView(seed, turn) {
  const age = seed.plantedTurn != null ? turn - seed.plantedTurn : null;
  const window = seed.window ? `窗口 ${seed.window.min}–${seed.window.max} 回合` : '';
  const timing = seed.status === 'planted' && age != null ? (age > seed.window.max ? `<span class="nv-flag warn">逾期 ${age - seed.window.max}</span>` : age >= seed.window.min ? '<span class="nv-flag">可回收</span>' : '') : '';
  const surfaced = seed.surfaced === false ? '<span class="nv-flag warn">正文未露面</span>' : seed.surfaced ? '<span class="nv-flag ok">已露面</span>' : '';
  return `<li class="nv-seed ${escape(seed.status)}"><div class="nv-row"><strong>${escape(seed.id)}</strong><span class="nv-status">${SEED_STATUS[seed.status] ?? seed.status}</span>${timing}${surfaced}<small>${seed.origin === 'package' ? '故事包' : 'Agent 新埋'}${seed.plantedTurn != null ? ` · 第 ${seed.plantedTurn} 回合埋下` : ''}${window ? ` · ${window}` : ''}</small></div>
    <p><span class="nv-label">表面</span>${escape(seed.surfacedQuote ?? seed.surfaceDetail)}</p><p><span class="nv-label">真意</span>${escape(seed.hiddenMeaning)}</p>
    ${seed.reinforcements?.length ? `<p><span class="nv-label">强化</span>${seed.reinforcements.map((item) => `第 ${item.turn} 回合：${escape(item.detail)}`).join('；')}</p>` : ''}
    ${seed.payoff ? `<p><span class="nv-label">回收</span>${escape(seed.payoff)}${seed.paidOffTurn ? `（第 ${seed.paidOffTurn} 回合）` : ''}</p>` : ''}
    ${seed.retiredReason ? `<p><span class="nv-label">放弃</span>${escape(seed.retiredReason)}</p>` : ''}</li>`;
}

export function renderNarrativePanel(narrative, names = {}) {
  if (!narrative) return '<p class="pane-description">这一轮在叙事账本上线之前保存，没有节奏、伏笔与事实账本记录。</p>';
  const who = (ids) => (ids ?? []).map((id) => names[id] ?? id).join('、');
  const seeds = Object.values(narrative.seeds ?? {});
  const order = { planted: 0, dormant: 1, paid_off: 2, retired: 3 };
  const loops = narrative.openLoops ?? [];
  const ledger = [...(narrative.ledger ?? [])].reverse();
  return `<section class="nv-block"><h3>张力曲线</h3><p class="pane-description">每个回合结束时的张力（1–10）与节拍。悬停查看价值翻转与结尾悬念。</p>${tensionChart(narrative.arc)}</section>
    <section class="nv-block"><h3>伏笔账本 · ${seeds.filter((seed) => seed.status === 'planted').length} 条在场</h3><ol class="nv-list">${seeds.sort((a, b) => order[a.status] - order[b.status]).map((seed) => seedView(seed, narrative.turn)).join('')}</ol></section>
    <section class="nv-block"><h3>未兑现事项 · ${loops.filter((loop) => loop.status === 'open').length}</h3>${loops.length ? `<ol class="nv-list">${loops.map((loop) => `<li class="nv-loop ${escape(loop.status)}"><div class="nv-row"><strong>${escape(loop.id)}</strong><span class="nv-status">${LOOP_KINDS[loop.kind] ?? loop.kind}</span><span class="nv-flag ${loop.status === 'open' ? 'warn' : 'ok'}">${loop.status === 'open' ? `悬置 ${narrative.turn - loop.openedTurn} 回合` : `第 ${loop.closedTurn} 回合了结`}</span><small>${escape(who(loop.ownerIds))}</small></div><p>${escape(loop.text)}</p><p class="nv-quote">「${escape(loop.quote)}」</p>${loop.resolution ? `<p><span class="nv-label">了结</span>${escape(loop.resolution)}</p>` : ''}</li>`).join('')}</ol>` : '<p class="work-empty">没有记录到承诺、威胁或悬而未决的问题。</p>'}</section>
    <section class="nv-block"><h3>事实账本 · ${ledger.length} 条</h3><p class="pane-description">每条都锚定在正文原句上；「知情」是亲历或被告知的人物，下一轮只把各自知道的条目交给人物 Agent。</p>${ledger.length ? `<ol class="nv-list">${ledger.map((entry) => `<li class="nv-entry ${escape(entry.status)}"><div class="nv-row"><strong>${escape(entry.id)}</strong><span class="nv-status">${LEDGER_KINDS[entry.kind] ?? entry.kind}</span>${entry.status === 'superseded' ? '<span class="nv-flag">已被取代</span>' : ''}${entry.source === 'deterministic' ? '<span class="nv-flag">兜底记录</span>' : ''}<small>重要度 ${entry.importance} · 知情：${escape(who(entry.knownByIds)) || '—'}</small></div><p>${escape(entry.text)}</p>${entry.quote ? `<p class="nv-quote">「${escape(entry.quote)}」</p>` : ''}</li>`).join('')}</ol>` : '<p class="work-empty">还没有账本条目。</p>'}</section>`;
}

// The proposal gate's four checks, shown on the gate node.
export function renderGate(gate) {
  if (!gate) return '';
  const mode = { enforce: '强制', advise: '仅提示', off: '关闭' }[gate.mode] ?? gate.mode;
  return `<div class="gate-checks">${gate.checks.map((check) => `<div class="gate-check ${check.passed ? 'passed' : 'failed'}"><span class="gate-mark" aria-hidden="true">${check.passed ? '✓' : '!'}</span><div><strong>${escape(check.label)}</strong><small>${check.passed ? '通过' : '未通过'}</small><p>${escape(check.detail)}</p>${check.issues?.length ? `<ul>${check.issues.map((issue) => `<li>${escape(issue)}</li>`).join('')}</ul>` : ''}</div></div>`).join('')}</div><p class="pane-description">节奏校验模式：${mode}；退回主创修正 ${gate.bounces ?? 0} 次${gate.waived?.length ? `，仍有 ${gate.waived.length} 项问题按警告放行` : ''}。</p>`;
}
