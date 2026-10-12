import { updateBranchMemory } from '../../src/story-domain.js';

// Authored Chinese scenarios, not memories from the user's actual novel.
// Queries use paraphrases and causal questions rather than copying the answers.
const cases = [
  [1, 'su', '苏月小时候在春渡落水，是林舟把她救上岸。她此后一直害怕深水。', ['苏月为什么拒绝坐船渡河？', '是谁在苏月溺水时救了她？']],
  [2, 'lin', '林舟答应苏月，在落日前将银色项链送回钟楼。这件约定尚未兑现。', ['林舟要在什么时间归还首饰？', '谁还欠苏月一件银色的东西？']],
  [3, 'su', '苏月吃桂花后会起疹子。上次她吃了桂花糕，手臂红肿了整晚。', ['给苏月准备点心应该避开什么？', '苏月上次吃糕点后身体出了什么问题？']],
  [4, 'lin', '林舟把开启地窖的铜钥匙放进旧井旁的空酒坛。这件事只有他知道。', ['开启地下室的东西被林舟放在哪里？', '林舟在井边的容器里藏了什么？']],
  [5, 'environment', '通往东岸的木桥在暴雨中断裂，中间桥板全部落入河里。', ['为什么现在不能从木桥去东岸？', '暴雨破坏了哪一条过河通道？']],
  [6, 'su', '阿岚曾冒充药师骗走苏月的银币。苏月因这次欺骗不愿再借钱给他。', ['苏月为什么不肯再资助阿岚？', '谁用假身份骗走过苏月的钱？']],
  [7, 'lin', '林舟读过一份密信，信上约定三声长哨代表取消交易，两声短哨代表安全。', ['如何用声音通知林舟终止买卖？', '林舟知道哪种哨声表示没有危险？']],
  [8, 'su', '苏月一直以为红披风客人是父亲的朋友，因为那人拿着父亲的旧怀表。', ['苏月为何相信那个披着红衣的陌生人？', '什么物件让苏月把客人当成父亲的熟人？']],
  [9, 'environment', '药铺后门每晚亥时上锁，窗台下面留有一扇可以推开的低矮木窗。', ['药铺夜间锁门后还可能从哪进入？', '低矮的入口位于药铺什么位置？']],
  [10, 'lin', '林舟左肩被箭擦伤，伤口尚未愈合。他不能用左臂举起沉重的石板。', ['林舟为什么搬不动那块沉重石头？', '林舟哪一侧的手臂需要避免用力？']],
  [11, 'su', '苏月将母亲留下的蓝色丝巾交给阿岚保管，约好离城时取回。', ['离开这座城之前苏月要向阿岚拿回什么？', '谁保管着苏月母亲留下的遗物？']],
  [12, 'lin', '林舟在书页夹缝发现半张航线图，缺失的另一半据说由港口守卫保管。', ['林舟手里的地图还缺什么？', '为了补全航线，应该去找哪个人？']],
  [13, 'environment', '废弃磨坊的地下室积满沼气，进入时点火可能引发爆炸。', ['进入磨坊下面时为什么不能举火把？', '哪个地方有易燃气体聚集的危险？']],
  [14, 'su', '苏月曾在雪夜向失散的妹妹许诺，每年冬至都会到南门挂一盏红灯。', ['冬至那天苏月必须完成什么约定？', '苏月用什么方式向失散亲人传递消息？']],
  [15, 'lin', '林舟知道商会账本第三页被人替换，真正的金额记录刻在箱底的铜片上。', ['要核实商会真正的账目应该查看哪里？', '商会记录中哪一页存在伪造？']],
  [16, 'su', '苏月见过阿岚在清晨向穷孩子分发面包，因此开始怀疑他并非只会骗人。', ['苏月为什么对阿岚有了一点改观？', '苏月看见阿岚做过什么善事？']],
  [30, 'environment', '钟楼北墙的石缝在涨潮时渗入海水，那里通向地下排水沟。', ['寻找地下排水道可以从钟楼哪一侧入手？', '北墙的裂缝为什么在特定时段漏水？']],
  [31, 'lin', '林舟把假账本交给追兵，让他们误以为原件已经落入自己手中。真正的账本还在苏月手里。', ['追兵拿到的账簿是真的吗？', '林舟用什么办法让追赶者停止寻找原件？']],
  [32, 'su', '苏月从药师处得知，银叶草能暂时减轻林舟的箭伤疼痛，但无法解毒。', ['苏月知道什么草药能缓解林舟的疼痛？', '为什么使用银叶草后仍然需要寻找解毒药？']],
  [33, 'lin', '林舟害怕高处，却仍答应替苏月爬上屋顶修复风向标。', ['林舟为了修理屋顶的东西需要克服什么？', '林舟答应替苏月修好哪个装置？']],
  [77, 'su', '苏月刚刚从门卫口中得知，阿岚已经买好明晨驶往西岛的船票。', ['阿岚准备什么时候离开？', '苏月最新获知阿岚要去哪里？']],
  [78, 'environment', '集市入口刚刚开始实行宵禁，守卫只允许持红色通行证的人通过。', ['现在通过集市关卡需要出示什么？', '为什么普通行人此刻无法进入集市？']],
  [79, 'lin', '林舟刚在墙上发现苏月留下的白粉笔箭头，箭头指向一家关闭的茶馆。', ['林舟现在该循着标记往哪里走？', '苏月刚用什么方式为林舟留下方向？']],
  [80, 'su', '苏月刚收到妹妹的纸条：她在西门粮仓等待，暗号是两下轻敲再一下重敲。', ['苏月与妹妹见面时应该怎样敲门？', '妹妹最新约苏月在哪里碰面？']],
];

export function evaluationFixture() {
  const storyPackage = { id: 'memory-benchmark', packageHash: 'memory-benchmark-v1', playerCharacterId: 'su', world: { rules: [] }, locations: [{ id: 'town', name: '旧城', states: [] }], items: [], threads: [], stages: [], facts: [{ id: 'private-secret', kind: 'core', truth: '密室密码是紫鸢七三九', revealText: '密室密码是紫鸢七三九' }] };
  const state = { characters: { su: { id: 'su', name: '苏月', status: 'active', locationId: 'town', knowledgeFactIds: [] }, lin: { id: 'lin', name: '林舟', status: 'active', locationId: 'town', knowledgeFactIds: ['private-secret'] }, lan: { id: 'lan', name: '阿岚', status: 'active', locationId: 'town', knowledgeFactIds: [] } }, generatedFacts: {}, inventory: {}, threads: {}, storyProgress: { stages: [] }, locationId: 'town', timeMinutes: 0 };
  const opening = { id: 'opening', type: 'opening', prose: '三人分别来到旧城。', parentEventId: null, stateAfter: structuredClone(state) };
  const branch = { eventIds: ['opening'], headEventId: 'opening', memory: '尚未开始正式互动。', characterMemories: {}, environmentMemory: '' };
  const store = { story: { createdAt: '2026-09-28T00:00:00Z' }, currentBranchId: 'main', branches: { main: branch }, events: { opening } };
  const queries = [];
  for (let n = 1; n <= 80; n++) {
    const special = cases.find((item) => item[0] === n);
    const view = special?.[1] ?? (n % 3 === 0 ? 'environment' : n % 2 === 0 ? 'lin' : 'su');
    const text = special?.[2] ?? ('第' + n + '次巡查，街角摊贩仍在整理普通杂货，路人谈论今天的天气。众人沿着熟悉的街道慢慢行走，确认没有新的阻碍，然后继续等待后续消息。');
    const id = 'event-' + String(n).padStart(3, '0');
    const turnResult = { outcome: { summary: text }, memoryNotes: [text], characterMemoryNotes: view === 'environment' ? [] : [{ characterId: view, note: text }], environmentMemoryNotes: view === 'environment' ? [text] : [], delta: {} };
    const nextState = structuredClone(state); nextState.timeMinutes = n * 5;
    const event = { id, type: 'turn', branchId: 'main', parentEventId: branch.headEventId, action: '继续调查旧城', prose: text, stateAfter: nextState, turnResult };
    store.events[id] = event; branch.eventIds.push(id); branch.headEventId = id;
    updateBranchMemory(branch, event);
    if (special) for (const query of special[3]) queries.push({ query, view: view === 'environment' ? view : 'character:' + view, expectedEventId: id, evidence: text, horizon: n <= 33 ? 'long' : 'recent' });
  }
  return { store, storyPackage, queries };
}

export function baselineContext(store, view) {
  const branch = store.branches[store.currentBranchId];
  const recent = branch.eventIds.slice(-4).map((id) => store.events[id].prose).join('\n');
  const memory = view === 'environment' ? branch.environmentMemory : view === 'global' ? branch.memory : branch.characterMemories[view.slice(10)] ?? '';
  return [memory, recent].join('\n');
}
