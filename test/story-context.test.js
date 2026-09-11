import assert from "node:assert/strict";
import test from "node:test";
import { buildSharedContext } from "../src/story-context.js";
import { createInitialState } from "../src/story-engine.js";
import { packageById } from "./helpers.js";

const storyPackage = await packageById();

test("共享信息层保留完整状态并按玩家行动筛选领域上下文", () => {
  const state = createInitialState(storyPackage);
  const player = state.characters[storyPackage.playerCharacterId];
  const nearby = Object.values(state.characters).find((character) => character.id !== player.id && character.locationId === state.locationId);
  const context = buildSharedContext({
    action: `我和${nearby.name}检查手边的治疗记录`,
    state,
    recentEvents: [{ action: "观察", prose: "有人把记录放在桌边。", choices: [] }],
    storyPackage,
    branchMemory: "上一回合留下了一份待核对的记录。",
    characterMemories: { [nearby.id]: "他曾经隐瞒过一条线索。" },
    environmentMemory: "桌面有未收走的文件。",
  });

  assert.equal(context.version, 1);
  assert.equal(context.worldState.locationId, state.locationId);
  assert.equal(context.worldState.characters.length, Object.keys(state.characters).length);
  assert.ok(context.relevant.characterIds.includes(player.id));
  assert.ok(context.relevant.characterIds.includes(nearby.id));
  assert.equal(context.domainContexts.character.characters.find((item) => item.id === nearby.id).memory, "他曾经隐瞒过一条线索。");
  assert.equal(context.domainContexts.plot.branchMemory, "上一回合留下了一份待核对的记录。");
  assert.equal(context.domainContexts.environment.memory, "桌面有未收走的文件。");
  assert.deepEqual(context.candidateChanges, []);
});

test("共享信息层把人物关系图作为支撑数据提供，但不替主创提交变化", () => {
  const state = createInitialState(storyPackage);
  const context = buildSharedContext({ action: "和绘梨衣说话", state, storyPackage });
  assert.ok(Array.isArray(context.domainContexts.character.relationshipGraph.nodes));
  assert.ok(Array.isArray(context.domainContexts.character.relationshipGraph.edges));
  assert.deepEqual(context.candidateChanges, []);
});

