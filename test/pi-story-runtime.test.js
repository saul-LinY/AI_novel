import assert from "node:assert/strict";
import test from "node:test";
import { PiStoryRuntime } from "../src/pi-story-runtime.js";
import { createInitialState } from "../src/story-engine.js";
import { validateTurnRecord } from "../src/story-narrative.js";
import { dramaticProposal, packageById, projectRoot, proposal } from "./helpers.js";

const storyPackage = await packageById();
const roles = ["main", "plot", "character", "environment"];

function runtimeWithFakeSessions(pipeline = {}) {
  const runtime = new PiStoryRuntime({ projectRoot, dataDir: "/tmp", storyPackage });
  runtime.pipeline = { ...runtime.pipeline, recorder: "off", ...pipeline };
  const records = {};
  for (const role of roles) {
    let leafId = `${role}-base`;
    let listener = null;
    records[role] = { navigated: [], reset: false, aborted: false };
    runtime.sessions.set(role, {
      sessionFile: `/tmp/${role}.jsonl`,
      isStreaming: true,
      agent: { state: { messages: [] } },
      sessionManager: {
        getLeafId: () => leafId,
        resetLeaf: () => { leafId = null; records[role].reset = true; },
        buildSessionContext: () => ({ messages: [`${role}-rebuilt`] }),
      },
      navigateTree: async (target) => { records[role].navigated.push(target); leafId = target; },
      subscribe: (nextListener) => { listener = nextListener; return () => { listener = null; }; },
      prompt: async () => {},
      abort: async () => { records[role].aborted = true; },
      dispose() {},
      emitText: (value) => listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: value } }),
      setLeaf: (value) => { leafId = value; },
    });
  }
  return { runtime, records, session: (role) => runtime.sessions.get(role) };
}

function context(overrides = {}) {
  return {
    action: "检查治疗记录",
    state: createInitialState(storyPackage),
    recentEvents: [],
    piEntryIds: Object.fromEntries(roles.map((role) => [role, `${role}-base`])),
    branchMemory: "尚未开始正式互动。",
    characterMemories: {},
    environmentMemory: "",
    ...overrides,
  };
}

function reports(role) {
  if (role === "plot") return { currentNodeId: "see-countdown" };
  if (role === "character") return { involvedCharacterIds: ["lu-mingfei"] };
  if (role === "environment") return { locationId: "theme-hotel", sceneStateId: "default" };
  return dramaticProposal();
}

test('上游模型停用直接显示 410，不再误报缺少工具结果或再次催交', async () => {
  const fake = runtimeWithFakeSessions();
  let calls = 0;
  fake.session('environment').prompt = async () => {
    calls++;
    fake.session('environment').agent.state.messages.push({ role: 'assistant', model: 'retired-model', stopReason: 'error', errorMessage: '410: model was retired at 2026-09-25' });
  };
  await assert.rejects(fake.runtime.requestStructured('environment', '提交结果'), (error) => {
    assert.equal(error.code, 'MODEL_REQUEST_FAILED');
    assert.equal(error.status, 410);
    assert.match(error.message, /模型已停用/);
    assert.doesNotMatch(error.message, /没有提交可用结果/);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(fake.runtime.activePhases.size, 0);
});

test('普通模型错误保留原因且不回显 API Key', async () => {
  const fake = runtimeWithFakeSessions();
  fake.session('plot').prompt = async () => fake.session('plot').agent.state.messages.push({ role: 'assistant', stopReason: 'error', errorMessage: '401: invalid credential sk-not-a-real-key' });
  await assert.rejects(fake.runtime.requestStructured('plot', '提交结果'), (error) => {
    assert.equal(error.status, 401);
    assert.match(error.message, /模型调用失败/);
    assert.doesNotMatch(error.message, /sk-not-a-real-key/);
    return true;
  });
});

test('模型正常但漏调工具时仍可提醒一次，旧错误不污染新请求', async () => {
  const fake = runtimeWithFakeSessions();
  const session = fake.session('environment');
  session.agent.state.messages.push({ role: 'assistant', stopReason: 'error', errorMessage: '410: previous request' });
  let calls = 0;
  session.prompt = async () => {
    calls++;
    session.agent.state.messages.push({ role: 'assistant', stopReason: 'stop', content: [] });
    if (calls === 2) fake.runtime.pendingReports.set('environment', reports('environment'));
  };
  assert.deepEqual(await fake.runtime.requestStructured('environment', '提交结果'), reports('environment'));
  assert.equal(calls, 2);
});

test('并行 Agent 失败时先停止兄弟任务，再回退会话', async () => {
  const fake = runtimeWithFakeSessions();
  const active = new Set();
  const release = new Map();
  fake.runtime.requestStructured = async (role) => {
    if (role === 'plot') throw new Error('upstream retired');
    active.add(role);
    await new Promise((resolve) => release.set(role, resolve));
    active.delete(role);
    return reports(role);
  };
  for (const role of roles) fake.session(role).abort = async () => { release.get(role)?.(); };
  let rolledBack = false;
  fake.runtime.rollback = async () => { assert.equal(active.size, 0); rolledBack = true; };
  await assert.rejects(fake.runtime.generateTurn(context()), /upstream retired/);
  assert.equal(rolledBack, true);
  assert.equal(fake.runtime.activeState, null);
});

test("四个 Pi Session 可分别回退，无历史节点时重建各自上下文", async () => {
  const fake = runtimeWithFakeSessions();
  await fake.runtime.rollback(Object.fromEntries(roles.map((role) => [role, `${role}-older`])));
  for (const role of roles) assert.deepEqual(fake.records[role].navigated, [`${role}-older`]);

  await fake.runtime.rollback({});
  for (const role of roles) {
    assert.equal(fake.records[role].reset, true);
    assert.deepEqual(fake.session(role).agent.state.messages, [`${role}-rebuilt`]);
  }
});

test("情节、人物、环境并行完成后主 Agent 才准备回合，正文按完整句追加且不复核", async () => {
  const fake = runtimeWithFakeSessions();
  const started = [];
  const finished = [];
  fake.runtime.requestStructured = async (role) => {
    started.push(role);
    if (role !== "main") await new Promise((resolve) => setTimeout(resolve, 30));
    if (role === "main") assert.deepEqual(new Set(finished), new Set(["plot", "character", "environment"]));
    finished.push(role);
    return reports(role);
  };
  fake.session("main").prompt = async () => {
    fake.session("main").emitText("第一句还没有完");
    fake.session("main").emitText("成。第二句");
    fake.session("main").emitText("也完成了。");
  };
  const phases = [];
  const sentences = [];
  let prepared = null;
  const result = await fake.runtime.generateTurn(context(), {
    onPhase: (phase) => phases.push(phase),
    onPrepared: (value) => { prepared = value; },
    onSentence: (sentence) => sentences.push(sentence),
  });

  assert.deepEqual(new Set(started.slice(0, 3)), new Set(["plot", "character", "environment"]));
  assert.equal(started[3], "main");
  assert.deepEqual(sentences, ["第一句还没有完成。", "第二句也完成了。"]);
  assert.equal(result.prose, "第一句还没有完成。第二句也完成了。");
  assert.equal(prepared.scene.locationId, "theme-hotel");
  assert.deepEqual(phases, ["analyzing", "synthesizing", "narrating", "recording"]);
});

test("正文生成显式携带当前分支的紧邻上一段，并要求直接续写", async () => {
  const fake = runtimeWithFakeSessions();
  fake.runtime.requestStructured = async (role) => reports(role);
  let narrationPrompt = "";
  fake.session("main").prompt = async (prompt) => {
    narrationPrompt = prompt;
    fake.session("main").emitText("你推开门，跟他走进雨里。");
  };

  await fake.runtime.generateTurn(context({
    action: "出发",
    recentEvents: [
      { type: "opening", prose: "更早的开场。" },
      { type: "turn", prose: "他站在门边等你，手还按在门把上。" },
    ],
  }));

  assert.match(narrationPrompt, /<immediate_previous_prose>\n他站在门边等你，手还按在门把上。\n<\/immediate_previous_prose>/);
  assert.match(narrationPrompt, /不是背景摘要/);
  assert.match(narrationPrompt, /直接往后写/);
  assert.match(narrationPrompt, /通常写成2到3个自然段/);
  assert.match(narrationPrompt, /不单独复述玩家输入/);
  assert.match(narrationPrompt, /不重新凑字数或段数/);
  assert.doesNotMatch(narrationPrompt, /5到7个自然段/);
  assert.doesNotMatch(narrationPrompt, /更早的开场/);
});

test("准备前失败会回退四个会话，准备后不能取消", async () => {
  const fake = runtimeWithFakeSessions();
  fake.runtime.requestStructured = async (role) => {
    for (const item of roles) fake.session(item).setLeaf(`${item}-changed`);
    if (role === "plot") throw new Error("硬校验失败");
    return reports(role);
  };
  await assert.rejects(fake.runtime.generateTurn(context()), /硬校验失败/);
  for (const role of roles) assert.equal(fake.records[role].navigated.includes(`${role}-base`), true);

  const afterPrepare = runtimeWithFakeSessions();
  afterPrepare.runtime.requestStructured = async (role) => reports(role);
  afterPrepare.session("main").prompt = async () => afterPrepare.session("main").emitText("最终正文。 ");
  let cancelResult = null;
  await afterPrepare.runtime.generateTurn(context(), {
    onPrepared: async () => { cancelResult = await afterPrepare.runtime.abort(); },
  });
  assert.equal(cancelResult, false);
  for (const role of roles) assert.equal(afterPrepare.records[role].aborted, false);
});

test("准确秘密在进入 Pi 前被拒绝，准备前取消会中止所有活跃 Session", async () => {
  const fake = runtimeWithFakeSessions();
  const result = await fake.runtime.generateTurn(context({ action: "我去找赫尔佐格" }));
  assert.equal(result.rejected, true);
  assert.equal(result.proposal.outcome.type, "action_not_allowed");
  assert.equal(await fake.runtime.abort(), true);
  for (const role of roles) assert.equal(fake.records[role].aborted, true);
});

test("主Agent在准备阶段拦截没有推进目标的推荐选项", () => {
  const fake = runtimeWithFakeSessions();
  fake.runtime.activeState = createInitialState(storyPackage);
  assert.throws(() => fake.runtime.validateMainProposal(proposal()), /推进目标/);
  assert.equal(fake.runtime.preparedLocked, false);
});

test("情节和主Agent收到未解线索的内容、真实阶段进度和近期选项", async () => {
  const fake = runtimeWithFakeSessions();
  const prompts = {};
  fake.runtime.requestStructured = async (role, prompt) => { prompts[role] = prompt; return reports(role); };
  fake.session("main").prompt = async () => fake.session("main").emitText("你向凯撒说明条件，等他表态。");
  await fake.runtime.generateTurn(context({ recentEvents: [{ action: "开窗", prose: "你推开窗户。", choices: [{ id: "breakfast", label: "窗边吃早餐", action: "陪绘梨衣吃早餐" }] }] }));
  for (const role of ["plot", "main"]) {
    assert.match(prompts[role], /<shared_context>/);
    assert.match(prompts[role], /在药效耗尽前获得可信的治疗/);
    assert.match(prompts[role], /completedGoalIds/);
    assert.match(prompts[role], /窗边吃早餐/);
  }
  assert.match(prompts.main, /choicePlan/);
});

test("支线审核只约束 Agent 新增建议，玩家偏离主线可按因果结算", async () => {
  const fake = runtimeWithFakeSessions();
  const prompts = {};
  fake.runtime.requestStructured = async (role, prompt) => { prompts[role] = prompt; return reports(role); };
  fake.session("main").prompt = async () => fake.session("main").emitText("你决定离开。");
  await fake.runtime.generateTurn(context({ action: "我决定离开，不再追查。" }));
  for (const role of ["main", "plot"]) {
    assert.match(prompts[role], /严格支线审核只针对 Agent 自行新增的支线/);
    assert.match(prompts[role], /不得强制要求回归主线/);
  }
  assert.match(prompts.main, /ending.type 只能取 normal、failure、early、deviation/);
  fake.runtime.activeState = context().state;
  const playerRoute = { currentNodeId: "see-countdown", recommendedNodeId: "see-countdown", routeMode: "deviation", candidateChanges: [] };
  assert.doesNotThrow(() => fake.runtime.validateReport("plot", playerRoute));
  assert.throws(() => fake.runtime.validateReport("plot", { ...playerRoute, candidateChanges: [{ kind: "route_change", description: "Agent 新增的调查支线" }] }), /主线价值、回归节点和回归条件/);
});

// Exercise the actual Pi tool loop: schema rejection occurs before tool.execute.
async function structuredLoop(responses, businessFailure = false) {
  const { Agent } = await import("../vendor/pi/packages/agent/dist/index.js");
  const { EventStream } = await import("../vendor/pi/packages/ai/dist/index.js");
  const { TURN_PROPOSAL_SCHEMA } = await import("../src/story-engine.js");
  const { prepareMainArguments } = await import("../src/pi-story-runtime.js");
  const fake = runtimeWithFakeSessions();
  let calls = 0;
  let executions = 0;
  const results = [];
  const model = { id: "test", name: "test", api: "openai-completions", provider: "test", baseUrl: "http://unused.invalid", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 2048 };
  const agent = new Agent({
    initialState: { model, tools: [{
      name: "prepare_story_turn", label: "准备回合", description: "test", parameters: TURN_PROPOSAL_SCHEMA,
      prepareArguments: prepareMainArguments,
      execute: async (_id, args) => {
        executions += 1;
        if (businessFailure) return { content: [{ type: "text", text: "校验失败：当前目标已经完成" }], details: { accepted: false }, isError: true };
        fake.runtime.pendingReports.set("main", args);
        return { content: [{ type: "text", text: "通过" }], details: { accepted: true }, terminate: true };
      },
    }] },
    streamFn: () => {
      const stream = new EventStream(event => event.type === "done", event => event.message);
      const args = responses[Math.min(calls++, responses.length - 1)];
      if (calls > 6) throw new Error("Test guard: tool loop did not stop");
      queueMicrotask(() => stream.push({ type: "done", reason: "toolUse", message: {
        role: "assistant", content: [{ type: "toolCall", id: `call-${calls}`, name: "prepare_story_turn", arguments: structuredClone(args) }],
        api: model.api, provider: model.provider, model: model.id, stopReason: "toolUse", timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      } }));
      return stream;
    },
  });
  agent.subscribe(event => { if (event.type === "tool_execution_end") results.push(event); });
  fake.runtime.sessions.set("main", { agent, subscribe: listener => agent.subscribe(listener), prompt: prompt => agent.prompt(prompt) });
  return { ...fake, agent, results, counts: () => ({ calls, executions }) };
}

test("Pi 实际工具循环在参数连续三次错误后停止并保留具体原因", async () => {
  const fake = await structuredLoop([{ ...proposal(), ending: { type: "tragic" } }]);
  await assert.rejects(fake.runtime.requestStructured("main", "提交提案"), /连续 3 次校验失败.*ending.type.*tragic.*normal、failure、early、deviation/);
  assert.deepEqual(fake.counts(), { calls: 3, executions: 0 });
  assert.equal(fake.runtime.pendingReports.has("main"), false);
  assert.equal(fake.runtime.activePhases.has("main"), false);
  assert.equal(fake.agent.state.messages.filter(m => m.role === "toolResult").length, 3);
});

test("普通 schema 错误和业务校验失败都受三次上限约束", async () => {
  for (const [args, business] of [[{}, false], [proposal(), true]]) {
    const fake = await structuredLoop([args], business);
    await assert.rejects(fake.runtime.requestStructured("main", "提交提案"), /连续 3 次校验失败/);
    assert.equal(fake.counts().calls, 3);
    assert.equal(fake.counts().executions, business ? 3 : 0);
  }
});

test("主创收到明确错误后可修正通过，下一次请求重新计算次数", async () => {
  const fake = await structuredLoop([{ ...proposal(), ending: { type: "sad" } }, proposal()]);
  assert.deepEqual(await fake.runtime.requestStructured("main", "提交提案"), proposal());
  assert.equal(fake.counts().calls, 2);
  assert.match(fake.results[0].result.content[0].text, /不得自造类型/);
  assert.deepEqual(await fake.runtime.requestStructured("main", "下一轮"), proposal());
  assert.equal(fake.counts().calls, 3);
});

test("拒绝行动的缺失空字段、零步骤及多余变化在 Pi 校验前规范化，首轮即可返回拒绝", async () => {
  const { applyTurnProposal } = await import("../src/story-engine.js");
  const minimal = {
    normalizedAction: { intent: "让绘梨衣掏出不存在的武器", steps: ["要求 NPC 取出武器"], stoppedAtStep: 1, stopReason: "玩家没有取得该物品，也不能直接指定 NPC 动作" },
    outcome: { type: "action_not_allowed", summary: "目前没有这件物品，无法执行。", reasons: ["已提交的物品中没有该武器"] },
  };
  const withChanges = {
    ...proposal(), ...minimal,
    normalizedAction: { ...minimal.normalizedAction, stoppedAtStep: 0 },
    delta: { timeAdvanceMinutes: 1, addItemIds: ["erii-notebook"] },
    npcIntents: [{ characterId: "erii", intent: "执行被拒绝的动作", reason: "不应发生" }],
    memoryNotes: ["不应记住被拒绝的动作"],
    storyProgress: { evidence: "不应推进" },
    foreshadowing: { plant: [] },
  };
  for (const raw of [minimal, withChanges]) {
    const before = structuredClone(raw);
    const fake = await structuredLoop([raw]);
    const result = await fake.runtime.requestStructured("main", "提交拒绝结果");
    assert.deepEqual(fake.counts(), { calls: 1, executions: 1 });
    assert.deepEqual(result, { ...minimal, choices: [], delta: {}, npcIntents: [], memoryNotes: [] });
    assert.deepEqual(raw, before);
    const state = createInitialState(storyPackage);
    assert.deepEqual(applyTurnProposal(state, result, storyPackage), state);
    fake.runtime.activeState = state;
    assert.doesNotThrow(() => fake.runtime.validateMainProposal(result));
  }
});

test("拒绝仍须解释原因，普通成功提案的必填字段不会被补造", async () => {
  const missingChoices = proposal();
  delete missingChoices.choices;
  for (const raw of [{ outcome: { type: "action_not_allowed" } }, missingChoices]) {
    const fake = await structuredLoop([raw]);
    await assert.rejects(fake.runtime.requestStructured("main", "提交提案"), /连续 3 次校验失败/);
    assert.deepEqual(fake.counts(), { calls: 3, executions: 0 });
  }
});

test("规范化的行动拒绝不会进入正文、记录员或 prepared 阶段", async () => {
  const { prepareMainArguments } = await import("../src/pi-story-runtime.js");
  const fake = runtimeWithFakeSessions();
  const original = context();
  fake.runtime.requestStructured = async (role) => role === "main" ? prepareMainArguments({
    normalizedAction: { intent: original.action, steps: [original.action], stoppedAtStep: 0, stopReason: "缺少执行条件" },
    outcome: { type: "action_not_allowed", summary: "缺少执行条件", reasons: ["没有对应物品"] },
  }) : reports(role);
  fake.session("main").prompt = async () => { assert.fail("拒绝行动不应写正文"); };
  fake.runtime.recordTurn = async () => { assert.fail("拒绝行动不应记录事实"); };
  const result = await fake.runtime.generateTurn(original, { onPrepared: () => assert.fail("拒绝行动不应准备提交") });
  assert.equal(result.rejected, true);
  assert.equal(result.prose, undefined);
  assert.deepEqual(result.piEntryIds, original.piEntryIds);
});

function addHelperSession(fake, role) {
  let listener = null;
  const session = {
    agent: { state: { messages: [] }, abort() {} },
    sessionManager: { getLeafId: () => null, resetLeaf() {}, buildSessionContext: () => ({ messages: [] }) },
    subscribe: (next) => { listener = next; return () => { listener = null; }; },
    prompt: async () => {},
    abort: async () => {},
    dispose() {},
    emit: (event) => listener?.(event),
  };
  fake.runtime.sessions.set(role, session);
  return session;
}

test("遥测记录每个 Agent 的 token、自动重试、校验失败与首字时间", async () => {
  const { TurnTelemetry } = await import("../src/turn-telemetry.js");
  const fake = runtimeWithFakeSessions();
  fake.runtime.telemetry = new TurnTelemetry();
  const session = fake.session("environment");
  const listeners = new Set();
  session.subscribe = (next) => { listeners.add(next); return () => listeners.delete(next); };
  const emit = (event) => { for (const listener of listeners) listener(event); };
  session.prompt = async () => {
    emit({ type: "auto_retry_start", attempt: 1 });
    emit({ type: "message_update", assistantMessageEvent: { type: "toolcall_delta" } });
    emit({ type: "tool_execution_end", toolName: "submit_environment_analysis", isError: true, result: { content: [{ type: "text", text: "校验失败：地点不存在：nowhere" }] } });
    emit({ type: "message_end", message: { role: "assistant", model: "m-1", stopReason: "toolUse", usage: { input: 1200, output: 300, cacheRead: 800, cacheWrite: 0, totalTokens: 2300, cost: { total: 0.002 } } } });
    fake.runtime.pendingReports.set("environment", reports("environment"));
  };
  const progress = [];
  await fake.runtime.requestStructured("environment", "提交结果", { onProgress: (item) => progress.push(item.status) });
  const [call] = fake.runtime.telemetry.toJSON().calls;
  assert.equal(call.role, "environment");
  assert.equal(call.usage.totalTokens, 2300);
  assert.equal(call.usage.cacheRead, 800);
  assert.equal(call.autoRetries, 1);
  assert.equal(call.toolFailures, 1);
  assert.match(call.validationErrors[0], /地点不存在/);
  assert.equal(call.outcome, "ok");
  assert.equal(call.model, "m-1");
  assert.notEqual(call.firstTokenMs, null);
  assert.deepEqual(progress, ["started", "retrying", "done"]);
});

test("等待期感官描写只放行安全文本：秘密、内部 ID 与人物私有动机都被拦下", async () => {
  const { playerSafeText } = await import("../src/pi-story-runtime.js");
  const state = createInitialState(storyPackage);
  const safe = { state, storyPackage, privateReasons: ["他担心家族已经锁定了旅馆的位置"] };
  assert.equal(playerSafeText("走廊尽头的电梯叮了一声，又安静下来。", safe), "走廊尽头的电梯叮了一声，又安静下来。");
  assert.equal(playerSafeText("赫尔佐格的影子出现在门外。", safe), null);
  assert.equal(playerSafeText("theme-hotel 的灯闪了一下。", safe), null);
  assert.equal(playerSafeText("他担心家族已经锁定了旅馆的位置，脸色发白。", safe), null);
  assert.equal(playerSafeText("x".repeat(90), safe), null);
});

test("回合推送感官描写、结果基调与 Agent 进度，结果事件不含选项", async () => {
  const fake = runtimeWithFakeSessions();
  fake.runtime.requestStructured = async (role, _prompt, { onProgress } = {}) => {
    onProgress?.({ role, status: "done" });
    if (role === "environment") return { ...reports(role), playerBeat: "窗外的雨忽然大了，玻璃上爬满水痕。" };
    if (role === "character") return { ...reports(role), playerBeat: "绘梨衣握紧了笔记本，抬头看你。", reactions: [] };
    return reports(role);
  };
  fake.session("main").prompt = async () => fake.session("main").emitText("你把窗帘拉上。");
  const beats = [];
  const outcomes = [];
  const progress = [];
  await fake.runtime.generateTurn(context(), { onBeat: (beat) => beats.push(beat), onOutcome: (outcome) => outcomes.push(outcome), onProgress: (item) => progress.push(item.role) });
  assert.deepEqual(new Set(beats.map((beat) => beat.role)), new Set(["environment", "character"]));
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].outcomeType, "success");
  assert.equal(Object.hasOwn(outcomes[0], "choices"), false);
  assert.deepEqual(new Set(progress), new Set(["plot", "character", "environment", "main"]));
});

test("瘦身上下文：情节只拿相关原著真相，正文不收到选项计划与记忆笔记", async () => {
  const fake = runtimeWithFakeSessions();
  fake.runtime.pipeline = { ...fake.runtime.pipeline, slimContext: true };
  const prompts = {};
  fake.runtime.requestStructured = async (role, prompt) => { prompts[role] = prompt; return reports(role); };
  let narration = "";
  fake.session("main").prompt = async (prompt) => { narration = prompt; fake.session("main").emitText("你收好药盒。"); };
  const full = runtimeWithFakeSessions();
  const fullPrompts = {};
  full.runtime.pipeline = { ...full.runtime.pipeline, slimContext: false };
  full.runtime.requestStructured = async (role, prompt) => { fullPrompts[role] = prompt; return reports(role); };
  full.session("main").prompt = async () => full.session("main").emitText("你收好药盒。");
  await fake.runtime.generateTurn(context());
  await full.runtime.generateTurn(context());
  assert.ok(prompts.plot.length < fullPrompts.plot.length);
  assert.ok(prompts.main.length < fullPrompts.main.length);
  assert.doesNotMatch(narration, /"choicePlan"|"memoryNotes"/);
  assert.match(prompts.main, /choicePlan/);
});

test("正文守卫：重复句与超长都会停在最后一句完整正文", async () => {
  const fake = runtimeWithFakeSessions();
  let aborted = 0;
  fake.session("main").agent.abort = () => { aborted += 1; };
  fake.session("main").prompt = async () => {
    fake.session("main").emitText("门外的脚步声停在了走廊尽头。");
    fake.session("main").emitText("你把药盒塞进外套内袋。");
    fake.session("main").emitText("门外的脚步声停在了走廊尽头。");
    fake.session("main").emitText("这句不该出现。");
  };
  const sentences = [];
  const { TurnTelemetry } = await import("../src/turn-telemetry.js");
  fake.runtime.telemetry = new TurnTelemetry();
  const prose = await fake.runtime.generateProse(context(), proposal(), () => {}, (sentence) => sentences.push(sentence));
  assert.equal(prose, "门外的脚步声停在了走廊尽头。你把药盒塞进外套内袋。");
  assert.equal(aborted, 1);
  assert.deepEqual(fake.runtime.telemetry.toJSON().quality.issues.map((issue) => issue.code), ["repeated_sentence"]);
});

test("模型把推理写进正文通道时整段滤除，不会推送给读者", async () => {
  const fake = runtimeWithFakeSessions();
  fake.session("main").prompt = async () => {
    for (const piece of ["<thi", "nking>Continue from: the phone buzzed.\nDraft:", " 你把手机扣下。</thin", "king>\n\n你把手机屏朝下", "扣在桌上。她没有抬头。<think>再想想</think>门外静了。"]) fake.session("main").emitText(piece);
  };
  const sentences = [];
  const { TurnTelemetry } = await import("../src/turn-telemetry.js");
  fake.runtime.telemetry = new TurnTelemetry();
  const prose = await fake.runtime.generateProse(context(), dramaticProposal(), () => {}, (sentence) => sentences.push(sentence));
  assert.equal(prose, "你把手机屏朝下扣在桌上。她没有抬头。门外静了。");
  assert.doesNotMatch(sentences.join(""), /Continue|Draft|think|再想想/);
  assert.ok(fake.runtime.telemetry.toJSON().quality.issues.some((issue) => issue.code === "reasoning_stripped"));
});

test("并行选项：主 Agent 不出选项，选项 Agent 与正文同时进行，失败时用确定性选项兜底", async () => {
  const { fallbackChoices } = await import("../src/pi-story-runtime.js");
  const { validateChoicePlan } = await import("../src/story-choice-policy.js");
  const fake = runtimeWithFakeSessions();
  fake.runtime.pipeline = { ...fake.runtime.pipeline, choices: "parallel" };
  addHelperSession(fake, "choices");
  const deferred = dramaticProposal({ choices: [], closingBeat: "电梯停在了这一层，门缝里漏进一道光。" });
  let narrationFinished = false;
  let choicesStartedAfterNarration = null;
  fake.runtime.requestStructured = async (role) => {
    if (role === "choices") {
      choicesStartedAfterNarration = narrationFinished;
      throw new Error("选项连续三次校验失败");
    }
    return role === "main" ? deferred : reports(role);
  };
  fake.session("main").prompt = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    fake.session("main").emitText("电梯门在这一层打开。");
    narrationFinished = true;
  };
  const persisted = [];
  const phases = [];
  const result = await fake.runtime.generateTurn(context(), { onChoices: (value) => persisted.push(value), onPhase: (phase) => phases.push(phase) });
  assert.equal(choicesStartedAfterNarration, false, "选项生成应与正文同时进行，而不是等正文写完");
  assert.equal(persisted[0].source, "fallback");
  assert.ok(result.proposal.choices.length >= 2);
  assert.ok(phases.includes("choosing"));
  const stateAfter = createInitialState(storyPackage);
  const fallback = fallbackChoices(stateAfter, storyPackage);
  assert.doesNotThrow(() => validateChoicePlan({ proposal: { ...proposal(), ...fallback }, stateAfter, storyPackage }));
  assert.ok(result.telemetry.quality.issues.some((issue) => issue.code === "fallback_choices"));
});

test("并行模式下主 Agent 若自带选项或缺少落点会被要求修正", () => {
  const fake = runtimeWithFakeSessions();
  fake.runtime.pipeline = { ...fake.runtime.pipeline, choices: "parallel" };
  fake.runtime.activeState = createInitialState(storyPackage);
  assert.throws(() => fake.runtime.validateMainProposal(dramaticProposal()), /choices 必须为空数组/);
  assert.throws(() => fake.runtime.validateMainProposal(dramaticProposal({ choices: [] })), /closingBeat/);
  assert.doesNotThrow(() => fake.runtime.validateMainProposal(dramaticProposal({ choices: [], closingBeat: "门外有人敲了三下。" })));
});

test("连续性记录员只记录正文里逐字存在的事实，并修正与正文矛盾的记忆笔记", async () => {
  const fake = runtimeWithFakeSessions({ recorder: "agent", recorderTimeoutMs: 1000 });
  addHelperSession(fake, "recorder");
  const turnProposal = dramaticProposal({ memoryNotes: ["绘梨衣答应了回家", "两人仍在旅馆"] });
  const record = {
    entries: [{ kind: "dialogue", text: "绘梨衣把本子推回给玩家，没有表态", quote: "她把本子推回给你", characterIds: ["erii"], knownByIds: ["erii"], importance: 2 }],
    openLoops: [{ kind: "question", text: "绘梨衣还没有回答要不要回家", ownerIds: ["erii"], quote: "没有回答" }],
    dropMemoryNoteIndexes: [0],
  };
  let recorderPrompt = "";
  fake.runtime.requestStructured = async (role, prompt) => {
    if (role === "recorder") {
      recorderPrompt = prompt;
      assert.throws(() => validateTurnRecord({ ...record, entries: [{ ...record.entries[0], quote: "她答应了回家" }] }, fake.runtime.activeRecord), /quote 不在正文中/);
      return record;
    }
    return role === "main" ? turnProposal : reports(role);
  };
  fake.session("main").prompt = async () => fake.session("main").emitText("她把本子推回给你，没有回答。");
  const result = await fake.runtime.generateTurn(context());
  assert.match(recorderPrompt, /<published_prose>\n她把本子推回给你，没有回答。/);
  assert.equal(result.record.source, "agent");
  assert.deepEqual(result.proposal.memoryNotes, ["两人仍在旅馆"]);
  assert.equal(result.telemetry.record.entries, 1);
  assert.equal(result.telemetry.record.openedLoops, 1);
  assert.deepEqual(result.proposal.delta, turnProposal.delta);
});

test("记录员超时不阻塞提交，改用只摘录原文对白的确定性记录", async () => {
  const slow = runtimeWithFakeSessions({ recorder: "agent", recorderTimeoutMs: 1000 });
  addHelperSession(slow, "recorder");
  slow.runtime.requestStructured = async (role) => role === "recorder" ? new Promise(() => {}) : reports(role);
  slow.session("main").prompt = async () => slow.session("main").emitText("凯撒压低声音：「天亮前必须出发。」你没有立刻回答。");
  const started = Date.now();
  const result = await slow.runtime.generateTurn(context());
  assert.ok(Date.now() - started < 2500);
  assert.equal(result.record.source, "deterministic");
  assert.match(result.record.error, /超时/);
  assert.deepEqual(result.record.entries.map((entry) => entry.quote), ["天亮前必须出发。"]);
  assert.ok(result.telemetry.quality.issues.some((issue) => issue.code === "fallback_record"));
});

test("超长的 closingBeat 在句子边界截短，不再触发校验重试", async () => {
  const { prepareMainArguments } = await import("../src/pi-story-runtime.js");
  const long = "苏恩曦把时间轴推到你面前，红笔圈住最早那一通，楚子航的铅笔停在第二候选点上。".repeat(4);
  const prepared = prepareMainArguments(proposal({ closingBeat: long }));
  assert.ok([...prepared.closingBeat].length <= 120);
  assert.match(prepared.closingBeat, /。$/);
  const fake = runtimeWithFakeSessions();
  fake.runtime.activeState = createInitialState(storyPackage);
  const short = proposal({ closingBeat: "门外有人敲了三下。" });
  assert.equal(prepareMainArguments(short).closingBeat, "门外有人敲了三下。");
  assert.equal(prepareMainArguments(proposal()).closingBeat, undefined);
});
