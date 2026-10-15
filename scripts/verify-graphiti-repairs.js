// Live acceptance, isolated from the player's save and pinned to the prior benchmark.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import { createStoryMemory } from '../src/memory/story-memory.js';
import { createGraphitiMemory } from '../src/memory/graphiti-memory.js';
import { buildMemoryCorpus } from '../src/memory/cards.js';
import { buildGraphSnapshot } from '../src/memory/graphiti-projection.js';

const dataDir = resolve('.ai-novel');
const fixed = JSON.parse(await readFile(dataDir + '/graphiti/repair-fixture.json', 'utf8'));
const graph = await createGraphitiMemory({ dataDir });
const memory = await createStoryMemory({ dataDir });
const baseline = await createStoryMemory({ dataDir, graph: null });
const call = memory.graph.recall.bind(memory.graph);
memory.graph.recall = (stream, allowed, query, candidates) => stream?.view === 'global'
  ? call({ ...stream, scope: fixed.graphScope }, allowed, query, candidates)
  : Promise.resolve({ state: 'disabled', hits: [], rejected: 0 });
const reportPath = 'docs/evaluations/graphiti-repair-after.json';

async function statesReady(scope) {
  const deadline = Date.now() + 20 * 60 * 1000;
  let previous = '';
  while (Date.now() < deadline) {
    const row = (await graph.request('/status?' + new URLSearchParams({ scope }))).streams[0];
    const state = await graph.request('/states?' + new URLSearchParams({ scope, view: 'global', fingerprint: row.fingerprint }));
    const status = `${row.indexed}/${row.total} ${row.status} ${state.state}`;
    if (status !== previous) { console.log(scope, status); previous = status; }
    if (row.status === 'ready' && state.state === 'ready') return { row, state };
    await delay(2000);
  }
  throw new Error('State projection did not become ready: ' + scope);
}

async function retrieval() {
  await statesReady(fixed.graphScope);
  const results = [];
  for (const c of fixed.annotation.cases) {
    const input = { store: fixed.store, storyPackage: fixed.storyPackage, action: c.query, characterIds: ['lu-mingfei', 'erii'] };
    const off = await baseline.recall(input), on = await memory.recall(input);
    assert.equal(on.trace.graphiti.global.state, 'ready');
    assert.equal(on.trace.graphiti.global.ranking, 'cross_encoder');
    const match = (r) => c.expectedCardIds.includes(r.id) && c.anchors.some((a) => r.text.includes(a));
    const result = { name: c.name, query: c.query, bm25Hit: off.global.some(match), hit: on.global.some(match),
      global: on.global, ms: on.trace.elapsedMs, ranking: on.trace.graphiti.global.ranking };
    results.push(result);
    console.log(JSON.stringify({ case: c.name, hit: result.hit, bm25: result.bm25Hit, ms: result.ms }));
  }
  const before = JSON.parse(await readFile('docs/evaluations/graphiti-repair-before.json', 'utf8'));
  return { scope: fixed.graphScope, sourceHead: fixed.annotation.sourceHeadEventId, beforeHits: before.hits,
    hits: results.filter((r) => r.hit).length, bm25Hits: results.filter((r) => r.bm25Hit).length,
    regressed: results.filter((r) => !r.hit && before.results.find((x) => x.name === r.name)?.hit).map((r) => r.name), results };
}

async function temporal() {
  const id = randomUUID();
  const pkg = { id: 'state-repair-test', packageHash: 'v1', playerCharacterId: 'xu', world: { rules: [] }, facts: [], items: [{ id: 'key', name: '青梧钥匙' }], locations: [], stages: [] };
  const characters = Object.fromEntries([['shen', '沈禾'], ['xu', '许川'], ['gu', '顾宁']].map(([id, name]) => [id, { id, name, knowledgeFactIds: [] }]));
  const texts = [
    '沈禾将青梧钥匙交给许川。交接结束时，许川是青梧钥匙唯一的持有人。青梧钥匙上系着紫色短绳。',
    '许川把青梧钥匙交给顾宁。交接结束后，青梧钥匙由顾宁独自保管，许川已不再持有。',
    '顾宁把青梧钥匙归还许川。交接结束后，许川重新独自保管青梧钥匙，顾宁已不再持有。',
  ];
  const store = { story: { createdAt: new Date().toISOString() }, currentBranchId: 'main', branches: { main: { eventIds: [], headEventId: '' } }, events: {} };
  const steps = [];
  let scope, group;
  for (const [i, prose] of texts.entries()) {
    const eventId = 'transfer-' + i;
    store.events[eventId] = { id: eventId, type: i ? 'turn' : 'opening', parentEventId: i ? 'transfer-' + (i - 1) : null, prose,
      stateAfter: { characters, timeMinutes: i * 5, inventory: {}, generatedFacts: {}, storyProgress: {} } };
    store.branches.main.eventIds.push(eventId); store.branches.main.headEventId = eventId;
    const corpus = buildMemoryCorpus({ store, storyPackage: pkg, instanceId: 'state-repair-' + id });
    const snapshot = buildGraphSnapshot(corpus, { store, storyPackage: pkg }); scope = corpus.scope;
    await graph.request('/sync', snapshot, 10000);
    const { row, state } = await statesReady(scope);
    if (group) assert.equal(row.groupId, group);
    group = row.groupId;
    const holders = state.entries.filter((s) => s.property === 'holder' && s.subject === '青梧钥匙');
    assert.equal(holders.length, 1, 'There must be exactly one current holder');
    assert.equal(holders[0].value, i === 1 ? '顾宁' : '许川');
    const history = await graph.request('/states?' + new URLSearchParams({ scope, view: 'global', fingerprint: row.fingerprint, history: 'true', entity: '青梧钥匙' }));
    steps.push({ eventId, current: holders, history: history.entries });
    assert.equal(history.entries.filter((x) => x.property === 'holder').length, i + 1);
  }
  const intervals = steps.at(-1).history.filter((s) => s.property === 'holder');
  assert.ok(intervals[0].invalidAt && intervals[1].invalidAt && intervals[2].invalidAt === null);
  assert.notEqual(intervals[0].id, intervals[2].id);
  const connection = parseEnv(await readFile(dataDir + '/neo4j/connection.env', 'utf8'));
  const response = await fetch('http://127.0.0.1:7474/db/neo4j/tx/commit', { method: 'POST', headers: {
    authorization: 'Basic ' + Buffer.from(`${connection.NEO4J_USER}:${connection.NEO4J_PASSWORD}`).toString('base64'), 'content-type': 'application/json',
  }, body: JSON.stringify({ statements: [{ statement: 'MATCH ()-[r:RELATES_TO]->() WHERE r.group_id=$group AND r.fact CONTAINS "许川" AND r.fact CONTAINS "唯一" RETURN r.fact AS fact, toString(r.valid_at) AS validAt, toString(r.invalid_at) AS invalidAt', parameters: { group } }] }) });
  const raw = await response.json(); assert.deepEqual(raw.errors, []);
  const native = raw.results[0].data.map((x) => x.row);
  assert.ok(native.length && native.every((r) => r[1] && r[2]), 'Original native holder facts must also have closed validity windows');
  return { scope, group, checks: { currentHolderUnique: true, oldHolderExpired: true, returnHasNewInterval: true, nativeFactExpired: true }, steps, native };
}

try {
  const [ranking, transitions] = await Promise.all([retrieval(), temporal()]);
  assert.ok(ranking.hits > ranking.beforeHits, 'The fixed-snapshot evidence recall must improve');
  assert.deepEqual(ranking.regressed, [], 'Do not lose previously matched evidence');
  const report = { checkedAt: new Date().toISOString(), ranking, transitions };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ before: ranking.beforeHits, after: ranking.hits, total: ranking.results.length, regressed: ranking.regressed, transitions: transitions.checks, reportPath }));
} finally { graph.close(); memory.close(); baseline.close(); }
