// Opt-in live test: calls the configured LLM and writes an isolated test graph.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { graphFixture } from '../test/fixtures/graphiti.js';
import { buildMemoryCorpus } from '../src/memory/cards.js';
import { buildGraphSnapshot, verifyGraphHits } from '../src/memory/graphiti-projection.js';
import { createGraphitiMemory } from '../src/memory/graphiti-memory.js';

const dataDir = resolve(process.env.AI_NOVEL_DATA_DIR ?? '.ai-novel');
const graph = await createGraphitiMemory({ dataDir });
if (!graph) throw new Error('Configure and start Graphiti first');
try {
  const input = graphFixture();
  input.store.events.e1.turnResult.characterMemoryNotes.push({ characterId: 'b', note: '只有我知道旅馆通行暗号是青灯。' });
  const corpus = buildMemoryCorpus({ ...input, instanceId: 'graphiti-live-probe-v1' });
  const snapshot = buildGraphSnapshot(corpus, input);
  const initial = await graph.request('/sync', snapshot, 10000);
  console.log(JSON.stringify({ scope: corpus.scope, accepted: initial.accepted, episodes: snapshot.streams.reduce((n, s) => n + s.events.length, 0) }));
  const deadline = Date.now() + 20 * 60 * 1000;
  let ready;
  let prior = '';
  while (Date.now() < deadline) {
    const status = await graph.request('/status?' + new URLSearchParams({ scope: corpus.scope }));
    const state = status.streams.map((s) => `${s.view}: ${s.indexed}/${s.total} ${s.status}`).join('; ');
    if (state !== prior) { console.log(state); prior = state; }
    if (status.streams.length === snapshot.streams.length && status.streams.every((s) => s.status === 'ready') && (await graph.request('/health')).ok) { ready = status; break; }
    await delay(1000);
  }
  assert.ok(ready, 'Graphiti indexing exceeded the live-test deadline');
  const global = snapshot.streams.find((s) => s.view === 'global');
  const query = '那个用于记录文字的册子，封面受潮留下了什么痕迹？';
  const semantic = await graph.request('/search', { scope: corpus.scope, view: 'global', fingerprint: global.fingerprint, query, limit: 5 }, 10000);
  const checked = verifyGraphHits(semantic, corpus.records.filter((r) => r.view === 'global'));
  assert.ok(checked.hits.some(({ record }) => record.text.includes('水痕')), 'Semantic evidence should recall the original water stain');
  const character = snapshot.streams.find((s) => s.view === 'character:a');
  const secrets = await graph.request('/search', { scope: corpus.scope, view: character.view, fingerprint: character.fingerprint, query: '旅馆通行暗号是什么？', limit: 5 }, 10000);
  const roleHits = verifyGraphHits(secrets, corpus.records.filter((r) => r.view === character.view));
  assert.equal(roleHits.rejected, 0);
  assert.doesNotMatch(JSON.stringify(roleHits), /青灯/);
  const history = await graph.request('/history?' + new URLSearchParams({ scope: corpus.scope, view: 'global', fingerprint: global.fingerprint, entity: 'notebook' }));
  const historyHits = verifyGraphHits({ hits: history.entries }, corpus.records.filter((r) => r.view === 'global')).hits;
  const occurrences = historyHits.filter(({ record }) => record.kind === 'narrative').map(({ record }) => record.sourceEventId);
  assert.deepEqual(occurrences, ['e0', 'e1', 'e2']);
  const past = structuredClone(input);
  past.store.branches.main.eventIds = ['e0']; past.store.branches.main.headEventId = 'e0';
  const pastStream = buildGraphSnapshot(buildMemoryCorpus({ ...past, instanceId: 'graphiti-live-probe-v1' }), past).streams[0];
  const historical = await graph.request('/search', { scope: corpus.scope, view: 'global', fingerprint: pastStream.fingerprint, query, limit: 5 });
  assert.equal(historical.state, 'snapshot_mismatch');
  assert.deepEqual(historical.hits, []);
  const again = await graph.request('/sync', snapshot);
  const progress = (streams) => streams.map((s) => [s.view, s.groupId, s.indexed]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(progress(again.streams), progress(ready.streams));
  const report = { checkedAt: new Date().toISOString(), scope: corpus.scope, checks: { graphitiIngestion: true, semanticEvidence: true, characterIsolation: true, separateOccurrences: true, historicalCutoff: true, idempotentEnqueue: true }, streams: again.streams, query, recalledSourceIds: checked.hits.map(({ record }) => record.sourceEventId) };
  await writeFile(join(dataDir, 'graphiti', 'live-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { graph.close(); }
