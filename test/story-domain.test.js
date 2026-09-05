import assert from "node:assert/strict";
import test from "node:test";
import { appendTurn, createBranch, createInitialStore, serializeStore } from "../src/story-domain.js";
import {
  applyTurnProposal,
  createInitialState,
  findKnowledgeGate,
  OUTCOME_TYPES,
} from "../src/story-engine.js";
import { ending, packageById, proposal, rejectedProposal } from "./helpers.js";

const dragonRaja = await packageById();

test("合法状态增量生成新版本且不改动旧状态", () => {
  const initial = createInitialState(dragonRaja);
  const next = applyTurnProposal(
    initial,
    proposal({
      delta: {
        locationId: "tokyo-street",
        timeAdvanceMinutes: 7,
        addItemIds: ["serum-ampoule"],
        learnFactIdsByCharacter: [{ characterId: "lu-mingfei", factIds: ["tracking-ping"] }],
        relationshipChanges: [{ characterId: "erii", amount: -1, reason: "没有先说明联络风险" }],
      },
    }),
    dragonRaja,
    "turn-one",
  );

  assert.equal(initial.version, 0);
  assert.equal(initial.inventory["serum-ampoule"], undefined);
  assert.equal(initial.locationId, "theme-hotel");
  assert.equal(next.version, 1);
  assert.equal(next.timeMinutes, initial.timeMinutes + 7);
  assert.equal(next.inventory["serum-ampoule"], 1);
  assert.equal(next.locationId, "tokyo-street");
  assert.ok(next.characters["lu-mingfei"].knowledgeFactIds.includes("tracking-ping"));
  assert.equal(next.characters["erii"].attitude, initial.characters["erii"].attitude - 1);
});

test("知识门槛只拦截尚未获得的准确秘密", () => {
  const initial = createInitialState(dragonRaja);
  assert.deepEqual(findKnowledgeGate("我去找赫尔佐格", initial, dragonRaja), {
    factId: "white-king-vessel",
    term: "赫尔佐格",
  });

  const informed = applyTurnProposal(
    initial,
    proposal({
      delta: {
        learnFactIdsByCharacter: [{ characterId: "lu-mingfei", factIds: ["white-king-vessel"] }],
      },
    }),
    dragonRaja,
  );
  assert.equal(findKnowledgeGate("我去找赫尔佐格", informed, dragonRaja), null);
  assert.equal(findKnowledgeGate("我调查是谁修改了治疗记录", initial, dragonRaja), null);
});

test("NPC 知识不会自动变成玩家知识", () => {
  const initial = createInitialState(dragonRaja);
  const next = applyTurnProposal(
    initial,
    proposal({
      delta: {
        learnFactIdsByCharacter: [{ characterId: "gen-chisei", factIds: ["white-king-vessel"] }],
      },
    }),
    dragonRaja,
  );
  assert.ok(next.characters["gen-chisei"].knowledgeFactIds.includes("white-king-vessel"));
  assert.ok(!next.characters["lu-mingfei"].knowledgeFactIds.includes("white-king-vessel"));

  const store = createInitialStore(dragonRaja);
  store.events[store.branches.main.headEventId].stateAfter = next;
  assert.doesNotMatch(JSON.stringify(serializeStore(store, dragonRaja)), /承载白王之血的容器/);
});

test("生成事实带来历并永久锁定，核心事实没有运行时修改入口", () => {
  const initial = createInitialState(dragonRaja);
  const first = applyTurnProposal(
    initial,
    proposal({
      delta: {
        generatedFacts: [
          {
            localId: "signal-trace",
            kind: "clue",
            title: "联络残留",
            text: "加密手机留下了一次异常握手记录。",
            provenance: "角色检查手机通信记录",
            derivedFromFactIds: ["tracking-ping"],
            relatedCoreFactIds: ["family-search"],
            knownByCharacterIds: ["lu-mingfei"],
            carrierType: "observation",
          },
        ],
      },
    }),
    dragonRaja,
    "event-a",
  );
  const locked = structuredClone(first.generatedFacts["generated:event-a:signal-trace"]);
  const second = applyTurnProposal(first, proposal(), dragonRaja, "event-b");

  assert.deepEqual(second.generatedFacts[locked.id], locked);
  assert.equal(locked.sourceEventId, "event-a");
  assert.equal(locked.derivedFromFactIds[0], "tracking-ping");
  assert.deepEqual(locked.relatedCoreFactIds, ["family-search"]);
  assert.equal(locked.recordedAtTimeMinutes, initial.timeMinutes + 5);
  assert.equal(Object.hasOwn(second, "coreFacts"), false);
  assert.equal(dragonRaja.facts.find((fact) => fact.id === "family-search").truth.length > 0, true);

  assert.throws(
    () =>
      applyTurnProposal(
        initial,
        proposal({
          delta: {
            generatedFacts: [
              {
                localId: "bad-link",
                kind: "clue",
                title: "错误关联",
                text: "这条线索没有关联核心事实。",
                provenance: "现场观察",
                derivedFromFactIds: ["tracking-ping"],
                relatedCoreFactIds: ["tracking-ping"],
                knownByCharacterIds: ["lu-mingfei"],
                carrierType: "observation",
              },
            ],
          },
        }),
        dragonRaja,
      ),
    /关联核心事实不存在/,
  );
});

test("非法地点、时间、物品和死亡逆转都不改变原状态", () => {
  const initial = createInitialState(dragonRaja);
  const before = structuredClone(initial);
  assert.throws(
    () => applyTurnProposal(initial, proposal({ delta: { locationId: "unknown-place" } }), dragonRaja),
    /地点不存在/,
  );
  assert.throws(
    () => applyTurnProposal(initial, proposal({ delta: { timeAdvanceMinutes: 181 } }), dragonRaja),
    /结构不合法/,
  );
  assert.throws(
    () => applyTurnProposal(initial, proposal({ delta: { removeItemIds: ["serum-ampoule"] } }), dragonRaja),
    /无法移除未持有的物品/,
  );
  const dead = structuredClone(initial);
  dead.characters["erii"].status = "dead";
  assert.throws(
    () =>
      applyTurnProposal(
        dead,
        proposal({
          delta: {
            characterUpdates: [{ characterId: "erii", status: "active", reason: "重新出现" }],
          },
        }),
        dragonRaja,
      ),
    /死亡状态不可逆/,
  );
  assert.deepEqual(initial, before);
});

test("五类裁决都遵守各自的状态约束", () => {
  for (const type of OUTCOME_TYPES) {
    const candidate = type === "action_not_allowed"
      ? rejectedProposal()
      : proposal({ outcome: { type, summary: `结果为 ${type}`, reasons: ["确定性因果成立"] } });
    const next = applyTurnProposal(createInitialState(dragonRaja), candidate, dragonRaja, `event-${type}`);
    assert.equal(next.version, type === "action_not_allowed" ? 0 : 1);
  }

  assert.throws(
    () =>
      applyTurnProposal(
        createInitialState(dragonRaja),
        proposal({
          outcome: { type: "failure", summary: "没有成功", reasons: ["工具不足"] },
          delta: {
            learnFactIdsByCharacter: [{ characterId: "lu-mingfei", factIds: ["tracking-ping"] }],
          },
        }),
        dragonRaja,
      ),
    /完全失败不能同时获得/,
  );
});

test("长计划在第一个新选择点停止", () => {
  const next = applyTurnProposal(
    createInitialState(dragonRaja),
    proposal({
      normalizedAction: {
        steps: ["上楼", "检查房门", "闯入房间", "带走证物"],
        stoppedAtStep: 2,
        stopReason: "房门上锁，需要决定是否强行进入",
      },
    }),
    dragonRaja,
  );
  assert.equal(next.version, 1);
});

test("阶段可完成，也可失败并跳过中间阶段", () => {
  const completed = applyTurnProposal(
    createInitialState(dragonRaja),
    proposal({
      delta: {
        learnFactIdsByCharacter: [
          { characterId: "lu-mingfei", factIds: ["tracking-ping"] },
        ],
      },
      storyProgress: {
        completeGoalIds: ["find-immediate-risk"],
        evidence: "角色确认加密联络已经暴露了附近区域。",
      },
    }),
    dragonRaja,
  );
  assert.equal(completed.storyProgress.stages[0].status, "completed");
  assert.equal(completed.storyProgress.currentStageId, "own-the-choice");

  const skipped = applyTurnProposal(
    createInitialState(dragonRaja),
    proposal({
      storyProgress: {
        blockCurrentNode: true,
        nextNodeId: "pay-for-time",
        detourSummary: "原定调查被身体危机打断，先通过替代补给争取时间。",
        rejoinTargetId: "pay-for-time",
        evidence: "绘梨衣的身体急剧恶化，原定调查路线不可继续。",
        invalidatedRoutes: ["按原计划逐项调查治疗记录"],
      },
    }),
    dragonRaja,
  );
  assert.equal(skipped.storyProgress.stages[0].status, "blocked");
  assert.equal(skipped.storyProgress.stages[1].status, "skipped");
  assert.equal(skipped.storyProgress.stages[2].status, "active");
  assert.deepEqual(skipped.storyProgress.blockedNodeIds, ["see-countdown"]);
  assert.equal(skipped.storyProgress.route.mode, "detour");
});

test("四类结局都要求完整结算字段", () => {
  for (const type of ["failure", "early", "deviation"]) {
    const result = applyTurnProposal(
      createInitialState(dragonRaja),
      proposal({
        outcome: { type: "failure", summary: "原路线不可继续", reasons: ["不可逆变化已经发生"] },
        choices: [],
        storyProgress: {
          failCurrentStage: true,
          evidence: "关键关系已经不可逆地破裂。",
          invalidatedRoutes: ["按原计划完成东京撤离"],
        },
        ending: ending(type),
      }),
      dragonRaja,
    );
    assert.equal(result.ending.type, type);
    assert.equal(result.status, "ended");
  }

  let state = createInitialState(dragonRaja);
  for (const stage of dragonRaja.stages) {
    const isFinal = stage.role === "consequence";
    state = applyTurnProposal(
      state,
      proposal({
        ...(isFinal ? { choices: [], ending: ending("normal") } : {}),
        ...(["expose", "investigation"].includes(stage.role)
          ? {
              delta: {
                learnFactIdsByCharacter: [
                  { characterId: "lu-mingfei", factIds: [stage.role === "expose" ? "tracking-ping" : "medical-record-gap"] },
                ],
              },
            }
          : {}),
        storyProgress: {
          completeGoalIds: [stage.goals[0].id],
          evidence: `已完成阶段：${stage.title}`,
        },
      }),
      dragonRaja,
    );
  }
  assert.equal(state.ending.type, "normal");
  assert.throws(
    () =>
      applyTurnProposal(
        createInitialState(dragonRaja),
        proposal({ choices: [], ending: { type: "early" } }),
        dragonRaja,
      ),
    /结构不合法/,
  );
});

test("拒绝提案不写事件，两个分支状态互不污染", () => {
  const store = createInitialStore(dragonRaja);
  const openingId = store.branches.main.headEventId;
  assert.throws(
    () =>
      appendTurn(store, {
        branchId: "main",
        action: "让绘梨衣立刻回家",
        prose: "不应保存",
        proposal: rejectedProposal(),
        storyPackage: dragonRaja,
      }),
    /不能写入故事事件/,
  );
  assert.equal(store.branches.main.eventIds.length, 1);

  appendTurn(store, {
    branchId: "main",
    action: "检查药盒",
    prose: "你检查了桌上的药盒。",
    proposal: proposal({ delta: { addItemIds: ["serum-ampoule"] } }),
    storyPackage: dragonRaja,
  });
  createBranch(store, openingId, "离开旅馆");
  const branchId = store.currentBranchId;
  appendTurn(store, {
    branchId,
    action: "离开旅馆",
    prose: "你走进清晨的东京街区。",
    proposal: proposal({ delta: { locationId: "tokyo-street" } }),
    storyPackage: dragonRaja,
  });

  const mainState = store.events[store.branches.main.headEventId].stateAfter;
  const branchState = store.events[store.branches[branchId].headEventId].stateAfter;
  assert.equal(mainState.inventory["serum-ampoule"], 1);
  assert.equal(mainState.locationId, "theme-hotel");
  assert.equal(branchState.inventory["serum-ampoule"], undefined);
  assert.equal(branchState.locationId, "tokyo-street");
  assert.notEqual(store.branches.main.memory, store.branches[branchId].memory);
});

test("场景状态随地点切换，人物记忆只写入当前分支", () => {
  const store = createInitialStore(dragonRaja);
  const openingId = store.branches.main.headEventId;
  appendTurn(store, {
    branchId: "main",
    action: "走进雨后的街区",
    prose: "你推门走进雨后的东京。",
    proposal: proposal({
      delta: { locationId: "tokyo-street", sceneStateId: "default" },
      characterMemoryNotes: [{ characterId: "erii", note: "玩家在离开旅馆前确认了她愿意同行。" }],
      environmentMemoryNotes: ["旅馆房门已经从外侧锁好。"],
    }),
    storyPackage: dragonRaja,
  });
  const mainHead = store.events[store.branches.main.headEventId];
  assert.equal(mainHead.stateAfter.sceneStateId, "default");
  assert.match(store.branches.main.characterMemories.erii, /愿意同行/);

  createBranch(store, openingId, "留在旅馆");
  assert.equal(store.branches[store.currentBranchId].characterMemories.erii, undefined);
});

test("浏览器序列化不泄露核心事实、NPC 目标、知识和未知位置", () => {
  const store = createInitialStore(dragonRaja);
  const output = JSON.stringify(serializeStore(store, dragonRaja));

  assert.doesNotMatch(output, /承载白王之血的容器/);
  assert.doesNotMatch(output, /找回妹妹、恢复治疗/);
  assert.doesNotMatch(output, /knowledgeFactIds/);
  assert.doesNotMatch(output, /storyProgress/);
  assert.doesNotMatch(output, /packagePath/);
  assert.doesNotMatch(output, /赫尔佐格/);
  assert.match(output, /绘梨衣/);
  assert.match(output, /scene/);
});
