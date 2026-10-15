// Explicit live evaluation: read the current story; write only an isolated test graph.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { loadStoryPackage, resolvePlayableRole } from '../src/story-package.js';
import { StoryStore } from '../src/story-store.js';
import { createStoryMemory } from '../src/memory/story-memory.js';
import { createGraphitiMemory, GraphitiMemory } from '../src/memory/graphiti-memory.js';
import { buildMemoryCorpus } from '../src/memory/cards.js';
import { buildGraphSnapshot, verifyGraphHits } from '../src/memory/graphiti-projection.js';

const root = process.cwd();
const dataDir = resolve(process.env.AI_NOVEL_DATA_DIR ?? '.ai-novel');
const out = join(root, 'docs/evaluations');
const artifact = join(out, 'graphiti-effectiveness-2026-10-14');
await mkdir(out, { recursive: true });
let storyPackage = await loadStoryPackage(root, 'dragon-raja');
const store = await new StoryStore(dataDir, storyPackage).load();
if (store.story.selectedPlayerCharacterId) storyPackage = resolvePlayableRole(storyPackage, store.story.selectedPlayerCharacterId);
const branch = store.branches[store.currentBranchId];
const beforeHead = branch.headEventId;
const memory = await createStoryMemory({ dataDir });
assert.ok(memory.graph, 'Graphiti must be enabled');
const baseline = await createStoryMemory({ dataDir, graph: null });
const graph = await createGraphitiMemory({ dataDir });
const neo4j = parseEnv(await readFile(join(dataDir, 'neo4j/connection.env'), 'utf8'));
const http = new URL('http://localhost:7474'); http.hostname = new URL(neo4j.NEO4J_URI).hostname;
async function cypher(statement, parameters = {}) {
  const r = await fetch(new URL('/db/neo4j/tx/commit', http), { method: 'POST', headers: {
    authorization: 'Basic ' + Buffer.from(`${neo4j.NEO4J_USER}:${neo4j.NEO4J_PASSWORD}`).toString('base64'), 'content-type': 'application/json',
  }, body: JSON.stringify({ statements: [{ statement, parameters }] }), signal: AbortSignal.timeout(10000) });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(j.errors, []);
  return j.results[0].data.map(({ row }) => Object.fromEntries(j.results[0].columns.map((key, i) => [key, row[i]])));
}
function temporalTransferCheck(relations) {
  const old = relations.filter((r) => [r.source, r.target].includes('青梧钥匙') && r.fact.includes('许川') && r.fact.includes('唯一') && r.fact.includes('持有'));
  const current = relations.filter((r) => [r.source, r.target].includes('青梧钥匙') && r.fact.includes('顾宁') && r.fact.includes('独自保管'));
  const changedAt = Date.parse('2000-01-01T00:05:00Z');
  return {
    oldHolderFactFound: old.length > 0,
    oldHolderExpired: old.length > 0 && old.every((r) => r.invalidAt && Date.parse(r.invalidAt) <= changedAt),
    newHolderDated: current.some((r) => r.validAt && Date.parse(r.validAt) <= changedAt && (!r.invalidAt || Date.parse(r.invalidAt) > changedAt)),
    oldHolderFacts: old, newHolderFacts: current,
  };
}
const cases = [
  ['物品交接', '她写完自己的决定之后，记录愿望的东西又交到了谁手里？', ['转手递给你', '转手递给他', '没让他代笔']],
  ['药物位置', '离开房间时，最后的救命针剂被收在什么地方？', ['外侧口袋']],
  ['未揭露的目的地', '她选择的目的地现在已经告诉同行者了吗？', ['那一行夹在两层纸', '内容还没念出来', '内容尚未被念出']],
  ['离开路线', '我们是从哪里避开电梯离开的？', ['非常口', '绕开电梯厅']],
  ['监控关联', '沿途两处监视装置有什么相同的异常？', ['偏得一模一样', '镜头同样偏着一点角度', '偏角却和压在房门上那台一样']],
  ['设备细节', '楼梯下方监视装置看上去在正常工作吗？', ['指示灯是灭的', '镜头上落了薄灰']],
  ['人物身体', '有什么微小表现说明她的身体正在变差？', ['微微发抖', '眼底那点颜色比一小时前深', '握笔的手指还在抖']],
  ['联络结果', '刚才求援已经成功送达了吗？', ['没有变成已发出', '发送状态停在未确认']],
  ['交换条件', '他为了换到救命资源，向接应者提出了什么交换条件？', ['天亮前一次能接上的药', '天亮前一次能撑过今天的药物接续']],
  ['追踪距离', '追来的动静最近停在距离我们多远的位置？', ['停在离他们一层高', '停在离你们一层高']],
  ['暴露原因', '为什么只是查看联络装置也可能泄露藏身地点？', ['读取记录同样是风险', '开机收发都可能上行暴露', '先跳出来的不是界面，而是一次上行登记']],
  ['药物使用', '最后一支药有没有已经被使用？', ['最后一支药好好立着，谁也没碰', '最后一支药未使用']],
].map(([name, query, anchors]) => ({ name, query, anchors }));
const corpus = memory.corpus({ store, storyPackage });
const globalCards = corpus.records.filter((r) => r.view === 'global');
const annotated = cases.map((c) => ({ ...c, expectedCardIds: globalCards.filter((r) => c.anchors.some((a) => r.text.includes(a))).map((r) => r.id) }));
assert.ok(annotated.every((c) => c.expectedCardIds.length), 'Every question needs pre-registered evidence');
await writeFile(artifact + '.cases.json', JSON.stringify({ sourceHeadEventId: beforeHead, scope: corpus.scope, metric: 'Evidence occurs in an authorized top-5 global card and survives the writer context budget', cases: annotated }, null, 2) + '\n');

async function evaluateExisting() {
  const rows = [];
  for (const [i, c] of annotated.entries()) {
    const input = { store, storyPackage, action: c.query, characterIds: ['lu-mingfei', 'erii'] };
    // Alternate order; both paths receive the same state and context budget.
    let off, on;
    if (i % 2) { on = await memory.recall(input); off = await baseline.recall(input); }
    else { off = await baseline.recall(input); on = await memory.recall(input); }
    const matches = (r) => c.expectedCardIds.includes(r.id) && c.anchors.some((a) => r.text.includes(a));
    const onIds = new Set(on.global.map((r) => r.id)), offIds = new Set(off.global.map((r) => r.id));
    const row = { name: c.name, query: c.query, bm25Hit: off.global.some(matches), combinedHit: on.global.some(matches),
      bm25Ms: off.trace.elapsedMs, combinedMs: on.trace.elapsedMs, graphState: on.trace.graphiti.global.state,
      graphCandidates: on.trace.graphiti.global.matched, changedTop5: [...onIds].some((id) => !offIds.has(id)),
      graphOnlyAdditions: on.global.filter((r) => !offIds.has(r.id)).map((r) => ({ id: r.id, sourceEventId: r.sourceEventId, text: r.text, evidenceMatch: matches(r), retrievalSources: r.retrievalSources })),
      bm25: off.global, combined: on.global };
    rows.push(row);
    console.log(JSON.stringify({ case: c.name, bm25: row.bm25Hit, combined: row.combinedHit, graphState: row.graphState, ms: row.combinedMs }));
  }
  const secrecy = await memory.recall({ store, storyPackage, action: '橘政宗的真实身份是不是赫尔佐格？', characterIds: ['lu-mingfei'] });
  assert.doesNotMatch(JSON.stringify(secrecy.characters['lu-mingfei']), /赫尔佐格|白王之血的容器/);
  const past = structuredClone(store);
  past.branches[past.currentBranchId].eventIds = branch.eventIds.slice(0, 2);
  past.branches[past.currentBranchId].headEventId = branch.eventIds[1];
  const historical = await memory.recall({ store: past, storyPackage, action: '之后的短讯发送成功了吗？', characterIds: ['lu-mingfei'] });
  assert.equal(historical.trace.graphiti.global.state, 'snapshot_mismatch');
  assert.ok(historical.global.every((r) => r.ordinal <= 1));
  const offline = new GraphitiMemory({ config: { url: 'http://127.0.0.1:4320', timeoutMs: 50, topK: 5 }, token: 'test-only', fetchImpl: async () => { throw new Error('simulated unavailable'); } });
  const fallback = await createStoryMemory({ dataDir, graph: offline });
  try {
    const input = { store, storyPackage, action: annotated[0].query, characterIds: ['lu-mingfei', 'erii'] };
    const failed = await fallback.recall(input), normal = await baseline.recall(input);
    assert.equal(failed.trace.graphiti.global.state, 'unavailable');
    assert.deepEqual(failed.global.map((r) => r.id), normal.global.map((r) => r.id));
  } finally { fallback.close(); }
  const latest = store.events[beforeHead];
  const saved = latest.sharedContext;
  const groups = { plot: saved?.domainContexts?.plot?.longTermMemory ?? [], environment: saved?.domainContexts?.environment?.longTermMemory ?? [], ...saved?.domainContexts?.character?.longTermMemoryByCharacter };
  const savedCounts = Object.fromEntries(Object.entries(groups).map(([k, rs]) => [k, rs.filter((r) => r.retrievalSources?.includes('graphiti')).length]));
  assert.ok(Object.values(savedCounts).some((n) => n > 0));
  return { cases: rows, checks: { actualStoredAgentContext: true, characterIsolation: true, historicalCutoff: true, failureFallsBackToBM25: true }, actualContext: { eventId: beforeHead, savedGraphCardCounts: savedCounts, elapsedMs: saved?.memoryTrace?.elapsedMs },
    summary: { questions: rows.length, bm25Hits: rows.filter((x) => x.bm25Hit).length, combinedHits: rows.filter((x) => x.combinedHit).length, improved: rows.filter((x) => !x.bm25Hit && x.combinedHit).map((x) => x.name), regressed: rows.filter((x) => x.bm25Hit && !x.combinedHit).map((x) => x.name), changedTop5: rows.filter((x) => x.changedTop5).length } };
}

async function evaluateFresh() {
  const id = randomUUID();
  const pkg = { id: 'graphiti-evaluation', packageHash: 'fresh-key-v1', playerCharacterId: 'shen', facts: [], world: { rules: [] },
    items: [{ id: 'key', name: '青梧钥匙' }], locations: [{ id: 'tea', name: '茶室' }], stages: [] };
  const characters = Object.fromEntries([['shen','沈禾'],['xu','许川'],['gu','顾宁']].map(([id,name]) => [id,{id,name,status:'active',locationId:'tea',knowledgeFactIds:[]}]));
  const texts = ['沈禾将青梧钥匙交给许川。交接结束时，许川是青梧钥匙唯一的持有人。青梧钥匙上系着紫色短绳。', '许川把青梧钥匙交给顾宁。交接结束后，青梧钥匙由顾宁独自保管，许川已不再持有。'];
  const events = Object.fromEntries(texts.map((prose,i) => ['fresh-'+i,{id:'fresh-'+i,type:i?'turn':'opening',parentEventId:i?'fresh-0':null,prose,stateAfter:{characters,locationId:'tea',timeMinutes:i*5,generatedFacts:{},inventory:{},storyProgress:{}}}]));
  const testStore = { story:{createdAt:new Date().toISOString()},currentBranchId:'main',branches:{main:{eventIds:['fresh-0'],headEventId:'fresh-0'}},events };
  const make = () => { const c=buildMemoryCorpus({store:testStore,storyPackage:pkg,instanceId:'eval-'+id});return {corpus:c,snapshot:buildGraphSnapshot(c,{store:testStore,storyPackage:pkg})}; };
  const started = Date.now();
  async function ready(snapshot) {
    const submitted = await graph.request('/sync', snapshot, 10000);
    const scope=snapshot.streams[0].scope;
    const deadline=Date.now()+12*60*1000;
    let prior='';
    while(Date.now()<deadline){
      const s=(await graph.request('/status?'+new URLSearchParams({scope}))).streams[0];
      const label=`${s.indexed}/${s.total} ${s.status}`;
      if(label!==prior){console.log('fresh '+label);prior=label;}
      if(s.status==='ready')return s;
      await delay(1500);
    }
    throw new Error('Fresh graph indexing timed out: '+scope);
  }
  const first=make();const firstReady=await ready(first.snapshot);
  testStore.branches.main.eventIds.push('fresh-1');testStore.branches.main.headEventId='fresh-1';
  const second=make();const finalReady=await ready(second.snapshot);
  assert.equal(firstReady.groupId,finalReady.groupId,'Append must reuse the graph');
  const q=await graph.request('/search',{scope:second.corpus.scope,view:'global',fingerprint:second.snapshot.streams[0].fingerprint,query:'青梧钥匙现在交到了谁手中？',limit:5},10000);
  const hits=verifyGraphHits(q,second.corpus.records).hits;
  assert.ok(hits.some(({record})=>record.sourceEventId==='fresh-1'&&record.text.includes('顾宁')));
  const sources=await cypher('MATCH (o:NovelOccurrence {group_id:$group}) RETURN o.sourceEventId AS source, o.text AS text ORDER BY source',{group:finalReady.groupId});
  assert.deepEqual(sources.map(x=>x.source),['fresh-0','fresh-1']);
  const relations=await cypher('MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity) WHERE r.group_id=$group RETURN a.name AS source, r.name AS relation, b.name AS target, r.fact AS fact, toString(r.valid_at) AS validAt, toString(r.invalid_at) AS invalidAt ORDER BY fact',{group:finalReady.groupId});
  const temporal = temporalTransferCheck(relations);
  return {scope:second.corpus.scope,groupId:finalReady.groupId,elapsedMs:Date.now()-started,checks:{freshModelIngestion:true,incrementalSameGraph:true,bothOccurrencesPersisted:true,newOwnerEvidenceRecalled:true,oldHolderExpired:temporal.oldHolderExpired},temporal,sources,relations,recall:hits.map(({record})=>record)};
}

try {
  const existingTask = evaluateExisting().then(async (result) => {
    await writeFile(artifact+'.retrieval.json',JSON.stringify(result,null,2)+'\n');
    return result;
  });
  const [existing,fresh]=await Promise.all([existingTask,evaluateFresh()]);
  const now=await new StoryStore(dataDir,storyPackage).load();
  const unchanged=now.branches[now.currentBranchId].headEventId===beforeHead;
  const report={checkedAt:new Date().toISOString(),scope:corpus.scope,sourceHeadEventId:beforeHead,storyHeadUnchanged:unchanged,existing,fresh};
  await writeFile(artifact+'.json',JSON.stringify(report,null,2)+'\n');
  const mark=b=>b?'命中':'未命中';
  const table=existing.cases.map(c=>`| ${c.name} | ${mark(c.bm25Hit)} | ${mark(c.combinedHit)} | ${c.combinedMs} ms |`).join('\n');
  const md=`# Graphiti 实际效果测试\n\n日期：2026-10-14。真实模型入图、当前存档对照召回、历史与角色隔离验证。问题和证据锚点在发出查询前保存到同目录 cases.json，测试中未调整排序参数。\n\n当前存档：${existing.summary.questions} 道问题；BM25 命中 ${existing.summary.bm25Hits}，加入 Graphiti 后命中 ${existing.summary.combinedHits}。${existing.summary.changedTop5} 道题的前五条发生变化。\n\n| 问题类型 | BM25 | BM25 + Graphiti | 组合召回耗时 |\n| --- | --- | --- | --- |\n${table}\n\n改善：${existing.summary.improved.join('、')||'无'}。退步：${existing.summary.regressed.join('、')||'无'}。\n\n指标检查全局前五条中的原文证据是否在上下文字符预算截断后仍然可见；它不是最终答案准确率，也不是正文质量评分。样本来自当前短存档，不能据此推断长篇收益或延迟分布。\n\n独立测试图重新调用模型处理两次钥匙交接，耗时 ${(fresh.elapsedMs/1000).toFixed(1)} 秒。两次原文均在 Neo4j 中保留，追加使用同一个图，新持有人证据可以召回。关系的 valid_at/invalid_at 原始结果见 JSON，不能把来源召回成功等同于所有时效关系都正确。\n\n真实成功回合 ${beforeHead} 的已保存上下文已包含 Graphiti 卡片：${JSON.stringify(existing.actualContext.savedGraphCardCounts)}。这是投入实际上下文的证据，未做生成正文的因果对照。角色秘密、历史截断、模拟服务不可用时退回 BM25 均通过。测试使用独立 scope，未向正式故事提交任何新回合；测试结束时存档头${unchanged?'未变化':'已变化（可能有并发用户操作）'}。\n\n详细数据：[测试结果](graphiti-effectiveness-2026-10-14.json)。\n`;
  const temporalNote = `\n## 时效状态验收\n\n旧持有事实抽取：${fresh.temporal.oldHolderFactFound?'通过':'未通过'}；新持有事实带时间：${fresh.temporal.newHolderDated?'通过':'未通过'}；交接后旧持有关系结束：**${fresh.temporal.oldHolderExpired?'通过':'未通过'}**。\n\n${fresh.temporal.oldHolderExpired?'本次旧关系具有失效时间。':'旧的“许川唯一持有钥匙”关系仍未设置 invalid_at，不能依靠当前图的未失效关系直接判断唯一持有人。'}\n`;
  await writeFile(artifact+'.md',md+temporalNote);
  console.log(JSON.stringify({summary:existing.summary,fresh:fresh.checks,storyHeadUnchanged:unchanged,report:artifact+'.md'},null,2));
} finally {memory.close();baseline.close();graph.close();}
