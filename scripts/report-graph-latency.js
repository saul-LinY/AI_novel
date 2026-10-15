import { readFile, writeFile } from 'node:fs/promises';
const prefix='docs/evaluations/graph-latency-2026-10-15';
const report=JSON.parse(await readFile(prefix+'.json','utf8'));
const db=JSON.parse(await readFile(prefix+'.neo4j.json','utf8'));
const single=JSON.parse(await readFile(prefix+'.single-first.json','utf8'));
const xs=single.rows.map(r=>r.ms).sort((a,b)=>a-b);
const sf={count:xs.length,medianMs:xs[9],p95Ms:xs[18],maxMs:xs[19]};
const names={fourViewsFirst:'真实回合四视角：首次问题',fourViewsRepeat:'真实回合四视角：重复问题',singleGlobalWarm:'单全局视角：重复问题、带 BM25 候选',bm25:'仅 BM25：四视角'};
const table=Object.entries(report.summary).map(([k,v])=>`| ${names[k]} | ${v.count} | ${v.medianMs.toFixed(2)} ms | ${v.p95Ms.toFixed(2)} ms | ${v.maxMs.toFixed(2)} ms | ${v.ready}/${v.count} |`).join('\n');
const doc=`# 图数据库检索速率实测

2026-10-15（北京时间）。当前 ${report.turns} 轮故事、${report.cards} 张记忆卡片，全局 ${report.globalCards} 张。冻结事件：${report.head}。精排关闭；图请求与同步等待预算均为 10 秒；模型和服务已加载，正常缓存保留，不重启或清空用户数据。

## 已就绪图的查询速度

| 场景 | 样本 | 中位数 | P95 | 最慢 | 成功 |
| --- | --- | --- | --- | --- | --- |
| Neo4j HTTP 一跳关系读取 | 20 | ${db.medianMs.toFixed(2)} ms | ${db.p95Ms.toFixed(2)} ms | ${db.maxMs.toFixed(2)} ms | 20/20 |
| 单全局视角：20 条不同问题，无外部 BM25 候选 | 20 | ${sf.medianMs.toFixed(2)} ms | ${sf.p95Ms.toFixed(2)} ms | ${sf.maxMs.toFixed(2)} ms | ${single.rows.filter(r=>r.state==='ready').length}/20 |
${table}

四视角为全局、环境、路明非、绘梨衣。四视角耗时包括本地 BM25、Graphiti HTTP 请求、embedding、图候选检索、来源核验、名次融合及字符预算处理，按实际并发调用流程计墙钟时间。每题最多 5 条/视角、合计 6000 字符。先完成 20 个不同问题的四视角查询，再原序重复；随后测单视角和 BM25。独立单视角不同问题测试在准备等待期间完成，未复用这 20 个问题。

服务早已加载，不把“首次问题”写成“冷启动”。重复问题明显受缓存影响，不能用重复查询结果代替新问题体验。Neo4j 原始读取仅用于区分存储查询与完整语义检索开销，不与完整检索等价。这里没有多用户压测，顺序吞吐量也不是服务器容量承诺。

## 图同步尚未完成时

${report.live ? `实测完整回合检索用了 **${(report.live.ms/1000).toFixed(3)} 秒**。各视角：\n\n`+Object.entries(report.live.graph).map(([view,s])=>`- ${view}：${s.state}，${s.elapsedMs} ms，图命中 ${s.matched} 条。`).join('\n') : '此次开始测试时图已全部就绪。'}

之后为取得公平的已就绪速度样本，评测准备阶段另外等了 ${(report.indexPreparationMs/1000).toFixed(1)} 秒。这个等待只发生在测试准备，不修改线上 10 秒预算，也不计入纯检索耗时。

后台日志显示本轮全局入图耗时约 370.4 秒、环境入图约 111.9 秒；这是来源抽取、关系维护与状态投影等写入阶段，并不是 Neo4j 的读查询耗时。实际正在游玩时，“图是否已经追上最新回合”比已就绪查询的毫秒级差异更影响体验。等待不代表整轮所有视角都不用图：本次同步等待样本中全局已返回图证据，其他未就绪视角使用本地结果。

## 边界与验证

所有稳定图样本必须返回 ready，否则脚本终止而不把 BM25 降级计为图检索成功。10 秒边界附近的十几毫秒额外开销包括本地处理和事件调度，并非额外一分钟等待。对照核验故事头${report.storyHeadUnchanged?'未改变':'发生变化'}；本测试不生成剧情、不写入图、不改变线上配置。样本较小、存档仅 ${report.turns} 轮，不能外推长篇数据或并发负载下的 P95。

[完整结果](graph-latency-2026-10-15.json) · [独立全局查询](graph-latency-2026-10-15.single-first.json) · [Neo4j 原始读取](graph-latency-2026-10-15.neo4j.json)。复现脚本：scripts/benchmark-graph-latency.js。
`;
await writeFile(prefix+'.md',doc);
console.log(JSON.stringify({summary:report.summary,singleFirst:sf,liveWaitMs:report.live?.ms,indexPreparationMs:report.indexPreparationMs},null,2));
