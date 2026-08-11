import assert from "node:assert/strict";
import test from "node:test";
import {
  appendTurn,
  applyTurnProposal,
  createBranch,
  createInitialState,
  createInitialStore,
  serializeStore,
} from "../src/story-domain.js";

const proposal = {
  choices: [
    { id: "one", label: "继续调查", action: "我继续调查前台。" },
    { id: "two", label: "上楼查看", action: "我走上二楼。" },
  ],
  delta: {
    timeAdvanceMinutes: 7,
    addItemIds: ["room-207-key"],
    learnFactIds: ["missing-key"],
    relationshipChanges: [{ characterId: "lin-qiu", amount: -1, reason: "发现钥匙" }],
  },
  memoryNotes: ["钥匙藏在前台"],
};

test("合法状态变化会生成新版本且不改动旧状态", () => {
  const initial = createInitialState();
  const next = applyTurnProposal(initial, proposal);

  assert.equal(initial.version, 0);
  assert.equal(initial.inventory["room-207-key"], undefined);
  assert.equal(next.version, 1);
  assert.equal(next.timeMinutes, initial.timeMinutes + 7);
  assert.equal(next.inventory["room-207-key"], 1);
  assert.deepEqual(next.knownFactIds, ["missing-key"]);
  assert.equal(next.characters["lin-qiu"].attitude, -1);
});

test("非法状态变化会被拒绝", () => {
  const initial = createInitialState();
  assert.throws(
    () => applyTurnProposal(initial, { delta: { removeItemIds: ["room-207-key"] } }),
    /无法移除未持有的物品/,
  );
  assert.throws(
    () => applyTurnProposal(initial, { delta: { locationId: "unknown-place" } }),
    /地点不存在/,
  );
  assert.throws(
    () => applyTurnProposal(initial, { delta: { timeAdvanceMinutes: 181 } }),
    /时间变化/,
  );
});

test("两个故事分支的状态互不污染", () => {
  const store = createInitialStore();
  const openingId = store.branches.main.headEventId;
  appendTurn(store, {
    branchId: "main",
    action: "检查前台",
    prose: "你在前台找到了钥匙。",
    proposal,
  });

  createBranch(store, openingId, "直接上楼");
  const branchId = store.currentBranchId;
  appendTurn(store, {
    branchId,
    action: "直接上楼",
    prose: "你绕过前台走上二楼。",
    proposal: {
      choices: proposal.choices,
      delta: { locationId: "upstairs", timeAdvanceMinutes: 3 },
    },
  });

  const mainState = store.events[store.branches.main.headEventId].stateAfter;
  const branchState = store.events[store.branches[branchId].headEventId].stateAfter;
  assert.equal(mainState.inventory["room-207-key"], 1);
  assert.equal(mainState.locationId, "lobby");
  assert.equal(branchState.inventory["room-207-key"], undefined);
  assert.equal(branchState.locationId, "upstairs");
});

test("浏览器接口不会泄露隐藏真相和人物目标", () => {
  const store = createInitialStore();
  const output = JSON.stringify(serializeStore(store, "demo"));

  assert.doesNotMatch(output, /privateText/);
  assert.doesNotMatch(output, /207 号房钥匙在前台抽屉的夹层里/);
  assert.doesNotMatch(output, /确认来客是否值得信任/);
});
