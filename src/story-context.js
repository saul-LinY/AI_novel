const clone = (value) => structuredClone(value);

function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("zh-CN");
}

function mentions(text, values = []) {
  const haystack = normalize(text);
  return values.some((value) => value && haystack.includes(normalize(value)));
}

function compactCharacter(character, memory = "") {
  return {
    id: character.id,
    name: character.name,
    aliases: character.aliases ?? [],
    role: character.role,
    locationId: character.locationId,
    status: character.status,
    attitude: character.attitude,
    knowledgeFactIds: [...(character.knowledgeFactIds ?? [])],
    personality: character.personality,
    goal: character.goal,
    speech: character.speech,
    abilities: character.abilities ?? [],
    soul: character.soul,
    knownToPlayer: character.knownToPlayer,
    memory,
  };
}

function locationSnapshot(location, state) {
  if (!location) return null;
  return {
    id: location.id,
    name: location.name,
    description: location.description,
    narrativePurpose: location.narrativePurpose,
    currentStateId: location.id === state.locationId ? state.sceneStateId : location.defaultStateId,
    states: location.states.map(({ id, title, description }) => ({ id, title, description })),
  };
}

/**
 * The shared information layer is deliberately deterministic. It owns the
 * canonical snapshot (the state object) and produces a smaller, auditable
 * context for each domain agent. It never invents facts or commits changes.
 */
export function buildSharedContext({
  action = "",
  state,
  recentEvents = [],
  storyPackage,
  branchMemory = "",
  characterMemories = {},
  environmentMemory = "",
}) {
  const characters = Object.values(state.characters ?? {});
  const locations = storyPackage.locations ?? [];
  const items = storyPackage.items ?? [];
  const facts = [...(storyPackage.facts ?? []), ...Object.values(state.generatedFacts ?? {})];
  const threads = Object.values(state.threads ?? {});
  const stages = storyPackage.stages ?? [];
  const currentStage = stages.find((stage) => stage.id === state.storyProgress?.currentStageId) ?? null;
  const currentLocation = locations.find((location) => location.id === state.locationId) ?? null;

  const characterIds = new Set([storyPackage.playerCharacterId]);
  for (const character of characters) {
    if (character.locationId === state.locationId && character.status === "active") characterIds.add(character.id);
    if (mentions(action, [character.name, ...(character.aliases ?? [])])) characterIds.add(character.id);
  }
  const locationIds = new Set([state.locationId]);
  for (const location of locations) if (mentions(action, [location.name, location.description])) locationIds.add(location.id);
  const itemIds = new Set(Object.entries(state.inventory ?? {}).filter(([, count]) => count > 0).map(([id]) => id));
  for (const item of items) if (mentions(action, [item.name, item.description])) itemIds.add(item.id);
  const factIds = new Set();
  for (const characterId of characterIds) {
    for (const factId of state.characters[characterId]?.knowledgeFactIds ?? []) factIds.add(factId);
  }
  for (const fact of facts) if (mentions(action, [fact.title, fact.truth, fact.revealText, fact.text])) factIds.add(fact.id);
  const threadIds = new Set(threads.filter((thread) => mentions(action, [thread.title])).map((thread) => thread.id));
  const stageIds = new Set([state.storyProgress?.currentStageId].filter(Boolean));
  for (const stage of stages) if (mentions(action, [stage.title, stage.purpose])) stageIds.add(stage.id);

  const relevantCharacters = characters.filter((character) => characterIds.has(character.id));
  const relevantLocations = locations.filter((location) => locationIds.has(location.id));
  const relevantItems = items.filter((item) => itemIds.has(item.id));
  const relevantFacts = facts.filter((fact) => factIds.has(fact.id));
  const relevantThreads = threads.filter((thread) => threadIds.has(thread.id) || thread.status === "open");
  const spineWindow = stages
    .slice(Math.max(0, stages.findIndex((stage) => stage.id === state.storyProgress?.currentStageId) - 1), stages.findIndex((stage) => stage.id === state.storyProgress?.currentStageId) + 3)
    .map((stage) => ({ ...clone(stage), progress: state.storyProgress?.stages?.find((item) => item.id === stage.id) ?? null }));

  const relationshipEdges = [];
  for (const character of relevantCharacters) {
    relationshipEdges.push({
      from: character.id,
      to: storyPackage.playerCharacterId,
      type: "attitude",
      value: character.attitude,
      status: character.status,
    });
  }
  for (const edge of state.relationships ?? state.relationshipGraph?.edges ?? []) {
    if (characterIds.has(edge.from) && characterIds.has(edge.to)) relationshipEdges.push(clone(edge));
  }

  const worldState = {
    version: state.version,
    status: state.status,
    timeMinutes: state.timeMinutes,
    locationId: state.locationId,
    sceneStateId: state.sceneStateId,
    inventory: clone(state.inventory ?? {}),
    generatedFacts: clone(state.generatedFacts ?? {}),
    characters: characters.map((character) => ({
      id: character.id,
      locationId: character.locationId,
      status: character.status,
      attitude: character.attitude,
      knowledgeFactIds: [...(character.knowledgeFactIds ?? [])],
    })),
    threads: clone(state.threads ?? {}),
    storyProgress: clone(state.storyProgress),
    ending: clone(state.ending),
  };

  const shared = {
    version: 1,
    trigger: { action, currentLocationId: state.locationId, currentStageId: state.storyProgress?.currentStageId ?? null },
    worldState,
    relevant: {
      characterIds: [...characterIds],
      locationIds: [...locationIds],
      itemIds: [...itemIds],
      factIds: [...factIds],
      threadIds: [...threadIds],
      stageIds: [...stageIds],
    },
    domainContexts: {
      environment: {
        currentLocation: locationSnapshot(currentLocation, state),
        relevantLocations: relevantLocations.map((location) => locationSnapshot(location, state)),
        items: relevantItems,
        inventory: clone(state.inventory ?? {}),
        activeCharacters: relevantCharacters.map((character) => ({ id: character.id, locationId: character.locationId, status: character.status })),
        worldRules: [...(storyPackage.world?.rules ?? [])],
        memory: environmentMemory,
      },
      character: {
        characters: relevantCharacters.map((character) => compactCharacter(character, characterMemories[character.id] ?? "")),
        relationshipGraph: { nodes: relevantCharacters.map(({ id, name }) => ({ id, name })), edges: relationshipEdges },
        facts: relevantFacts.map((fact) => ({ id: fact.id, kind: fact.kind, truth: fact.truth ?? fact.text, revealText: fact.revealText ?? fact.text })),
      },
      plot: {
        currentStage,
        spineWindow,
        route: clone(state.storyProgress?.route),
        openThreads: relevantThreads,
        branchMemory,
        recentEvents: recentEvents.slice(-4).map((event) => ({ action: event.action, prose: event.prose, choices: event.choices ?? [], outcome: event.turnResult?.outcome ?? null })),
      },
    },
    unknowns: [
      ...(relevantCharacters.length === 1 ? ["当前行动没有命中可交互的其他人物"] : []),
      ...(relevantItems.length === 0 && /拿|取|用|放|找|物品|道具/u.test(action) ? ["行动提到了物品，但共享状态中没有匹配条目"] : []),
    ],
    candidateChanges: [],
  };
  return shared;
}
