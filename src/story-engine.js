import { Type } from "typebox";
import Schema from "typebox/schema";
import { CHOICE_PLAN_SCHEMA } from "./story-choice-policy.js";

const clone = (value) => structuredClone(value);
const referenceId = Type.String({ minLength: 1, maxLength: 120, pattern: "^[a-zA-Z0-9:_-]+$" });
const nonEmptyString = (maxLength = 500) => Type.String({ minLength: 1, maxLength });

export const OUTCOME_TYPES = [
  "success",
  "success_with_cost",
  "failure_with_gain",
  "failure",
  "action_not_allowed",
];

export const PLOT_AGENT_SCHEMA = Type.Object({
  currentNodeId: referenceId,
  recommendedNodeId: referenceId,
  causalChain: Type.Array(nonEmptyString(300), { minItems: 2, maxItems: 8 }),
  routeMode: Type.Union([Type.Literal("main"), Type.Literal("detour"), Type.Literal("deviation")]),
  shouldBlockCurrentNode: Type.Boolean(),
  rejoinTargetId: Type.Optional(referenceId),
  rejoinConditions: Type.Array(nonEmptyString(240), { maxItems: 6 }),
  forbiddenOutcomes: Type.Array(nonEmptyString(240), { maxItems: 8 }),
  memoryNotes: Type.Array(nonEmptyString(200), { maxItems: 6 }),
  candidateChanges: Type.Optional(Type.Array(Type.Object({
    kind: Type.Union([Type.Literal("branch_seed"), Type.Literal("causal_risk"), Type.Literal("route_change")]),
    description: nonEmptyString(300),
    evidence: nonEmptyString(240),
  }), { maxItems: 6 })),
});

export const CHARACTER_AGENT_SCHEMA = Type.Object({
  involvedCharacterIds: Type.Array(referenceId, { minItems: 1, maxItems: 12 }),
  reactions: Type.Array(Type.Object({
    characterId: referenceId,
    observableReaction: nonEmptyString(300),
    privateReason: nonEmptyString(300),
    currentIntent: nonEmptyString(240),
    knowledgeUsedFactIds: Type.Optional(Type.Array(referenceId, { maxItems: 8 })),
  }), { maxItems: 12 }),
  forbiddenBehaviors: Type.Array(nonEmptyString(240), { maxItems: 10 }),
  memoryNotes: Type.Array(Type.Object({ characterId: referenceId, note: nonEmptyString(240) }), { maxItems: 12 }),
  candidateChanges: Type.Optional(Type.Array(Type.Object({
    kind: Type.Union([Type.Literal("relationship"), Type.Literal("knowledge"), Type.Literal("emotion"), Type.Literal("memory")]),
    characterId: referenceId,
    targetCharacterId: Type.Optional(referenceId),
    description: nonEmptyString(300),
    evidence: nonEmptyString(240),
  }), { maxItems: 12 })),
});

export const ENVIRONMENT_AGENT_SCHEMA = Type.Object({
  locationId: referenceId,
  sceneStateId: referenceId,
  timeAdvanceMinutes: Type.Integer({ minimum: 0, maximum: 180 }),
  transitionReason: nonEmptyString(300),
  availableResources: Type.Array(nonEmptyString(180), { maxItems: 10 }),
  constraints: Type.Array(nonEmptyString(240), { minItems: 1, maxItems: 10 }),
  memoryNotes: Type.Array(nonEmptyString(200), { maxItems: 6 }),
  candidateChanges: Type.Optional(Type.Array(Type.Object({
    kind: Type.Union([Type.Literal("movement"), Type.Literal("resource"), Type.Literal("access"), Type.Literal("scene_state"), Type.Literal("time")]),
    locationId: Type.Optional(referenceId),
    itemId: Type.Optional(referenceId),
    description: nonEmptyString(300),
    evidence: nonEmptyString(240),
  }), { maxItems: 10 })),
});

const generatedFactSchema = Type.Object({
  localId: referenceId,
  kind: Type.Union([Type.Literal("detail"), Type.Literal("clue")]),
  title: nonEmptyString(100),
  text: nonEmptyString(320),
  provenance: nonEmptyString(300),
  derivedFromFactIds: Type.Array(referenceId, { maxItems: 5 }),
  relatedCoreFactIds: Type.Array(referenceId, { minItems: 1, maxItems: 5 }),
  knownByCharacterIds: Type.Array(referenceId, { minItems: 1, maxItems: 8 }),
  carrierType: Type.Union([
    Type.Literal("observation"),
    Type.Literal("item"),
    Type.Literal("recording"),
    Type.Literal("document"),
    Type.Literal("testimony"),
  ]),
});

const generatedCharacterSchema = Type.Object({
  localId: referenceId,
  name: nonEmptyString(60),
  role: nonEmptyString(100),
  personality: nonEmptyString(240),
  goal: nonEmptyString(240),
  locationId: referenceId,
  knowledgeFactIds: Type.Array(referenceId, { maxItems: 8 }),
  provenance: nonEmptyString(300),
  knownToPlayer: Type.Boolean(),
});

const storyProgressSchema = Type.Object({
  completeGoalIds: Type.Optional(Type.Array(referenceId, { maxItems: 4 })),
  failCurrentStage: Type.Optional(Type.Boolean()),
  nextStageId: Type.Optional(referenceId),
  evidence: nonEmptyString(320),
  invalidatedRoutes: Type.Optional(Type.Array(nonEmptyString(200), { maxItems: 6 })),
  blockCurrentNode: Type.Optional(Type.Boolean()),
  nextNodeId: Type.Optional(referenceId),
  detourSummary: Type.Optional(nonEmptyString(320)),
  rejoinTargetId: Type.Optional(referenceId),
  rejoinConditions: Type.Optional(Type.Array(nonEmptyString(240), { maxItems: 6 })),
  clearDetour: Type.Optional(Type.Boolean()),
});

export const TURN_PROPOSAL_SCHEMA = Type.Object({
  normalizedAction: Type.Object({
    intent: nonEmptyString(300),
    steps: Type.Array(nonEmptyString(240), { minItems: 1, maxItems: 8 }),
    stoppedAtStep: Type.Integer({ minimum: 1, maximum: 8 }),
    stopReason: nonEmptyString(240),
  }),
  outcome: Type.Object({
    type: Type.Union(OUTCOME_TYPES.map((value) => Type.Literal(value))),
    summary: nonEmptyString(320),
    reasons: Type.Array(nonEmptyString(240), { minItems: 1, maxItems: 8 }),
  }),
  choices: Type.Array(
    Type.Object({
      id: referenceId,
      label: nonEmptyString(40),
      action: nonEmptyString(240),
    }),
    { maxItems: 4 },
  ),
  storyProgress: Type.Optional(storyProgressSchema),
  choicePlan: Type.Optional(CHOICE_PLAN_SCHEMA),
  delta: Type.Object({
    locationId: Type.Optional(referenceId),
    sceneStateId: Type.Optional(referenceId),
    timeAdvanceMinutes: Type.Optional(Type.Integer({ minimum: 0, maximum: 180 })),
    addItemIds: Type.Optional(Type.Array(referenceId, { maxItems: 5 })),
    removeItemIds: Type.Optional(Type.Array(referenceId, { maxItems: 5 })),
    learnFactIdsByCharacter: Type.Optional(
      Type.Array(
        Type.Object({
          characterId: referenceId,
          factIds: Type.Array(referenceId, { minItems: 1, maxItems: 8 }),
        }),
        { maxItems: 8 },
      ),
    ),
    relationshipChanges: Type.Optional(
      Type.Array(
        Type.Object({
          characterId: referenceId,
          targetCharacterId: Type.Optional(referenceId),
          amount: Type.Integer({ minimum: -2, maximum: 2 }),
          reason: nonEmptyString(160),
        }),
        { maxItems: 5 },
      ),
    ),
    characterUpdates: Type.Optional(
      Type.Array(
        Type.Object({
          characterId: referenceId,
          locationId: Type.Optional(referenceId),
          status: Type.Optional(
            Type.Union([
              Type.Literal("active"),
              Type.Literal("missing"),
              Type.Literal("injured"),
              Type.Literal("dead"),
              Type.Literal("departed"),
            ]),
          ),
          reason: nonEmptyString(200),
        }),
        { maxItems: 5 },
      ),
    ),
    threadUpdates: Type.Optional(
      Type.Array(
        Type.Object({
          threadId: referenceId,
          status: Type.Union([Type.Literal("open"), Type.Literal("resolved"), Type.Literal("failed")]),
          reason: nonEmptyString(200),
        }),
        { maxItems: 5 },
      ),
    ),
    generatedFacts: Type.Optional(Type.Array(generatedFactSchema, { maxItems: 4 })),
    generatedCharacters: Type.Optional(Type.Array(generatedCharacterSchema, { maxItems: 2 })),
  }),
  npcIntents: Type.Array(
    Type.Object({
      characterId: referenceId,
      intent: nonEmptyString(240),
      reason: nonEmptyString(240),
    }),
    { maxItems: 6 },
  ),
  ending: Type.Optional(
    Type.Object({
      type: Type.Union([
        Type.Literal("normal"),
        Type.Literal("failure"),
        Type.Literal("early"),
        Type.Literal("deviation"),
      ]),
      coreQuestionResponse: nonEmptyString(400),
      keyChoice: nonEmptyString(300),
      directConsequences: Type.Array(nonEmptyString(300), { minItems: 1, maxItems: 8 }),
      longTermConsequences: Type.Array(nonEmptyString(300), { minItems: 1, maxItems: 8 }),
      costs: Type.Array(nonEmptyString(300), { minItems: 1, maxItems: 8 }),
      resolvedQuestions: Type.Array(nonEmptyString(240), { maxItems: 8 }),
      unresolvedQuestions: Type.Array(nonEmptyString(240), { maxItems: 8 }),
    }),
  ),
  memoryNotes: Type.Array(nonEmptyString(200), { maxItems: 6 }),
  characterMemoryNotes: Type.Optional(Type.Array(Type.Object({
    characterId: referenceId,
    note: nonEmptyString(240),
  }), { maxItems: 12 })),
  environmentMemoryNotes: Type.Optional(Type.Array(nonEmptyString(200), { maxItems: 6 })),
});

const turnProposalValidator = Schema.Compile(TURN_PROPOSAL_SCHEMA);

function schemaError(validator, value, label) {
  const [valid, errors] = validator.Errors(value);
  if (valid) return;
  const summary = errors.slice(0, 4).map((error) => `${error.path || "/"}: ${error.message}`).join("；");
  throw new Error(`${label}结构不合法：${summary}`);
}

function mapById(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

export function createInitialState(storyPackage) {
  const inventory = Object.fromEntries(storyPackage.initialInventory.map((item) => [item.itemId, item.count]));
  const stages = storyPackage.stages.map((stage, index) => ({
    id: stage.id,
    status: index === 0 ? "active" : "pending",
    completedGoalIds: [],
    evidence: [],
  }));
  return {
    version: 0,
    status: "playing",
    timeMinutes: storyPackage.world.timeMinutes,
    locationId: storyPackage.world.locationId,
    sceneStateId: storyPackage.locations.find((location) => location.id === storyPackage.world.locationId)?.defaultStateId ?? "default",
    inventory,
    generatedFacts: {},
    relationshipGraph: {
      nodes: storyPackage.characters.map(({ id, name }) => ({ id, name })),
      edges: storyPackage.characters
        .filter((character) => character.id !== storyPackage.playerCharacterId && character.attitude !== 0)
        .map((character) => ({ from: character.id, to: storyPackage.playerCharacterId, type: "attitude", value: character.attitude })),
    },
    characters: Object.fromEntries(
      storyPackage.characters.map((character) => [
        character.id,
        {
          ...clone(character),
          generated: false,
        },
      ]),
    ),
    threads: Object.fromEntries(storyPackage.threads.map((thread) => [thread.id, clone(thread)])),
    storyProgress: {
      currentStageId: stages[0].id,
      stages,
      invalidatedRoutes: [],
      blockedNodeIds: [],
      route: {
        mode: "main",
        detourSummary: null,
        rejoinTargetId: null,
        rejoinConditions: [],
      },
    },
    ending: null,
  };
}

export function findKnowledgeGate(action, state, storyPackage) {
  const player = state.characters[storyPackage.playerCharacterId];
  const known = new Set(player.knowledgeFactIds);
  const normalized = action.toLocaleLowerCase("zh-CN");
  for (const fact of storyPackage.facts) {
    if (known.has(fact.id)) continue;
    for (const term of fact.knowledgeGateTerms ?? []) {
      if (normalized.includes(term.toLocaleLowerCase("zh-CN"))) {
        return { factId: fact.id, term };
      }
    }
  }
  return null;
}

function allFactIds(state, storyPackage) {
  return new Set([...storyPackage.facts.map((fact) => fact.id), ...Object.keys(state.generatedFacts)]);
}

function assertReference(ids, id, label) {
  if (!ids.has(id)) throw new Error(`${label}不存在：${id}`);
}

function goalStateSatisfied(goal, state, storyPackage) {
  const completion = goal.completion;
  const playerKnowledge = new Set(state.characters[storyPackage.playerCharacterId].knowledgeFactIds);
  if (completion.factIdsAny?.length && !completion.factIdsAny.some((id) => playerKnowledge.has(id))) return false;
  if (completion.factIdsAll?.length && !completion.factIdsAll.every((id) => playerKnowledge.has(id))) return false;
  if (
    completion.threadStatuses?.length &&
    !completion.threadStatuses.every((expected) => state.threads[expected.threadId]?.status === expected.status)
  ) {
    return false;
  }
  return true;
}

function activeStage(state, storyPackage) {
  const stage = storyPackage.stages.find((item) => item.id === state.storyProgress.currentStageId);
  const progress = state.storyProgress.stages.find((item) => item.id === state.storyProgress.currentStageId);
  if (!stage || !progress) throw new Error("当前故事阶段不存在");
  return { stage, progress };
}

function activateStage(state, storyPackage, targetId) {
  const targetIndex = storyPackage.stages.findIndex((stage) => stage.id === targetId);
  if (targetIndex < 0) throw new Error(`下一阶段不存在：${targetId}`);
  const currentIndex = storyPackage.stages.findIndex((stage) => stage.id === state.storyProgress.currentStageId);
  if (targetIndex <= currentIndex) throw new Error("故事阶段不能倒退");
  for (let index = currentIndex + 1; index < targetIndex; index += 1) {
    state.storyProgress.stages[index].status = "skipped";
  }
  state.storyProgress.stages[targetIndex].status = "active";
  state.storyProgress.currentStageId = targetId;
}

function applyStoryProgress(state, storyPackage, requestedProgress, ending) {
  const { stage, progress } = activeStage(state, storyPackage);
  // Older saves may already have a completed final stage without an ending.
  // Settling that ending must not append the same completion evidence again.
  if (progress.status === "completed") return;
  const evidence = requestedProgress?.evidence?.trim();

  const blockCurrentNode = requestedProgress?.blockCurrentNode || requestedProgress?.failCurrentStage;
  if (blockCurrentNode) {
    if (!evidence) throw new Error("阻止主干节点必须提供具体证据");
    progress.status = "blocked";
    progress.evidence.push({ type: "blocked", text: evidence });
    if (!state.storyProgress.blockedNodeIds.includes(stage.id)) state.storyProgress.blockedNodeIds.push(stage.id);
    for (const route of requestedProgress.invalidatedRoutes ?? []) {
      if (!state.storyProgress.invalidatedRoutes.includes(route)) state.storyProgress.invalidatedRoutes.push(route);
    }
    const nextNodeId = requestedProgress.nextNodeId ?? requestedProgress.nextStageId;
    if (nextNodeId) {
      if (!stage.compatibleRejoinNodeIds.includes(nextNodeId)) {
        throw new Error(`节点 ${stage.id} 不能接回不兼容节点：${nextNodeId}`);
      }
      if (!requestedProgress.detourSummary) throw new Error("替代路线必须说明它承载的因果");
      activateStage(state, storyPackage, nextNodeId);
      state.storyProgress.route = {
        mode: "detour",
        detourSummary: requestedProgress.detourSummary,
        rejoinTargetId: requestedProgress.rejoinTargetId ?? nextNodeId,
        rejoinConditions: [...(requestedProgress.rejoinConditions ?? [])],
      };
    } else if (!ending) {
      throw new Error("主干节点被阻止后必须接入兼容节点或进入结局");
    }
    return;
  }

  if (requestedProgress?.nextStageId || requestedProgress?.nextNodeId) throw new Error("只有节点被阻止时才能跳到后续节点");
  const requestedGoalIds = new Set(requestedProgress?.completeGoalIds ?? []);
  for (const goalId of requestedGoalIds) {
    if (!stage.goals.some((goal) => goal.id === goalId)) throw new Error(`目标不属于当前阶段：${goalId}`);
  }
  for (const goal of stage.goals) {
    if (!requestedGoalIds.has(goal.id)) continue;
    const stateSatisfied = goalStateSatisfied(goal, state, storyPackage);
    if (!stateSatisfied && goal.completion.evidenceAllowed !== true) {
      throw new Error(`阶段目标尚未满足：${goal.id}`);
    }
    if (!evidence) throw new Error("推进阶段必须提供具体证据");
    if (!progress.completedGoalIds.includes(goal.id)) progress.completedGoalIds.push(goal.id);
  }

  if (progress.completedGoalIds.length < stage.requiredGoalCount) return;
  progress.status = "completed";
  if (evidence) progress.evidence.push({ type: "completed", text: evidence });
  if (requestedProgress?.clearDetour || state.storyProgress.route.rejoinTargetId === stage.id) {
    state.storyProgress.route = { mode: "main", detourSummary: null, rejoinTargetId: null, rejoinConditions: [] };
  }
  const currentIndex = storyPackage.stages.findIndex((item) => item.id === stage.id);
  const nextStage = storyPackage.stages[currentIndex + 1];
  if (nextStage) {
    state.storyProgress.stages[currentIndex + 1].status = "active";
    state.storyProgress.currentStageId = nextStage.id;
  }
}

function applyEnding(state, proposal, storyPackage) {
  if (!proposal.ending) return;
  if (!storyPackage.ending.allowedTypes.includes(proposal.ending.type)) {
    throw new Error(`故事包不允许这种结局：${proposal.ending.type}`);
  }
  const consequenceIndex = storyPackage.stages.length - 1;
  const consequenceProgress = state.storyProgress.stages[consequenceIndex];
  if (proposal.ending.type === "normal" && consequenceProgress.status !== "completed") {
    throw new Error("正常结局只能在承担后果阶段完成后提交");
  }
  if (
    proposal.ending.type !== "normal" &&
    !proposal.storyProgress?.failCurrentStage &&
    !proposal.storyProgress?.blockCurrentNode &&
    !["active", "completed", "blocked"].includes(consequenceProgress.status)
  ) {
    throw new Error("提前或偏离结局必须由阶段失败或承担后果阶段触发");
  }
  state.status = "ended";
  state.ending = clone(proposal.ending);
}

function applyGeneratedContent(state, delta, storyPackage, eventId, recordedAtTimeMinutes) {
  const locationIds = new Set(storyPackage.locations.map((item) => item.id));
  const factsBefore = allFactIds(state, storyPackage);
  const coreFactIds = new Set(storyPackage.facts.filter((fact) => fact.kind === "core").map((fact) => fact.id));
  const characterIdsBefore = new Set(Object.keys(state.characters));
  const localIds = new Set();

  for (const fact of delta.generatedFacts ?? []) {
    if (localIds.has(fact.localId)) throw new Error(`本回合生成 ID 重复：${fact.localId}`);
    localIds.add(fact.localId);
    if (fact.kind === "clue" && fact.derivedFromFactIds.length === 0) {
      throw new Error("临时线索必须说明它来自哪些既有事实");
    }
    for (const factId of fact.derivedFromFactIds) assertReference(factsBefore, factId, "关联事实");
    for (const factId of fact.relatedCoreFactIds) assertReference(coreFactIds, factId, "关联核心事实");
    for (const characterId of fact.knownByCharacterIds) assertReference(characterIdsBefore, characterId, "知情人物");
    const id = `generated:${eventId}:${fact.localId}`;
    state.generatedFacts[id] = {
      id,
      kind: fact.kind,
      title: fact.title,
      text: fact.text,
      provenance: fact.provenance,
      derivedFromFactIds: [...fact.derivedFromFactIds],
      relatedCoreFactIds: [...fact.relatedCoreFactIds],
      carrierType: fact.carrierType,
      sourceEventId: eventId,
      recordedAtTimeMinutes,
    };
    for (const characterId of fact.knownByCharacterIds) {
      const character = state.characters[characterId];
      if (!character.knowledgeFactIds.includes(id)) character.knowledgeFactIds.push(id);
    }
  }

  for (const character of delta.generatedCharacters ?? []) {
    if (localIds.has(character.localId)) throw new Error(`本回合生成 ID 重复：${character.localId}`);
    localIds.add(character.localId);
    assertReference(locationIds, character.locationId, "次要人物地点");
    for (const factId of character.knowledgeFactIds) assertReference(factsBefore, factId, "次要人物知识");
    const id = `generated:${eventId}:${character.localId}`;
    state.characters[id] = {
      id,
      name: character.name,
      role: character.role,
      personality: character.personality,
      goal: character.goal,
      locationId: character.locationId,
      status: "active",
      attitude: 0,
      knowledgeFactIds: [...character.knowledgeFactIds],
      knownToPlayer: character.knownToPlayer,
      generated: true,
      provenance: character.provenance,
      sourceEventId: eventId,
      introducedAtTimeMinutes: recordedAtTimeMinutes,
    };
    state.relationshipGraph ??= { nodes: [], edges: [] };
    state.relationshipGraph.nodes.push({ id, name: character.name });
  }
}

export function isRejectedProposal(proposal) {
  return proposal.outcome.type === "action_not_allowed";
}

export function applyTurnProposal(currentState, proposal, storyPackage, eventId = "preview") {
  schemaError(turnProposalValidator, proposal, "回合提案");
  if (proposal.delta.storyProgress !== undefined) throw new Error("storyProgress 必须是提案顶层字段，不能放进 delta");
  if (currentState.status !== "playing") throw new Error("故事已经结束");
  if (proposal.normalizedAction.stoppedAtStep > proposal.normalizedAction.steps.length) {
    throw new Error("行动停止位置超出计划步骤");
  }
  if (new Set(proposal.choices.map((choice) => choice.id)).size !== proposal.choices.length) {
    throw new Error("建议行动 ID 不能重复");
  }

  if (isRejectedProposal(proposal)) {
    if (proposal.choices.length > 0 || Object.keys(proposal.delta).length > 0 || proposal.storyProgress || proposal.ending) {
      throw new Error("不成立的行动不能携带状态变化、选项、阶段变化或结局");
    }
    return clone(currentState);
  }

  if (proposal.ending) {
    if (proposal.choices.length !== 0) throw new Error("结局回合不能继续提供行动选项");
  } else if (proposal.choices.length < 2 || proposal.choices.length > 4) {
    throw new Error("有效回合必须提供 2 到 4 个下一步选项");
  }

  if (proposal.outcome.type === "failure") {
    const delta = proposal.delta;
    const hasReward =
      (delta.addItemIds?.length ?? 0) > 0 ||
      (delta.learnFactIdsByCharacter?.length ?? 0) > 0 ||
      (delta.generatedFacts?.length ?? 0) > 0 ||
      (delta.generatedCharacters?.length ?? 0) > 0 ||
      (delta.relationshipChanges ?? []).some((change) => change.amount > 0) ||
      (delta.threadUpdates ?? []).some((update) => update.status === "resolved") ||
      (proposal.storyProgress?.completeGoalIds?.length ?? 0) > 0;
    if (hasReward) throw new Error("完全失败不能同时获得线索、物品、关系收益或阶段成果");
  }
  if (
    (proposal.storyProgress?.invalidatedRoutes?.length ?? 0) > 0 &&
    !proposal.storyProgress?.failCurrentStage &&
    !proposal.storyProgress?.blockCurrentNode
  ) {
    throw new Error("只有主干节点被阻止时才能登记失效路线");
  }

  const addedItems = new Set(proposal.delta.addItemIds ?? []);
  if ((proposal.delta.removeItemIds ?? []).some((itemId) => addedItems.has(itemId))) {
    throw new Error("同一回合不能同时获得和移除同一物品");
  }

  const next = clone(currentState);
  const delta = proposal.delta;
  const locationIds = new Set(storyPackage.locations.map((item) => item.id));
  const itemIds = new Set(storyPackage.items.map((item) => item.id));
  const threadIds = new Set(storyPackage.threads.map((item) => item.id));
  const characterIds = new Set(Object.keys(next.characters));

  for (const note of proposal.characterMemoryNotes ?? []) assertReference(characterIds, note.characterId, "人物记忆");

  const timeAdvanceMinutes = delta.timeAdvanceMinutes ?? 5;
  applyGeneratedContent(next, delta, storyPackage, eventId, next.timeMinutes + timeAdvanceMinutes);
  const factIds = allFactIds(next, storyPackage);

  if (delta.locationId !== undefined) {
    assertReference(locationIds, delta.locationId, "地点");
    next.locationId = delta.locationId;
    next.characters[storyPackage.playerCharacterId].locationId = delta.locationId;
  }
  if (delta.sceneStateId !== undefined) {
    const locationId = delta.locationId ?? next.locationId;
    const location = storyPackage.locations.find((item) => item.id === locationId);
    if (!location?.states.some((sceneState) => sceneState.id === delta.sceneStateId)) {
      throw new Error(`场景状态不存在：${locationId}/${delta.sceneStateId}`);
    }
    next.sceneStateId = delta.sceneStateId;
  } else if (delta.locationId !== undefined) {
    next.sceneStateId = storyPackage.locations.find((item) => item.id === delta.locationId)?.defaultStateId ?? "default";
  }

  next.timeMinutes += timeAdvanceMinutes;

  for (const itemId of delta.addItemIds ?? []) {
    assertReference(itemIds, itemId, "物品");
    next.inventory[itemId] = (next.inventory[itemId] ?? 0) + 1;
  }
  for (const itemId of delta.removeItemIds ?? []) {
    assertReference(itemIds, itemId, "物品");
    if (!next.inventory[itemId]) throw new Error(`无法移除未持有的物品：${itemId}`);
    next.inventory[itemId] -= 1;
    if (next.inventory[itemId] === 0) delete next.inventory[itemId];
  }

  for (const learning of delta.learnFactIdsByCharacter ?? []) {
    assertReference(characterIds, learning.characterId, "人物");
    for (const factId of learning.factIds) {
      assertReference(factIds, factId, "事实");
      const knowledge = next.characters[learning.characterId].knowledgeFactIds;
      if (!knowledge.includes(factId)) knowledge.push(factId);
    }
  }

  for (const change of delta.relationshipChanges ?? []) {
    assertReference(characterIds, change.characterId, "人物");
    if (change.targetCharacterId) assertReference(characterIds, change.targetCharacterId, "关系目标人物");
    const character = next.characters[change.characterId];
    if (!change.targetCharacterId || change.targetCharacterId === storyPackage.playerCharacterId) {
      character.attitude = Math.max(-5, Math.min(5, character.attitude + change.amount));
    }
    next.relationshipGraph ??= { nodes: Object.values(next.characters).map(({ id, name }) => ({ id, name })), edges: [] };
    const from = change.characterId;
    const to = change.targetCharacterId ?? storyPackage.playerCharacterId;
    const edge = next.relationshipGraph.edges.find((item) => item.from === from && item.to === to && item.type === "attitude");
    if (edge) edge.value = Math.max(-5, Math.min(5, edge.value + change.amount));
    else next.relationshipGraph.edges.push({ from, to, type: "attitude", value: change.amount });
  }

  for (const update of delta.characterUpdates ?? []) {
    assertReference(characterIds, update.characterId, "人物");
    const character = next.characters[update.characterId];
    if (character.status === "dead" && update.status !== undefined && update.status !== "dead") {
      throw new Error(`死亡状态不可逆：${update.characterId}`);
    }
    if (update.locationId !== undefined) {
      assertReference(locationIds, update.locationId, "人物地点");
      character.locationId = update.locationId;
    }
    if (update.status !== undefined) character.status = update.status;
  }

  for (const update of delta.threadUpdates ?? []) {
    assertReference(threadIds, update.threadId, "剧情问题");
    next.threads[update.threadId].status = update.status;
  }

  for (const intent of proposal.npcIntents) {
    assertReference(characterIds, intent.characterId, "NPC");
    if (intent.characterId === storyPackage.playerCharacterId) throw new Error("模型不能替玩家角色生成意图");
    if (next.characters[intent.characterId].status === "dead") throw new Error("死亡人物不能产生行动意图");
    next.characters[intent.characterId].currentIntent = intent.intent;
    next.characters[intent.characterId].intentReason = intent.reason;
  }

  applyStoryProgress(next, storyPackage, proposal.storyProgress, proposal.ending);
  applyEnding(next, proposal, storyPackage);
  next.version += 1;
  return next;
}

export function storyContextForModel(state, storyPackage) {
  const fixedFacts = storyPackage.facts.map((fact) => ({
    id: fact.id,
    kind: fact.kind,
    truth: fact.truth,
    revealText: fact.revealText,
  }));
  const stages = storyPackage.stages.map((stage) => {
    const progress = state.storyProgress.stages.find((item) => item.id === stage.id);
    return {
      id: stage.id,
      role: stage.role,
      title: stage.title,
      purpose: stage.purpose,
      requiredGoalCount: stage.requiredGoalCount,
      goals: stage.goals,
      status: progress.status,
      completedGoalIds: progress.completedGoalIds,
    };
  });
  return {
    story: {
      id: storyPackage.id,
      title: storyPackage.title,
      premise: storyPackage.premise,
      playerCharacterId: storyPackage.playerCharacterId,
      worldRules: storyPackage.world.rules,
      narration: storyPackage.narration,
      coreQuestion: storyPackage.stages.map((stage) => stage.purpose).join(" → "),
      ending: storyPackage.ending,
      foreshadows: storyPackage.foreshadows,
    },
    state: {
      status: state.status,
      timeMinutes: state.timeMinutes,
      locationId: state.locationId,
      inventory: state.inventory,
      fixedFacts,
      generatedFacts: Object.values(state.generatedFacts),
      characters: state.characters,
      threads: state.threads,
      stages,
      currentStageId: state.storyProgress.currentStageId,
      invalidatedRoutes: state.storyProgress.invalidatedRoutes,
    },
    catalogs: {
      locations: storyPackage.locations,
      items: storyPackage.items,
    },
  };
}
