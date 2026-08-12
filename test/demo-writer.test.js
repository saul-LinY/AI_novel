import assert from "node:assert/strict";
import test from "node:test";
import { createDemoTurn } from "../src/demo-writer.js";
import { applyTurnProposal, createInitialState } from "../src/story-domain.js";

function advance(state, action) {
  const turn = createDemoTurn({ action, state });
  return { turn, state: applyTurnProposal(state, turn.proposal) };
}

function choose(state, choiceId, action = choiceId) {
  const turn = createDemoTurn({ action, choiceId, state });
  return { turn, state: applyTurnProposal(state, turn.proposal) };
}

test("询问 207 会得到回答，不会被误判成上二楼", () => {
  const { turn, state } = advance(createInitialState(), "我问林秋，207 号房的住客去了哪里。");

  assert.match(turn.prose, /林秋/);
  assert.match(turn.prose, /钥匙|退房/);
  assert.doesNotMatch(turn.prose, /楼梯每响一声/);
  assert.equal(state.locationId, "lobby");
});

test("检查 207 房门会推进门内情节，不会重复上楼描写", () => {
  const upstairs = advance(createInitialState(), "我没有继续追问，沿楼梯走向二楼。");
  const door = advance(upstairs.state, "我先检查 207 号房的门锁和门缝。");

  assert.match(door.turn.prose, /锁孔|门缝|门内/);
  assert.notEqual(door.turn.prose, upstairs.turn.prose);
  assert.equal(door.state.locationId, "upstairs");
  assert.equal(door.state.inventory["torn-receipt"], 1);
});

test("截图中的连续行动会产生三个不同后果并抵达内院", () => {
  const upstairs = advance(createInitialState(), "我直接上二楼。");
  const listened = advance(upstairs.state, "我关掉手机屏幕，站在原地听走廊里的声音。");
  const watched = advance(listened.state, "我没有移动，只观察林秋听见声音后的反应。");
  const checked = advance(watched.state, "我立刻绕到雨棚后，查看刚才的金属碰撞声。");

  assert.equal(new Set([listened.turn.prose, watched.turn.prose, checked.turn.prose]).size, 3);
  assert.match(listened.turn.prose, /安全门|铁梯/);
  assert.match(watched.turn.prose, /电话/);
  assert.match(checked.turn.prose, /赵山|旧铁梯/);
  assert.equal(checked.state.locationId, "courtyard");
  assert.ok(checked.state.knownFactIds.includes("courtyard-route"));
});

test("建议选项使用 choiceId 路由，不会把后办公室行动送进通用兜底", () => {
  const courtyard = advance(createInitialState(), "我去雨棚后的内院查看铁梯。");
  const guard = choose(courtyard.state, "question-guard", "我问赵山刚才是谁使用铁梯。");
  const office = choose(guard.state, "enter-office", "我返回大堂寻找后办公室的入口。");

  assert.match(office.turn.prose, /办公室|登记页|电话副机/);
  assert.doesNotMatch(office.turn.prose, /你开始执行自己的打算/);
  assert.equal(office.state.locationId, "office");
});

test("关键建议节点都有专用结果，不会连续复用同一组选项", () => {
  const state = createInitialState();
  const choiceIds = [
    "question-key",
    "inspect-key",
    "speak-through-door",
    "inspect-phone",
    "confront-signal",
    "feint-courtyard",
    "inspect-ladder",
    "climb-ladder",
    "ask-power",
    "inspect-ledger",
    "press-guard",
    "compare-oil",
    "enter-office",
  ];
  const turns = choiceIds.map((choiceId) => createDemoTurn({ action: choiceId, choiceId, state }));
  const prose = new Set(turns.map((turn) => turn.prose));
  const choiceSets = new Set(
    turns.map((turn) => turn.proposal.choices.map((choice) => `${choice.label}:${choice.action}`).sort().join("|")),
  );

  assert.equal(prose.size, choiceIds.length);
  assert.equal(choiceSets.size, choiceIds.length);
  assert.ok(turns.every((turn) => !turn.prose.startsWith("你开始执行自己的打算")));
});
