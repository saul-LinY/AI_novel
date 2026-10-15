import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStoryPackage, resolvePlayableRole } from '../src/story-package.js';
import { createInitialStore, serializeStore } from '../src/story-domain.js';
import { actionPayload, getContent, mapSave, paragraphs } from '../frontend/src/story/data.ts';
import { applyTurnEvent, newSession, readTurnStream } from '../frontend/src/story/api.ts';
const pkg = await loadStoryPackage(process.cwd(), 'dragon-raja');
function selected(id = 'erii') { const p = resolvePlayableRole(pkg, id); return serializeStore(createInitialStore(p), p); }

test('imports all four real roles, eighteen comics and eight NPC profiles', () => {
  const data = getContent(selected());
  assert.equal(data.roles.length, 4);
  assert.equal(data.comic.length, 18);
  assert.equal(data.cast.filter((p) => !p.playable).length, 8);
  assert.equal(data.story.title, '东京出走');
  assert.deepEqual(data.roles.map((r) => r.id), pkg.onboarding.characterProfiles.map((p) => p.id));
});
test('unselected state is not treated as an existing player save', () => {
  assert.equal(mapSave(serializeStore(createInitialStore(pkg), pkg)), null);
  for (const id of pkg.playableRoles.characterIds) assert.equal(mapSave(selected(id)).roleId, id);
});
test('adapts real choices, known facts, relationship strength and inventory exactly', () => {
  const raw = selected(); const s = mapSave(raw);
  assert.deepEqual(s.turns[0].choices, raw.events[0].choices);
  assert.deepEqual(s.world.people.map((p) => p.trust), raw.state.characters.map((p) => p.attitude));
  assert.deepEqual(s.world.clues.map((c) => c.id), raw.state.knownFacts.map((f) => f.id));
  assert.equal(s.world.relationships.length, raw.state.relationshipGraph.edges.length);
  assert.equal(s.world.items.length, raw.state.inventory.length);
});
test('serializer exposes only public historical location/time/scene, not stateAfter', () => {
  const s = selected(); const e = s.events[0];
  assert.equal(e.location.id, s.state.location.id);
  assert.deepEqual(e.scene, s.state.scene);
  assert.equal(e.time, s.state.time);
  assert.equal('stateAfter' in e, false);
  assert.equal('piEntryIds' in e, false);
  assert.equal('agentReports' in e, false);
});
test('trusted recommended choices use choiceId; free dialogue uses the existing action API', () => {
  assert.deepEqual(actionPayload({mode:'do',text:'UI label',choiceId:'ask'}, 'main'), {choiceId:'ask',branchId:'main'});
  assert.deepEqual(actionPayload({mode:'say',text:'一起走吧'}, 'main'), {action:'我说：「一起走吧」',branchId:'main'});
});
test('stream replays cannot duplicate prose or cross turn IDs', () => {
  const s = newSession({mode:'do',text:'检查'}, null);
  const e = (seq, type, data = {}) => ({turnId:'a', seq, type, ...data});
  applyTurnEvent(s,e(1,'start'));
  applyTurnEvent(s,e(2,'prepared'));
  applyTurnEvent(s,e(3,'prose_delta',{text:'正文第一句。'}));
  assert.equal(applyTurnEvent(s,e(3,'prose_delta',{text:'正文第一句。'})),false);
  assert.equal(applyTurnEvent(s,{...e(4,'prose_delta',{text:'错误故事'}),turnId:'b'}),false);
  applyTurnEvent(s,e(4,'prose_delta',{text:'正文第二句。'}));
  assert.equal(s.text,'正文第一句。正文第二句。');
  assert.equal(s.prepared,true);
});
test('recoverable failure retains locked text; completion uses server-authored ending', () => {
  const s = newSession({mode:'do',text:'检查'}, null);
  applyTurnEvent(s,{turnId:'a',seq:1,type:'prose_delta',text:'保留正文。'});
  applyTurnEvent(s,{turnId:'a',seq:2,type:'error',recoverable:true,message:'paused'});
  assert.equal(s.text,'保留正文。'); assert.equal(s.recoverable,true); assert.equal(s.terminal,false);
  const response = selected(); response.state.status='ended';
  response.state.ending={type:'deviation',coreQuestionResponse:'另一条路',keyChoice:'一起走',directConsequences:[],longTermConsequences:[],costs:[],resolvedQuestions:[],unresolvedQuestions:[]};
  applyTurnEvent(s,{turnId:'a',seq:3,type:'complete',story:response});
  assert.equal(s.terminal,true); assert.deepEqual(mapSave(s.complete).ending,response.state.ending);
});
test('action rejection is distinguished from technical failure and cannot resume a terminal turn', () => {
  const s = newSession({ mode: 'do', text: '指定 NPC 取出不存在的物品' }, null);
  applyTurnEvent(s, { turnId: 'a', seq: 1, type: 'error', recoverable: true, message: '断线' });
  applyTurnEvent(s, { turnId: 'a', seq: 2, type: 'rejected', message: '当前没有这件物品' });
  assert.equal(s.rejected, true);
  assert.equal(s.terminal, true);
  assert.equal(s.recoverable, false);
  assert.equal(s.text, '');
  assert.equal(s.complete, null);
  const failed = newSession({ mode: 'do', text: '正常行动' }, null);
  applyTurnEvent(failed, { turnId: 'b', seq: 1, type: 'failed', message: '模型服务异常' });
  assert.equal(failed.rejected, false);
});
test('NDJSON decoder handles split UTF-8 bytes and a final line without newline', async () => {
  const encoder = new TextEncoder();
  const bytes=encoder.encode(JSON.stringify({turnId:'a',seq:1,type:'prose_delta',text:'东京的雨。'})+'\n'+JSON.stringify({turnId:'a',seq:2,type:'prepared'}));
  const stream = new ReadableStream({start(controller) { for(let i=0;i<bytes.length;i+=2)controller.enqueue(bytes.slice(i,i+2));controller.close(); }});
  const seen=[]; await readTurnStream(new Response(stream),e=>seen.push(e));
  assert.equal(seen.length,2);assert.equal(seen[0].text,'东京的雨。');
});
test('short source paragraphs keep the established continuous-reading grouping', () => {
  assert.deepEqual(paragraphs('第一句。\n\n第二句。'), ['第一句。第二句。']);
  const long='一'.repeat(140); assert.deepEqual(paragraphs(long+'\n下一段。'),[long,'下一段。']);
});
test('live session tracks agent seals, beats and outcome without touching prose', () => {
  const s = newSession({ mode: 'do', text: '开门' }, null);
  const events = [
    { type: 'start', turnId: 't', seq: 1, action: '开门', createdAt: '2026-10-08T00:00:00.000Z' },
    { type: 'agent_progress', turnId: 't', seq: 2, role: 'environment', status: 'started' },
    { type: 'agent_progress', turnId: 't', seq: 3, role: 'environment', status: 'done' },
    { type: 'beat', turnId: 't', seq: 4, role: 'environment', text: '雨声密了。' },
    { type: 'beat', turnId: 't', seq: 5, role: 'environment', text: '风停了。' },
    { type: 'outcome', turnId: 't', seq: 6, outcomeType: 'success', label: '如愿以偿', ending: false },
    { type: 'phase', turnId: 't', seq: 7, phase: 'choosing' },
  ];
  for (const event of events) applyTurnEvent(s, event);
  assert.equal(s.agents.environment, 'done');
  assert.deepEqual(s.beats, [{ role: 'environment', text: '风停了。' }]);
  assert.equal(s.outcome.label, '如愿以偿');
  assert.equal(s.label, '命运岔路正在成形');
  assert.equal(s.startedAt, Date.parse('2026-10-08T00:00:00.000Z'));
  assert.equal(s.text, '');
});
test('story art and NPC portraits come from the public package', async () => {
  const { cnNumber } = await import('../frontend/src/story/data.ts');
  const data = getContent(selected());
  assert.match(data.story.cover.src, /covers\/dragon-raja-wide/);
  assert.equal(Object.keys(data.endingArt).length, 4);
  assert.ok(data.roles.every((role) => role.keyArt));
  assert.equal(Object.keys(data.portraits).length, 12);
  assert.deepEqual([1, 10, 11, 20, 23].map(cnNumber), ['一', '十', '十一', '二十', '二十三']);
});
test('a recommended choice can be spoken: payload keeps the trusted choiceId and adds mode', () => {
  assert.deepEqual(actionPayload({ mode: 'say', text: '我们换个地方吧', choiceId: 'move' }, 'main'), { choiceId: 'move', mode: 'say', branchId: 'main' });
  assert.deepEqual(actionPayload({ mode: 'do', text: '换地方', choiceId: 'move' }, 'main'), { choiceId: 'move', branchId: 'main' });
});
