import {
  stateHash,
  STORY_FACTS,
  STORY_ITEMS,
  STORY_LOCATIONS,
} from "./story-domain.js";

const BROAD_INSPECTION_TERMS = ["查看", "观察", "检查", "寻找", "调查", "搜索", "翻找", "打量"];

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function selectDiscoveryCandidates(action, state) {
  const unknownFacts = STORY_FACTS.filter((fact) => !state.knownFactIds.includes(fact.id));
  const actionMatches = STORY_FACTS.filter((fact) => includesAny(action, fact.discovery.actionTerms));
  if (actionMatches.length > 0) {
    return actionMatches.filter((fact) => !state.knownFactIds.includes(fact.id)).slice(0, 3);
  }

  if (!includesAny(action, BROAD_INSPECTION_TERMS)) return [];
  return unknownFacts.filter((fact) => fact.discovery.locationIds.includes(state.locationId)).slice(0, 2);
}

function publicCharacters(state) {
  return Object.values(state.characters).map(({ goal, ...character }) => ({
    ...character,
    locationId: character.status === "active" ? character.locationId : null,
  }));
}

function selectRelevantCharacters(action, state) {
  return Object.values(state.characters)
    .filter(
      (character) =>
        character.status === "active" &&
        (character.locationId === state.locationId || action.includes(character.name)),
    )
    .map(({ id, name, role, locationId, attitude, status, goal }) => ({
      id,
      name,
      role,
      locationId,
      attitude,
      status,
      privateGoal: goal,
    }));
}

export function compileTurnContext({ action, state, recentEvents }) {
  const selectedEvents = recentEvents.slice(-4);
  const discoveryCandidates = selectDiscoveryCandidates(action, state);
  const relevantCharacters = selectRelevantCharacters(action, state);
  const knownFacts = STORY_FACTS.filter((fact) => state.knownFactIds.includes(fact.id)).map(({ id, text }) => ({ id, text }));

  const modelContext = {
    state: {
      version: state.version,
      timeMinutes: state.timeMinutes,
      locationId: state.locationId,
      locations: STORY_LOCATIONS,
      inventory: state.inventory,
      knownFacts,
      characters: publicCharacters(state),
      threads: state.threads,
      availableItems: STORY_ITEMS,
    },
    relevantCharacters,
    discoveryCandidates: discoveryCandidates.map(({ id, privateText }) => ({ id, discovery: privateText })),
    recentStory: selectedEvents.map(({ id, action: eventAction, prose, memoryNotes = [] }) => ({
      id,
      action: eventAction,
      prose,
      memoryNotes,
    })),
  };

  return {
    modelContext,
    trace: {
      compilerVersion: 1,
      stateVersion: state.version,
      stateHash: stateHash(state),
      selectedEventIds: selectedEvents.map((event) => event.id),
      selectedMemoryNoteCount: selectedEvents.reduce((count, event) => count + (event.memoryNotes?.length ?? 0), 0),
      relevantCharacterIds: relevantCharacters.map((character) => character.id),
      discoveryCandidateIds: discoveryCandidates.map((fact) => fact.id),
      omittedSecretFactIds: STORY_FACTS.filter(
        (fact) => !state.knownFactIds.includes(fact.id) && !discoveryCandidates.some((candidate) => candidate.id === fact.id),
      ).map((fact) => fact.id),
    },
  };
}
