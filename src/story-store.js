import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInitialStore } from "./story-domain.js";

function archiveSuffix() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readText(path, fallback = "") {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, contents, "utf8");
  await rename(tempPath, path);
}

async function atomicJson(path, value) {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

export class StoryStore {
  constructor(rootDir, storyPackage) {
    this.rootDir = rootDir;
    this.storyPackage = storyPackage;
    this.storyDir = join(rootDir, "stories", storyPackage.id);
    this.filePath = join(this.storyDir, "index.json");
    this.v3FilePath = join(this.storyDir, "story.json");
    this.legacyFilePath = join(rootDir, "story.json");
    this.archiveDir = join(rootDir, "archive");
    this.data = null;
  }

  branchDir(branchId) {
    return join(this.storyDir, "branches", branchId);
  }

  async archive(path, label) {
    await mkdir(this.archiveDir, { recursive: true });
    const archivePath = join(this.archiveDir, `${label}-${archiveSuffix()}.json`);
    await rename(path, archivePath);
    return archivePath;
  }

  async archiveOldStores() {
    for (const [path, label] of [[this.legacyFilePath, "story-v2"], [this.v3FilePath, `${this.storyPackage.id}-v3`]]) {
      try {
        await this.archive(path, label);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  isCurrentIndex(index) {
    return (
      index?.schemaVersion === 4
      && index.story?.id === this.storyPackage.id
      && index.story?.packageVersion === this.storyPackage.version
      && index.story?.packageHash === this.storyPackage.packageHash
      && Array.isArray(index.branches)
    );
  }

  async loadBranch(branchId) {
    const branchDir = this.branchDir(branchId);
    const branch = await readJson(join(branchDir, "branch.json"));
    branch.memory = (await readText(join(branchDir, "memory.md"), "尚未开始正式互动。")).trim();
    branch.environmentMemory = (await readText(join(branchDir, "environment-state.memory.md"), "")).trim();
    branch.characterMemories = {};
    const events = {};
    for (const eventId of branch.eventIds) {
      const event = await readJson(join(branchDir, "turns", eventId, "event.json"));
      events[eventId] = event;
    }
    const state = events[branch.headEventId]?.stateAfter;
    for (const characterId of Object.keys(state?.characters ?? {})) {
      const memory = (await readText(join(branchDir, "characters", characterId, "memory.md"), "")).trim();
      if (memory) branch.characterMemories[characterId] = memory;
    }
    return { branch, events };
  }

  async load() {
    if (this.data) return this.data;
    await this.archiveOldStores();
    try {
      const index = await readJson(this.filePath);
      if (!this.isCurrentIndex(index)) {
        await this.archive(this.filePath, `${this.storyPackage.id}-incompatible`);
      } else {
        const branches = {};
        const events = {};
        for (const item of index.branches) {
          const loaded = await this.loadBranch(item.id);
          branches[item.id] = loaded.branch;
          Object.assign(events, loaded.events);
        }
        this.data = {
          schemaVersion: 4,
          story: index.story,
          currentBranchId: index.currentBranchId,
          branches,
          events,
        };
        if (!branches[this.data.currentBranchId]) throw new Error("当前分支索引损坏");
        return this.data;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.data = createInitialStore(this.storyPackage);
    await this.save();
    return this.data;
  }

  async saveBranch(data, branch) {
    const branchDir = this.branchDir(branch.id);
    const branchRecord = {
      id: branch.id,
      name: branch.name,
      parentBranchId: branch.parentBranchId,
      forkEventId: branch.forkEventId,
      eventIds: branch.eventIds,
      headEventId: branch.headEventId,
      createdAt: branch.createdAt,
    };
    await atomicJson(join(branchDir, "branch.json"), branchRecord);
    await atomicWrite(join(branchDir, "memory.md"), `${branch.memory || "尚未开始正式互动。"}\n`);
    await atomicWrite(join(branchDir, "environment-state.memory.md"), `${branch.environmentMemory || ""}\n`);

    for (const eventId of branch.eventIds) {
      await atomicJson(join(branchDir, "turns", eventId, "event.json"), data.events[eventId]);
    }

    const headState = data.events[branch.headEventId].stateAfter;
    await atomicJson(join(branchDir, "plot-state.json"), headState.storyProgress);
    await atomicJson(join(branchDir, "environment-state.json"), {
      locationId: headState.locationId,
      sceneStateId: headState.sceneStateId,
      timeMinutes: headState.timeMinutes,
      inventory: headState.inventory,
      threads: headState.threads,
      status: headState.status,
      ending: headState.ending,
    });
    for (const [characterId, character] of Object.entries(headState.characters)) {
      await atomicJson(join(branchDir, "characters", characterId, "state.json"), character);
      await atomicWrite(join(branchDir, "characters", characterId, "memory.md"), `${branch.characterMemories?.[characterId] || ""}\n`);
    }
  }

  async save(nextData = this.data) {
    if (!nextData) throw new Error("故事尚未加载");
    for (const branch of Object.values(nextData.branches)) await this.saveBranch(nextData, branch);
    const index = {
      schemaVersion: 4,
      story: nextData.story,
      currentBranchId: nextData.currentBranchId,
      branches: Object.values(nextData.branches).map((branch) => {
        const state = nextData.events[branch.headEventId].stateAfter;
        return {
          id: branch.id,
          name: branch.name,
          parentBranchId: branch.parentBranchId,
          forkEventId: branch.forkEventId,
          headEventId: branch.headEventId,
          currentLocationId: state.locationId,
          currentNodeId: state.storyProgress.currentStageId,
        };
      }),
    };
    await atomicJson(this.filePath, index);
    this.data = nextData;
  }

  async reset() {
    this.data = createInitialStore(this.storyPackage);
    await this.save();
    return this.data;
  }
}
