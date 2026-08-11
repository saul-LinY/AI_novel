import { createHash, randomUUID } from "node:crypto";

const clone = (value) => structuredClone(value);

export const STORY_LOCATIONS = [
  { id: "lobby", name: "青岚旅店大堂" },
  { id: "upstairs", name: "二楼走廊" },
  { id: "room-207", name: "207 号房" },
  { id: "office", name: "旅店后办公室" },
  { id: "courtyard", name: "雨棚后的内院" },
];

export const STORY_ITEMS = [
  { id: "notebook", name: "旧笔记本" },
  { id: "room-207-key", name: "207 号房钥匙" },
  { id: "brass-token", name: "刻花铜牌" },
  { id: "torn-receipt", name: "被撕开的寄存单" },
];

export const STORY_FACTS = [
  {
    id: "missing-key",
    text: "钥匙架上唯独缺少 207 号房的钥匙。",
    privateText: "207 号房钥匙在前台抽屉的夹层里。",
  },
  {
    id: "wet-footprints",
    text: "二楼走廊的湿脚印从 207 号房门口延伸到安全楼梯。",
    privateText: "脚印来自刚从内院上楼的人。",
  },
  {
    id: "red-umbrella-owner",
    text: "门边的红伞并不属于前台林秋，而属于昨夜失踪的住客。",
    privateText: "林秋刻意把红伞留在显眼处，希望有人注意到它。",
  },
  {
    id: "stopped-clock",
    text: "大堂挂钟停在 23:17，但旅店登记簿写着 23:40。",
    privateText: "停电发生在 23:17，有人事后补写了登记时间。",
  },
  {
    id: "courtyard-route",
    text: "内院的旧铁梯可以绕过前台直接通往二楼。",
    privateText: "铁梯的扶手上留有新鲜的机油。",
  },
];

export function createInitialState() {
  return {
    version: 0,
    timeMinutes: 23 * 60 + 40,
    locationId: "lobby",
    inventory: { notebook: 1 },
    knownFactIds: [],
    characters: {
      "lin-qiu": {
        id: "lin-qiu",
        name: "林秋",
        role: "旅店前台",
        locationId: "lobby",
        attitude: 0,
        status: "active",
        goal: "确认来客是否值得信任",
      },
      "zhao-shan": {
        id: "zhao-shan",
        name: "赵山",
        role: "值夜保安",
        locationId: "courtyard",
        attitude: -1,
        status: "active",
        goal: "阻止别人进入内院",
      },
      "chen-mo": {
        id: "chen-mo",
        name: "陈默",
        role: "207 号房住客",
        locationId: "room-207",
        attitude: 0,
        status: "missing",
        goal: "隐藏自己昨夜看到的事情",
      },
    },
    threads: {
      "missing-guest": {
        id: "missing-guest",
        title: "找到失踪的 207 号房住客",
        status: "open",
      },
      "false-time": {
        id: "false-time",
        title: "查明登记时间为什么对不上",
        status: "open",
      },
    },
  };
}

const openingProse =
  "雨水沿着青岚旅店的玻璃门不断下坠，像有人在外面用指节轻轻敲门。前台后的林秋合上登记簿，目光越过你的肩膀，落在门边那把滴水的红伞上。二楼传来一声很轻的木板响，随即又归于安静。";

const openingChoices = [
  { id: "choice-umbrella", label: "查看门边的红伞", action: "我走到门边，仔细查看那把还在滴水的红伞。" },
  { id: "choice-clerk", label: "询问 207 号房", action: "我问林秋，207 号房的住客去了哪里。" },
  { id: "choice-upstairs", label: "直接上二楼", action: "我没有继续追问，沿楼梯走向二楼。" },
];

export function createInitialStore() {
  const initialState = createInitialState();
  const openingEventId = randomUUID();
  const mainBranchId = "main";
  return {
    schemaVersion: 1,
    story: {
      id: "rain-hotel",
      title: "雨夜来客",
      subtitle: "青岚旅店 · 第一幕",
      premise: "一名住客在暴雨封路的夜里失踪，而旅店里每个人都记得不同的时间。",
      createdAt: new Date().toISOString(),
      piSessionFile: null,
    },
    currentBranchId: mainBranchId,
    branches: {
      [mainBranchId]: {
        id: mainBranchId,
        name: "主线",
        parentBranchId: null,
        forkEventId: null,
        eventIds: [openingEventId],
        headEventId: openingEventId,
        createdAt: new Date().toISOString(),
      },
    },
    events: {
      [openingEventId]: {
        id: openingEventId,
        branchId: mainBranchId,
        parentEventId: null,
        action: "进入青岚旅店",
        prose: openingProse,
        choices: openingChoices,
        memoryNotes: ["暴雨已经封住下山公路", "门边有一把无人认领的红伞"],
        stateAfter: initialState,
        piEntryId: null,
        createdAt: new Date().toISOString(),
      },
    },
  };
}

export function formatStoryTime(timeMinutes) {
  const normalized = ((timeMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function assertKnownId(items, id, label) {
  if (!items.some((item) => item.id === id)) {
    throw new Error(`${label}不存在：${id}`);
  }
}

export function applyTurnProposal(currentState, proposal) {
  const nextState = clone(currentState);
  const delta = proposal.delta ?? {};

  if (delta.locationId !== undefined) {
    assertKnownId(STORY_LOCATIONS, delta.locationId, "地点");
    nextState.locationId = delta.locationId;
  }

  const timeAdvanceMinutes = delta.timeAdvanceMinutes ?? 5;
  if (!Number.isInteger(timeAdvanceMinutes) || timeAdvanceMinutes < 0 || timeAdvanceMinutes > 180) {
    throw new Error("时间变化必须是 0 到 180 分钟之间的整数");
  }
  nextState.timeMinutes += timeAdvanceMinutes;

  for (const itemId of delta.addItemIds ?? []) {
    assertKnownId(STORY_ITEMS, itemId, "物品");
    nextState.inventory[itemId] = (nextState.inventory[itemId] ?? 0) + 1;
  }

  for (const itemId of delta.removeItemIds ?? []) {
    assertKnownId(STORY_ITEMS, itemId, "物品");
    if (!nextState.inventory[itemId]) {
      throw new Error(`无法移除未持有的物品：${itemId}`);
    }
    nextState.inventory[itemId] -= 1;
    if (nextState.inventory[itemId] === 0) delete nextState.inventory[itemId];
  }

  for (const factId of delta.learnFactIds ?? []) {
    assertKnownId(STORY_FACTS, factId, "线索");
    if (!nextState.knownFactIds.includes(factId)) nextState.knownFactIds.push(factId);
  }

  for (const change of delta.relationshipChanges ?? []) {
    const character = nextState.characters[change.characterId];
    if (!character) throw new Error(`人物不存在：${change.characterId}`);
    if (!Number.isInteger(change.amount) || change.amount < -2 || change.amount > 2) {
      throw new Error("人物关系每回合只能变化 -2 到 2");
    }
    character.attitude = Math.max(-5, Math.min(5, character.attitude + change.amount));
  }

  for (const update of delta.threadUpdates ?? []) {
    const thread = nextState.threads[update.threadId];
    if (!thread) throw new Error(`剧情问题不存在：${update.threadId}`);
    if (!["open", "resolved", "failed"].includes(update.status)) {
      throw new Error(`未知的剧情问题状态：${update.status}`);
    }
    thread.status = update.status;
  }

  nextState.version += 1;
  return nextState;
}

export function appendTurn(store, { branchId, action, prose, proposal, piEntryId = null }) {
  const branch = store.branches[branchId];
  if (!branch) throw new Error(`分支不存在：${branchId}`);
  const parentEvent = store.events[branch.headEventId];
  const nextState = applyTurnProposal(parentEvent.stateAfter, proposal);
  const eventId = randomUUID();
  const event = {
    id: eventId,
    branchId,
    parentEventId: parentEvent.id,
    action,
    prose: prose.trim(),
    choices: proposal.choices,
    memoryNotes: proposal.memoryNotes ?? [],
    stateAfter: nextState,
    piEntryId,
    createdAt: new Date().toISOString(),
  };
  store.events[eventId] = event;
  branch.eventIds.push(eventId);
  branch.headEventId = eventId;
  return event;
}

export function createBranch(store, sourceEventId, requestedName) {
  const sourceEvent = store.events[sourceEventId];
  if (!sourceEvent) throw new Error("找不到要分支的剧情节点");
  const sourceBranch = store.branches[sourceEvent.branchId];
  const sourceIndex = sourceBranch.eventIds.indexOf(sourceEventId);
  if (sourceIndex < 0) throw new Error("剧情节点不属于来源分支");

  const branchNumber = Object.keys(store.branches).length + 1;
  const branchId = `branch-${randomUUID().slice(0, 8)}`;
  store.branches[branchId] = {
    id: branchId,
    name: requestedName?.trim() || `分支 ${branchNumber}`,
    parentBranchId: sourceBranch.id,
    forkEventId: sourceEventId,
    eventIds: sourceBranch.eventIds.slice(0, sourceIndex + 1),
    headEventId: sourceEventId,
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

export function serializeStore(store, runtimeMode) {
  const branch = store.branches[store.currentBranchId];
  const currentEvent = store.events[branch.headEventId];
  const state = currentEvent.stateAfter;
  const knownFacts = STORY_FACTS.filter((fact) => state.knownFactIds.includes(fact.id)).map(({ id, text }) => ({ id, text }));
  const inventory = Object.entries(state.inventory).map(([id, count]) => ({
    ...STORY_ITEMS.find((item) => item.id === id),
    count,
  }));

  return {
    story: {
      id: store.story.id,
      title: store.story.title,
      subtitle: store.story.subtitle,
      premise: store.story.premise,
    },
    runtimeMode,
    currentBranchId: store.currentBranchId,
    branches: Object.values(store.branches).map((item) => ({
      id: item.id,
      name: item.name,
      parentBranchId: item.parentBranchId,
      forkEventId: item.forkEventId,
      headEventId: item.headEventId,
      turnCount: item.eventIds.length - 1,
    })),
    events: branch.eventIds.map((eventId, index) => {
      const event = store.events[eventId];
      return {
        id: event.id,
        action: event.action,
        prose: event.prose,
        choices: event.choices,
        memoryNotes: event.memoryNotes,
        turn: index,
        createdAt: event.createdAt,
        isHead: event.id === branch.headEventId,
      };
    }),
    state: {
      version: state.version,
      hash: stateHash(state),
      time: formatStoryTime(state.timeMinutes),
      location: STORY_LOCATIONS.find((item) => item.id === state.locationId),
      characters: Object.values(state.characters).map(({ goal, ...character }) => ({
        ...character,
        location: STORY_LOCATIONS.find((item) => item.id === character.locationId)?.name,
      })),
      inventory,
      knownFacts,
      threads: Object.values(state.threads),
    },
  };
}
