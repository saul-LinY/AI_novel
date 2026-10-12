import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConsoleReader, createConsoleServer } from '../src/console-server.js';
import { createMemoryConsoleFixture } from './fixtures/console-memory.js';
import { renderMemoryPanel } from '../console/memory-view.js';

async function setup(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'novel-memory-console-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const fixture = await createMemoryConsoleFixture(dataDir);
  const options = { dataDir, loadMemoryPackage: async () => fixture.storyPackage };
  return { ...fixture, options, reader: createConsoleReader(options) };
}

test('按回合展示新增与累计记忆，不包含未来轮次', async (t) => {
  const { reader } = await setup(t);
  const first = await reader.memory('run-1');
  const second = await reader.memory('run-2');
  assert.equal(first.round, 1);
  assert.ok(first.added.length > 0);
  assert.ok(first.added.every((card) => card.sourceEventId === 'turn-1'));
  assert.ok(first.retained.every((card) => ['opening', 'turn-1'].includes(card.sourceEventId)));
  assert.doesNotMatch(JSON.stringify(first.retained), /第二轮才发生/);
  assert.match(JSON.stringify(second.added), /第二轮才发生/);
  assert.ok(second.summary.retained > first.summary.retained);
});

test('本轮调用与本轮新增分开，并保留角色和查询来源', async (t) => {
  const { reader } = await setup(t);
  const first = await reader.memory('run-1');
  assert.equal(first.recalled.length, 1);
  assert.equal(first.recalled[0].view, 'character:lin');
  assert.equal(first.recalled[0].ownerLabel, '林舟');
  assert.equal(first.recalled[0].sourceEventId, 'opening');
  assert.equal(first.recalled[0].sourceVerified, true);
  assert.equal(first.retrievalTrace.elapsedMs, 42);
  assert.doesNotMatch(JSON.stringify(first.retained.filter((card) => card.view === 'character:su')), /青灯七三/);
});

test('仅实时索引内容吻合才标记已入库，缺失和异常分别标记', async (t) => {
  const { reader, snapshot, saveIndex } = await setup(t);
  const missing = snapshot.records.find((card) => card.sourceEventId === 'turn-1');
  snapshot.records.splice(snapshot.records.indexOf(missing), 1);
  const mismatched = snapshot.records.find((card) => card.sourceEventId === 'turn-1');
  mismatched.text = '旧版本内容';
  await saveIndex();
  const first = await reader.memory('run-1');
  assert.equal(first.retained.find((card) => card.id === missing.id).indexState, 'pending');
  assert.equal(first.retained.find((card) => card.id === mismatched.id).indexState, 'mismatch');
  assert.equal(first.summary.pending, 1);
  assert.equal(first.summary.indexed, first.summary.retained - 2);
});

test('索引损坏时回执不冒充实时确认，不读取无关密钥', async (t) => {
  const { reader, corpus, dataDir, indexPath } = await setup(t);
  await mkdir(join(dataDir, 'memory/checkpoints'), { recursive: true });
  await writeFile(join(dataDir, 'memory/checkpoints', corpus.scope + '.json'), JSON.stringify({ indexedIds: [corpus.records[0].id], updatedAt: '2026-09-29T01:00:00Z' }));
  await writeFile(indexPath, '{broken snapshot');
  await writeFile(join(dataDir, 'memory/secrets.json'), 'DO_NOT_EXPOSE');
  const first = await reader.memory('run-1');
  assert.equal(first.index.state, 'unavailable');
  assert.equal(first.summary.indexed, 0);
  assert.ok(first.retained.some((card) => card.indexState === 'receipt'));
  assert.doesNotMatch(JSON.stringify(first), /DO_NOT_EXPOSE/);
});

test('失败或未提交的回合没有新增记忆，候选提案不计入', async (t) => {
  const { reader } = await setup(t);
  const failed = await reader.memory('failed');
  assert.equal(failed.committed, false);
  assert.deepEqual(failed.added, []);
  assert.doesNotMatch(JSON.stringify(failed), /候选内容不能冒充/);
  assert.equal(failed.retrievalRecorded, false);
});

test('记忆接口只读，并按真实 scope 读取本地索引', async (t) => {
  const { options, dataDir } = await setup(t);
  const path = join(dataDir, 'stories/dragon-raja/index.json');
  const before = await readFile(path, 'utf8');
  const server = createConsoleServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(base + '/api/console/memory/runs/run-1');
  assert.equal(response.status, 200);
  assert.ok((await response.json()).summary.retained > 0);
  assert.equal((await fetch(base + '/api/console/memory', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/console/memory/runs/absent')).status, 404);
  assert.equal((await fetch(base + '/memory-view.js')).status, 200);
  assert.equal(await readFile(path, 'utf8'), before);
});

test('记忆卡片转义小说文本，并能按归属和文字筛选', async (t) => {
  const { reader } = await setup(t);
  const model = await reader.memory('run-1');
  const su = model.added.find((card) => card.view === 'character:su');
  su.text = '<img src=x onerror=alert(1)>铜钥匙';
  const html = renderMemoryPanel(model, { scope: 'added', owner: 'character:su', query: '铜钥匙', limit: 60 });
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('青灯七三'));
  assert.ok(html.includes('1 条记录'));
});

test('关键词搜索针对记忆内容，不因本轮行动相同而匹配所有条目', async (t) => {
  const { reader } = await setup(t);
  const model = await reader.memory('run-1');
  const html = renderMemoryPanel(model, { scope: 'added', owner: 'all', query: '钥匙', limit: 60 });
  assert.ok(html.includes('7 条记录'));
  assert.ok(!html.includes('<p class="memory-text">钟楼窗户被风吹开。</p>'));
});

test('没有记忆条目的角色仍可作为空视角查看', async (t) => {
  const { reader, store, save } = await setup(t);
  store.events['turn-1'].stateAfter.characters.lan = { id: 'lan', name: '阿岚', knowledgeFactIds: [] };
  await save('branches/main/turns/turn-1/event.json', store.events['turn-1']);
  const first = await reader.memory('run-1');
  assert.deepEqual(first.owners.find((owner) => owner.id === 'character:lan'), { id: 'character:lan', label: '阿岚', count: 0 });
});

test('观察台读取完整本地索引，无需网络，并识别索引缺失', async (t) => {
  const { reader, indexPath, dataDir } = await setup(t);
  const before = await readFile(indexPath, 'utf8');
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Network forbidden'); };
  try {
    const first = await reader.memory('run-1');
    assert.equal(first.summary.indexed, first.summary.retained);
    assert.equal(first.summary.pending, 0);
    assert.equal(await readFile(indexPath, 'utf8'), before);
    await rm(indexPath);
    const missing = await reader.memory('run-1');
    assert.equal(missing.summary.indexed, 0);
    assert.equal(missing.summary.pending, missing.summary.retained);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('概览定位最新已提交轮次，不把已有交互误标为初始状态', async (t) => {
  const { reader } = await setup(t);
  const overview = await reader.memory();
  assert.equal(overview.round, 2);
  assert.equal(overview.initial, false);
  assert.equal(overview.committed, true);
});

test('控制台显示具体降级原因，旧记录缺少原因时不猜测', async (t) => {
  const { reader } = await setup(t);
  const model = await reader.memory('run-2');
  const filters = { scope: 'recalled', owner: 'all', query: '', limit: 60 };
  assert.match(renderMemoryPanel(model, filters), /历史记录未保存具体失败原因/);
  model.retrievalTrace.failures = [{ view: 'character:lin', code: 'MEMORY_INDEX_UNREADABLE', stage: 'local-index', message: 'Local index unreadable' }];
  const html = renderMemoryPanel(model, filters);
  assert.match(html, /本地索引不可读/);
  assert.match(html, /Local index unreadable/);
  assert.match(html, /影响视角：林舟/);
});


test('已停用检索方式的历史回合保留原标记，不冒充当前 BM25', async (t) => {
  const { reader } = await setup(t);
  const model = await reader.memory('run-1');
  model.retrievalTrace.backend = 'retired-backend';
  const html = renderMemoryPanel(model, { scope: 'recalled', owner: 'all', query: '', limit: 60 });
  assert.match(html, /历史检索方式：retired-backend/);
  assert.match(html, /当前统一使用本地 BM25/);
  assert.doesNotMatch(html, /本轮通过本地 BM25 检索/);
  model.retrievalTrace.backend = '<script>alert(1)</script>';
  assert.doesNotMatch(renderMemoryPanel(model, { scope: 'recalled', owner: 'all', query: '', limit: 60 }), /<script>/);
});
