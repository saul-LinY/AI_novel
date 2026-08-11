import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { createInitialStore } from "./story-domain.js";

export class StoryStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.filePath = join(rootDir, "story.json");
    this.data = null;
    this.commitQueue = Promise.resolve();
  }

  async load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const initialData = createInitialStore();
      await this.persist(initialData);
      this.data = initialData;
    }
    return this.data;
  }

  async persist(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async save() {
    if (!this.data) throw new Error("故事尚未加载");
    await this.persist(this.data);
  }

  async commit(mutator) {
    const operation = this.commitQueue.then(async () => {
      const currentData = await this.load();
      const draft = structuredClone(currentData);
      const result = await mutator(draft);
      await this.persist(draft);
      this.data = draft;
      return result;
    });
    this.commitQueue = operation.catch(() => {});
    return operation;
  }

  async reset() {
    const nextData = createInitialStore();
    await this.persist(nextData);
    this.data = nextData;
    return this.data;
  }
}
