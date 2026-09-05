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
