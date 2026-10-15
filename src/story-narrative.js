import { Type } from "typebox";
import Schema from "typebox/schema";
import { terms } from "./memory/cards.js";

// The narrative layer keeps three ledgers inside every committed state, so
// branches fork them for free: the tension arc (pacing), foreshadowing seeds
// and the fact ledger (prose-grounded memory). Everything here is
// deterministic; models only propose, the code decides what is recorded.

const referenceId = Type.String({ minLength: 1, maxLength: 120, pattern: "^[a-zA-Z0-9:_-]+$" });
const text = (maxLength, minLength = 1) => Type.String({ minLength, maxLength });
const literals = (values) => Type.Union(values.map((value) => Type.Literal(value)));

export const BEATS = ["setup", "complication", "reversal", "revelation", "climax", "release", "aftermath"];
export const BEAT_LABELS = { setup: "铺垫", complication: "施压", reversal: "反转", revelation: "揭示", climax: "高潮", release: "喘息", aftermath: "余波" };
const ESCALATING_BEATS = new Set(["complication", "reversal", "revelation", "climax"]);
export const LEDGER_KINDS = ["event", "detail", "dialogue", "promise", "secret", "injury", "item", "relationship", "location"];
export const LOOP_KINDS = ["promise", "threat", "question", "plan", "debt"];
export const MAX_AGENT_SEEDS = 5;
const PACKAGE_SEED_WINDOW = Object.freeze({ min: 2, max: 12 });
const LIMITS = Object.freeze({ arc: 60, ledger: 240, closedLoops: 20, notes: 6, digestLedger: 20, perCharacter: 8, loops: 12 });

export const DRAMATURGY_SCHEMA = Type.Object({
  beat: literals(BEATS),
  tension: Type.Integer({ minimum: 1, maximum: 10 }),
  valueShift: Type.Object({ axis: text(20), from: text(30), to: text(30) }),
  turningPoint: text(160),
  hook: text(120),
  callbacks: Type.Optional(Type.Array(referenceId, { maxItems: 4 })),
});

export const FORESHADOWING_SCHEMA = Type.Object({
  plant: Type.Optional(Type.Array(Type.Object({
    localId: referenceId,
    surfaceDetail: text(120),
    hiddenMeaning: text(200),
    payoffIdea: text(200),
    payoffWindow: Type.Object({ min: Type.Integer({ minimum: 1, maximum: 8 }), max: Type.Integer({ minimum: 2, maximum: 12 }) }),
    pointsToFactIds: Type.Optional(Type.Array(referenceId, { maxItems: 4 })),
  }), { maxItems: 2 })),
  reinforce: Type.Optional(Type.Array(Type.Object({ seedId: referenceId, detail: text(120) }), { maxItems: 3 })),
  payoff: Type.Optional(Type.Array(Type.Object({ seedId: referenceId, howItPaysOff: text(200) }), { maxItems: 2 })),
  retire: Type.Optional(Type.Array(Type.Object({ seedId: referenceId, reason: text(160) }), { maxItems: 2 })),
});

export const PACING_ADVICE_SCHEMA = Type.Object({
  beat: literals(BEATS),
  tension: Type.Integer({ minimum: 1, maximum: 10 }),
  twistIdeas: Type.Array(text(160), { maxItems: 3 }),
  foreshadow: Type.Array(Type.Object({
    action: literals(["plant", "reinforce", "payoff"]),
    seedId: Type.Optional(referenceId),
    idea: text(200),
  }), { maxItems: 3 }),
});

export const TURN_RECORD_SCHEMA = Type.Object({
  entries: Type.Array(Type.Object({
    kind: literals(LEDGER_KINDS),
    text: text(160, 4),
    quote: text(80, 2),
    characterIds: Type.Array(referenceId, { maxItems: 6 }),
    entityIds: Type.Optional(Type.Array(referenceId, { maxItems: 10 })),
    knownByIds: Type.Array(referenceId, { maxItems: 8 }),
    importance: Type.Integer({ minimum: 1, maximum: 3 }),
  }), { minItems: 1, maxItems: 10 }),
  openLoops: Type.Optional(Type.Array(Type.Object({
    kind: literals(LOOP_KINDS),
    text: text(160, 4),
    ownerIds: Type.Array(referenceId, { maxItems: 4 }),
    quote: text(80, 2),
  }), { maxItems: 4 })),
  closeLoops: Type.Optional(Type.Array(Type.Object({ loopId: referenceId, resolution: text(160), quote: text(80, 2) }), { maxItems: 4 })),
  supersede: Type.Optional(Type.Array(Type.Object({ ledgerId: referenceId, reason: text(120) }), { maxItems: 4 })),
  foreshadowCheck: Type.Optional(Type.Array(Type.Object({ seedId: referenceId, appeared: Type.Boolean(), quote: Type.Optional(text(80, 2)) }), { maxItems: 6 })),
  contradictions: Type.Optional(Type.Array(Type.Object({ quote: text(80, 2), problem: text(200) }), { maxItems: 4 })),
  dropMemoryNoteIndexes: Type.Optional(Type.Array(Type.Integer({ minimum: 0, maximum: 20 }), { maxItems: 6 })),
});

const recordValidator = Schema.Compile(TURN_RECORD_SCHEMA);

export const DRAMATURGY_POLICY = `节奏与伏笔（非拒绝回合必须在 prepare_story_turn 中提交 dramaturgy，按需提交 foreshadowing）：
- dramaturgy.beat 取 setup(铺垫)/complication(施压)/reversal(反转)/revelation(揭示)/climax(高潮)/release(喘息)/aftermath(余波)；tension 是本回合结束时的张力 1-10；valueShift 写本回合翻转的核心价值，如 {axis:"信任",from:"互相试探",to:"被迫托付"}，from 与 to 必须不同——没有价值翻转的回合不成立；turningPoint 写出人意料但合乎因果的转折点；hook 写结尾留给读者的具体悬念（一个问题或迫近的威胁），不是总结。
- 跌宕：遵守 narrative_state 的节奏指令。不连续三回合用同一节拍或同一张力；顺境之后让代价、对手或时间出招，高压之后给一口喘息但埋下新的不安。转折必须来自已有人物动机、已埋伏笔、未兑现事项或世界规则，不得凭空降下新危机。
- 伏笔：plant 只在本回合能用一个具体可见细节自然带出时使用（surfaceDetail 是读者看到的细节，hiddenMeaning 是它真正指向的东西，payoffIdea 是回收设想，payoffWindow 是几回合后回收）。reinforce 让已埋伏笔换一种方式再次露面；payoff 只能回收已埋下且已在正文露面的伏笔，让前文细节的意义落地；逾期伏笔要强化、回收或给出理由 retire。不得回收从未埋下的东西，不得用“早有准备”之类的事后补设化解危机。
- 事实账本 ledger 与 openLoops 是已经写进正文的事实和尚未兑现的承诺、威胁、疑问；提案与正文不得与之矛盾，兑现或违背承诺都要有后果。callbacks 可引用仍有效的账本条目 ID，正文会逐字准确地呼应这些前文细节。
- 推荐选项至少一项直接回应 hook 留下的悬念；有悬置的 openLoops 时，给玩家一个去兑现、追问或化解它的选择。`;

const clone = (value) => structuredClone(value);
const BEAT_BY_LABEL = Object.fromEntries(Object.entries(BEAT_LABELS).map(([beat, label]) => [label, beat]));

// Models often write the beat in Chinese or overshoot the 1-10 scale. Both are
// unambiguous, so they are normalized before schema validation instead of
// costing a structured retry.
export function normalizePacingArguments(value) {
  if (!value || typeof value !== "object") return value;
  const next = { ...value };
  if (typeof next.beat === "string") {
    const beat = next.beat.trim();
    next.beat = BEAT_BY_LABEL[beat] ?? beat.toLowerCase();
  }
  if (typeof next.tension === "string" && /^\d+(\.\d+)?$/.test(next.tension.trim())) next.tension = Number(next.tension);
  if (typeof next.tension === "number" && Number.isFinite(next.tension)) next.tension = Math.min(10, Math.max(1, Math.round(next.tension)));
  return next;
}
const squash = (value) => String(value ?? "").normalize("NFKC").replace(/[\s“”‘’「」『』"'《》]/gu, "");
const sameText = (left, right) => squash(left).toLowerCase() === squash(right).toLowerCase();

export function quoteInProse(quote, prose) {
  const needle = squash(quote);
  return needle.length >= 3 && squash(prose).includes(needle);
}

function trailing(list, predicate) {
  let count = 0;
  for (let index = list.length - 1; index >= 0 && predicate(list[index]); index -= 1) count += 1;
  return count;
}

function playerKnowledge(state, storyPackage) {
  return new Set(state?.characters?.[storyPackage.playerCharacterId]?.knowledgeFactIds ?? []);
}

function activatePackageSeeds(narrative, known, turn, eventId) {
  for (const seed of Object.values(narrative.seeds)) {
    if (seed.origin !== "package") continue;
    if (seed.status === "dormant" && known.has(seed.seedFactId)) {
      seed.pendingFactIds = seed.pointsToFactIds.filter((id) => !known.has(id));
      Object.assign(seed, { status: "planted", plantedTurn: turn, plantedEventId: eventId, surfaced: true, lastTouchedTurn: turn });
      if (!seed.pendingFactIds.length) Object.assign(seed, { status: "paid_off", paidOffTurn: turn, payoff: "伏笔指向的事实在埋下时已为玩家所知" });
    } else if (seed.status === "planted" && seed.pendingFactIds.some((id) => known.has(id))) {
      Object.assign(seed, {
        status: "paid_off", paidOffTurn: turn, paidOffEventId: eventId, lastTouchedTurn: turn,
        payoff: seed.payoff ?? `玩家角色得知了伏笔指向的事实：${seed.pendingFactIds.filter((id) => known.has(id)).join("、")}`,
      });
    }
  }
}

export function createNarrativeState(storyPackage, state = null) {
  const facts = new Map((storyPackage.facts ?? []).map((fact) => [fact.id, fact]));
  const narrative = { version: 1, turn: 0, arc: [], ledger: [], openLoops: [], seeds: {}, continuityNotes: [] };
  for (const foreshadow of storyPackage.foreshadows ?? []) {
    narrative.seeds[foreshadow.id] = {
      id: foreshadow.id,
      origin: "package",
      status: "dormant",
      seedFactId: foreshadow.seedFactId,
      pointsToFactIds: [...foreshadow.pointsToFactIds],
      pendingFactIds: [...foreshadow.pointsToFactIds],
      surfaceDetail: facts.get(foreshadow.seedFactId)?.revealText ?? foreshadow.seedFactId,
      hiddenMeaning: foreshadow.pointsToFactIds.map((id) => facts.get(id)?.truth ?? id).join(" / ").slice(0, 400),
      payoffIdea: "让玩家角色得知它真正指向的事实",
      window: { ...PACKAGE_SEED_WINDOW },
      plantedTurn: null,
      plantedEventId: null,
      surfaced: null,
      reinforcements: [],
      lastTouchedTurn: null,
    };
  }
  if (state) activatePackageSeeds(narrative, playerKnowledge(state, storyPackage), 0, null);
  return narrative;
}

// Older saves predate the narrative layer; read paths get a fresh one.
export function narrativeOf(state, storyPackage) {
  return state?.narrative ?? createNarrativeState(storyPackage, state);
}

function trimNarrative(narrative) {
  if (narrative.arc.length > LIMITS.arc) narrative.arc = narrative.arc.slice(-LIMITS.arc);
  const excess = narrative.ledger.length - LIMITS.ledger;
  if (excess > 0) {
    const rank = (entry) => (entry.status === "superseded" ? 0 : entry.importance);
    // The current turn's entries are never trimmed: memory cards are built from them.
    const candidates = narrative.ledger.filter((entry) => entry.turn < narrative.turn);
    const drop = new Set(candidates.sort((a, b) => rank(a) - rank(b) || a.turn - b.turn).slice(0, excess).map((entry) => entry.id));
    narrative.ledger = narrative.ledger.filter((entry) => !drop.has(entry.id));
  }
  const closed = narrative.openLoops.filter((loop) => loop.status !== "open");
  if (closed.length > LIMITS.closedLoops) {
    const drop = new Set(closed.slice(0, closed.length - LIMITS.closedLoops).map((loop) => loop.id));
    narrative.openLoops = narrative.openLoops.filter((loop) => !drop.has(loop.id));
  }
  if (narrative.continuityNotes.length > LIMITS.notes) narrative.continuityNotes = narrative.continuityNotes.slice(-LIMITS.notes);
}

/**
 * Applies the showrunner's pacing and foreshadowing decisions. Called by
 * applyTurnProposal after the world delta, so player knowledge is current.
 * Throws only on integrity errors (unknown or closed seeds); pacing quality is
 * judged by validateNarrativeProposal at the proposal gate.
 */
export function applyNarrativeProposal(next, before, proposal, { storyPackage, eventId }) {
  const narrative = next.narrative ?? createNarrativeState(storyPackage, before);
  next.narrative = narrative;
  narrative.turn += 1;
  const turn = narrative.turn;
  const foreshadowing = proposal.foreshadowing ?? {};
  const touched = new Set();
  const known = playerKnowledge(next, storyPackage);
  const seedFor = (seedId, verb) => {
    const seed = narrative.seeds[seedId];
    if (!seed) throw new Error(`不能${verb}不存在的伏笔：${seedId}`);
    if (seed.status !== "planted") throw new Error(`伏笔 ${seedId} 当前不是已埋下状态（${seed.status}），不能${verb}`);
    if (touched.has(seedId)) throw new Error(`同一回合不能对伏笔 ${seedId} 做多种处理`);
    touched.add(seedId);
    return seed;
  };
  for (const item of foreshadowing.reinforce ?? []) {
    const seed = seedFor(item.seedId, "强化");
    seed.reinforcements.push({ turn, eventId, detail: item.detail });
    seed.lastTouchedTurn = turn;
  }
  for (const item of foreshadowing.payoff ?? []) {
    const seed = seedFor(item.seedId, "回收");
    if (seed.origin === "package" && !seed.pendingFactIds.some((id) => known.has(id))) {
      throw new Error(`主线伏笔 ${seed.id} 的回收必须让玩家角色得知它指向的事实之一：${seed.pendingFactIds.join("、")}`);
    }
    Object.assign(seed, { status: "paid_off", paidOffTurn: turn, paidOffEventId: eventId, payoff: item.howItPaysOff, lastTouchedTurn: turn });
  }
  for (const item of foreshadowing.retire ?? []) {
    const seed = seedFor(item.seedId, "放弃");
    Object.assign(seed, { status: "retired", retiredTurn: turn, retiredReason: item.reason });
  }
  // Facts generated this same turn only get their real ID at commit, so seeds may point at earlier facts only.
  const factIds = new Set([...(storyPackage.facts ?? []).map((fact) => fact.id), ...Object.keys(before.generatedFacts ?? {})]);
  const localIds = new Set();
  for (const plant of foreshadowing.plant ?? []) {
    if (localIds.has(plant.localId)) throw new Error(`本回合伏笔 localId 重复：${plant.localId}`);
    localIds.add(plant.localId);
    if (plant.payoffWindow.min > plant.payoffWindow.max) throw new Error(`伏笔 ${plant.localId} 的回收窗口 min 不能大于 max`);
    for (const factId of plant.pointsToFactIds ?? []) if (!factIds.has(factId)) throw new Error(`伏笔 ${plant.localId} 指向不存在的事实：${factId}`);
    const id = `fs-${turn}-${plant.localId}`;
    if (narrative.seeds[id]) throw new Error(`伏笔 ID 重复：${id}`);
    narrative.seeds[id] = {
      id,
      origin: "agent",
      status: "planted",
      surfaceDetail: plant.surfaceDetail,
      hiddenMeaning: plant.hiddenMeaning,
      payoffIdea: plant.payoffIdea,
      window: { ...plant.payoffWindow },
      pointsToFactIds: [...(plant.pointsToFactIds ?? [])],
      plantedTurn: turn,
      plantedEventId: eventId,
      surfaced: null,
      reinforcements: [],
      lastTouchedTurn: turn,
    };
  }
  activatePackageSeeds(narrative, known, turn, eventId);

  const dramaturgy = proposal.dramaturgy;
  narrative.arc.push({
    turn,
    eventId,
    beat: dramaturgy?.beat ?? null,
    tension: dramaturgy?.tension ?? null,
    valueShift: dramaturgy?.valueShift ? clone(dramaturgy.valueShift) : null,
    turningPoint: dramaturgy?.turningPoint ?? null,
    hook: dramaturgy?.hook ?? null,
    outcomeType: proposal.outcome.type,
    ending: Boolean(proposal.ending),
  });
  const involved = [storyPackage.playerCharacterId, ...proposal.npcIntents.map((intent) => intent.characterId)].filter((id) => next.characters[id]);
  narrative.ledger.push({
    id: `L${turn}-0`, turn, eventId, kind: "event", text: proposal.outcome.summary, quote: null,
    characterIds: [...new Set(involved)], knownByIds: [storyPackage.playerCharacterId], importance: 2, status: "active", source: "proposal",
  });
  trimNarrative(narrative);
  return narrative;
}

export function pacingDirective(state, storyPackage) {
  const narrative = narrativeOf(state, storyPackage);
  const turn = narrative.turn + 1;
  const arc = narrative.arc.filter((item) => item.beat && Number.isInteger(item.tension));
  const last = arc.at(-1) ?? null;
  const previous = arc.at(-2) ?? null;
  const hard = { avoidBeats: [], flatTension: null, mustEscalate: false, mustAddressSeedIds: [] };
  const advice = [];
  if (last && previous && last.beat === previous.beat) hard.avoidBeats.push(last.beat);
  if (last && previous && last.tension === previous.tension) hard.flatTension = last.tension;
  if (trailing(arc, (item) => item.tension <= 4) >= 3) hard.mustEscalate = true;
  if (!last) advice.push("这是第一个有节奏记录的回合：用具体细节铺垫处境，并在结尾留下一个读者想追问的悬念。");
  if (trailing(narrative.arc, (item) => item.outcomeType === "success") >= 2) advice.push("已连续两回合顺利成功：让这次成功带上代价，或让对手、时间先出招。");
  if (trailing(arc, (item) => item.tension >= 8) >= 2) advice.push("高压已持续两回合：可以给一口喘息（release），但在喘息里埋下新的不安。");
  if (arc.length >= 3 && last.tension > previous.tension && previous.tension > arc.at(-3).tension) {
    advice.push("张力已连续上升三回合：考虑用反转或揭示改变局面的方向，而不只是继续加码。");
  }
  const stageRole = storyPackage.stages?.find((stage) => stage.id === state.storyProgress?.currentStageId)?.role;
  if (stageRole === "climax") advice.push("当前主干阶段是高潮：张力应在 7 以上，让关键选择的代价摆上台面。");
  if (stageRole === "consequence") advice.push("当前主干阶段是承担后果：用余波和代价收束，优先回收仍悬置的伏笔与承诺。");

  const seeds = [];
  for (const seed of Object.values(narrative.seeds)) {
    if (seed.status !== "planted") continue;
    const age = turn - seed.plantedTurn;
    const timing = age < seed.window.min ? "not_yet" : age <= seed.window.max ? "due" : "overdue";
    seeds.push({ id: seed.id, origin: seed.origin, age, timing, surfaced: seed.surfaced });
    if (seed.surfaced === false) advice.push(`伏笔 ${seed.id} 埋下后没有在正文露面：用 reinforce 让「${seed.surfaceDetail}」以具体细节出现，之后才能回收。`);
    else if (timing === "due" && seed.origin === "agent") advice.push(`伏笔 ${seed.id} 已进入回收窗口（埋下 ${age} 回合）：局面允许时回收，或用新细节强化。`);
    else if (timing === "overdue") advice.push(`伏笔 ${seed.id} 已超过回收窗口 ${age - seed.window.max} 回合：尽快回收、强化或说明理由放弃。`);
    const sinceTouched = turn - (seed.lastTouchedTurn ?? seed.plantedTurn);
    if (seed.origin === "agent" && age > seed.window.max + 2 && sinceTouched > 2) hard.mustAddressSeedIds.push(seed.id);
  }
  const staleLoopIds = [];
  for (const loop of narrative.openLoops) {
    if (loop.status !== "open" || turn - loop.openedTurn < 3) continue;
    staleLoopIds.push(loop.id);
    advice.push(`「${loop.text}」（${loop.id}）已悬置 ${turn - loop.openedTurn} 回合：让它兑现、落空或升级。`);
  }
  return {
    turn,
    curve: arc.slice(-6).map(({ turn: at, beat, tension }) => ({ turn: at, beat, tension })),
    lastBeat: last?.beat ?? null,
    lastTension: last?.tension ?? null,
    hard,
    advice,
    seeds,
    staleLoopIds,
  };
}

export function directiveText(directive, mode = "enforce") {
  if (!directive) return "";
  const tag = mode === "enforce" ? "【硬性】" : "【建议】";
  const { hard } = directive;
  const curve = directive.curve.map((item) => `${BEAT_LABELS[item.beat] ?? item.beat}${item.tension}`).join(" → ") || "尚无";
  const lines = [`节奏指令：下一回合是第 ${directive.turn} 回合。最近张力曲线：${curve}。`];
  if (hard.avoidBeats.length) lines.push(`${tag}不要再用节拍「${hard.avoidBeats.map((beat) => BEAT_LABELS[beat]).join("、")}」，它已连续两回合出现。`);
  if (hard.flatTension !== null) lines.push(`${tag}张力已连续两回合停在 ${hard.flatTension}，本回合必须改变。`);
  if (hard.mustEscalate) lines.push(`${tag}已连续三回合低张力：本回合节拍必须是施压、反转、揭示或高潮，且张力高于 ${directive.lastTension}。`);
  if (hard.mustAddressSeedIds.length) lines.push(`${tag}伏笔 ${hard.mustAddressSeedIds.join("、")} 严重逾期：本回合必须强化、回收或给出理由放弃。`);
  for (const item of directive.advice) lines.push(`· ${item}`);
  return lines.join("\n");
}

/**
 * The pacing and foreshadowing half of the proposal gate. Returns findings
 * instead of throwing, so the runtime can bounce the proposal back to the
 * showrunner once and record anything still unresolved as a waived warning.
 */
export function validateNarrativeProposal({ proposal, state, storyPackage }) {
  if (proposal.outcome.type === "action_not_allowed") return { checks: [], errors: [] };
  const narrative = narrativeOf(state, storyPackage);
  const directive = pacingDirective(state, storyPackage);
  const dramaturgy = proposal.dramaturgy;
  const foreshadowing = proposal.foreshadowing ?? {};
  const ending = Boolean(proposal.ending);
  const pacing = [];
  const foreshadow = [];
  const continuity = [];
  if (!dramaturgy) {
    pacing.push("缺少 dramaturgy：每个回合都要写明节拍 beat、张力 tension、价值翻转 valueShift、转折 turningPoint 与结尾悬念 hook");
  } else {
    const { beat, tension, valueShift } = dramaturgy;
    if (sameText(valueShift.from, valueShift.to)) pacing.push(`valueShift 的 from 与 to 相同（${valueShift.from}）：本回合必须让「${valueShift.axis}」发生翻转`);
    if (!ending && directive.hard.avoidBeats.includes(beat)) pacing.push(`节拍「${BEAT_LABELS[beat]}」已连续两回合使用，本回合换一种节拍`);
    if (!ending && directive.hard.flatTension === tension) pacing.push(`张力已连续两回合为 ${tension}，本回合不能继续持平`);
    if (!ending && directive.hard.mustEscalate && (!ESCALATING_BEATS.has(beat) || tension <= (directive.lastTension ?? 0))) {
      pacing.push(`已连续三回合低张力：节拍必须是施压、反转、揭示或高潮，且张力高于 ${directive.lastTension}`);
    }
    if (beat === "climax" && tension < 7) pacing.push("节拍为高潮时张力至少为 7");
    if (beat === "release" && directive.lastTension !== null && tension >= directive.lastTension) pacing.push(`喘息回合的张力应低于上一回合的 ${directive.lastTension}`);
    for (const id of dramaturgy.callbacks ?? []) {
      const entry = narrative.ledger.find((item) => item.id === id);
      if (!entry) continuity.push(`callbacks 引用了不存在的账本条目：${id}`);
      else if (entry.status !== "active") continuity.push(`账本条目 ${id} 已被后续事实取代，不能当作现状呼应`);
    }
  }
  const closing = new Set([...(foreshadowing.payoff ?? []), ...(foreshadowing.retire ?? [])].map((item) => item.seedId));
  const handled = new Set([...closing, ...(foreshadowing.reinforce ?? []).map((item) => item.seedId)]);
  const missing = directive.hard.mustAddressSeedIds.filter((id) => !handled.has(id));
  if (missing.length) foreshadow.push(`伏笔 ${missing.join("、")} 严重逾期，本回合必须强化、回收或给出理由放弃`);
  for (const item of foreshadowing.payoff ?? []) {
    if (narrative.seeds[item.seedId]?.surfaced === false) foreshadow.push(`伏笔 ${item.seedId} 还没有在正文露面，不能直接回收；先用 reinforce 让它出现`);
  }
  const activeAgentSeeds = Object.values(narrative.seeds).filter((seed) => seed.origin === "agent" && seed.status === "planted" && !closing.has(seed.id));
  if (activeAgentSeeds.length + (foreshadowing.plant?.length ?? 0) > MAX_AGENT_SEEDS) {
    foreshadow.push(`活跃伏笔将超过 ${MAX_AGENT_SEEDS} 条：先回收或放弃旧伏笔，再埋新的`);
  }
  if (ending) {
    const open = activeAgentSeeds.map((seed) => seed.id);
    if (open.length) foreshadow.push(`结局回合必须回收或放弃所有仍在场的伏笔：${open.join("、")}`);
    if (foreshadowing.plant?.length) foreshadow.push("结局回合不能再埋新伏笔");
  }
  const counts = ["plant", "reinforce", "payoff", "retire"].map((key) => foreshadowing[key]?.length ?? 0);
  return {
    checks: [
      {
        id: "pacing", label: "节奏曲线", passed: pacing.length === 0, issues: pacing,
        detail: dramaturgy
          ? `${BEAT_LABELS[directive.lastBeat] ?? "开篇"}${directive.lastTension ?? ""} → ${BEAT_LABELS[dramaturgy.beat]}${dramaturgy.tension}；${dramaturgy.valueShift.axis}：${dramaturgy.valueShift.from} → ${dramaturgy.valueShift.to}`
          : "未提交节奏设计",
      },
      { id: "foreshadow", label: "伏笔账本", passed: foreshadow.length === 0, issues: foreshadow, detail: `埋 ${counts[0]} · 强化 ${counts[1]} · 回收 ${counts[2]} · 放弃 ${counts[3]}` },
      { id: "continuity", label: "前文呼应", passed: continuity.length === 0, issues: continuity, detail: `呼应账本 ${dramaturgy?.callbacks?.length ?? 0} 条` },
    ],
    errors: [...pacing, ...foreshadow, ...continuity],
  };
}

function seedsToVerify(stateAfter, proposal) {
  const narrative = stateAfter.narrative;
  return [
    ...Object.values(narrative.seeds).filter((seed) => seed.origin === "agent" && seed.plantedTurn === narrative.turn)
      .map((seed) => ({ seedId: seed.id, action: "plant", detail: seed.surfaceDetail })),
    ...(proposal.foreshadowing?.reinforce ?? []).map((item) => ({ seedId: item.seedId, action: "reinforce", detail: item.detail })),
    ...(proposal.foreshadowing?.payoff ?? []).map((item) => ({ seedId: item.seedId, action: "payoff", detail: item.howItPaysOff })),
  ];
}

export function recordTargets(stateAfter, proposal) {
  const narrative = stateAfter.narrative;
  const turn = narrative.turn;
  return {
    turn,
    seeds: seedsToVerify(stateAfter, proposal),
    openLoops: narrative.openLoops.filter((loop) => loop.status === "open" && loop.openedTurn < turn).map(({ id, kind, text: body }) => ({ id, kind, text: body })),
    ledger: narrative.ledger.filter((entry) => entry.status === "active" && entry.turn < turn).slice(-20).map(({ id, text: body }) => ({ id, text: body })),
  };
}

// Every entry must be grounded in a verbatim quote: a memory that cannot point
// at the published prose is not recorded.
export function validateTurnRecord(record, { prose, stateAfter, proposal, storyPackage }) {
  const [valid, schemaErrors] = recordValidator.Errors(record);
  if (!valid) throw new Error(`连续性记录结构不合法：${schemaErrors.slice(0, 4).map((error) => `${error.path || "/"}: ${error.message}`).join("；")}`);
  const narrative = stateAfter.narrative;
  const errors = [];
  const quoted = (quote, label) => { if (!quoteInProse(quote, prose)) errors.push(`${label} 的 quote 不在正文中：「${quote}」——引文必须从正文逐字摘录`); };
  const characters = (ids, label) => { for (const id of ids ?? []) if (!stateAfter.characters[id]) errors.push(`${label} 引用了不存在的人物：${id}`); };
  const entityIds = new Set([...Object.keys(stateAfter.characters), ...(storyPackage?.items ?? []).map((x) => x.id), ...(storyPackage?.locations ?? []).map((x) => x.id)]);
  record.entries.forEach((entry, index) => {
    quoted(entry.quote, `entries[${index}]`);
    characters([...entry.characterIds, ...entry.knownByIds], `entries[${index}]`);
    for (const id of entry.entityIds ?? []) if (!entityIds.has(id)) errors.push(`entries[${index}] 引用了不存在的实体：${id}`);
  });
  (record.openLoops ?? []).forEach((loop, index) => { quoted(loop.quote, `openLoops[${index}]`); characters(loop.ownerIds, `openLoops[${index}]`); });
  for (const item of record.closeLoops ?? []) {
    if (!narrative.openLoops.some((loop) => loop.id === item.loopId && loop.status === "open" && loop.openedTurn < narrative.turn)) errors.push(`closeLoops 引用了不存在或已关闭的事项：${item.loopId}`);
    quoted(item.quote, `closeLoops ${item.loopId}`);
  }
  for (const item of record.supersede ?? []) {
    if (!narrative.ledger.some((entry) => entry.id === item.ledgerId && entry.status === "active" && entry.turn < narrative.turn)) errors.push(`supersede 只能作废此前仍有效的账本条目：${item.ledgerId}`);
  }
  const targets = new Map(seedsToVerify(stateAfter, proposal).map((item) => [item.seedId, item]));
  const checked = new Set();
  for (const check of record.foreshadowCheck ?? []) {
    if (!targets.has(check.seedId)) errors.push(`foreshadowCheck 只能核对本回合埋下、强化或回收的伏笔：${check.seedId}`);
    if (check.appeared) {
      if (!check.quote) errors.push(`伏笔 ${check.seedId} 标记为已出现时必须给出正文引文`);
      else quoted(check.quote, `foreshadowCheck ${check.seedId}`);
    }
    checked.add(check.seedId);
  }
  for (const [seedId, item] of targets) if (item.action === "plant" && !checked.has(seedId)) errors.push(`本回合埋下的伏笔 ${seedId} 必须在 foreshadowCheck 中核对是否出现在正文`);
  (record.contradictions ?? []).forEach((item, index) => quoted(item.quote, `contradictions[${index}]`));
  if (errors.length) throw new Error(errors.slice(0, 5).join("；"));
}

function overlap(detail, prose) {
  const words = terms(detail).filter((word) => [...word].length >= 2);
  if (!words.length) return 0;
  return words.filter((word) => prose.includes(word)).length / words.length;
}

// Used when the recorder agent is disabled, fails or times out: quoted
// dialogue is still exact, and a seed only counts as surfaced on strong
// overlap; an unconfirmed plant must be reinforced before it can pay off.
export function fallbackRecord({ prose, proposal, stateAfter }) {
  const entries = [];
  for (const match of String(prose).matchAll(/[「“]([^「」“”]{4,60})[」”]/gu)) {
    if (entries.length >= 4) break;
    entries.push({ kind: "dialogue", text: `正文对白：「${match[1]}」`, quote: match[1], characterIds: [], knownByIds: [], importance: 1 });
  }
  const foreshadowCheck = seedsToVerify(stateAfter, proposal)
    .filter((item) => item.action !== "payoff")
    .map((item) => ({ seedId: item.seedId, appeared: overlap(item.detail, prose) >= 0.6 }));
  return { source: "deterministic", entries, openLoops: [], closeLoops: [], supersede: [], foreshadowCheck, contradictions: [] };
}

export function applyTurnRecord(state, record, { eventId, playerCharacterId }) {
  const narrative = state.narrative;
  if (!narrative || !record) return state;
  const turn = narrative.turn;
  // Records are validated against a preview state; generated IDs carry the real event ID once committed.
  const realId = (id) => (id?.startsWith("generated:preview:") ? `generated:${eventId}:${id.slice("generated:preview:".length)}` : id);
  const characters = (ids) => [...new Set((ids ?? []).map(realId).filter((id) => state.characters[id]))];
  const source = record.source ?? "agent";
  (record.entries ?? []).forEach((entry, index) => {
    narrative.ledger.push({
      id: `L${turn}-${index + 1}`, turn, eventId, kind: entry.kind, text: entry.text, quote: entry.quote ?? null,
      characterIds: characters(entry.characterIds), knownByIds: characters([playerCharacterId, ...entry.knownByIds]), importance: entry.importance ?? 1,
      ...(entry.entityIds ? { entityIds: [...new Set(entry.entityIds.map(realId))] } : {}),
      status: "active", source,
    });
  });
  for (const item of record.supersede ?? []) {
    const entry = narrative.ledger.find((candidate) => candidate.id === item.ledgerId && candidate.status === "active");
    if (entry) Object.assign(entry, { status: "superseded", supersededTurn: turn, supersededReason: item.reason });
  }
  for (const item of record.closeLoops ?? []) {
    const loop = narrative.openLoops.find((candidate) => candidate.id === item.loopId && candidate.status === "open");
    if (loop) Object.assign(loop, { status: "closed", closedTurn: turn, resolution: item.resolution, closingQuote: item.quote });
  }
  (record.openLoops ?? []).forEach((loop, index) => {
    narrative.openLoops.push({ id: `Q${turn}-${index + 1}`, kind: loop.kind, text: loop.text, ownerIds: characters(loop.ownerIds), quote: loop.quote, openedTurn: turn, eventId, status: "open" });
  });
  for (const check of record.foreshadowCheck ?? []) {
    const seed = narrative.seeds[check.seedId];
    if (!seed) continue;
    if (check.appeared) {
      seed.surfaced = true;
      if (check.quote) seed.surfacedQuote ??= check.quote;
    } else if (seed.plantedTurn === turn && seed.surfaced !== true) {
      seed.surfaced = false;
    } else if (seed.status === "paid_off" && seed.paidOffTurn === turn) {
      narrative.continuityNotes.push({ turn, quote: null, problem: `伏笔 ${seed.id} 的回收没有在正文中写出来，下一回合要补上前后呼应` });
    }
  }
  for (const item of record.contradictions ?? []) narrative.continuityNotes.push({ turn, quote: item.quote, problem: item.problem });
  trimNarrative(narrative);
  return state;
}

function slimEntry(entry) {
  return { id: entry.id, turn: entry.turn, kind: entry.kind, text: entry.text, ...(entry.quote ? { quote: entry.quote } : {}), who: entry.characterIds };
}

/**
 * What the next turn needs from the ledgers: the pacing directive, live seeds,
 * open loops and a bounded, relevance-ranked slice of the fact ledger. Each
 * character only receives entries it witnessed or was told.
 */
export function narrativeDigest(state, storyPackage, { action = "", characterIds = [] } = {}) {
  const narrative = narrativeOf(state, storyPackage);
  const directive = pacingDirective(state, storyPackage);
  const active = narrative.ledger.filter((entry) => entry.status === "active");
  const wanted = new Set(characterIds.filter((id) => id !== storyPackage.playerCharacterId));
  const actionTerms = terms(action).filter((word) => [...word].length >= 2);
  const ledger = active
    .map((entry) => {
      let score = entry.importance;
      score += entry.characterIds.filter((id) => wanted.has(id)).length * 2;
      if (narrative.turn - entry.turn < 3) score += 2;
      score += Math.min(4, actionTerms.filter((word) => entry.text.includes(word) || entry.quote?.includes(word)).length * 2);
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score || b.entry.turn - a.entry.turn)
    .slice(0, LIMITS.digestLedger)
    .map(({ entry }) => entry)
    .sort((a, b) => a.turn - b.turn || a.id.localeCompare(b.id, "en", { numeric: true }))
    .map(slimEntry);
  const timing = new Map(directive.seeds.map((seed) => [seed.id, seed]));
  return {
    turn: narrative.turn,
    directive,
    arc: narrative.arc.slice(-6).map(({ turn, beat, tension, valueShift, hook, outcomeType }) => ({ turn, beat, tension, valueShift, hook, outcomeType })),
    seeds: Object.values(narrative.seeds).filter((seed) => seed.status === "planted").map((seed) => ({
      id: seed.id, origin: seed.origin, surfaceDetail: seed.surfaceDetail, hiddenMeaning: seed.hiddenMeaning, payoffIdea: seed.payoffIdea,
      plantedTurn: seed.plantedTurn, window: seed.window, surfaced: seed.surfaced, reinforced: seed.reinforcements.length,
      age: timing.get(seed.id)?.age ?? null, timing: timing.get(seed.id)?.timing ?? null,
    })),
    openLoops: narrative.openLoops.filter((loop) => loop.status === "open").slice(-LIMITS.loops)
      .map(({ id, kind, text: body, ownerIds, openedTurn }) => ({ id, kind, text: body, ownerIds, openedTurn })),
    ledger,
    ledgerByCharacter: Object.fromEntries(characterIds.map((id) => [id, active.filter((entry) => entry.knownByIds.includes(id)).slice(-LIMITS.perCharacter).map(slimEntry)])),
    continuityNotes: narrative.continuityNotes.filter((note) => narrative.turn - note.turn < 3),
  };
}

/**
 * The writing brief handed to narration. It is derived from the accepted
 * proposal and the ledgers, never from hidden meanings: plants and
 * reinforcements carry only their visible surface detail.
 */
export function buildBeatSheet(proposal, state, storyPackage) {
  if (!proposal || proposal.outcome.type === "action_not_allowed") return null;
  const narrative = narrativeOf(state, storyPackage);
  const dramaturgy = proposal.dramaturgy;
  const foreshadowing = proposal.foreshadowing ?? {};
  const ledger = new Map(narrative.ledger.map((entry) => [entry.id, entry]));
  const earlier = (seedId) => narrative.seeds[seedId]?.surfacedQuote ?? narrative.seeds[seedId]?.surfaceDetail ?? null;
  return {
    beat: dramaturgy ? { type: dramaturgy.beat, tension: dramaturgy.tension } : null,
    valueShift: dramaturgy?.valueShift ? clone(dramaturgy.valueShift) : null,
    turningPoint: dramaturgy?.turningPoint ?? null,
    hook: dramaturgy?.hook ?? proposal.closingBeat ?? null,
    callbacks: (dramaturgy?.callbacks ?? []).map((id) => ledger.get(id)).filter(Boolean).map(({ id, text: body, quote }) => ({ id, text: body, ...(quote ? { quote } : {}) })),
    plant: (foreshadowing.plant ?? []).map((item) => ({ detail: item.surfaceDetail })),
    reinforce: (foreshadowing.reinforce ?? []).map((item) => ({ detail: item.detail, earlier: earlier(item.seedId) })),
    payoff: (foreshadowing.payoff ?? []).map((item) => ({ earlier: earlier(item.seedId), howItPaysOff: item.howItPaysOff })),
    continuity: narrative.continuityNotes.filter((note) => narrative.turn - note.turn < 2).map((note) => note.problem),
  };
}
