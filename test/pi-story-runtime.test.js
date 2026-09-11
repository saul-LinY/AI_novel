import assert from "node:assert/strict";
import test from "node:test";
import { PiStoryRuntime } from "../src/pi-story-runtime.js";
import { createInitialState } from "../src/story-engine.js";
import { packageById, projectRoot, proposal } from "./helpers.js";

const storyPackage = await packageById();
const roles = ["main", "plot", "character", "environment"];

function runtimeWithFakeSessions() {
  const runtime = new PiStoryRuntime({ projectRoot, dataDir: "/tmp", storyPackage });
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
  return proposal();
}

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
  assert.deepEqual(phases, ["analyzing", "synthesizing", "narrating"]);
  assert.equal(phases.includes("reviewing"), false);
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
