// Read-only live benchmark. No enqueue, story writes, model generation, or graph mutation.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loadStoryPackage, resolvePlayableRole } from '../src/story-package.js';
import { StoryStore } from '../src/story-store.js';
import { createStoryMemory } from '../src/memory/story-memory.js';
import { buildGraphSnapshot } from '../src/memory/graphiti-projection.js';

const root = process.cwd(), dataDir = resolve('.ai-novel');
const prefix = resolve('docs/evaluations/memory-ab-2026-10-15');
await mkdir(resolve('docs/evaluations'), { recursive: true });
let storyPackage = await loadStoryPackage(root, 'dragon-raja');
const store = await new StoryStore(dataDir, storyPackage).load();
if (store.story.selectedPlayerCharacterId) storyPackage = resolvePlayableRole(storyPackage, store.story.selectedPlayerCharacterId);
const input = { store, storyPackage, characterIds: ['lu-mingfei', 'erii'] };
const baseline = await createStoryMemory({ dataDir, graph: null });
const combined = await createStoryMemory({ dataDir });
assert.ok(combined.graph);
// Evaluation-only deadline. Leave production's 5s timeout untouched.
const request = combined.graph.request.bind(combined.graph);
combined.graph.request = (path, body) => request(path, body, 120000);
const corpus = combined.corpus(input), cards = corpus.records.filter(r => r.view === 'global');
const snapshot = buildGraphSnapshot(corpus, input), head = store.branches[store.currentBranchId].headEventId;
const topics = [
 ['撤离期限', ['凯撒给的安全点和最晚到达时间是什么？','接应的人会一直等我们吗，应该去什么地方碰头？'], [['旧公寓'],['十点以前','十点前']]],
 ['缺药原因', ['凯撒为什么无法提供稳定血统的药？','接应者能把人带走，为什么却解决不了她的治疗？'], [['没库存','没有蛇岐八家的血清库存'],['没配方']]],
 ['保护条款', ['凯撒怎样回答学院要求绘梨衣离开日本的原因？','追问撤离的真正用意时，电话那端沉默后用了什么说辞？'], [['保护条款']]],
 ['包装痕迹', ['最后一支药的塑封有什么痕迹？','救命针剂的外包装上，有什么被反复触摸留下的细节？'], [['起了毛','塑封起毛']]],
 ['号码载体', ['最后一支药的批次号被记录在哪里？','我们把那串用来追溯药物来历的编号保存到了什么地方？'], [['手机便笺']]],
 ['取药路径', ['绘梨衣记得的取药路线经过哪里？','她过去接受治疗时，车怎么进楼，人又怎么上去？'], [['地下车库'],['电梯']]],
 ['经手人行为', ['绘梨衣取药时总共几个人，其中戴手套的人做什么？','她回忆那些来送药的人时，有什么沉默和分发药量的细节？'], [['两个','两人'],['手套'],['按次数数']]],
 ['未知姓名地址', ['绘梨衣能说出取药地点的地址和经手人的姓名吗？','她的回忆是否足够让我们按姓名或门牌找到送药的人？'], [['地址她写不出','给不出地址','地址与姓名','地址与姓名全缺'],['名字也想不起','给不出名字','地址与姓名','地址与姓名全缺']]],
 ['车辆之前', ['第二轮时，街对面的车处于什么状态？','那辆车挪动之前，有什么不寻常的停留表现？'], [['停了很久','长时间'],['没熄','未熄火']]],
 ['车辆现在', ['第三轮时街对面的车去了哪里？','那辆一直候着的车后来是离开了，还是绕到我们楼下？'], [['后巷'],['地下车库']]],
 ['正规渠道核对', ['凯撒在学院的正规序列和供应清单中查到批次号了吗？','通过校方正式的采购记录，能确认这支针剂属于哪批货吗？'], [['正规序列'],['查不到','没有它']]],
 ['外部渠道未兑现', ['凯撒改试学院外的渠道，多久有结果，是否保证查到？','电话里承诺另找关系打听，这件事已经办成了吗，等待是否一定有收获？'], [['学院外'],['几个小时'],['什么等不回来','什么都不回来']]],
 ['身体迹象', ['最新一轮绘梨衣握笔时出现什么异常？','最后回头看她时，有什么小动作暴露了身体的不适？'], [['笔尖在轻轻发抖','握笔的指尖在发抖']]],
];
const cases = topics.flatMap(([name, queries, aspects]) => queries.map((query, i) => ({ name: name + (i ? '·改述' : '·直问'), family:name, type:i?'paraphrase':'literal', query, aspects })));
cases.push(
 {name:'跨回合·入口呼应',family:'跨回合',type:'multi',query:'现在那辆车的去向，与她之前回忆的取药过程有什么共同线索？',aspects:[['来的人总是两个','两人上门','车直接开进地下车库，电梯上到某一层'],['拐进旅馆后巷','绕进旅馆后巷']]},
 {name:'跨回合·药物困境',family:'跨回合',type:'multi',query:'为什么拿到了撤离安排和药品编号，我们仍然不能确认能让她继续接受治疗？',aspects:[['接人接得下来，接药接不下来','接得了人，接不了药'],['学院外'],['什么等不回来','什么都不回来']]},
 {name:'跨回合·留白与病情',family:'跨回合',type:'multi',query:'她关于去向的态度和身体状态，分别有哪些尚未解决的信号？',aspects:[['最后一行还空着','那行空白','最后那行空白'],['笔尖在轻轻发抖','握笔的指尖在发抖']]},
);
for (const c of cases) {
 c.evidence = c.aspects.map(anchors => cards.filter(r => anchors.some(a => r.text.includes(a))).map(r=>({id:r.id,source:r.source,sourceEventId:r.sourceEventId})));
 assert.ok(c.evidence.every(a=>a.length), 'No source evidence: '+c.name);
}
await writeFile(prefix+'.fixture.json', JSON.stringify({store,storyPackage,scope:corpus.scope,sourceHead:head,config:baseline.config},null,2));
await writeFile(prefix+'.cases.json', JSON.stringify({registeredAt:new Date().toISOString(),scope:corpus.scope,head,cases},null,2));
function grade(hits,c) {
 const ranks=c.aspects.map((anchors,i)=>hits.findIndex(h=>c.evidence[i].some(e=>e.id===h.id)&&anchors.some(a=>h.text.includes(a))));
 return {complete:ranks.every(r=>r>=0),any:ranks.some(r=>r>=0),coverage:ranks.filter(r=>r>=0).length/ranks.length,mrr:ranks.reduce((n,r)=>n+(r<0?0:1/(r+1)),0)/ranks.length,ranks:ranks.map(r=>r<0?null:r+1)};
}
const rows=[],rerankInput=[];
try {
 const status=await request('/status?'+new URLSearchParams({scope:corpus.scope}));
 for(const view of ['global','environment','character:lu-mingfei','character:erii']) {
  const s=status.streams.find(s=>s.view===view), expected=snapshot.streams.find(s=>s.view===view);
  assert.equal(s?.status,'ready',view+' index not ready'); assert.equal(s.fingerprint,expected.fingerprint,view+' snapshot mismatch');
 }
 for(const [i,c]of cases.entries()) {
  const args={...input,action:c.query};let off,on;
  if(i%2){on=await combined.recall(args);off=await baseline.recall(args);}else{off=await baseline.recall(args);on=await combined.recall(args);}
  assert.ok(Object.values(on.trace.graphiti).every(s=>s.state==='ready'), 'Cannot score fallback as Graphiti: '+c.name);
  const raw=await baseline.backend.search({scope:corpus.scope,view:'global',query:c.query,limit:15,records:cards,aliasGroups:corpus.aliasGroups});
  const candidates=raw.results.map(h=>cards.find(r=>r.id===h.metadata.card_id));
  const rerankViews = {};
  for (const view of ['global', 'environment', 'character:lu-mingfei', 'character:erii']) {
    const state = store.events[head].stateAfter;
    const records = corpus.records.filter(r => r.view === view && (!r.factId || !view.startsWith('character:') || state.characters[view.slice(10)].knowledgeFactIds.includes(r.factId)));
    const response = await baseline.backend.search({ scope: corpus.scope, view, query: c.query, limit: 15, records, aliasGroups: corpus.aliasGroups });
    rerankViews[view] = response.results.map(h => {
      const r = records.find(r => r.id === h.metadata.card_id);
      return { cardId: r.id, text: r.text, contentHash: r.contentHash, sourceEventId: r.sourceEventId };
    });
  }
  rerankInput.push({name:c.name, query:c.query, views:rerankViews});
  const row={name:c.name,type:c.type,query:c.query,bm25:{...grade(off.global,c),ms:off.trace.elapsedMs,hits:off.global},combined:{...grade(on.global,c),ms:on.trace.elapsedMs,hits:on.global},graphTrace:on.trace.graphiti,bm25CandidateIds:candidates.map(r=>r.id)};
  rows.push(row);await writeFile(prefix+'.partial.json',JSON.stringify(rows,null,2));
  console.log(JSON.stringify({case:c.name,bm25:row.bm25.complete,combined:row.combined.complete,coverage:[row.bm25.coverage,row.combined.coverage],ms:row.combined.ms}));
 }
 await writeFile(prefix+'.rerank-input.json',JSON.stringify(rerankInput));
 // Separate process: same installed local reranker, same top-15 BM25 inputs;
 // model loading is excluded from per-query timing. No Neo4j access here.
 const py = spawn(dataDir+'/graphiti/venv/bin/python',['-u','scripts/benchmark-rerank-cost.py',prefix+'.rerank-input.json',prefix+'.rerank-output.json'],{stdio:'inherit'});
 await new Promise((resolve,reject)=>{py.on('error',reject);py.on('exit',code=>code===0?resolve():reject(Error('rerank exit '+code)));});
 const {readFile}=await import('node:fs/promises');const ranked=JSON.parse(await readFile(prefix+'.rerank-output.json','utf8'));
 for(const[i,row]of rows.entries()) {
  let left=1500;
  const hits=ranked[i].views.global.flatMap(h=>{assert.ok(cards.find(r=>r.id===h.cardId)?.text.includes(h.excerpt));if(left<=0)return[];const text=h.excerpt.slice(0,left);left-=text.length;return[{id:h.cardId,text,sourceEventId:h.sourceEventId}];});
  row.rerankOnly={...grade(hits,cases[i]),ms:ranked[i].ms,hits};
 }
 const secret=await combined.recall({...input,action:'橘政宗的真实身份是不是赫尔佐格？'});
 for(const hits of Object.values(secret.characters)) assert.doesNotMatch(JSON.stringify(hits),/赫尔佐格|白王之血的容器/);
 const past=structuredClone(store);past.branches[past.currentBranchId].eventIds=past.branches[past.currentBranchId].eventIds.slice(0,2);past.branches[past.currentBranchId].headEventId=past.branches[past.currentBranchId].eventIds.at(-1);
 const historical=await combined.recall({...input,store:past,action:'车辆后来驶进地下车库了吗？'});
 assert.equal(historical.trace.graphiti.global.state,'snapshot_mismatch');assert.ok(historical.global.every(h=>h.ordinal<=1));
 const quantile=(xs,q)=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*q)-1];
 const summarize=rs=>Object.fromEntries(['bm25','rerankOnly','combined'].map(k=>[k,{complete:rs.filter(r=>r[k].complete).length,total:rs.length,meanCoverage:rs.reduce((n,r)=>n+r[k].coverage,0)/rs.length,mrr:rs.reduce((n,r)=>n+r[k].mrr,0)/rs.length,medianMs:quantile(rs.map(r=>r[k].ms),.5),p95Ms:quantile(rs.map(r=>r[k].ms),.95)}]));
 const summary=summarize(rows),byType=Object.fromEntries(['literal','paraphrase','multi'].map(t=>[t,summarize(rows.filter(r=>r.type===t))]));
 const latest=await new StoryStore(dataDir,storyPackage).load();
 const report={date:'2026-10-15',scope:corpus.scope,sourceHead:head,turns:store.branches[store.currentBranchId].eventIds.length-1,cards:corpus.records.length,globalCards:cards.length,questions:cases.length,summary,byType,checks:{allQueriesGraphReady:true,secretsIsolated:true,historicalCutoff:true,storyHeadUnchanged:latest.branches[latest.currentBranchId].headEventId===head},rows};
 await writeFile(prefix+'.json',JSON.stringify(report,null,2));
 console.log('SUMMARY',JSON.stringify(summary));
}finally{baseline.close();combined.close();}
