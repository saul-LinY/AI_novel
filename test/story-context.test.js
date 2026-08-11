import assert from "node:assert/strict";
import test from "node:test";
import { compileTurnContext } from "../src/story-context.js";
import { createInitialState, createInitialStore } from "../src/story-domain.js";

test("上下文编译器只注入与行动相关的秘密", () => {
  const store = createInitialStore();
  const state = createInitialState();
  const opening = store.events[store.branches.main.headEventId];
  const result = compileTurnContext({
    action: "我查看门边的红伞。",
    state,
    recentEvents: [opening],
  });
  const payload = JSON.stringify(result.modelContext);

  assert.deepEqual(result.trace.discoveryCandidateIds, ["red-umbrella-owner"]);
  assert.match(payload, /林秋刻意把红伞留在显眼处/);
  assert.doesNotMatch(payload, /207 号房钥匙在前台抽屉的夹层里/);
  assert.doesNotMatch(payload, /停电发生在 23:17/);
  assert.doesNotMatch(payload, /阻止别人进入内院/);
  assert.equal(result.modelContext.state.characters.find((character) => character.id === "chen-mo").locationId, null);
  assert.equal(result.trace.selectedMemoryNoteCount, 2);
});

test("已知线索不会再次作为隐藏候选注入", () => {
  const state = createInitialState();
  state.knownFactIds.push("red-umbrella-owner");
  const result = compileTurnContext({
    action: "我再次查看红伞。",
    state,
    recentEvents: [],
  });

  assert.deepEqual(result.trace.discoveryCandidateIds, []);
  assert.deepEqual(result.modelContext.state.knownFacts.map((fact) => fact.id), ["red-umbrella-owner"]);
});
