import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendTurn } from "../src/story-domain.js";
import { StoryStore } from "../src/story-store.js";
import { packageById, proposal } from "./helpers.js";

test("旧 v2 与 v3 单文件存档原样归档，并创建 v4 分支文件系统", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ai-novel-store-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storyPackage = await packageById();
  const legacyV2 = { schemaVersion: 2, marker: "legacy-v2" };
  const legacyV3 = { schemaVersion: 3, marker: "legacy-v3" };
  const piSession = join(root, "pi-sessions", "old-session.jsonl");
  await mkdir(join(root, "pi-sessions"), { recursive: true });
  await mkdir(join(root, "stories", "dragon-raja"), { recursive: true });
  await writeFile(join(root, "story.json"), JSON.stringify(legacyV2), "utf8");
  await writeFile(join(root, "stories", "dragon-raja", "story.json"), JSON.stringify(legacyV3), "utf8");
  await writeFile(piSession, '{"type":"session"}\n', "utf8");

  const store = new StoryStore(root, storyPackage);
  const loaded = await store.load();
  const archives = await readdir(join(root, "archive"));

  assert.equal(loaded.schemaVersion, 4);
  assert.equal(loaded.story.id, "dragon-raja");
  assert.equal(archives.some((name) => name.startsWith("story-v2-")), true);
  assert.equal(archives.some((name) => name.startsWith("dragon-raja-v3-")), true);
  await access(piSession);
  assert.equal(JSON.parse(await readFile(store.filePath, "utf8")).schemaVersion, 4);
  await access(join(root, "stories", "dragon-raja", "branches", "main", "memory.md"));
});

test("v4 按分支保存回合、情节、环境、人物状态和独立记忆", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ai-novel-store-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storyPackage = await packageById();
  const store = new StoryStore(root, storyPackage);
  const data = await store.load();
  const parentId = data.branches.main.headEventId;
  const event = appendTurn(data, {
    branchId: "main",
    expectedParentEventId: parentId,
    action: "询问绘梨衣是否愿意同行",
    prose: "她在本子上写下答案。",
    proposal: proposal({
      characterMemoryNotes: [{ characterId: "erii", note: "玩家询问了她自己的意愿。" }],
      environmentMemoryNotes: ["药盒仍留在桌上。"],
    }),
    storyPackage,
  });
  await store.save(data);

  const branchDir = join(root, "stories", "dragon-raja", "branches", "main");
  for (const path of [
    "branch.json",
    "memory.md",
    "plot-state.json",
    "environment-state.json",
    join("characters", "erii", "state.json"),
    join("characters", "erii", "memory.md"),
    join("turns", event.id, "event.json"),
  ]) await access(join(branchDir, path));
  assert.match(await readFile(join(branchDir, "characters", "erii", "memory.md"), "utf8"), /自己的意愿/);

  const reloaded = await new StoryStore(root, storyPackage).load();
  assert.equal(reloaded.branches.main.headEventId, event.id);
  assert.equal(reloaded.events[event.id].prose, "她在本子上写下答案。");
});

test("当前故事包版本或哈希不匹配时归档索引后重建", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ai-novel-store-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storyPackage = await packageById();
  const store = new StoryStore(root, storyPackage);
  await mkdir(join(root, "stories", "dragon-raja"), { recursive: true });
  await writeFile(store.filePath, JSON.stringify({ schemaVersion: 4, story: { id: "dragon-raja", packageVersion: 0, packageHash: "old" }, branches: [] }), "utf8");

  const loaded = await store.load();
  const archives = await readdir(join(root, "archive"));
  assert.equal(loaded.story.packageVersion, storyPackage.version);
  assert.equal(loaded.story.packageHash, storyPackage.packageHash);
  assert.equal(archives.some((name) => name.startsWith("dragon-raja-incompatible-")), true);
});
