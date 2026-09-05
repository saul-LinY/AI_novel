import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { Type } from "typebox";
import Schema from "typebox/schema";

const idSchema = Type.String({ pattern: "^[a-z][a-z0-9-]{1,63}$" });
const referenceId = Type.String({ minLength: 1, maxLength: 120, pattern: "^[a-zA-Z0-9:_-]+$" });
const nonEmptyString = (maxLength = 500) => Type.String({ minLength: 1, maxLength });
const choiceSchema = Type.Object({ id: idSchema, label: nonEmptyString(40), action: nonEmptyString(300) });
const imageSchema = Type.Object({
  src: nonEmptyString(240),
  alt: nonEmptyString(240),
  position: Type.Optional(nonEmptyString(40)),
});
const openingSchema = Type.Object({
  action: nonEmptyString(160),
  prose: nonEmptyString(1600),
  choices: Type.Array(choiceSchema, { minItems: 2, maxItems: 4 }),
});
const inventorySchema = Type.Array(Type.Object({ itemId: idSchema, count: Type.Integer({ minimum: 1, maximum: 20 }) }));
const goalConditionSchema = Type.Object({
  factIdsAny: Type.Optional(Type.Array(referenceId)),
  factIdsAll: Type.Optional(Type.Array(referenceId)),
  threadStatuses: Type.Optional(Type.Array(Type.Object({
    threadId: referenceId,
    status: Type.Union([Type.Literal("open"), Type.Literal("resolved"), Type.Literal("failed")]),
  }))),
  evidenceAllowed: Type.Optional(Type.Boolean()),
});
const profileSchema = Type.Object({
  id: idSchema,
  name: nonEmptyString(60),
  aliases: Type.Array(nonEmptyString(60), { maxItems: 6 }),
  role: nonEmptyString(120),
  selectable: Type.Boolean(),
  onboardingVisible: Type.Boolean(),
  tagline: nonEmptyString(180),
  publicSummary: nonEmptyString(800),
  traits: Type.Array(nonEmptyString(80), { minItems: 2, maxItems: 6 }),
  appearance: nonEmptyString(500),
  abilities: Type.Array(nonEmptyString(100), { minItems: 1, maxItems: 8 }),
  speech: nonEmptyString(500),
  image: Type.Union([imageSchema, Type.Null()]),
});

export const STORY_PACKAGE_SCHEMA = Type.Object({
  schemaVersion: Type.Literal(2),
  id: idSchema,
  version: Type.Integer({ minimum: 2 }),
  title: nonEmptyString(80),
  subtitle: nonEmptyString(120),
  premise: nonEmptyString(500),
  playerCharacterId: idSchema,
  visual: Type.Optional(imageSchema),
  sourcePolicy: Type.Object({
    basis: nonEmptyString(120),
    primarySources: Type.Array(nonEmptyString(300), { minItems: 1 }),
    copyright: nonEmptyString(300),
  }),
  background: Type.Object({
    title: nonEmptyString(80),
    summary: nonEmptyString(5000),
    beats: Type.Array(Type.Object({
      id: idSchema,
      order: Type.Integer({ minimum: 1 }),
      comicPageId: idSchema,
      location: nonEmptyString(120),
      characterIds: Type.Array(idSchema, { minItems: 1, maxItems: 12 }),
      cause: nonEmptyString(800),
      event: nonEmptyString(800),
      effect: nonEmptyString(800),
      visualContinuity: Type.Array(nonEmptyString(300), { minItems: 1, maxItems: 6 }),
      sourceStatus: Type.Union([Type.Literal("verified-public"), Type.Literal("current-adaptation")]),
    }), { minItems: 3, maxItems: 30 }),
  }),
  onboarding: Type.Object({
    mode: Type.Literal("comic-role-select"),
    version: Type.Integer({ minimum: 1 }),
    background: Type.Object({ title: nonEmptyString(80), body: nonEmptyString(5000) }),
    comicPages: Type.Array(Type.Object({
      id: idSchema,
      title: nonEmptyString(80),
      caption: Type.Optional(nonEmptyString(800)),
      panels: Type.Optional(Type.Array(Type.Object({
        id: idSchema,
        scene: nonEmptyString(300),
        lines: Type.Array(Type.Object({ speaker: nonEmptyString(40), text: nonEmptyString(240) }), { minItems: 1, maxItems: 4 }),
      }), { minItems: 3, maxItems: 8 })),
      image: imageSchema,
    }), { minItems: 3, maxItems: 30 }),
    characterProfiles: Type.Array(profileSchema, { minItems: 4, maxItems: 6 }),
    npcProfiles: Type.Array(profileSchema, { minItems: 1, maxItems: 24 }),
    roleSelection: Type.Object({
      title: nonEmptyString(120),
      body: nonEmptyString(600),
      roles: Type.Array(Type.Object({
        characterId: idSchema,
        hook: nonEmptyString(240),
        strengths: Type.Array(nonEmptyString(80), { minItems: 2, maxItems: 5 }),
        pressure: nonEmptyString(240),
        image: imageSchema,
      }), { minItems: 4, maxItems: 6 }),
    }),
  }),
  opening: openingSchema,
  playableRoles: Type.Object({
    characterIds: Type.Array(idSchema, { minItems: 4, maxItems: 6 }),
    configs: Type.Array(Type.Object({
      characterId: idSchema,
      locationId: Type.Optional(idSchema),
      initialInventory: inventorySchema,
      opening: openingSchema,
      relationshipOverrides: Type.Optional(Type.Array(Type.Object({ characterId: idSchema, attitude: Type.Integer({ minimum: -5, maximum: 5 }) }))),
    }), { minItems: 4, maxItems: 6 }),
  }),
  narration: Type.Object({
    viewpoint: nonEmptyString(160),
    style: nonEmptyString(800),
    rules: Type.Array(nonEmptyString(300), { minItems: 1, maxItems: 16 }),
  }),
  world: Type.Object({
    timeMinutes: Type.Integer({ minimum: 0 }),
    locationId: idSchema,
    rules: Type.Array(nonEmptyString(300), { minItems: 1, maxItems: 24 }),
  }),
  locations: Type.Array(Type.Object({
    id: idSchema,
    name: nonEmptyString(80),
    description: nonEmptyString(1000),
    narrativePurpose: nonEmptyString(1200),
    defaultStateId: idSchema,
    fallbackImage: nonEmptyString(240),
    states: Type.Array(Type.Object({ id: idSchema, title: nonEmptyString(100), description: nonEmptyString(1000), image: imageSchema }), { minItems: 1, maxItems: 8 }),
  }), { minItems: 2 }),
  items: Type.Array(Type.Object({ id: idSchema, name: nonEmptyString(80), description: nonEmptyString(300) })),
  initialInventory: inventorySchema,
  facts: Type.Array(Type.Object({
    id: idSchema,
    kind: Type.Union([Type.Literal("core"), Type.Literal("clue")]),
    truth: nonEmptyString(800),
    revealText: nonEmptyString(500),
    knowledgeGateTerms: Type.Optional(Type.Array(nonEmptyString(100), { maxItems: 12 })),
  }), { minItems: 3 }),
  canonKnowledge: Type.Object({
    initialByCharacterId: Type.Record(idSchema, Type.Array(idSchema)),
    protectedTerms: Type.Array(Type.Object({ truthId: idSchema, terms: Type.Array(nonEmptyString(100), { minItems: 1 }) })),
  }),
  characters: Type.Array(Type.Object({
    id: idSchema,
    name: nonEmptyString(60),
    aliases: Type.Array(nonEmptyString(60), { maxItems: 6 }),
    role: nonEmptyString(120),
    personality: nonEmptyString(500),
    goal: nonEmptyString(500),
    appearance: nonEmptyString(500),
    background: nonEmptyString(800),
    speech: nonEmptyString(500),
    abilities: Type.Array(nonEmptyString(100), { minItems: 1, maxItems: 8 }),
    soul: nonEmptyString(5000),
    locationId: idSchema,
    status: Type.Union([Type.Literal("active"), Type.Literal("missing"), Type.Literal("injured"), Type.Literal("dead"), Type.Literal("departed")]),
    attitude: Type.Integer({ minimum: -5, maximum: 5 }),
    knowledgeFactIds: Type.Array(referenceId),
    knownToPlayer: Type.Boolean(),
    profile: profileSchema,
  }), { minItems: 12, maxItems: 32 }),
  threads: Type.Array(Type.Object({
    id: idSchema,
    title: nonEmptyString(200),
    status: Type.Union([Type.Literal("open"), Type.Literal("resolved"), Type.Literal("failed")]),
    knownToPlayer: Type.Boolean(),
  }), { minItems: 1 }),
  stages: Type.Array(Type.Object({
    id: idSchema,
    role: Type.Union([Type.Literal("expose"), Type.Literal("choice"), Type.Literal("cost"), Type.Literal("investigation"), Type.Literal("commitment"), Type.Literal("climax"), Type.Literal("consequence")]),
    title: nonEmptyString(100),
    purpose: nonEmptyString(500),
    prerequisites: Type.Array(idSchema, { maxItems: 6 }),
    expectedResults: Type.Array(nonEmptyString(300), { minItems: 1, maxItems: 8 }),
    blockConditions: Type.Array(nonEmptyString(300), { maxItems: 8 }),
    compatibleRejoinNodeIds: Type.Array(idSchema, { maxItems: 6 }),
    requiredGoalCount: Type.Integer({ minimum: 1 }),
    goals: Type.Array(Type.Object({ id: idSchema, title: nonEmptyString(160), completion: goalConditionSchema }), { minItems: 1 }),
  }), { minItems: 5, maxItems: 20 }),
  foreshadows: Type.Array(Type.Object({ id: idSchema, seedFactId: idSchema, pointsToFactIds: Type.Array(idSchema, { minItems: 1 }) })),
  ending: Type.Object({
    allowedTypes: Type.Array(Type.Union([Type.Literal("normal"), Type.Literal("failure"), Type.Literal("early"), Type.Literal("deviation")]), { minItems: 4, maxItems: 4 }),
    constraints: Type.Array(nonEmptyString(300), { minItems: 1, maxItems: 16 }),
  }),
});

const storyPackageValidator = Schema.Compile(STORY_PACKAGE_SCHEMA);

function assertUnique(items, label) {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} ID 不能重复`);
  return new Set(ids);
}

function assertReferences(ids, references, label) {
  for (const id of references) if (!ids.has(id)) throw new Error(`${label}引用了不存在的 ID：${id}`);
}

function safeComponentPath(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/")) throw new Error("故事包文件路径不合法");
  const target = resolve(root, relativePath);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("故事包文件越出故事目录");
  return target;
}

export function validateStoryPackage(input) {
  const [valid, errors] = storyPackageValidator.Errors(input);
  if (!valid) {
    const summary = errors.slice(0, 5).map((error) => `${error.path || "/"}: ${error.message}`).join("；");
    throw new Error(`故事包结构不合法：${summary}`);
  }
  const locationIds = assertUnique(input.locations, "地点");
  const itemIds = assertUnique(input.items, "物品");
  const factIds = assertUnique(input.facts, "事实");
  const characterIds = assertUnique(input.characters, "人物");
  const threadIds = assertUnique(input.threads, "剧情问题");
  const stageIds = assertUnique(input.stages, "主干节点");
  const comicIds = assertUnique(input.onboarding.comicPages, "漫画页");
  assertUnique(input.background.beats, "背景节拍");
  assertUnique(input.foreshadows, "伏笔");
  assertUnique(input.opening.choices, "开场选项");

  if (!characterIds.has(input.playerCharacterId)) throw new Error("玩家角色不存在");
  if (!locationIds.has(input.world.locationId)) throw new Error("初始地点不存在");
  if (!input.facts.some((fact) => fact.kind === "core")) throw new Error("故事包至少需要一个核心事实");
  if (input.background.beats.length !== input.onboarding.comicPages.length) throw new Error("漫画页与背景因果节拍必须一一对应");
  for (const beat of input.background.beats) {
    assertReferences(comicIds, [beat.comicPageId], `背景节拍 ${beat.id}`);
    assertReferences(characterIds, beat.characterIds, `背景节拍 ${beat.id}`);
  }
  for (const character of input.characters) {
    if (!locationIds.has(character.locationId)) throw new Error(`人物地点不存在：${character.id}`);
    assertReferences(factIds, character.knowledgeFactIds, `人物 ${character.id}`);
    if (character.profile.id !== character.id) throw new Error(`人物档案 ID 不一致：${character.id}`);
  }
  for (const location of input.locations) {
    assertReferences(new Set(location.states.map((state) => state.id)), [location.defaultStateId], `地点 ${location.id}`);
  }
  for (const stage of input.stages) {
    if (stage.requiredGoalCount > stage.goals.length) throw new Error(`主干节点目标数量不足：${stage.id}`);
    assertReferences(stageIds, stage.prerequisites, `主干节点 ${stage.id}`);
    assertReferences(stageIds, stage.compatibleRejoinNodeIds, `主干节点 ${stage.id}`);
    for (const goal of stage.goals) {
      const completion = goal.completion;
      const hasCondition = (completion.factIdsAny?.length ?? 0) > 0 || (completion.factIdsAll?.length ?? 0) > 0 || (completion.threadStatuses?.length ?? 0) > 0 || completion.evidenceAllowed === true;
      if (!hasCondition) throw new Error(`目标必须有完成条件：${goal.id}`);
      assertReferences(factIds, completion.factIdsAny ?? [], `目标 ${goal.id}`);
      assertReferences(factIds, completion.factIdsAll ?? [], `目标 ${goal.id}`);
      assertReferences(threadIds, (completion.threadStatuses ?? []).map((item) => item.threadId), `目标 ${goal.id}`);
    }
  }

  const playableIds = new Set(input.playableRoles.characterIds);
  const configIds = new Set(input.playableRoles.configs.map((config) => config.characterId));
  const profileIds = new Set(input.onboarding.characterProfiles.map((profile) => profile.id));
  const selectionIds = new Set(input.onboarding.roleSelection.roles.map((role) => role.characterId));
  assertReferences(characterIds, playableIds, "可扮演角色");
  for (const characterId of playableIds) {
    if (!configIds.has(characterId) || !profileIds.has(characterId) || !selectionIds.has(characterId)) throw new Error(`可扮演角色缺少完整配置：${characterId}`);
  }
  for (const config of input.playableRoles.configs) {
    if (config.locationId) assertReferences(locationIds, [config.locationId], `角色 ${config.characterId} 开场地点`);
    for (const item of config.initialInventory) assertReferences(itemIds, [item.itemId], `角色 ${config.characterId} 初始物品`);
    for (const override of config.relationshipOverrides ?? []) assertReferences(characterIds, [override.characterId], `角色 ${config.characterId} 关系`);
  }
  for (const item of input.initialInventory) assertReferences(itemIds, [item.itemId], "初始物品");
  for (const foreshadow of input.foreshadows) assertReferences(factIds, [foreshadow.seedFactId, ...foreshadow.pointsToFactIds], `伏笔 ${foreshadow.id}`);
  const requiredEndings = ["normal", "failure", "early", "deviation"];
  if (new Set(input.ending.allowedTypes).size !== requiredEndings.length || requiredEndings.some((type) => !input.ending.allowedTypes.includes(type))) throw new Error("故事包必须明确允许 normal、failure、early、deviation 四类结局");
  return input;
}

async function readComponent(storyRoot, relativePath, loadedFiles, mode = "json") {
  const raw = await readFile(safeComponentPath(storyRoot, relativePath), "utf8");
  loadedFiles.set(relativePath, raw);
  return mode === "json" ? JSON.parse(raw) : raw;
}

function withoutMarkdownHeading(markdown) {
  const lines = markdown.trim().split("\n");
  if (lines[0]?.startsWith("# ")) lines.splice(0, 1);
  return lines.join("\n").trim();
}

export async function loadStoryPackage(projectRoot, requestedId = "dragon-raja") {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(requestedId)) throw new Error("故事 ID 不合法");
  const storiesRoot = resolve(projectRoot, "stories");
  const storyRoot = resolve(storiesRoot, requestedId);
  if (!storyRoot.startsWith(`${storiesRoot}${sep}`)) throw new Error("故事路径不合法");
  const manifestPath = resolve(storyRoot, "manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  if (manifest.schemaVersion !== 2) throw new Error("故事包必须使用 schema v2");
  if (manifest.id !== requestedId) throw new Error(`故事包 ID 与目录不一致：${requestedId}`);

  const loadedFiles = new Map([["manifest.json", manifestRaw]]);
  const summary = await readComponent(storyRoot, manifest.files.backgroundSummary, loadedFiles, "text");
  const beats = await readComponent(storyRoot, manifest.files.backgroundBeats, loadedFiles);
  const comicPages = await readComponent(storyRoot, manifest.files.comicPages, loadedFiles);
  const facts = await readComponent(storyRoot, manifest.files.canonTruths, loadedFiles);
  const canonKnowledge = await readComponent(storyRoot, manifest.files.canonKnowledge, loadedFiles);
  const spine = await readComponent(storyRoot, manifest.files.plotSpine, loadedFiles);
  const characters = [];
  for (const id of manifest.characterIds) {
    const profile = await readComponent(storyRoot, `characters/${id}/profile.json`, loadedFiles);
    const initial = await readComponent(storyRoot, `characters/${id}/initial-state.json`, loadedFiles);
    const soul = await readComponent(storyRoot, `characters/${id}/soul.md`, loadedFiles, "text");
    characters.push({ id, name: profile.name, aliases: profile.aliases, role: profile.role, appearance: profile.appearance, abilities: profile.abilities, speech: profile.speech, soul, profile, ...initial });
  }
  const locations = [];
  for (const id of manifest.locationIds) {
    const states = await readComponent(storyRoot, `locations/${id}/states.json`, loadedFiles);
    const description = await readComponent(storyRoot, `locations/${id}/description.md`, loadedFiles, "text");
    locations.push({ ...states, narrativePurpose: withoutMarkdownHeading(description) });
  }
  const selectableProfiles = characters.filter((character) => character.profile.selectable).map((character) => character.profile);
  const npcProfiles = characters.filter((character) => !character.profile.selectable && character.profile.onboardingVisible).map((character) => character.profile);
  const storyPackage = validateStoryPackage({
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    version: manifest.version,
    title: manifest.title,
    subtitle: manifest.subtitle,
    premise: manifest.premise,
    sourcePolicy: manifest.sourcePolicy,
    ...manifest.runtime,
    background: { title: "前情提要", summary, beats },
    onboarding: { mode: "comic-role-select", version: manifest.version, background: { title: "在故事开始之前", body: withoutMarkdownHeading(summary) }, comicPages, characterProfiles: selectableProfiles, npcProfiles, roleSelection: manifest.runtime.roleSelection },
    facts,
    canonKnowledge,
    characters,
    locations,
    stages: spine.nodes,
  });
  const hashSource = [...loadedFiles.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([path, raw]) => `${path}\0${raw}`).join("\0");
  return { ...storyPackage, packageHash: createHash("sha256").update(hashSource).digest("hex").slice(0, 16), packagePath: manifestPath, storyRoot };
}

export function publicStoryMetadata(storyPackage) {
  return { id: storyPackage.id, title: storyPackage.title, subtitle: storyPackage.subtitle, premise: storyPackage.premise, visual: storyPackage.visual ?? null, onboarding: storyPackage.onboarding };
}

export function resolvePlayableRole(storyPackage, characterId) {
  const config = storyPackage.playableRoles.configs.find((item) => item.characterId === characterId);
  if (!config || !storyPackage.playableRoles.characterIds.includes(characterId)) throw new Error("这个角色不可扮演");
  const attitudes = new Map((config.relationshipOverrides ?? []).map((item) => [item.characterId, item.attitude]));
  return {
    ...storyPackage,
    playerCharacterId: characterId,
    world: { ...storyPackage.world, locationId: config.locationId ?? storyPackage.world.locationId },
    initialInventory: structuredClone(config.initialInventory),
    opening: structuredClone(config.opening),
    characters: storyPackage.characters.map((character) => ({ ...character, attitude: attitudes.get(character.id) ?? character.attitude })),
    selectedPlayerCharacterId: characterId,
  };
}
