import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAppServer } from "../src/server.js";
import { createInitialStore } from "../src/story-domain.js";
import { loadStoryPackage, resolvePlayableRole } from "../src/story-package.js";
import { StoryStore } from "../src/story-store.js";
import { TurnJobManager } from "../src/turn-job-manager.js";
import { projectRoot, proposal, rejectedProposal } from "./helpers.js";

class FakeRuntime {
  constructor({ dataDir }) {
    this.sessionFiles = Object.fromEntries(["main", "plot", "character", "environment"].map((role) => [role, join(dataDir, `${role}.jsonl`)]));
    this.contexts = [];
    this.disposed = false;
  }

  async initialize(store) {
    store.story.piSessionFiles = this.sessionFiles;
  }

  async generateTurn(context, handlers = {}) {
    this.contexts.push(context);
    handlers.onPhase?.("analyzing");
    if (context.action === "拒绝") {
      return { rejected: true, proposal: rejectedProposal("玩家没有手段直接命令绘梨衣回家。"), piEntryIds: context.piEntryIds };
    }
    if (context.action === "等待取消") {
      await new Promise((_resolve, reject) => { this.rejectActive = reject; });
    }
    handlers.onPhase?.("synthesizing");
    const turnProposal = proposal({
      delta: { timeAdvanceMinutes: 5, locationId: "tokyo-street", sceneStateId: "default" },
      characterMemoryNotes: [{ characterId: "erii", note: "玩家带她走进了雨后的街区。" }],
    });
    const prepared = {
      proposal: turnProposal,
      scene: {
        locationId: "tokyo-street",
        locationName: "东京街区",
        stateId: "default",
        title: "普通世界",
        image: { src: "/assets/scenes/dragon-raja/tokyo-street.png", alt: "东京街区" },
        fallbackImage: "/assets/scenes/dragon-raja/fallback.png",
      },
      reports: { plot: {}, character: {}, environment: {} },
      basePiEntryIds: context.piEntryIds,
      piEntryIds: Object.fromEntries(Object.keys(this.sessionFiles).map((role) => [role, `${role}-prepared`])),
    };
    await handlers.onPrepared?.(prepared);
    handlers.onPhase?.("narrating");
    handlers.onSentence?.("第一句已经确定。");
    if (["断线继续", "提交前检查"].includes(context.action)) {
      await new Promise((resolve) => { this.releaseProse = resolve; });
    }
    handlers.onSentence?.("第二句也不会改写。");
    return {
      rejected: false,
      proposal: turnProposal,
      prose: "第一句已经确定。第二句也不会改写。",
      reports: prepared.reports,
      basePiEntryIds: context.piEntryIds,
      piEntryIds: Object.fromEntries(Object.keys(this.sessionFiles).map((role) => [role, `${role}-complete`])),
    };
  }

  async resumePreparedTurn(context, prepared, handlers = {}) {
    this.contexts.push({ ...context, resumed: true });
    handlers.onPhase?.("narrating");
    handlers.onSentence?.("恢复后的完整句。");
    return {
      rejected: false,
      proposal: prepared.proposal,
      prose: `${prepared.prosePrefix}恢复后的完整句。`,
      reports: prepared.reports,
      piEntryIds: prepared.piEntryIds,
    };
  }

  async abort() {
    if (!this.rejectActive) return false;
    this.rejectActive(Object.assign(new Error("aborted"), { name: "AbortError" }));
    this.rejectActive = null;
    return true;
  }

  dispose() { this.disposed = true; }
}

function parseNdjson(text) {
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function startTestServer(t) {
  const dataDir = await mkdtemp(join(tmpdir(), "ai-novel-server-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const runtimes = [];
  const app = await createAppServer({
    projectRoot,
    dataDir,
    logger: { error() {} },
    runtimeFactory: (args) => { const runtime = new FakeRuntime(args); runtimes.push(runtime); return runtime; },
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  return { app, runtimes, baseUrl: `http://127.0.0.1:${app.server.address().port}` };
}

async function selectRole(baseUrl, characterId = "lu-mingfei") {
  const response = await fetch(`${baseUrl}/api/roles/select`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("回合先准备场景，再按完整句流式追加，结束后才原子提交", async (t) => {
  const { baseUrl, runtimes } = await startTestServer(t);
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.deepEqual(health, { ok: true, busy: false, storyId: "dragon-raja" });
  const publicStory = await fetch(`${baseUrl}/api/story`).then((response) => response.json());
  assert.equal(publicStory.story.onboarding.comicPages.length, 18);
  assert.equal(publicStory.story.onboarding.npcProfiles.length, 8);
  assert.doesNotMatch(JSON.stringify(publicStory), /承载白王之血的容器/);

  const selected = await selectRole(baseUrl);
  assert.equal(selected.story.story.player.id, "lu-mingfei");
  const response = await fetch(`${baseUrl}/api/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "走进街区", branchId: "main" }),
  });
  const events = parseNdjson(await response.text());
  const types = events.map((event) => event.type);
  assert.equal(types.indexOf("scene") < types.indexOf("prose_delta"), true);
  assert.deepEqual(events.filter((event) => event.type === "prose_delta").map((event) => event.text), ["第一句已经确定。", "第二句也不会改写。"]);
  assert.equal(types.includes("reviewing"), false);
  assert.equal(events.at(-1).type, "complete");
  assert.equal(events.at(-1).story.events.length, 2);
  assert.equal(events.at(-1).story.state.scene.image.src, "/assets/scenes/dragon-raja/tokyo-street.png");
  assert.equal(runtimes.at(-1).contexts[0].branchMemory, "尚未开始正式互动。");
});

test("浏览器断开不会取消服务端生成，afterSeq 重放不重复", async (t) => {
  const { baseUrl, runtimes } = await startTestServer(t);
  await selectRole(baseUrl);
  const response = await fetch(`${baseUrl}/api/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "断线继续", branchId: "main" }),
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastSeq = 0;
  while (!buffer.includes('"type":"prose_delta"')) {
    const { value } = await reader.read();
    buffer += decoder.decode(value);
    for (const line of buffer.split("\n").filter(Boolean)) {
      try { lastSeq = Math.max(lastSeq, JSON.parse(line).seq ?? 0); } catch {}
    }
  }
  await reader.cancel();
  runtimes.at(-1).releaseProse();
  while ((await fetch(`${baseUrl}/api/health`).then((item) => item.json())).busy) await new Promise((resolve) => setTimeout(resolve, 5));
  const activeTurnId = parseNdjson(buffer)[0].turnId;
  const replay = parseNdjson(await fetch(`${baseUrl}/api/turns/${activeTurnId}/stream?afterSeq=${lastSeq}`).then((item) => item.text()));
  assert.equal(replay.every((event) => event.seq > lastSeq), true);
  assert.deepEqual(replay.filter((event) => event.type === "prose_delta").map((event) => event.text), ["第二句也不会改写。"]);
  assert.equal(replay.at(-1).type, "complete");
});

test("prepared 之前可取消，prepared 之后状态和记忆仍等正文完成才提交", async (t) => {
  const { baseUrl, runtimes } = await startTestServer(t);
  await selectRole(baseUrl);
  const pending = fetch(`${baseUrl}/api/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "等待取消", branchId: "main" }),
  }).then((response) => response.text());
  while (!runtimes.at(-1).rejectActive) await new Promise((resolve) => setImmediate(resolve));
  const active = await fetch(`${baseUrl}/api/turns/active`).then((response) => response.json());
  assert.equal((await fetch(`${baseUrl}/api/turns/${active.turnId}/cancel`, { method: "POST", body: "{}" })).status, 200);
  assert.equal(parseNdjson(await pending).at(-1).type, "cancelled");
  assert.equal((await fetch(`${baseUrl}/api/story`).then((response) => response.json())).events.length, 1);

  const held = fetch(`${baseUrl}/api/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "提交前检查", branchId: "main" }),
  }).then((response) => response.text());
  while (!runtimes.at(-1).releaseProse) await new Promise((resolve) => setImmediate(resolve));
  const preparedActive = await fetch(`${baseUrl}/api/turns/active`).then((response) => response.json());
  assert.equal((await fetch(`${baseUrl}/api/turns/${preparedActive.turnId}/cancel`, { method: "POST", body: "{}" })).status, 409);
  assert.equal((await fetch(`${baseUrl}/api/story`).then((response) => response.json())).events.length, 1);
  runtimes.at(-1).releaseProse();
  assert.equal(parseNdjson(await held).at(-1).type, "complete");
  const committed = await fetch(`${baseUrl}/api/story`).then((response) => response.json());
  assert.equal(committed.events.length, 2);
});

test("拒绝行动不写事件，旧接口仍不暴露故事内部状态", async (t) => {
  const { baseUrl } = await startTestServer(t);
  assert.equal((await fetch(`${baseUrl}/api/stories`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/story-plan`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "直接开始" }) })).status, 409);
  await selectRole(baseUrl);
  const events = parseNdjson(await fetch(`${baseUrl}/api/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "拒绝", branchId: "main" }),
  }).then((response) => response.text()));
  assert.equal(events.at(-1).type, "rejected");
  assert.equal((await fetch(`${baseUrl}/api/story`).then((response) => response.json())).events.length, 1);
});

test("服务重启后从已展示的完整句继续，并只提交一次", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "ai-novel-restart-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const basePackage = await loadStoryPackage(projectRoot, "dragon-raja");
  const activePackage = resolvePlayableRole(basePackage, "lu-mingfei");
  const storyStore = new StoryStore(dataDir, basePackage);
  const store = createInitialStore(activePackage);
  await storyStore.save(store);
  const headId = store.branches.main.headEventId;
  const jobs = new TurnJobManager(dataDir, "dragon-raja");
  await jobs.initialize();
  const job = await jobs.create({
    turnId: "restart-turn",
    eventId: "restart-event",
    branchId: "main",
    headEventId: headId,
    action: "继续寻找安全出口",
    trustedChoice: false,
  });
  const prepared = {
    proposal: proposal(),
    scene: { locationId: "theme-hotel", locationName: "主题旅馆", stateId: "default", title: "雨夜藏身", image: { src: "/assets/scenes/dragon-raja/theme-hotel.png", alt: "主题旅馆" }, fallbackImage: "/assets/scenes/dragon-raja/fallback.png" },
    reports: { plot: {}, character: {}, environment: {} },
    basePiEntryIds: {},
    piEntryIds: {},
  };
  await jobs.setPrepared(job, prepared);
  jobs.emit(job, { type: "prepared" });
  const prefixEvent = jobs.emit(job, { type: "prose_delta", text: "重启前已经显示的句子。" });
  await jobs.setStatus(job, "paused");

  const app = await createAppServer({
    projectRoot,
    dataDir,
    logger: { error() {} },
    runtimeFactory: (args) => new FakeRuntime(args),
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  let publicStory;
  do {
    publicStory = await fetch(`${baseUrl}/api/story`).then((response) => response.json());
    if (publicStory.events.length === 1) await new Promise((resolve) => setTimeout(resolve, 5));
  } while (publicStory.events.length === 1);

  const replay = parseNdjson(await fetch(`${baseUrl}/api/turns/restart-turn/stream?afterSeq=${prefixEvent.seq}`).then((response) => response.text()));
  assert.deepEqual(replay.filter((event) => event.type === "prose_delta").map((event) => event.text), ["恢复后的完整句。"]);
  assert.equal(replay.filter((event) => event.type === "complete").length, 1);
  assert.equal(publicStory.events.length, 2);
  assert.equal(publicStory.events[1].prose, "重启前已经显示的句子。恢复后的完整句。");
});
