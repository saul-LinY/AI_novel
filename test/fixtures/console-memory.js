import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { BM25Backend, bm25IndexPath, readBM25Snapshot } from '../../src/memory/bm25-backend.js';
import { buildMemoryCorpus, memoryExcerpt } from '../../src/memory/cards.js';

export async function createMemoryConsoleFixture(dataDir) {
  const storyPackage = { id: 'dragon-raja', packageHash: 'console-fixture', playerCharacterId: 'su', world: { rules: [] }, facts: [{ id: 'secret', truth: '密室口令是青灯七三', revealText: '密室口令是青灯七三' }] };
  const state = { characters: { su: { id: 'su', name: '苏月', knowledgeFactIds: [], status: 'active' }, lin: { id: 'lin', name: '林舟', knowledgeFactIds: ['secret'], status: 'active' } }, generatedFacts: {}, timeMinutes: 0 };
  const opening = { id: 'opening', type: 'opening', parentEventId: null, prose: '苏月和林舟来到钟楼。', stateAfter: structuredClone(state) };
  const branch = { id: 'main', name: '主线', eventIds: ['opening'], headEventId: 'opening', memory: '' };
  const store = { story: { title: '记忆观察测试', createdAt: '2026-09-29T00:00:00Z', packageHash: storyPackage.packageHash, piSessionFiles: {} }, currentBranchId: 'main', branches: { main: branch }, events: { opening } };
  const original = buildMemoryCorpus({ store, storyPackage, instanceId: resolve(dataDir) });
  const recalled = original.records.find((card) => card.view === 'character:lin');
  const first = { id: 'turn-1', type: 'turn', branchId: 'main', parentEventId: 'opening', action: '把钥匙交给林舟，约好天亮前回来。', createdAt: '2026-09-29T01:00:00Z', prose: '苏月把铜钥匙交给林舟。窗户被风吹开。', stateAfter: structuredClone(state), turnResult: { outcome: { summary: '钥匙已交给林舟。' }, memoryNotes: ['天亮前归还钥匙的约定尚未兑现。'], characterMemoryNotes: [{ characterId: 'su', note: '我把钥匙交给了林舟。' }, { characterId: 'lin', note: '苏月把铜钥匙交给我，约定天亮前归还。' }], environmentMemoryNotes: ['钟楼窗户被风吹开。'], delta: {} }, sharedContext: { memoryTrace: { backend: 'bm25', degraded: false, elapsedMs: 42, query: '回忆钟楼钥匙与密室的线索' }, domainContexts: { plot: { longTermMemory: [] }, environment: { longTermMemory: [] }, character: { longTermMemoryByCharacter: { lin: [memoryExcerpt(recalled, 0.8)], su: [] } } } } };
  const second = { id: 'turn-2', type: 'turn', branchId: 'main', parentEventId: 'turn-1', action: '林舟独自把钥匙藏到井边。', createdAt: '2026-09-29T02:00:00Z', prose: '林舟把钥匙藏进井边的酒坛，苏月没有看见。', stateAfter: structuredClone(state), turnResult: { outcome: { summary: '钥匙被藏到井边。' }, memoryNotes: [], characterMemoryNotes: [{ characterId: 'lin', note: '第二轮才发生：我把钥匙藏到了井边。' }], delta: {} }, sharedContext: { memoryTrace: { backend: 'bm25', degraded: true, elapsedMs: 101, query: '回忆钥匙归属' }, domainContexts: { plot: { longTermMemory: [] }, environment: { longTermMemory: [] }, character: { longTermMemoryByCharacter: {} } } } };
  store.events[first.id] = first; store.events[second.id] = second;
  branch.eventIds.push(first.id, second.id); branch.headEventId = second.id;
  const corpus = buildMemoryCorpus({ store, storyPackage, instanceId: resolve(dataDir) });
  const storyDir = join(dataDir, 'stories', 'dragon-raja');
  async function save(path, data) { const full = join(storyDir, path); await mkdir(dirname(full), { recursive: true }); await writeFile(full, typeof data === 'string' ? data : JSON.stringify(data)); }
  await save('index.json', { story: store.story, currentBranchId: 'main', branches: [{ id: 'main', name: '主线' }] });
  await save('branches/main/branch.json', branch);
  for (const event of Object.values(store.events)) await save('branches/main/turns/' + event.id + '/event.json', event);
  for (const [i, event] of [first, second].entries()) {
    const id = 'run-' + (i + 1);
    await save('turn-jobs/' + id + '/job.json', { turnId: id, branchId: 'main', eventId: event.id, headEventId: event.parentEventId, status: 'complete', action: event.action, createdAt: event.createdAt, updatedAt: event.createdAt });
    await save('turn-jobs/' + id + '/events.ndjson', JSON.stringify({ type: 'complete', createdAt: event.createdAt }));
  }
  await save('turn-jobs/failed/job.json', { turnId: 'failed', branchId: 'main', eventId: 'uncommitted', headEventId: 'turn-2', status: 'failed', action: '尚未保存的行动', createdAt: '2026-09-29T03:00:00Z', updatedAt: '2026-09-29T03:01:00Z', prepared: { proposal: { memoryNotes: ['候选内容不能冒充保留的记忆'] } } });
  await save('turn-jobs/failed/events.ndjson', JSON.stringify({ type: 'failed', message: '测试中断', createdAt: '2026-09-29T03:01:00Z' }));
  await mkdir(join(dataDir, 'memory'), { recursive: true });
  await writeFile(join(dataDir, 'memory/config.json'), JSON.stringify({ enabled: true, retriever: 'bm25' }));
  const backend = new BM25Backend(dataDir);
  await backend.replaceScope(corpus.scope, corpus.records);
  backend.close();
  const indexPath = bm25IndexPath(dataDir, corpus.scope);
  const snapshot = await readBM25Snapshot(dataDir, corpus.scope);
  const saveIndex = async () => writeFile(indexPath, JSON.stringify(snapshot));
  return { dataDir, store, storyPackage, snapshot, indexPath, saveIndex, corpus, save };
}
