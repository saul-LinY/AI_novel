import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInitialStore } from "./story-domain.js";
import { collapseRepeatedProse } from "./story-quality.js";

export class StoryStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.filePath = join(rootDir, "story.json");
    this.data = null;
  }

  async load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await readFile(this.filePath, "utf8"));
      let repaired = false;
      for (const event of Object.values(this.data.events ?? {})) {
        const prose = collapseRepeatedProse(event.prose);
        if (prose !== event.prose) {
          event.prose = prose;
          repaired = true;
        }
      }
      if (repaired) await this.save();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.data = createInitialStore();
      await this.save();
    }
    return this.data;
  }

  async save() {
    if (!this.data) throw new Error("故事尚未加载");
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }

  async reset() {
    this.data = createInitialStore();
    await this.save();
    return this.data;
  }
}
