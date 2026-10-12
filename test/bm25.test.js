import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BM25Index, createTokenizer, buildAliasGroups } from '../src/memory/bm25.js';
import { BM25Backend, bm25IndexPath, readBM25Snapshot } from '../src/memory/bm25-backend.js';
import { StoryMemory } from '../src/memory/story-memory.js';
import { evaluationFixture } from './fixtures/memory-evaluation.js';
import { createMemoryConsoleFixture } from './fixtures/console-memory.js';
import { createConsoleReader } from '../src/console-server.js';
import { renderMemoryPanel } from '../console/memory-view.js';

const docs = (texts) => texts.map((text, ordinal) => ({ id: String(ordinal), text, ordinal }));
async function setup(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'novel-bm25-'));
  const memory = new StoryMemory({ dataDir, config: { enabled: true, retriever: 'bm25' }, logger: { warn() {} } });
  t.after(async () => { memory.close(); await memory.drain(); await rm(dataDir, { recursive: true, force: true }); });
  return { dataDir, memory };
}

test('BM25 使用词频饱和、逆文档频率和长度归一化', () => {
  const index = new BM25Index(docs(['bronze bronze key', 'bronze candle', 'lantern']));
  const result = index.search('bronze', 5);
  const idf = Math.log(1 + (3 - 2 + 0.5) / (2 + 0.5));
  const expected = idf * (2 * 2.2) / (2 + 1.2 * (0.25 + 0.75 * 3 / 2));
  assert.equal(result[0].record.id, '0');
  assert.ok(Math.abs(result[0].score - expected) < 1e-10);
  assert.deepEqual(result[0].matchedTerms, ['bronze']);
});

test('短文精确匹配不被长文中大量无关词淹没', () => {
  const index = new BM25Index(docs(['bronze key', 'bronze ' + 'lantern '.repeat(100)]));
  assert.equal(index.search('bronze')[0].record.id, '0');
  assert.deepEqual(index.search('unknownterm'), []);
  assert.deepEqual(index.search('的 了 是'), []);
});

test('中文分词保留词频，并为复合词生成低权重字对', () => {
  const tokens = createTokenizer().tokenize('不可抗力 不可抗力');
  assert.equal(tokens.filter((token) => token === 'w:不可抗力').length, 2);
  assert.ok(tokens.includes('g:抗力'));
  assert.ok(!tokens.includes('w:的'));
});

test('显式人物别名和 ID 与全名匹配，歧义别名不随意指认', () => {
  const aliases = [{ id: 'erii', name: '上杉绘梨衣', aliases: ['erii', '上杉绘梨衣', '绘梨衣'] }];
  const index = new BM25Index(docs(['上杉绘梨衣藏起钥匙。', '另一个人走进屋里。']), aliases);
  assert.equal(index.search('绘梨衣的钥匙')[0].record.id, '0');
  assert.equal(index.search('erii')[0].record.id, '0');
  assert.ok(index.search('绘梨衣')[0].matchedTerms.includes('上杉绘梨衣'));
  const ambiguous = createTokenizer([{ id: 'a', name: '林舟', aliases: ['林舟', '哥哥'] }, { id: 'b', name: '林山', aliases: ['林山', '哥哥'] }]);
  assert.deepEqual(ambiguous.tokenize('哥哥'), ['w:哥哥']);
});

test('人物别名含正则符号时按字面值匹配', () => {
  const index = new BM25Index(docs(['A+B收好信件。']), [{ id: 'person', name: 'A+B', aliases: ['A+B'] }]);
  assert.equal(index.search('A+B')[0].record.id, '0');
});

test('别名归一化不会抹掉原文中的常用简称词语', () => {
  const aliases = [{ id: 'erii', name: '上杉绘梨衣', aliases: ['上杉绘梨衣', '月读命'] }];
  const index = new BM25Index(docs(['上杉绘梨衣收好钥匙。', '林舟离开房间。']), aliases);
  assert.equal(index.search('绘梨衣')[0].record.id, '0');
  assert.equal(index.search('月读命')[0].record.id, '0');
});

test('人物目录和当前状态合并别名而不丢失角色字段', () => {
  const groups = buildAliasGroups({ characters: [{ id: 'a', name: '苏月', aliases: ['阿月'] }] }, { characters: { a: { id: 'a', name: '苏月', aliases: ['小月'] } } });
  assert.deepEqual(new Set(groups[0].aliases), new Set(['a', '苏月', '阿月', '小月'].filter((value) => value.length > 1)));
});

test('BM25 写入与查询在网络完全禁用时仍可运行', async (t) => {
  const { memory } = await setup(t);
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Network forbidden'); };
  try {
    const input = evaluationFixture();
    await memory.sync(input);
    const result = await memory.recall({ ...input, action: '记起苏月在春渡落水的往事', characterIds: ['su'] });
    assert.equal(result.trace.backend, 'bm25');
    assert.equal(result.trace.degraded, false);
    assert.equal(Object.hasOwn(result.trace, 'embeddingModel'), false);
    assert.ok(result.characters.su.length);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; }
});

test('BM25 权限过滤先于评分，角色不能查到他人的秘密', async (t) => {
  const { memory } = await setup(t);
  const input = evaluationFixture();
  const corpus = memory.corpus(input);
  const secret = await memory.searchView(corpus, 'character:lin', '紫鸢七三九');
  const hidden = await memory.searchView(corpus, 'character:su', '紫鸢七三九');
  assert.ok(secret.hits.some((hit) => hit.text.includes('紫鸢七三九')));
  assert.deepEqual(hidden.hits, []);
  await assert.rejects(memory.backend.search({ scope: corpus.scope, view: 'character:su', query: '口令', records: corpus.records, limit: 5 }), /role-scoped/);
});

test('本地索引幂等持久化，损坏时能由原始存档重建', async (t) => {
  const { memory, dataDir } = await setup(t);
  const input = evaluationFixture();
  await memory.sync(input);
  const corpus = memory.corpus(input), path = bm25IndexPath(dataDir, corpus.scope);
  const before = (await stat(path)).mtimeMs;
  await memory.sync(input);
  assert.equal((await stat(path)).mtimeMs, before);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  saved.records[0].text = 'tampered';
  await writeFile(path, JSON.stringify(saved));
  await memory.sync(input);
  assert.equal((await readBM25Snapshot(dataDir, corpus.scope)).records[0].text, corpus.records[0].text);
  const restarted = new BM25Backend(dataDir);
  assert.equal((await restarted.existing(corpus.scope)).length, corpus.records.length);
  await rm(path);
  await memory.sync(input);
  assert.equal((await restarted.existing(corpus.scope)).length, corpus.records.length);
});

test('同一分支的历史查询不使用未来回合，即使磁盘已保存未来索引', async (t) => {
  const { memory } = await setup(t);
  const input = evaluationFixture();
  await memory.sync(input);
  const earlier = structuredClone(input.store);
  earlier.branches.main.eventIds = earlier.branches.main.eventIds.slice(0, 11);
  earlier.branches.main.headEventId = 'event-010';
  const hits = await memory.searchView(memory.corpus({ ...input, store: earlier }), 'character:su', '妹妹 西门 粮仓 暗号');
  assert.ok(hits.hits.every((hit) => hit.ordinal <= 10));
});

test('控制台读取真实 BM25 索引并显示当前检索方式', async (t) => {
  const { dataDir, memory } = await setup(t);
  const fixture = await createMemoryConsoleFixture(dataDir);
  await writeFile(join(dataDir, 'memory/config.json'), JSON.stringify({ enabled: true, retriever: 'bm25' }));
  await memory.sync(fixture);
  const reader = createConsoleReader({ dataDir, loadMemoryPackage: async () => fixture.storyPackage });
  const detail = await reader.memory('run-1');
  assert.equal(detail.index.backend, 'bm25');
  assert.equal(detail.summary.indexed, detail.summary.retained);
  detail.retrievalTrace = { backend: 'bm25', degraded: false, elapsedMs: 2, query: '钥匙' };
  const html = renderMemoryPanel(detail, { scope: 'recalled', owner: 'all', query: '', limit: 60 });
  assert.match(html, /本轮通过本地 BM25 检索/);
  assert.match(html, /本地 BM25 已收录/);
});
