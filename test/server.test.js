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
import { projectRoot, proposal, rejectedProposal, ending } from "./helpers.js";

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
    handlers.onProgress?.({ role: "environment", status: "done", durationMs: 12 });
    handlers.onBeat?.({ role: "environment", text: "雨从屋檐上连成线。" });
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
    handlers.onOutcome?.({ outcomeType: "success", label: "如愿以偿", ending: false });
    handlers.onPhase?.("narrating");
    handlers.onSentence?.("第一句已经确定。");
    if (["断线继续", "提交前检查"].includes(context.action)) {
      await new Promise((resolve) => { this.releaseProse = resolve; });
    }
    handlers.onSentence?.("第二句也不会改写。");
    if (context.action === "提交冲突") {
      return { rejected: false, proposal: proposal({ choices: [] }), prose: "第一句已经确定。第二句也不会改写。", reports: prepared.reports, piEntryIds: prepared.piEntryIds };
    }
    handlers.telemetry?.calls.push({ role: "main", phase: "prepare", durationMs: 40, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: 0 }, toolFailures: 0, autoRetries: 0, validationErrors: [] });
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
    if (context.action === "一直失败") throw new Error("模型暂时不可用");
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

async function startTestServer(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "ai-novel-server-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const runtimes = [];
  const app = await createAppServer({
    memory: options.memory,
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

class RecordingMemory {
  constructor() { this.snapshots = []; this.queries = []; this.fail = false; }
  enqueue(store) { this.snapshots.push(structuredClone(store)); }
  async recall(input) {
    this.queries.push(input);
    if (this.fail) throw new Error('simulated memory outage');
    return { global: [], environment: [], characters: {}, trace: { backend: 'bm25', sourceHeadEventId: input.store.branches[input.branchId].headEventId } };
  }
  status() { return { enabled: true, backend: 'bm25', healthy: !this.fail }; }
  close() {}
}

test('记忆只在正文和状态保存后入库，读取发生在新回合生成前', async (t) => {
  const memory = new RecordingMemory();
  const { app, baseUrl, runtimes } = await startTestServer(t, { memory });
  await selectRole(baseUrl);
  const before = memory.snapshots.length;
  const response = await fetch(baseUrl + '/api/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: '提交前检查' }) });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes('prose_delta')) { const item = await reader.read(); text += decoder.decode(item.value); }
  assert.equal(memory.snapshots.length, before);
  assert.equal(memory.queries.length, 1);
  assert.equal(runtimes.at(-1).contexts[0].longTermMemory.trace.backend, 'bm25');
  runtimes.at(-1).releaseProse();
  while (true) { const item = await reader.read(); if (item.done) break; text += decoder.decode(item.value); }
  assert.equal(parseNdjson(text).at(-1).type, 'complete');
  const job = [...app.jobs.jobs.values()].at(-1);
  assert.equal(job.memoryRecall.status, 'complete');
  assert.equal(job.memoryRecall.result.trace.backend, 'bm25');
  assert.equal(job.memoryUpdate.enabled, true);
  assert.equal(job.memoryUpdate.graphiti, false);
  assert.ok(job.memoryUpdate.enqueuedAt);
  assert.equal(Object.hasOwn(job.memoryUpdate, 'completedAt'), false);
  assert.equal(memory.snapshots.at(-1).branches.main.eventIds.length, 2);
  assert.equal((await app.storyStore.load()).branches.main.eventIds.length, 2);
  assert.deepEqual(await fetch(baseUrl + '/api/memory/status').then((r) => r.json()), { enabled: true, backend: 'bm25', healthy: true });
});

test('拒绝行动不会进入长期记忆', async (t) => {
  const memory = new RecordingMemory();
  const { baseUrl } = await startTestServer(t, { memory });
  await selectRole(baseUrl);
  const before = memory.snapshots.length;
  const response = await fetch(baseUrl + '/api/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: '拒绝' }) });
  assert.equal(parseNdjson(await response.text()).at(-1).type, 'rejected');
  assert.equal(memory.snapshots.length, before);
});

test('等待图索引时可以取消，检索完成后不会继续生成', async (t) => {
  const memory = new RecordingMemory();
  let release;
  memory.recall = () => new Promise(resolve => { release = resolve; });
  const { app, baseUrl, runtimes } = await startTestServer(t, { memory });
  await selectRole(baseUrl);
  const response = await fetch(baseUrl + '/api/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: '等待记忆' }) });
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  const job = app.jobs.activeJob();
  const cancelled = await fetch(baseUrl + '/api/turns/' + job.turnId + '/cancel', { method: 'POST' });
  assert.equal(cancelled.status, 200);
  assert.equal(parseNdjson(await response.text()).at(-1).type, 'cancelled');
  release(null);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(runtimes.at(-1).contexts.length, 0);
  assert.equal((await app.storyStore.load()).branches.main.eventIds.length, 1);
});

test('记忆服务异常不破坏流式生成及正常存档', async (t) => {
  const memory = new RecordingMemory(); memory.fail = true;
  const { baseUrl } = await startTestServer(t, { memory });
  await selectRole(baseUrl);
  const response = await fetch(baseUrl + '/api/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: '走进街区' }) });
  const events = parseNdjson(await response.text());
  assert.equal(events.at(-1).type, 'complete');
  assert.equal(events.filter((event) => event.type === 'prose_delta').length, 2);
});

test("回合先准备场景，再按完整句流式追加，结束后才原子提交", async (t) => {
  const { baseUrl, runtimes } = await startTestServer(t);
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.busy, false);
  assert.equal(health.storyId, "dragon-raja");
  assert.equal(health.pipeline.narrative, "enforce");
  assert.equal(health.pipeline.recorder, "agent");
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
  assert.ok(types.indexOf("beat") < types.indexOf("prepared"));
  assert.ok(types.indexOf("outcome") > types.indexOf("prepared") && types.indexOf("outcome") < types.indexOf("prose_delta"));
  assert.ok(events.some((event) => event.type === "agent_progress" && event.role === "environment"));
  assert.equal(events.some((event) => Object.hasOwn(event, "telemetry")), false, "遥测不能进入玩家事件流");
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

test("已结束的存档拒绝新回合，不创建生成作业或调用模型", async (t) => {
  const { app, baseUrl, runtimes } = await startTestServer(t);
  await selectRole(baseUrl);
  const store = await app.storyStore.load();
  const head = store.events[store.branches[store.currentBranchId].headEventId];
  head.stateAfter.status = "ended";
  head.stateAfter.ending = ending("deviation");
  head.choices = [];
  await app.storyStore.save(store);
  const response = await fetch(`${baseUrl}/api/turn`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "继续吃早餐" }),
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /已经结束/);
  assert.equal(app.jobs.activeJob(), null);
  assert.equal(runtimes.at(-1).contexts.length, 0);
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

test("提交被拒属于永久错误：作业失败且重连不会无限续写", async (t) => {
  const { app, baseUrl, runtimes } = await startTestServer(t);
  await selectRole(baseUrl);
  const events = parseNdjson(await fetch(`${baseUrl}/api/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "提交冲突", branchId: "main" }),
  }).then((response) => response.text()));
  const failed = events.at(-1);
  assert.equal(failed.type, "failed");
  assert.equal(failed.code, "COMMIT_REJECTED");
  const job = app.jobs.get(failed.turnId);
  assert.equal(job.status, "failed");
  const replay = parseNdjson(await fetch(`${baseUrl}/api/turns/${failed.turnId}/stream?afterSeq=0`).then((response) => response.text()));
  assert.equal(replay.filter((event) => event.type === "failed").length, 1);
  assert.equal(runtimes.at(-1).contexts.filter((context) => context.resumed).length, 0);
  const story = await fetch(`${baseUrl}/api/story`).then((response) => response.json());
  assert.equal(story.events.length, 1);
});

test("遥测随回合写入作业与存档事件，但不出现在公开接口", async (t) => {
  const { app, baseUrl } = await startTestServer(t);
  await selectRole(baseUrl);
  const events = parseNdjson(await fetch(`${baseUrl}/api/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "走进街区", branchId: "main" }),
  }).then((response) => response.text()));
  const job = app.jobs.get(events[0].turnId);
  assert.equal(job.telemetry.calls[0].role, "main");
  assert.ok(job.telemetry.marks.prepared === undefined || job.telemetry.marks.prepared >= 0);
  assert.ok(job.telemetry.marks.firstProse >= 0);
  assert.ok(job.telemetry.totalMs >= 0);
  const store = await app.storyStore.load();
  const event = store.events[store.branches.main.headEventId];
  assert.equal(event.telemetry.calls[0].usage.totalTokens, 15);
  const publicStory = await fetch(`${baseUrl}/api/story`).then((response) => response.text());
  assert.doesNotMatch(publicStory, /telemetry|totalTokens/);
});

test("正文恢复连续失败达到上限后转为失败，不再续写", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "ai-novel-resume-cap-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const basePackage = await loadStoryPackage(projectRoot, "dragon-raja");
  const storyStore = new StoryStore(dataDir, basePackage);
  const store = createInitialStore(resolvePlayableRole(basePackage, "lu-mingfei"));
  await storyStore.save(store);
  const jobs = new TurnJobManager(dataDir, "dragon-raja");
  await jobs.initialize();
  const job = await jobs.create({ turnId: "cap-turn", eventId: "cap-event", branchId: "main", headEventId: store.branches.main.headEventId, action: "一直失败", trustedChoice: false });
  await jobs.setPrepared(job, { proposal: proposal(), scene: null, reports: {}, basePiEntryIds: {}, piEntryIds: {} });
  job.resumeCount = 1;
  await jobs.setStatus(job, "paused");
  const app = await createAppServer({
    projectRoot,
    dataDir,
    logger: { error() {} },
    pipelineConfig: { beats: true, outcomeSummary: true, choices: "inline", narrative: "enforce", recorder: "agent", quality: "warn", slimContext: true, recorderTimeoutMs: 30000, maxResumes: 2 },
    runtimeFactory: (args) => new FakeRuntime(args),
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  while (!["failed", "paused"].includes(app.jobs.get("cap-turn").status) || app.jobs.get("cap-turn").resumeCount < 2) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const final = app.jobs.get("cap-turn");
  assert.equal(final.status, "failed");
  assert.match(final.events.at(-1).message, /多次续写失败/);
});

test("推荐选项可以按对话说出：仍走可信路径，行动文本带上台词与原意图", async (t) => {
  const { app, baseUrl, runtimes } = await startTestServer(t);
  await selectRole(baseUrl);
  const store = await app.storyStore.load();
  const head = store.events[store.branches.main.headEventId];
  head.choices = head.choices.map((choice, index) => index === 0 ? { ...choice, line: "你先挑，我不改。" } : choice);
  await app.storyStore.save(store);
  const choice = head.choices[0];
  await fetch(`${baseUrl}/api/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choiceId: choice.id, mode: "say", branchId: "main" }) }).then((r) => r.text());
  const context = runtimes.at(-1).contexts.at(-1);
  assert.equal(context.trustedChoice, true);
  assert.equal(context.action, `我说：「你先挑，我不改。」（${choice.action}）`);
  // A choice without a line falls back to its action even in 对话 mode.
  const next = await app.storyStore.load();
  const nextChoice = next.events[next.branches.main.headEventId].choices[0];
  await fetch(`${baseUrl}/api/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choiceId: nextChoice.id, mode: "say", branchId: "main" }) }).then((r) => r.text());
  assert.equal(runtimes.at(-1).contexts.at(-1).action, nextChoice.action);
});
