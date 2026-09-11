import assert from "node:assert/strict";
import test from "node:test";
import { choiceContext, validateChoicePlan } from "../src/story-choice-policy.js";
import { createInitialState, applyTurnProposal } from "../src/story-engine.js";
import { createInitialStore, appendTurn, serializeStore } from "../src/story-domain.js";
import { packageById, proposal, ending } from "./helpers.js";

const storyPackage = await packageById();
const makeState = () => createInitialState(storyPackage);
function decisiveProposal() {
  return proposal({
    choices: [
      { id: "verify", label: "核对药源", action: "我把剩余药物的批号发给凯撒，请他独立核对来源，暂时承担联络可能暴露位置的风险。" },
      { id: "negotiate", label: "把条件说清", action: "我联系凯撒，明确只有绘梨衣同意且药物能够核验，才接受他的撤离安排。" },
    ],
    choicePlan: [
      { choiceId: "verify", targetKind: "thread", targetId: "serum-thread", approach: "investigate", expectedChange: "独立核验药物来源，为是否采用现有治疗方案提供证据。", risk: "联络可能暴露位置，也会消耗剩余时间。" },
      { choiceId: "negotiate", targetKind: "thread", targetId: "trust-thread", approach: "confront", expectedChange: "要求凯撒明确撤离条件和药物保证，使合作立场落实为行动。", risk: "凯撒可能拒绝条件，撤离窗口可能缩短。" },
    ],
  });
}
function validate(turn, stateAfter = makeState(), recentEvents = []) {
  return validateChoicePlan({ proposal: turn, stateAfter, storyPackage, recentEvents });
}

test("接受有明确目标、不同手段和实际代价的选项，不把计划强制写入状态", () => {
  const state = makeState();
  const before = structuredClone(state);
  assert.doesNotThrow(() => validate(decisiveProposal(), state));
  assert.deepEqual(state, before);
});

test("截图中的日常选项不能在缺少推进计划时通过", () => {
  assert.throws(() => validate(proposal({ choices: [
    { id: "breakfast", label: "窗边吃早餐", action: "我陪绘梨衣在窗边吃早餐。" },
    { id: "quiet", label: "安静待一会儿", action: "我陪绘梨衣安静待一会儿。" },
  ] })), /推进目标/);
});

test("拒绝不同标题下的同一行动，以及近期刚执行过的行动", () => {
  const turn = decisiveProposal();
  turn.choices[1].action = turn.choices[0].action;
  assert.throws(() => validate(turn), /重复同一个行动/);
  assert.throws(() => validate(decisiveProposal(), makeState(), [{ action: decisiveProposal().choices[0].action }]), /近期已经执行/);
});

test("不能只换标题和顺序来重复上一整组选项", () => {
  const previous = decisiveProposal().choices.toReversed().map(choice => ({ ...choice, label: "换一个标题" }));
  assert.throws(() => validate(decisiveProposal(), makeState(), [{ action: "吃早餐", choices: previous }]), /整组推荐行动/);
});

test("校验回合结束后的目标状态，拒绝已解决线索和完成目标", () => {
  const turn = decisiveProposal();
  const state = makeState();
  state.threads["serum-thread"].status = "resolved";
  assert.throws(() => validate(turn, state), /仍未解决/);
  const other = makeState();
  const goalId = storyPackage.stages[0].goals[0].id;
  other.storyProgress.stages[0].completedGoalIds.push(goalId);
  turn.choicePlan[0].targetKind = "goal";
  turn.choicePlan[0].targetId = goalId;
  assert.throws(() => validate(turn, other), /仍未解决/);
});

test("选项不能以隐藏线索为目标，设计上下文只列出玩家已知事实", () => {
  const turn = decisiveProposal();
  turn.choicePlan[0].targetId = "white-king-thread";
  assert.throws(() => validate(turn), /仍未解决/);
  const context = choiceContext(makeState(), storyPackage);
  assert.ok(!context.knownFacts.some(fact => fact.id === "white-king-vessel"));
  assert.ok(!context.openThreads.some(thread => thread.id === "white-king-thread"));
});

test("每个选项都要有独立推进计划，至少两种行动方式", () => {
  const missing = decisiveProposal();
  missing.choicePlan[1].choiceId = missing.choicePlan[0].choiceId;
  assert.throws(() => validate(missing), /逐项对应/);
  const same = decisiveProposal();
  same.choicePlan[1].approach = same.choicePlan[0].approach;
  assert.throws(() => validate(same), /两种不同/);
});

test("最终目标完成后拒绝尾声循环，接受正式结构化结局", () => {
  const state = makeState();
  const final = state.storyProgress.stages.at(-1);
  state.storyProgress.currentStageId = final.id;
  final.status = "completed";
  final.completedGoalIds = storyPackage.stages.at(-1).goals.map(goal => goal.id);
  final.evidence = [{ type: "completed", text: "结局已发生，但旧存档没有提交ending。" }];
  assert.throws(() => validate(decisiveProposal(), state), /最终阶段已经完成/);
  const settled = proposal({ choices: [], ending: ending("deviation"), storyProgress: { completeGoalIds: final.completedGoalIds, evidence: "不得重复计入的完成记录。" } });
  assert.doesNotThrow(() => validate(settled, state));
  const after = applyTurnProposal(state, settled, storyPackage);
  assert.equal(after.status, "ended");
  assert.deepEqual(after.storyProgress.stages.at(-1).evidence, final.evidence);
});

test("内部推进计划不会随公开选项发送给浏览器", () => {
  const store = createInitialStore(storyPackage);
  appendTurn(store, { branchId: "main", eventId: "choice-policy-turn", action: "核对治疗安排", prose: "你展开药物记录，准备核对来源。", proposal: decisiveProposal(), storyPackage });
  const publicEvent = serializeStore(store, storyPackage).events.at(-1);
  assert.deepEqual(publicEvent.choices, decisiveProposal().choices);
  assert.doesNotMatch(JSON.stringify(publicEvent), /choicePlan|expectedChange|targetKind/);
});
