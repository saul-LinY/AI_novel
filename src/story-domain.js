import { createHash, randomUUID } from "node:crypto";
import { applyTurnProposal, createInitialState, isRejectedProposal } from "./story-engine.js";
import { publicStoryMetadata } from "./story-package.js";

export function formatStoryTime(timeMinutes) {
  const normalized = ((timeMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function createInitialStore(storyPackage) {
  const initialState = createInitialState(storyPackage);
  const openingEventId = randomUUID();
  return {
    schemaVersion: 4,
    story: {
      ...publicStoryMetadata(storyPackage),
      packageVersion: storyPackage.version,
      packageHash: storyPackage.packageHash,
      roleSelectionRequired: Boolean(storyPackage.playableRoles),
      selectedPlayerCharacterId: storyPackage.selectedPlayerCharacterId ?? null,
      createdAt: new Date().toISOString(),
      piSessionFiles: {},
    },
    currentBranchId: "main",
    branches: {
      main: {
        id: "main",
        name: "主线",
        parentBranchId: null,
        forkEventId: null,
        eventIds: [openingEventId],
        headEventId: openingEventId,
        memory: "尚未开始正式互动。",
        characterMemories: {},
        environmentMemory: "",
        createdAt: new Date().toISOString(),
      },
    },
    events: {
      [openingEventId]: {
        id: openingEventId,
        type: "opening",
        branchId: "main",
        parentEventId: null,
        action: storyPackage.opening.action,
        prose: storyPackage.opening.prose,
        choices: structuredClone(storyPackage.opening.choices),
        stateAfter: initialState,
        turnResult: null,
        piEntryIds: {},
        createdAt: new Date().toISOString(),
      },
    },
  };
}

export function appendTurn(
  store,
  {
    branchId,
    eventId = randomUUID(),
    expectedParentEventId,
    action,
    prose,
    proposal,
    piEntryIds = {},
    agentReports = null,
    storyPackage,
  },
) {
  if (isRejectedProposal(proposal)) throw new Error("不成立的行动不能写入故事事件");
  const branch = store.branches[branchId];
  if (!branch) throw new Error(`分支不存在：${branchId}`);
  if (expectedParentEventId && branch.headEventId !== expectedParentEventId) {
    throw new Error("故事分支在生成期间已经变化");
  }
  const parentEvent = store.events[branch.headEventId];
  const nextState = applyTurnProposal(parentEvent.stateAfter, proposal, storyPackage, eventId);
  const event = {
    id: eventId,
    type: "turn",
    branchId,
    parentEventId: parentEvent.id,
    action,
    prose: prose.trim(),
    choices: structuredClone(proposal.choices),
    stateAfter: nextState,
    turnResult: structuredClone(proposal),
    piEntryIds: structuredClone(piEntryIds),
    agentReports: agentReports ? structuredClone(agentReports) : null,
    createdAt: new Date().toISOString(),
  };
  store.events[eventId] = event;
  branch.eventIds.push(eventId);
  branch.headEventId = eventId;
  updateBranchMemory(branch, event);
  return event;
}

function compactLines(lines, maxChars) {
  const kept = [];
  let length = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = String(lines[index] ?? "").trim();
    if (!line) continue;
    if (length + line.length + 1 > maxChars) break;
    kept.unshift(line);
    length += line.length + 1;
  }
  return kept.join("\n");
}

function updateBranchMemory(branch, event) {
  const outcome = event.turnResult?.outcome?.summary;
  const turnLine = `- ${event.action}${outcome ? ` -> ${outcome}` : ""}`;
  const prior = branch.memory && branch.memory !== "尚未开始正式互动。" ? branch.memory.split("\n") : [];
  branch.memory = compactLines([...prior, turnLine, ...(event.turnResult?.memoryNotes ?? []).map((note) => `- ${note}`)], 1600);

  branch.characterMemories ??= {};
  for (const { characterId, note } of event.turnResult?.characterMemoryNotes ?? []) {
    const lines = branch.characterMemories[characterId]?.split("\n") ?? [];
    branch.characterMemories[characterId] = compactLines([...lines, `- ${note}`], 800);
  }

  const environmentNotes = event.turnResult?.environmentMemoryNotes ?? [];
  if (environmentNotes.length) {
    const lines = branch.environmentMemory?.split("\n") ?? [];
    branch.environmentMemory = compactLines([...lines, ...environmentNotes.map((note) => `- ${note}`)], 800);
  }
}

function memoryAtEvent(store, eventIds) {
  const memory = { memory: "尚未开始正式互动。", characterMemories: {}, environmentMemory: "" };
  for (const eventId of eventIds) {
    const event = store.events[eventId];
    if (event?.type === "turn") updateBranchMemory(memory, event);
  }
  return memory;
}

export function createBranch(store, sourceEventId, requestedName) {
  const sourceEvent = store.events[sourceEventId];
  if (!sourceEvent) throw new Error("找不到要分支的剧情节点");
  const sourceBranch = store.branches[sourceEvent.branchId];
  const sourceIndex = sourceBranch.eventIds.indexOf(sourceEventId);
  if (sourceIndex < 0) throw new Error("剧情节点不属于来源分支");

  const branchId = `branch-${randomUUID().slice(0, 8)}`;
  const branchNumber = Object.keys(store.branches).length + 1;
  const eventIds = sourceBranch.eventIds.slice(0, sourceIndex + 1);
  const branchMemory = memoryAtEvent(store, eventIds);
  store.branches[branchId] = {
    id: branchId,
    name: requestedName?.trim().slice(0, 60) || `分支 ${branchNumber}`,
    parentBranchId: sourceBranch.id,
    forkEventId: sourceEventId,
    eventIds,
    headEventId: sourceEventId,
    ...branchMemory,
    createdAt: new Date().toISOString(),
  };
  store.currentBranchId = branchId;
  return store.branches[branchId];
}

export function selectBranch(store, branchId) {
  if (!store.branches[branchId]) throw new Error("找不到这个故事分支");
  store.currentBranchId = branchId;
}

export function stateHash(state) {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 12);
}

function serializeKnownFact(factId, state, storyPackage) {
  const fixed = storyPackage.facts.find((fact) => fact.id === factId);
  if (fixed) return { id: fixed.id, text: fixed.revealText };
  const generated = state.generatedFacts[factId];
  return generated ? { id: generated.id, text: generated.text } : null;
}

export function serializeStore(store, storyPackage) {
  const branch = store.branches[store.currentBranchId];
  const currentEvent = store.events[branch.headEventId];
  const state = currentEvent.stateAfter;
  const player = state.characters[storyPackage.playerCharacterId];
  const selectedPlayerCharacterId = store.story.selectedPlayerCharacterId ?? null;
  const locations = Object.fromEntries(storyPackage.locations.map((location) => [location.id, location]));
  const items = Object.fromEntries(storyPackage.items.map((item) => [item.id, item]));
  const knownFacts = player.knowledgeFactIds
    .map((factId) => serializeKnownFact(factId, state, storyPackage))
    .filter(Boolean);
  const visibleCharacters = Object.values(state.characters)
    .filter((character) => character.id !== storyPackage.playerCharacterId && character.knownToPlayer)
    .map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      attitude: character.attitude,
      status: character.status,
      present: character.locationId === state.locationId,
    }));
  const currentLocation = locations[state.locationId] ?? null;
  const sceneState = currentLocation?.states.find((item) => item.id === state.sceneStateId)
    ?? currentLocation?.states.find((item) => item.id === currentLocation.defaultStateId)
    ?? null;

  return {
    story: {
      ...publicStoryMetadata(storyPackage),
      roleSelection: storyPackage.playableRoles
        ? {
            required: true,
            selectedCharacterId: selectedPlayerCharacterId,
            canSelect: branch.eventIds.length === 1,
          }
        : { required: false, selectedCharacterId: storyPackage.playerCharacterId, canSelect: false },
      player: selectedPlayerCharacterId
        ? {
            id: player.id,
            name: player.name,
            role: player.role,
          }
        : null,
    },
    currentBranchId: store.currentBranchId,
    branches: Object.values(store.branches).map((item) => ({
      id: item.id,
      name: item.name,
      parentBranchId: item.parentBranchId,
      forkEventId: item.forkEventId,
      headEventId: item.headEventId,
      turnCount: Math.max(0, item.eventIds.length - 1),
      currentNodeId: store.events[item.headEventId]?.stateAfter?.storyProgress?.currentStageId ?? null,
    })),
    events: branch.eventIds.map((eventId, index) => {
      const event = store.events[eventId];
      return {
        id: event.id,
        type: event.type,
        action: event.action,
        prose: event.prose,
        choices: event.choices,
        turn: index,
        createdAt: event.createdAt,
        isHead: event.id === branch.headEventId,
      };
    }),
    state: {
      version: state.version,
      hash: stateHash(state),
      status: state.status,
      time: formatStoryTime(state.timeMinutes),
      location: locations[state.locationId]
        ? { id: state.locationId, name: locations[state.locationId].name }
        : null,
      scene: currentLocation && sceneState
        ? {
            locationId: currentLocation.id,
            locationName: currentLocation.name,
            stateId: sceneState.id,
            title: sceneState.title,
            image: sceneState.image,
            fallbackImage: currentLocation.fallbackImage,
          }
        : null,
      characters: visibleCharacters,
      inventory: Object.entries(state.inventory).map(([id, count]) => ({
        id,
        name: items[id]?.name ?? id,
        count,
      })),
      knownFacts,
      threads: Object.values(state.threads)
        .filter((thread) => thread.knownToPlayer)
        .map(({ id, title, status }) => ({ id, title, status })),
      ending: state.ending
        ? {
            type: state.ending.type,
            coreQuestionResponse: state.ending.coreQuestionResponse,
            keyChoice: state.ending.keyChoice,
            directConsequences: state.ending.directConsequences,
            longTermConsequences: state.ending.longTermConsequences,
            costs: state.ending.costs,
            resolvedQuestions: state.ending.resolvedQuestions,
            unresolvedQuestions: state.ending.unresolvedQuestions,
          }
        : null,
    },
  };
}
