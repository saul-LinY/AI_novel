// Read-only latency benchmark; preserves production deadlines and never enqueues.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadStoryPackage, resolvePlayableRole } from '../src/story-package.js';
import { StoryStore } from '../src/story-store.js';
import { createStoryMemory } from '../src/memory/story-memory.js';
import { buildGraphSnapshot } from '../src/memory/graphiti-projection.js';

const dataDir=resolve('.ai-novel'), prefix=resolve('docs/evaluations/graph-latency-2026-10-15');
await mkdir(resolve('docs/evaluations'),{recursive:true});
let storyPackage=await loadStoryPackage(process.cwd(),'dragon-raja');
const store=await new StoryStore(dataDir,storyPackage).load();
if(store.story.selectedPlayerCharacterId)storyPackage=resolvePlayableRole(storyPackage,store.story.selectedPlayerCharacterId);
const input={store,storyPackage,characterIds:['lu-mingfei','erii']};
const memory=await createStoryMemory({dataDir}), baseline=await createStoryMemory({dataDir,graph:null});
const corpus=memory.corpus(input),snapshot=buildGraphSnapshot(corpus,input),head=store.branches[store.currentBranchId].headEventId;
const views=['global','environment','character:lu-mingfei','character:erii'];
const questions=[
'现在我们有哪些能核查药源的证据，哪些还只是猜测？',
'凯撒答应的外部调查有没有确定回音？',
'她过去取药时，车辆、电梯和送药人怎样衔接？',
'记录药品编号时用的是什么工具？',
'联系学院的人之前，药盒被挪到了哪里？',
'最初的安全点允许我们等到几点？',
'卡塞尔为什么能安排撤离，却接不上她的用药？',
'手机的再次开机给藏身地点带来什么风险？',
'街对面那辆车最初为什么令人警觉？',
'那辆车后来绕行的方向有什么意义？',
'本子最后一行的留白表达了什么未解决的问题？',
'握笔时出现的细微异常与药效有什么关系？',
'源稚生组织搜索的直接动机是什么？',
'凯撒对学院保护命令的解释有过什么停顿？',
'药品包装为什么难以看清批次号？',
'她能不能提供送药人的真实姓名？',
'学院供应清单核对出了什么结果？',
'等待药物线索回拨还需要承担什么代价？',
'有哪些承诺还没兑现，哪些只是接下来的打算？',
'如果继续留在旅馆，现在最紧迫的两个问题是什么？',
];
const rows=[],statusLog=[];let live=null;
const percentile=(xs,p)=>xs.toSorted((a,b)=>a-b)[Math.ceil(xs.length*p)-1];
const stats=rs=>{const xs=rs.map(x=>x.ms);return{count:xs.length,minMs:Math.min(...xs),medianMs:percentile(xs,.5),p95Ms:percentile(xs,.95),maxMs:Math.max(...xs),meanMs:xs.reduce((a,b)=>a+b,0)/xs.length,sequentialQueriesPerSecond:1000*xs.length/xs.reduce((a,b)=>a+b,0),ready:rs.filter(x=>x.ready).length,overBudget:rs.filter(x=>x.ms>10000).length};};
async function status(){const result=await memory.graph.request('/status?'+new URLSearchParams({scope:corpus.scope}));return views.map(view=>{const s=result.streams.find(x=>x.view===view),expected=snapshot.streams.find(x=>x.view===view);if(s?.fingerprint!==expected.fingerprint)throw Error('Frozen snapshot no longer matches live graph: '+view);return{view,status:s.status,indexed:s.indexed,total:s.total};});}
async function recall(query, mode){const t=performance.now();const r=await(mode==='bm25'?baseline:memory).recall({...input,action:query});const row={mode,query,ms:+(performance.now()-t).toFixed(2),ready:mode==='bm25'||Object.values(r.trace.graphiti).every(x=>x.state==='ready'),graph:r.trace.graphiti??null,hits:r.trace.counts};rows.push(row);return row;}
try{
 const initial=await status();console.log('INITIAL',JSON.stringify(initial));
 if(initial.some(s=>s.status!=='ready')){live=await recall('回想刚刚的经历：药品、电话和楼下车辆有哪些新线索？','indexing');console.log('LIVE_WAIT',JSON.stringify(live));}
 const started=Date.now();let previous='';
 while(true){const current=await status();const label=JSON.stringify(current);if(label!==previous||Date.now()-(statusLog.at(-1)?.at??0)>30000){statusLog.push({at:Date.now(),views:current});console.log('INDEX_WAIT',Math.round((Date.now()-started)/1000),label);previous=label;}if(current.every(s=>s.status==='ready'))break;if(Date.now()-started>15*60000)throw Error('Index did not catch up within benchmark preparation window');await delay(5000);}
 const indexPreparationMs=Date.now()-started;
 // First all-view pass precedes warm repetition and single-view calls. Normal
 // model/embedding caches stay enabled; this is not a service cold-start test.
 for(const mode of['fourViewsFirst','fourViewsRepeat'])for(const query of questions){const row=await recall(query,mode);assert.ok(row.ready,'Do not count fallback as successful graph retrieval');console.log(mode,rows.filter(x=>x.mode===mode).length,row.ms);}
 const global=snapshot.streams.find(s=>s.view==='global');
 for(const query of questions){const allowed=corpus.records.filter(r=>r.view==='global');const bm=await baseline.backend.search({scope:corpus.scope,view:'global',query,records:allowed,aliasGroups:corpus.aliasGroups,limit:15});const t=performance.now();const r=await memory.graph.recall(global,allowed,query,bm.results.map(x=>x.metadata.card_id));const row={mode:'singleGlobalWarm',query,ms:+(performance.now()-t).toFixed(2),ready:r.state==='ready',state:r.state,ranking:r.ranking,hits:r.hits.length};assert.ok(row.ready);rows.push(row);}
 for(const query of questions)await recall(query,'bm25');
 const latest=await new StoryStore(dataDir,storyPackage).load();
 const report={date:'2026-10-15',head,turns:store.branches[store.currentBranchId].eventIds.length-1,cards:corpus.records.length,globalCards:corpus.records.filter(r=>r.view==='global').length,scope:corpus.scope,config:memory.graph.config,health:await memory.graph.request('/health'),initial,live,indexPreparationMs,statusLog,summary:Object.fromEntries(['fourViewsFirst','fourViewsRepeat','singleGlobalWarm','bm25'].map(mode=>[mode,stats(rows.filter(r=>r.mode===mode))])),storyHeadUnchanged:latest.branches[latest.currentBranchId].headEventId===head,rows};
 await writeFile(prefix+'.json',JSON.stringify(report,null,2));console.log('SUMMARY',JSON.stringify(report.summary));
}catch(error){await writeFile(prefix+'.partial.json',JSON.stringify({error:error.message,head,rows,statusLog},null,2));throw error;}finally{memory.close();baseline.close();}
