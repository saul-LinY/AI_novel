import assert from "node:assert/strict";
import test from "node:test";
import { buildMemoryCorpus } from "../src/memory/cards.js";
import { PiStoryRuntime } from "../src/pi-story-runtime.js";
import { buildSharedContext } from "../src/story-context.js";
import { appendTurn, createInitialStore } from "../src/story-domain.js";
import { applyTurnProposal, createInitialState } from "../src/story-engine.js";
import {
  applyTurnRecord,
  buildBeatSheet,
  directiveText,
  fallbackRecord,
  narrativeDigest,
  pacingDirective,
  validateNarrativeProposal,
  validateTurnRecord,
} from "../src/story-narrative.js";
import { DRAMATURGY, dramaticProposal, packageById, projectRoot } from "./helpers.js";

const storyPackage = await packageById();
const player = storyPackage.playerCharacterId;

function beat(beatType, tension, overrides = {}) {
  return dramaticProposal({ dramaturgy: { ...DRAMATURGY, beat: beatType, tension }, ...overrides });
}

// Advances a state through committed turns, the same way the store does.
function play(state, proposals) {
  let current = state;
  proposals.forEach((proposal, index) => { current = applyTurnProposal(current, proposal, storyPackage, `event-${index + 1}`); });
  return current;
}

test("初始状态带上叙事账本：玩家已知的伏笔种子直接埋下，其余保持休眠", () => {
  const state = createInitialState(storyPackage);
  const seeds = state.narrative.seeds;
  assert.equal(state.narrative.turn, 0);
  assert.equal(seeds["wish-seed"].status, "planted");
  assert.deepEqual(seeds["wish-seed"].pendingFactIds, ["family-search"]);
  assert.equal(seeds["serum-seed"].status, "dormant");
  assert.deepEqual(state.narrative.ledger, []);
});

test("节奏闸门：连续同一节拍、持平张力与无价值翻转都会被退回", () => {
  const state = play(createInitialState(storyPackage), [beat("complication", 5), beat("complication", 6)]);
  const directive = pacingDirective(state, storyPackage);
  assert.deepEqual(directive.hard.avoidBeats, ["complication"]);
  assert.match(directiveText(directive), /不要再用节拍「施压」/);

  const repeated = validateNarrativeProposal({ proposal: beat("complication", 7), state, storyPackage });
  assert.match(repeated.errors.join(), /节拍「施压」已连续两回合使用/);
  const flat = validateNarrativeProposal({ proposal: beat("reversal", 6), state: play(createInitialState(storyPackage), [beat("setup", 6), beat("complication", 6)]), storyPackage });
  assert.match(flat.errors.join(), /张力已连续两回合为 6/);
  const noShift = validateNarrativeProposal({ proposal: dramaticProposal({ dramaturgy: { ...DRAMATURGY, beat: "reversal", valueShift: { axis: "信任", from: "怀疑", to: "怀疑" } } }), state, storyPackage });
  assert.match(noShift.errors.join(), /必须让「信任」发生翻转/);
  assert.deepEqual(validateNarrativeProposal({ proposal: beat("reversal", 8), state, storyPackage }).errors, []);
  assert.match(validateNarrativeProposal({ proposal: dramaticProposal({ dramaturgy: undefined }), state, storyPackage }).errors[0], /缺少 dramaturgy/);
});

test("连续三回合低张力后必须升级，高潮节拍张力至少为 7", () => {
  const state = play(createInitialState(storyPackage), [beat("setup", 3), beat("release", 2), beat("aftermath", 4)]);
  assert.equal(pacingDirective(state, storyPackage).hard.mustEscalate, true);
  assert.match(validateNarrativeProposal({ proposal: beat("setup", 6), state, storyPackage }).errors.join(), /连续三回合低张力/);
  assert.match(validateNarrativeProposal({ proposal: beat("complication", 4), state, storyPackage }).errors.join(), /张力高于 4/);
  assert.deepEqual(validateNarrativeProposal({ proposal: beat("revelation", 6), state, storyPackage }).errors, []);
  assert.match(validateNarrativeProposal({ proposal: beat("climax", 5), state: createInitialState(storyPackage), storyPackage }).errors.join(), /高潮时张力至少为 7/);
});

test("伏笔生命周期：埋下 → 正文露面 → 强化 → 窗口内回收，未知伏笔不能回收", () => {
  const plant = { localId: "lighter", surfaceDetail: "凯撒的打火机外壳刻着一串陌生编号", hiddenMeaning: "编号对应撤离直升机的识别码", payoffIdea: "会合时直升机机身出现同一编号", payoffWindow: { min: 1, max: 3 } };
  let state = applyTurnProposal(createInitialState(storyPackage), beat("setup", 3, { foreshadowing: { plant: [plant] } }), storyPackage, "event-1");
  const seed = state.narrative.seeds["fs-1-lighter"];
  assert.equal(seed.status, "planted");
  assert.equal(seed.plantedTurn, 1);

  // The recorder confirms the plant appeared in the published prose.
  const prose = "凯撒点烟时，你看见打火机外壳刻着一串陌生编号。";
  validateTurnRecord({ entries: [{ kind: "detail", text: "凯撒的打火机刻着编号", quote: "打火机外壳刻着一串陌生编号", characterIds: ["caesar"], knownByIds: [], importance: 2 }], foreshadowCheck: [{ seedId: seed.id, appeared: true, quote: "打火机外壳刻着一串陌生编号" }] }, { prose, stateAfter: state, proposal: beat("setup", 3) });
  applyTurnRecord(state, { entries: [], foreshadowCheck: [{ seedId: seed.id, appeared: true, quote: "打火机外壳刻着一串陌生编号" }] }, { eventId: "event-1", playerCharacterId: player });
  assert.equal(state.narrative.seeds[seed.id].surfaced, true);

  state = applyTurnProposal(state, beat("complication", 5, { foreshadowing: { reinforce: [{ seedId: seed.id, detail: "编号在凯撒的通讯器屏幕上闪了一下" }] } }), storyPackage, "event-2");
  assert.equal(state.narrative.seeds[seed.id].reinforcements.length, 1);

  const sheet = buildBeatSheet(beat("reversal", 7, { foreshadowing: { payoff: [{ seedId: seed.id, howItPaysOff: "直升机侧门上喷着同一串编号" }] } }), state, storyPackage);
  assert.equal(sheet.payoff[0].earlier, "打火机外壳刻着一串陌生编号");
  assert.doesNotMatch(JSON.stringify(sheet), /识别码/, "正文简报不得泄露伏笔的真实含义");

  state = applyTurnProposal(state, beat("reversal", 7, { foreshadowing: { payoff: [{ seedId: seed.id, howItPaysOff: "直升机侧门上喷着同一串编号" }] } }), storyPackage, "event-3");
  assert.equal(state.narrative.seeds[seed.id].status, "paid_off");
  assert.throws(() => applyTurnProposal(state, beat("release", 3, { foreshadowing: { payoff: [{ seedId: seed.id, howItPaysOff: "再回收一次" }] } }), storyPackage, "event-4"), /不是已埋下状态/);
  assert.throws(() => applyTurnProposal(state, beat("release", 3, { foreshadowing: { payoff: [{ seedId: "fs-9-ghost", howItPaysOff: "凭空回收" }] } }), storyPackage, "event-4"), /不存在的伏笔/);
});

test("没有在正文露面的伏笔不能直接回收，严重逾期的伏笔必须处理", () => {
  const plant = { localId: "key", surfaceDetail: "门牌下压着一把旧钥匙", hiddenMeaning: "钥匙能打开源氏重工的旧档案室", payoffIdea: "调查时用它开门", payoffWindow: { min: 1, max: 2 } };
  const state = applyTurnProposal(createInitialState(storyPackage), beat("setup", 3, { foreshadowing: { plant: [plant] } }), storyPackage, "event-1");
  applyTurnRecord(state, { entries: [], foreshadowCheck: [{ seedId: "fs-1-key", appeared: false }] }, { eventId: "event-1", playerCharacterId: player });
  assert.equal(state.narrative.seeds["fs-1-key"].surfaced, false);
  const payoff = beat("revelation", 6, { foreshadowing: { payoff: [{ seedId: "fs-1-key", howItPaysOff: "钥匙打开了档案室" }] } });
  assert.match(validateNarrativeProposal({ proposal: payoff, state, storyPackage }).errors.join(), /还没有在正文露面/);
  assert.match(directiveText(pacingDirective(state, storyPackage)), /埋下后没有在正文露面/);

  const late = play(state, [beat("complication", 5), beat("reversal", 7), beat("release", 4), beat("complication", 6)]);
  const directive = pacingDirective(late, storyPackage);
  assert.deepEqual(directive.hard.mustAddressSeedIds, ["fs-1-key"]);
  assert.match(validateNarrativeProposal({ proposal: beat("revelation", 8), state: late, storyPackage }).errors.join(), /严重逾期/);
  assert.deepEqual(validateNarrativeProposal({ proposal: beat("revelation", 8, { foreshadowing: { retire: [{ seedId: "fs-1-key", reason: "档案室已在上一回合被烧毁" }] } }), state: late, storyPackage }).errors, []);
});

test("主线伏笔只有在玩家得知它指向的事实时才算回收", () => {
  const state = createInitialState(storyPackage);
  assert.throws(() => applyTurnProposal(state, beat("revelation", 6, { foreshadowing: { payoff: [{ seedId: "wish-seed", howItPaysOff: "清单背后是家族的寻找" }] } }), storyPackage, "event-1"), /必须让玩家角色得知它指向的事实/);
  const learned = applyTurnProposal(state, beat("revelation", 6, { delta: { timeAdvanceMinutes: 5, learnFactIdsByCharacter: [{ characterId: player, factIds: ["family-search"] }] } }), storyPackage, "event-1");
  assert.equal(learned.narrative.seeds["wish-seed"].status, "paid_off");
  assert.equal(learned.narrative.seeds["signal-seed"].status, "dormant");
});

test("结局回合必须收束所有仍在场的伏笔", () => {
  const plant = { localId: "scar", surfaceDetail: "源稚生手背上有一道新疤", hiddenMeaning: "他昨夜独自追查过红井", payoffIdea: "结局前揭开", payoffWindow: { min: 1, max: 4 } };
  const state = applyTurnProposal(createInitialState(storyPackage), beat("setup", 3, { foreshadowing: { plant: [plant] } }), storyPackage, "event-1");
  const result = validateNarrativeProposal({ proposal: beat("climax", 9, { ending: {} }), state, storyPackage });
  assert.match(result.errors.join(), /结局回合必须回收或放弃所有仍在场的伏笔：fs-1-scar/);
});

test("连续性记录：引文必须逐字出自正文，人物与事项引用必须存在", () => {
  const stateAfter = applyTurnProposal(createInitialState(storyPackage), dramaticProposal(), storyPackage, "preview");
  const prose = "绘梨衣在本子上写：「明天还能去看海吗？」你说：“我答应你。”";
  const ok = { entries: [{ kind: "promise", text: "玩家答应明天带绘梨衣去看海", quote: "我答应你", characterIds: ["erii"], knownByIds: ["erii"], importance: 3 }], openLoops: [{ kind: "promise", text: "明天带绘梨衣去看海", ownerIds: [player], quote: "我答应你" }] };
  assert.doesNotThrow(() => validateTurnRecord(ok, { prose, stateAfter, proposal: dramaticProposal() }));
  assert.throws(() => validateTurnRecord({ entries: [{ ...ok.entries[0], quote: "我一定会带你去" }] }, { prose, stateAfter, proposal: dramaticProposal() }), /quote 不在正文中/);
  assert.throws(() => validateTurnRecord({ entries: [{ ...ok.entries[0], characterIds: ["nobody"] }] }, { prose, stateAfter, proposal: dramaticProposal() }), /不存在的人物：nobody/);
  assert.throws(() => validateTurnRecord({ ...ok, closeLoops: [{ loopId: "Q9-9", resolution: "x", quote: "我答应你" }] }, { prose, stateAfter, proposal: dramaticProposal() }), /不存在或已关闭/);
});

test("确定性兜底记录只摘录原文对白，不臆造伏笔已出现", () => {
  const plant = { localId: "bell", surfaceDetail: "走廊尽头挂着一只不会响的风铃", hiddenMeaning: "风铃里藏着追踪器", payoffIdea: "风铃突然响起", payoffWindow: { min: 1, max: 3 } };
  const proposal = beat("setup", 3, { foreshadowing: { plant: [plant] } });
  const stateAfter = applyTurnProposal(createInitialState(storyPackage), proposal, storyPackage, "preview");
  const record = fallbackRecord({ prose: "凯撒说：「先别动。」雨还在下。", proposal, stateAfter });
  assert.equal(record.source, "deterministic");
  assert.deepEqual(record.entries.map((entry) => entry.quote), ["先别动。"]);
  assert.deepEqual(record.foreshadowCheck, [{ seedId: "fs-1-bell", appeared: false }]);
  const seen = fallbackRecord({ prose: "走廊尽头挂着一只风铃，不会响。", proposal, stateAfter });
  assert.equal(seen.foreshadowCheck[0].appeared, true);
});

test("回合提交原子写入账本，人物只拿到自己亲历的条目，记忆卡按视角隔离", () => {
  const store = createInitialStore(storyPackage);
  const prose = "绘梨衣在本子上写：「明天还能去看海吗？」你说：“我答应你。”门外传来源稚生的脚步声。";
  const record = {
    source: "agent",
    entries: [
      { kind: "promise", text: "玩家答应明天带绘梨衣去看海", quote: "我答应你", characterIds: ["erii"], knownByIds: ["erii"], importance: 3 },
      { kind: "event", text: "源稚生来到门外", quote: "门外传来源稚生的脚步声", characterIds: ["gen-chisei"], knownByIds: [], importance: 2 },
    ],
    openLoops: [{ kind: "promise", text: "明天带绘梨衣去看海", ownerIds: [player], quote: "我答应你" }],
  };
  const event = appendTurn(store, { branchId: "main", eventId: "turn-1", action: "答应她", prose, proposal: dramaticProposal(), record, storyPackage });
  const narrative = event.stateAfter.narrative;
  assert.equal(narrative.turn, 1);
  assert.deepEqual(narrative.ledger.map((entry) => entry.id), ["L1-0", "L1-1", "L1-2"]);
  assert.deepEqual(narrative.ledger[1].knownByIds, [player, "erii"]);
  assert.equal(narrative.openLoops[0].id, "Q1-1");
  assert.equal(event.continuityRecord.source, "agent");

  const digest = narrativeDigest(event.stateAfter, storyPackage, { action: "去看海", characterIds: [player, "erii", "gen-chisei"] });
  assert.deepEqual(digest.ledgerByCharacter.erii.map((entry) => entry.id), ["L1-1"]);
  assert.deepEqual(digest.ledgerByCharacter["gen-chisei"], []);
  assert.equal(digest.openLoops[0].text, "明天带绘梨衣去看海");

  const corpus = buildMemoryCorpus({ store, storyPackage, instanceId: "test" });
  const ledgerCards = corpus.records.filter((card) => card.kind === "ledger");
  assert.ok(ledgerCards.some((card) => card.view === "character:erii" && card.text.includes("「我答应你」")));
  assert.equal(ledgerCards.some((card) => card.view === "character:gen-chisei"), false);
  assert.ok(corpus.records.some((card) => card.kind === "open-loop"));

  // A later record can close the promise; the next directive stops nagging about it.
  const second = appendTurn(store, { branchId: "main", eventId: "turn-2", action: "出发", prose: "你们在海边坐到天黑。", proposal: dramaticProposal({ dramaturgy: { ...DRAMATURGY, beat: "release", tension: 3 } }), record: { entries: [{ kind: "event", text: "两人在海边坐到天黑", quote: "在海边坐到天黑", characterIds: ["erii"], knownByIds: ["erii"], importance: 2 }], closeLoops: [{ loopId: "Q1-1", resolution: "玩家兑现了看海的承诺", quote: "在海边坐到天黑" }] }, storyPackage });
  assert.equal(second.stateAfter.narrative.openLoops[0].status, "closed");
});

test("共享信息层附带叙事摘要，主创与情节提示词收到节奏指令，正文收到写作简报", async () => {
  const state = play(createInitialState(storyPackage), [beat("complication", 5), beat("complication", 6)]);
  const shared = buildSharedContext({ action: "检查治疗记录", state, storyPackage });
  assert.equal(shared.narrative.turn, 2);
  assert.deepEqual(shared.narrative.directive.hard.avoidBeats, ["complication"]);

  const runtime = new PiStoryRuntime({ projectRoot, dataDir: "/tmp", storyPackage });
  runtime.pipeline = { ...runtime.pipeline, recorder: "off" };
  const prompts = {};
  let narration = "";
  for (const role of ["main", "plot", "character", "environment"]) {
    let listener = null;
    runtime.sessions.set(role, {
      agent: { state: { messages: [] } }, sessionManager: { getLeafId: () => null, resetLeaf() {}, buildSessionContext: () => ({ messages: [] }) },
      navigateTree: async () => {}, subscribe: (next) => { listener = next; return () => { listener = null; }; },
      prompt: async (prompt) => { narration = prompt; listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "你翻开记录，门外脚步声停了。" } }); },
      abort: async () => {}, dispose() {},
    });
  }
  const accepted = beat("reversal", 8, { dramaturgy: { ...DRAMATURGY, beat: "reversal", tension: 8, hook: "记录最后一页被人撕掉了。" } });
  runtime.requestStructured = async (role, prompt) => {
    prompts[role] = prompt;
    if (role === "plot") return { currentNodeId: "see-countdown" };
    if (role === "character") return { involvedCharacterIds: [player] };
    if (role === "environment") return { locationId: "theme-hotel", sceneStateId: "default" };
    return accepted;
  };
  const result = await runtime.generateTurn({ action: "检查治疗记录", state, recentEvents: [], piEntryIds: {}, branchMemory: "", characterMemories: {}, environmentMemory: "" });
  for (const role of ["plot", "main"]) {
    assert.match(prompts[role], /<pacing_directive>/);
    assert.match(prompts[role], /不要再用节拍「施压」/);
    assert.match(prompts[role], /<narrative_state>/);
  }
  assert.match(narration, /<beat_sheet>/);
  assert.match(narration, /本回合节拍：反转，结尾张力 8\/10/);
  assert.match(narration, /记录最后一页被人撕掉了/);
  assert.doesNotMatch(narration, /"dramaturgy"/);
  assert.equal(result.beatSheet.beat.type, "reversal");
});

test("主创提案的节奏问题最多退回一次，仍未修正则记为放行警告而不是卡死回合", () => {
  const state = play(createInitialState(storyPackage), [beat("complication", 5), beat("complication", 6)]);
  const runtime = new PiStoryRuntime({ projectRoot, dataDir: "/tmp", storyPackage });
  runtime.activeState = state;
  runtime.activeRecentEvents = [];
  runtime.narrativeBounces = 0;
  runtime.pipeline = { ...runtime.pipeline, choices: "parallel" };
  const stale = beat("complication", 7, { choices: [], closingBeat: "门外有人敲门。" });
  assert.throws(() => runtime.validateMainProposal(stale), (error) => error.advisory === true && /节拍「施压」已连续两回合使用/.test(error.message));
  assert.doesNotThrow(() => runtime.validateMainProposal(stale));
  assert.deepEqual(runtime.activeGate.checks.map((check) => [check.id, check.passed]), [["world", true], ["pacing", false], ["foreshadow", true], ["continuity", true]]);
  assert.equal(runtime.activeGate.bounces, 1);
  assert.match(runtime.activeGate.waived[0], /施压/);

  runtime.narrativeBounces = 0;
  runtime.pipeline = { ...runtime.pipeline, narrative: "advise" };
  assert.doesNotThrow(() => runtime.validateMainProposal(stale));
  assert.equal(runtime.activeGate.bounces, 0);
});

test("节拍写成中文或张力越界时直接规范化，不消耗结构化重试", async () => {
  const { prepareMainArguments, preparePlotArguments } = await import("../src/pi-story-runtime.js");
  const main = prepareMainArguments(dramaticProposal({ dramaturgy: { ...DRAMATURGY, beat: "反转", tension: 12 } }));
  assert.equal(main.dramaturgy.beat, "reversal");
  assert.equal(main.dramaturgy.tension, 10);
  const plot = preparePlotArguments({ currentNodeId: "see-countdown", pacing: { beat: "铺垫", tension: "0", twistIdeas: [], foreshadow: [] } });
  assert.deepEqual([plot.pacing.beat, plot.pacing.tension], ["setup", 1]);
  assert.equal(preparePlotArguments({ currentNodeId: "x" }).pacing, undefined);
});

test("旧存档没有叙事账本时，首个回合会从当前状态补建", () => {
  const legacy = createInitialState(storyPackage);
  delete legacy.narrative;
  const next = applyTurnProposal(legacy, dramaticProposal(), storyPackage, "event-1");
  assert.equal(next.narrative.turn, 1);
  assert.equal(next.narrative.seeds["wish-seed"].status, "planted");
  assert.equal(pacingDirective(legacy, storyPackage).turn, 1);
});
