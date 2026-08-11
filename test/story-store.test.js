import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { StoryStore } from "../src/story-store.js";

test("事务写盘失败时不会污染内存或已保存故事", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-novel-store-"));
  try {
    const store = new StoryStore(directory);
    const initial = structuredClone(await store.load());
    const savedBefore = await readFile(store.filePath, "utf8");
    store.persist = async () => {
      throw new Error("simulated disk failure");
    };

    await assert.rejects(
      store.commit((draft) => {
        draft.story.title = "不应保存的标题";
      }),
      /simulated disk failure/,
    );

    assert.deepEqual(await store.load(), initial);
    assert.equal(await readFile(store.filePath, "utf8"), savedBefore);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
