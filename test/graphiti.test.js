import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMemoryCorpus } from '../src/memory/cards.js';
import { buildGraphSnapshot, verifyGraphHits, graphLifecycle } from '../src/memory/graphiti-projection.js';
import { GraphitiMemory } from '../src/memory/graphiti-memory.js';
import { StoryMemory } from '../src/memory/story-memory.js';
import { createNarrativeState, validateTurnRecord, applyTurnRecord } from '../src/story-narrative.js';

import { graphFixture } from './fixtures/graphiti.js';

test('unselected opening never builds a graph; all saved branches remain live after selection', () => {
  const input = { ...graphFixture(), instanceId: '/test/story' };
  input.store.story.roleSelectionRequired = true;
  input.store.story.selectedPlayerCharacterId = null;
  assert.deepEqual(buildGraphSnapshot(buildMemoryCorpus(input), input).streams, []);
  const waiting = graphLifecycle(input);
  assert.deepEqual(waiting.activeScopes, []);
  input.store.story.selectedPlayerCharacterId = 'a';
  input.store.branches.other = { ...input.store.branches.main, id: 'other' };
  const selected = graphLifecycle(input);
  assert.equal(selected.owner, waiting.owner);
  assert.equal(new Set(selected.activeScopes).size, 2);
  input.store.currentBranchId = 'other';
  assert.deepEqual(graphLifecycle(input), selected);
  input.store.story.createdAt = '2099-01-01';
  const reset = graphLifecycle(input);
  assert.equal(reset.owner, selected.owner);
  assert.ok(reset.activeScopes.every((scope) => !selected.activeScopes.includes(scope)));
});

test('a failed pre-reset request is not requeued after the reset manifest', async () => {
  let reject;
  const sent = [];
  const graph = new GraphitiMemory({ config: { url: 'http://127.0.0.1:4320', timeoutMs: 500, topK: 5 }, token: 'x', logger: { warn() {} },
    fetchImpl: async (_url, args) => {
      sent.push(JSON.parse(args.body));
      if (sent.length === 1) return new Promise((_resolve, r) => { reject = r; });
      return { ok: true, json: async () => ({ streams: [] }) };
    } });
  graph.enqueue({ owner: 'owner', activeScopes: ['old'], streams: [{ scope: 'old' }] });
  graph.enqueue({ owner: 'owner', activeScopes: [], streams: [] });
  reject(new Error('offline'));
  await graph.drain();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].activeScopes, []);
  assert.equal(graph.pending.size, 0);
  graph.close();
});

test('graph occurrences preserve every handover and only include committed perspective sources', () => {
  const input = graphFixture();
  input.store.events.e1.turnResult.npcIntents = [{ intent: '未采纳的纵火计划' }];
  input.store.events.e1.turnResult.characterMemoryNotes.push({ characterId: 'b', note: '只有我知道密钥是青灯。' });
  input.store.events.orphan = { id: 'orphan', prose: '没有提交的事件' };
  const corpus = buildMemoryCorpus(input);
  const snapshot = buildGraphSnapshot(corpus, input);
  const global = snapshot.streams.find((s) => s.view === 'global');
  assert.equal(global.events.length, 3);
  const transfers = global.events.flatMap((e) => e.records).filter((r) => r.kind === 'narrative' && r.ordinal > 0);
  assert.equal(new Set(transfers.map((r) => r.id)).size, 2);
  assert.ok(transfers.every((r) => r.entities.some((e) => e.id === 'notebook')));
  assert.doesNotMatch(JSON.stringify(snapshot), /未采纳的纵火|没有提交的事件/);
  assert.doesNotMatch(JSON.stringify(snapshot.streams.find((s) => s.view === 'character:a')), /青灯/);
  assert.match(JSON.stringify(snapshot.streams.find((s) => s.view === 'character:b')), /青灯/);
});

test('snapshots change on rewrites, cutoffs and resets without mutating source events', () => {
  const input = graphFixture();
  const build = () => buildGraphSnapshot(buildMemoryCorpus(input), input).streams[0];
  const first = build();
  const original = JSON.stringify(input);
  assert.deepEqual(first, build());
  assert.equal(JSON.stringify(input), original);
  input.store.branches.main.eventIds.pop(); input.store.branches.main.headEventId = 'e1';
  const cut = build();
  assert.notEqual(cut.fingerprint, first.fingerprint);
  assert.equal(cut.events.length, 2);
  assert.equal(cut.events[0].fingerprint, first.events[0].fingerprint);
  input.store.events.e1.prose = '交接已被作者修正。';
  assert.notEqual(build().events[1].fingerprint, cut.events[1].fingerprint);
  input.store.story.createdAt = '2026-10-15T00:00:00Z';
  assert.notEqual(build().scope, first.scope);
});

test('explicit recorder entity references preserve pronoun-only occurrences and reject unknown IDs', () => {
  const input = graphFixture();
  const event = input.store.events.e2;
  event.prose = '他把它交还给她。';
  event.stateAfter.narrative = createNarrativeState(input.storyPackage);
  event.stateAfter.narrative.turn = 2;
  const record = { entries: [{ kind: 'item', text: '本次交接已经完成。', quote: event.prose, characterIds: ['a', 'b'], knownByIds: ['a', 'b'], importance: 2, entityIds: ['notebook'] }] };
  const context = { prose: event.prose, stateAfter: event.stateAfter, proposal: {}, storyPackage: input.storyPackage };
  validateTurnRecord(record, context);
  applyTurnRecord(event.stateAfter, record, { eventId: event.id, playerCharacterId: 'a' });
  const snapshot = buildGraphSnapshot(buildMemoryCorpus(input), input);
  const occurrences = snapshot.streams.find((s) => s.view === 'global').events.at(-1).records.filter((r) => r.kind === 'ledger');
  assert.ok(occurrences[0].entities.some((e) => e.id === 'notebook'));
  record.entries[0].entityIds = ['invented-item'];
  assert.throws(() => validateTurnRecord(record, context), /不存在的实体/);
});

test('reader-facing graph status does not expose private perspective names or tokens', () => {
  const graph = new GraphitiMemory({ config: {}, token: 'secret-token' });
  graph.stats.streams = [{ view: 'character:hidden-villain', status: 'ready', indexed: 1, total: 1 }];
  assert.equal(graph.status().readyPerspectives, 1);
  assert.doesNotMatch(JSON.stringify(graph.status()), /hidden-villain|secret-token/);
  graph.close();
});

test('graph results cannot inject rewritten facts, stale cards, another role or future records', () => {
  const records = buildMemoryCorpus(graphFixture()).records;
  const allowed = records.filter((r) => r.view === 'character:a');
  const a = allowed[0], b = records.find((r) => r.view === 'character:b');
  const hit = (r) => ({ cardId: r.id, contentHash: r.contentHash, sourceEventId: r.sourceEventId, text: '伪造新事实' });
  const result = verifyGraphHits({ hits: [hit(a), hit(a), hit(b), { ...hit(a), contentHash: 'stale' }, { ...hit(a), sourceEventId: 'future' }] }, allowed);
  assert.equal(result.hits.length, 1);
  assert.equal(result.rejected, 3);
  assert.equal(result.hits[0].record.text, a.text);
  assert.doesNotMatch(JSON.stringify(result), /伪造新事实/);
});

test('graph excerpts must be exact source substrings and preserve their local offset', () => {
  const records = buildMemoryCorpus(graphFixture()).records.filter((r) => r.view === 'global');
  const r = records.find((r) => r.text.includes('水痕'));
  const base = { cardId: r.id, sourceEventId: r.sourceEventId, contentHash: r.contentHash };
  const quote = '本子封面有一道水痕。';
  const result = verifyGraphHits({ hits: [{ ...base, excerpt: '伪造的线索' }, { ...base, excerpt: quote }] }, records);
  assert.equal(result.rejected, 1);
  assert.equal(result.hits[0].excerpt.text, quote);
  assert.equal(result.hits[0].excerpt.offset, r.text.indexOf(quote));
  assert.equal(result.hits[0].record.text, r.text);
});

test('embedding candidates fuse with BM25 without a precision reranker', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'novel-rerank-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const input = graphFixture();
  let observed;
  const graph = { status: () => ({ enabled: true }), close() {}, async recall(stream, allowed, query, ids) {
    observed = { query, ids };
    const record = allowed.find((r) => r.text.includes('水痕'));
    return { ranking: 'embedding', state: 'ready', rejected: 0, hits: record ? [{ record, score: 0.8 }] : [] };
  } };
  const memory = new StoryMemory({ dataDir, config: { enabled: true, topK: 5 }, graph });
  t.after(() => memory.close());
  const result = await memory.recall({ ...input, action: '本子上有什么痕迹？', characterIds: [] });
  assert.ok(result.global.some(r => r.text.includes('水痕') && r.retrievalSources.includes('graphiti')));
  assert.equal(result.trace.graphiti.global.ranking, 'embedding');
  assert.equal(result.trace.query, '本子上有什么痕迹？');
  assert.ok(observed.ids.length > 0);
});

test('indexing is retried until ready but a historical mismatch is never retried', async () => {
  const g = new GraphitiMemory({ config: { timeoutMs: 30000, readyWaitMs: 2200, topK: 5 }, token: 'x' });
  let calls = 0;
  g.request = async () => ++calls === 1 ? { state: 'indexing', hits: [] } : { state: 'ready', ranking: 'embedding', hits: [] };
  const stream = { scope: 's', view: 'global', fingerprint: 'f' };
  const result = await g.recall(stream, [], 'query');
  assert.equal(result.state, 'ready'); assert.equal(result.waitedForIndex, true); assert.equal(calls, 2);
  calls = 0; g.request = async () => { calls++; return { state: 'snapshot_mismatch', hits: [] }; };
  assert.equal((await g.recall(stream, [], 'query')).state, 'snapshot_mismatch'); assert.equal(calls, 1);
  g.close();
});

test('index readiness wait has a deadline and closes promptly', async () => {
  const g = new GraphitiMemory({ config: { timeoutMs: 30000, readyWaitMs: 15, topK: 5 }, token: 'x' });
  g.request = async () => ({ state: 'pending', hits: [] });
  const stream = { scope: 's', view: 'global', fingerprint: 'f' };
  assert.equal((await g.recall(stream, [], 'query')).state, 'pending');
  g.config.readyWaitMs = 60000;
  const pending = g.recall(stream, [], 'query');
  await new Promise(resolve => setTimeout(resolve, 10));
  g.close(); assert.equal((await pending).state, 'disabled');
});

test('graph semantic candidates reach writer memory as locally verified source cards', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'novel-graphiti-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const input = graphFixture();
  const graph = {
    status: () => ({ enabled: true }), enqueue() {}, drain: async () => {}, close() {},
    async recall(stream, allowed) {
      const record = allowed.find((r) => r.text.includes('水痕'));
      return { hits: record ? [{ record, score: 0.9 }] : [], rejected: 0, state: 'ready', indexedThroughEventId: 'e2' };
    },
  };
  const memory = new StoryMemory({ dataDir, config: { enabled: true }, graph });
  t.after(() => memory.close());
  const result = await memory.recall({ ...input, action: '回想封面受潮的痕迹', characterIds: ['a'] });
  assert.equal(result.trace.backend, 'bm25+graphiti');
  assert.ok(result.global.some((r) => r.text.includes('水痕') && r.retrievalSources.includes('graphiti')));
  assert.doesNotMatch(JSON.stringify(result.characters), /水痕/);
});

test('network errors degrade graph recall without losing local BM25 or exposing secrets', async () => {
  const graph = new GraphitiMemory({ config: { url: 'http://127.0.0.1:4320', timeoutMs: 80, topK: 5 }, token: 'private-token',
    fetchImpl: async () => { throw new Error('provider failed: private-token'); }, logger: { warn() {} } });
  const result = await graph.recall({ scope: 'x', view: 'global', fingerprint: 'y' }, [], 'test');
  assert.equal(result.state, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /private-token/);
  graph.close();
});

test('a newer queued snapshot survives failed dispatch and is retried instead of an older one', async () => {
  let reject;
  const sent = [];
  const graph = new GraphitiMemory({ config: { url: 'http://127.0.0.1:4320', timeoutMs: 500, topK: 5 }, token: 'x', logger: { warn() {} },
    fetchImpl: (_url, args) => { sent.push(JSON.parse(args.body)); return new Promise((_resolve, r) => { reject = r; }); } });
  graph.enqueue({ streams: [{ scope: 's', headEventId: 'old' }] });
  graph.enqueue({ streams: [{ scope: 's', headEventId: 'new' }] });
  reject(new Error('offline'));
  await graph.drain();
  assert.equal(graph.pending.get('s').streams[0].headEventId, 'new');
  assert.equal(sent.length, 1);
  graph.close();
});
