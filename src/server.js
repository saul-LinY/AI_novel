import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendTurn, createBranch, createInitialStore, selectBranch, serializeStore } from "./story-domain.js";
import { loadStoryPackage, resolvePlayableRole } from "./story-package.js";
import { PiStoryRuntime } from "./pi-story-runtime.js";
import { StoryStore } from "./story-store.js";
import { TurnJobManager } from "./turn-job-manager.js";
import { createStoryMemory } from "./memory/story-memory.js";
import { readPipelineConfig } from "./pipeline-config.js";
import { TurnTelemetry } from "./turn-telemetry.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = resolve(sourceDir, "..");
const defaultDataDir = join(defaultProjectRoot, ".ai-novel");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Story art is referenced as PNG everywhere; when an optimized WebP sibling
// exists (scripts/optimize-assets.js) and the browser accepts it, serve that.
async function preferredImage(filePath, request) {
  if (extname(filePath) !== ".png" || !request?.headers.accept?.includes("image/webp")) return filePath;
  const webpPath = `${filePath.slice(0, -4)}.webp`;
  try {
    if ((await stat(webpPath)).isFile()) return webpPath;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return filePath;
}

async function serveFile(response, requestedPath, request = null) {
  try {
    const filePath = await preferredImage(requestedPath, request);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    const isAsset = filePath.includes(`${sep}assets${sep}`);
    response.writeHead(200, {
      "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
      "content-length": fileStat.size,
      "cache-control": isAsset ? "public, max-age=86400" : "no-cache",
      ...(extname(requestedPath) === ".png" ? { vary: "Accept" } : {}),
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function createAppServer(options = {}) {
  const projectRoot = options.projectRoot ?? defaultProjectRoot;
  const publicDir = join(projectRoot, "public");
  const dataDir = options.dataDir ?? defaultDataDir;
  const lucidePath = join(projectRoot, "node_modules", "lucide", "dist", "umd", "lucide.min.js");
  const logger = options.logger ?? console;
  const baseStoryPackage = await loadStoryPackage(projectRoot, "dragon-raja");
  const pipeline = options.pipelineConfig ?? await readPipelineConfig(dataDir);
  const runtimeFactory = options.runtimeFactory ?? ((args) => new PiStoryRuntime(args));
  const makeRuntime = (activeStoryPackage) => runtimeFactory({
    projectRoot,
    dataDir,
    storyPackage: activeStoryPackage,
    agentDir: options.agentDir,
    pipeline,
  });

  const storyStore = new StoryStore(dataDir, baseStoryPackage);
  const initialStore = await storyStore.load();
  let storyPackage = initialStore.story.selectedPlayerCharacterId
    ? resolvePlayableRole(baseStoryPackage, initialStore.story.selectedPlayerCharacterId)
    : baseStoryPackage;
  let runtime = makeRuntime(storyPackage);
  await runtime.initialize(initialStore);
  initialStore.story.piSessionFiles = runtime.sessionFiles ?? initialStore.story.piSessionFiles;
  await storyStore.save(initialStore);
  const jobs = new TurnJobManager(dataDir, storyPackage.id);
  await jobs.initialize();
  const memory = options.memory ?? await createStoryMemory({ dataDir, logger });
  memory.enqueue(initialStore, storyPackage);
  const runningJobs = new Set();

  const isBusy = () => Boolean(jobs.activeJob());

  // A commit or branch conflict can never succeed on retry: fail the job for
  // good instead of letting the reader's reconnects resume it forever.
  const permanentError = (message, code) => Object.assign(new Error(message), { code, permanent: true });
  const TRANSIENT_FS_CODES = new Set(["EIO", "EBUSY", "ENOSPC", "EAGAIN", "EMFILE", "ENFILE"]);

  async function executeJob(job) {
    if (runningJobs.has(job.turnId)) return;
    runningJobs.add(job.turnId);
    const telemetry = job.telemetry ? TurnTelemetry.from(job.telemetry, pipeline) : new TurnTelemetry(pipeline);
    try {
      await jobs.setStatus(job, job.prepared ? "recovering" : "running");
      const store = await storyStore.load();
      const branch = store.branches[job.branchId];
      if (!branch || branch.headEventId !== job.headEventId) throw permanentError("故事分支在作业恢复前已经变化", "BRANCH_CHANGED");
      const headEvent = store.events[branch.headEventId];
      const recentEvents = branch.eventIds
        .map((eventId) => store.events[eventId])
        .filter((event) => event.type === "opening" || event.type === "turn")
        .slice(-4);
      const context = {
        action: job.action,
        state: headEvent.stateAfter,
        recentEvents,
        piEntryIds: headEvent.piEntryIds ?? {},
        trustedChoice: job.trustedChoice,
        branchMemory: branch.memory,
        characterMemories: branch.characterMemories,
        environmentMemory: branch.environmentMemory,
      };
      // A prepared job must keep its original context during stream recovery.
      if (!job.prepared && !job.completedTurn) {
        jobs.emit(job, { type: "phase", phase: "recalling" });
        try {
          context.longTermMemory = await memory.recall({ store, storyPackage, branchId: job.branchId, action: job.action });
          job.memoryRecall = { result: context.longTermMemory, status: context.longTermMemory ? "complete" : "disabled" };
        } catch (error) {
          logger.warn?.('[AI novel memory] recall unavailable:', error.message);
          job.memoryRecall = { result: null, status: "degraded" };
        }
        await jobs.persist(job);
      }
      if (job.status === "cancelled") return;
      let firstProse = !jobs.prosePrefix(job);
      const handlers = {
        telemetry,
        onPhase: (phase) => jobs.emit(job, { type: "phase", phase }),
        onProgress: ({ role, status, attempt, durationMs }) => jobs.emit(job, { type: "agent_progress", role, status, ...(attempt ? { attempt } : {}), ...(durationMs !== undefined ? { durationMs } : {}) }),
        onBeat: ({ role, text }) => jobs.emit(job, { type: "beat", role, text }),
        onOutcome: (outcome) => jobs.emit(job, { type: "outcome", ...outcome }),
        onPrepared: async (prepared) => {
          await jobs.setPrepared(job, prepared);
          jobs.emit(job, { type: "prepared" });
          jobs.emit(job, { type: "scene", scene: prepared.scene });
        },
        onChoices: async (choices) => {
          await jobs.setChoices(job, { choices: choices.choices, choicePlan: choices.choicePlan });
          jobs.emit(job, { type: "choices_ready", count: choices.choices.length, source: choices.source });
        },
        onSentence: (text) => {
          if (firstProse) { telemetry.mark("firstProse"); firstProse = false; }
          jobs.emit(job, { type: "prose_delta", text });
        },
      };
      const result = job.completedTurn ?? (job.prepared
        ? await runtime.resumePreparedTurn(context, {
            ...job.prepared,
            prosePrefix: jobs.prosePrefix(job),
          }, handlers)
        : await runtime.generateTurn(context, handlers));

      if (job.status === "cancelled") return;
      if (result.rejected) {
        job.telemetry = result.telemetry ?? telemetry.toJSON();
        jobs.emit(job, { type: "rejected", message: result.proposal.outcome.summary });
        await jobs.persist(job);
        return;
      }

      job.completedTurn = structuredClone(result);
      job.telemetry = result.telemetry ?? telemetry.toJSON();
      await jobs.persist(job);
      jobs.emit(job, { type: "phase", phase: "committing" });
      const latestStore = await storyStore.load();
      const latestBranch = latestStore.branches[job.branchId];
      if (!latestBranch || latestBranch.headEventId !== job.headEventId) throw permanentError("故事分支在生成期间已经变化", "BRANCH_CHANGED");
      const nextStore = structuredClone(latestStore);
      // The runtime records into this same telemetry object (handlers.telemetry).
      telemetry.mark("committed");
      const committedTelemetry = { ...telemetry.toJSON(), totalMs: telemetry.marks.committed };
      try {
        appendTurn(nextStore, {
          branchId: job.branchId,
          eventId: job.eventId,
          expectedParentEventId: job.headEventId,
          action: job.action,
          prose: result.prose,
          proposal: result.proposal,
          piEntryIds: result.piEntryIds,
          agentReports: result.reports,
          sharedContext: result.sharedContext,
          telemetry: committedTelemetry,
          record: result.record ?? null,
          beatSheet: result.beatSheet ?? null,
          gate: result.gate ?? null,
          storyPackage,
        });
      } catch (error) {
        throw permanentError(`本回合无法保存：${error.message}`, "COMMIT_REJECTED");
      }
      nextStore.story.piSessionFiles = runtime.sessionFiles ?? nextStore.story.piSessionFiles;
      await storyStore.save(nextStore);
      job.telemetry = committedTelemetry;
      memory.enqueue(nextStore, storyPackage, job.branchId);
      const memoryStatus = memory.status();
      job.memoryUpdate = { enabled: memoryStatus.enabled, graphiti: Boolean(memoryStatus.graphiti?.enabled), enqueuedAt: new Date().toISOString() };
      jobs.emit(job, { type: "complete", story: serializeStore(nextStore, storyPackage) });
      await jobs.persist(job);
    } catch (error) {
      if (job.status === "cancelled") return;
      logger.error("[AI novel] turn failed", error);
      job.telemetry = error.telemetry ?? job.telemetry ?? telemetry.toJSON();
      const transient = !error.permanent && (!error.code || TRANSIENT_FS_CODES.has(error.code) || error.code === "MODEL_REQUEST_FAILED");
      job.resumeCount = (job.resumeCount ?? 0) + (job.prepared ? 1 : 0);
      if (job.prepared && transient && job.resumeCount < pipeline.maxResumes) {
        await jobs.setStatus(job, "paused");
        jobs.emit(job, { type: "error", recoverable: true, message: error.message || "正文生成暂时中断" });
        jobs.closeStreams(job);
      } else {
        const message = job.prepared && transient ? `正文多次续写失败，本回合已停止：${error.message}` : error.message || "本回合生成失败";
        jobs.emit(job, { type: "failed", message, ...(error.code ? { code: error.code } : {}) });
        await jobs.persist(job);
      }
    } finally {
      runningJobs.delete(job.turnId);
    }
  }

  for (const job of jobs.recoverableJobs()) queueMicrotask(() => executeJob(job));

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);

    try {
      if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          busy: isBusy(),
          storyId: storyPackage.id,
          pipeline,
          memory: { enabled: memory.status().enabled, healthy: memory.status().healthy ?? null },
          activeJob: jobs.activeJob() ? { turnId: jobs.activeJob().turnId, status: jobs.activeJob().status } : null,
          recentTurns: jobs.latencySummary(),
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/memory/status") {
        await memory.graph?.refreshStatus?.();
        sendJson(response, 200, memory.status());
        return;
      }

      if (request.method === "GET" && pathname === "/api/story") {
        sendJson(response, 200, serializeStore(await storyStore.load(), storyPackage));
        return;
      }

      if (request.method === "GET" && pathname === "/api/turns/active") {
        const job = jobs.activeJob();
        sendJson(response, 200, job ? { turnId: job.turnId, status: job.status, branchId: job.branchId } : null);
        return;
      }

      const streamMatch = pathname.match(/^\/api\/turns\/([^/]+)\/stream$/);
      if (request.method === "GET" && streamMatch) {
        const turnId = streamMatch[1];
        const job = jobs.get(turnId);
        if (!job) {
          sendJson(response, 404, { error: "找不到这个回合作业" });
          return;
        }
        if (job.status === "paused") queueMicrotask(() => executeJob(job));
        const afterSeq = Math.max(0, Number.parseInt(requestUrl.searchParams.get("afterSeq") ?? "0", 10) || 0);
        jobs.stream(turnId, response, afterSeq);
        return;
      }

      const cancelMatch = pathname.match(/^\/api\/turns\/([^/]+)\/cancel$/);
      if (request.method === "POST" && cancelMatch) {
        const job = jobs.get(cancelMatch[1]);
        if (!job) {
          sendJson(response, 404, { error: "找不到这个回合作业" });
          return;
        }
        if (job.prepared || job.status === "prepared" || job.status === "recovering" || job.status === "paused") {
          sendJson(response, 409, { error: "正文已经锁定，不能再取消" });
          return;
        }
        const recalling = job.events.findLast((event) => event.type === 'phase')?.phase === 'recalling';
        const cancelled = recalling || await runtime.abort();
        if (!cancelled) {
          sendJson(response, 409, { error: "正文已经锁定，不能再取消" });
          return;
        }
        jobs.emit(job, { type: "cancelled", message: "已停止生成，本回合没有保存。" });
        await jobs.persist(job);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && pathname === "/api/roles/select") {
        if (isBusy()) {
          sendJson(response, 409, { error: "故事生成时不能选择角色" });
          return;
        }
        if (!baseStoryPackage.playableRoles) {
          sendJson(response, 404, { error: "这个故事不提供角色选择" });
          return;
        }
        const body = await readJson(request);
        let nextStoryPackage;
        try {
          nextStoryPackage = resolvePlayableRole(baseStoryPackage, typeof body.characterId === "string" ? body.characterId : "");
        } catch (error) {
          sendJson(response, 400, { error: error.message });
          return;
        }
        const currentStore = await storyStore.load();
        if (Object.values(currentStore.branches).some((branch) => branch.eventIds.length > 1)) {
          sendJson(response, 409, { error: "故事开始后不能更换角色，请先重置故事" });
          return;
        }
        runtime.dispose();
        storyPackage = nextStoryPackage;
        const nextStore = createInitialStore(nextStoryPackage);
        await storyStore.save(nextStore);
        runtime = makeRuntime(nextStoryPackage);
        await runtime.initialize(nextStore);
        nextStore.story.piSessionFiles = runtime.sessionFiles ?? nextStore.story.piSessionFiles;
        await storyStore.save(nextStore);
        memory.enqueue(nextStore, storyPackage);
        sendJson(response, 200, { story: serializeStore(nextStore, storyPackage) });
        return;
      }

      if (request.method === "POST" && pathname === "/api/turn") {
        if (isBusy()) {
          sendJson(response, 409, { error: "上一回合还没有完成" });
          return;
        }
        const body = await readJson(request);
        const store = await storyStore.load();
        if (store.story.roleSelectionRequired && !store.story.selectedPlayerCharacterId) {
          sendJson(response, 409, { error: "请先选择要扮演的角色" });
          return;
        }
        const branchId = body.branchId ?? store.currentBranchId;
        const branch = store.branches[branchId];
        if (!branch || branchId !== store.currentBranchId) {
          sendJson(response, 409, { error: "当前分支已经变化，请刷新后重试" });
          return;
        }
        const headEvent = store.events[branch.headEventId];
        if (headEvent.stateAfter.status === "ended") {
          sendJson(response, 409, { error: "这段故事已经结束，可以回看正文或重新开始" });
          return;
        }
        const choiceId = typeof body.choiceId === "string" ? body.choiceId : null;
        const selectedChoice = choiceId ? headEvent.choices?.find((choice) => choice.id === choiceId) : null;
        if (choiceId && !selectedChoice) {
          sendJson(response, 409, { error: "这个推荐选项已经失效，请选择当前回合的行动" });
          return;
        }
        // A recommended choice can be taken as its action or spoken as its line;
        // both pursue the same pre-validated plan, so both stay trusted.
        const spoken = body.mode === "say" && selectedChoice?.line;
        const action = selectedChoice
          ? (spoken ? `我说：「${selectedChoice.line}」（${selectedChoice.action}）` : selectedChoice.action)
          : (typeof body.action === "string" ? body.action.trim() : "");
        if (!action || action.length > 300) {
          sendJson(response, 400, { error: "请输入 1 到 300 个字符的行动" });
          return;
        }
        const turnId = randomUUID();
        const job = await jobs.create({
          turnId,
          eventId: randomUUID(),
          branchId,
          headEventId: headEvent.id,
          action,
          trustedChoice: Boolean(selectedChoice),
        });
        jobs.stream(turnId, response, 0);
        queueMicrotask(() => executeJob(job));
        return;
      }

      if (request.method === "POST" && pathname === "/api/cancel") {
        const job = jobs.activeJob();
        if (!job) {
          sendJson(response, 200, { ok: false });
          return;
        }
        if (job.prepared) {
          sendJson(response, 409, { error: "正文已经锁定，不能再取消" });
          return;
        }
        const recalling = job.events.findLast((event) => event.type === 'phase')?.phase === 'recalling';
        const cancelled = recalling || await runtime.abort();
        if (!cancelled) {
          sendJson(response, 409, { error: "正文已经锁定，不能再取消" });
          return;
        }
        jobs.emit(job, { type: "cancelled", message: "已停止生成，本回合没有保存。" });
        await jobs.persist(job);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && pathname === "/api/branches") {
        if (isBusy()) {
          sendJson(response, 409, { error: "故事生成时不能创建分支" });
          return;
        }
        const body = await readJson(request);
        const nextStore = structuredClone(await storyStore.load());
        const branch = createBranch(nextStore, body.eventId, body.name);
        await storyStore.save(nextStore);
        memory.enqueue(nextStore, storyPackage);
        sendJson(response, 201, { branch, story: serializeStore(nextStore, storyPackage) });
        return;
      }

      if (request.method === "POST" && pathname === "/api/branches/select") {
        if (isBusy()) {
          sendJson(response, 409, { error: "故事生成时不能切换分支" });
          return;
        }
        const body = await readJson(request);
        const nextStore = structuredClone(await storyStore.load());
        selectBranch(nextStore, body.branchId);
        await storyStore.save(nextStore);
        memory.enqueue(nextStore, storyPackage);
        sendJson(response, 200, { story: serializeStore(nextStore, storyPackage) });
        return;
      }

      if (request.method === "POST" && pathname === "/api/reset") {
        if (isBusy()) {
          sendJson(response, 409, { error: "故事生成时不能重置" });
          return;
        }
        runtime.dispose();
        storyPackage = baseStoryPackage;
        const store = await storyStore.reset();
        runtime = makeRuntime(storyPackage);
        await runtime.initialize(store);
        store.story.piSessionFiles = runtime.sessionFiles ?? store.story.piSessionFiles;
        await storyStore.save(store);
        memory.enqueue(store, storyPackage);
        sendJson(response, 200, { story: serializeStore(store, storyPackage) });
        return;
      }

      if (request.method === "GET" && pathname === "/vendor/lucide.js") {
        if (await serveFile(response, lucidePath)) return;
        sendJson(response, 404, { error: "图标资源未安装" });
        return;
      }

      if (request.method === "GET") {
        // The imported UI is built independently; all API and save contracts stay here.
        if ((pathname === "/" || pathname === "/index.html" || pathname === "/ui/" || (!pathname.startsWith("/api/") && !extname(pathname)))
          && (await serveFile(response, join(publicDir, "ui", "index.html")))) return;
        const requestedPath = pathname === "/" ? "/index.html" : pathname;
        const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
        const filePath = resolve(publicDir, `.${normalizedPath}`);
        if (filePath.startsWith(`${publicDir}/`) && (await serveFile(response, filePath, request))) return;
        if (!pathname.startsWith("/api/") && !extname(pathname) && (await serveFile(response, join(publicDir, "index.html")))) return;
      }

      sendJson(response, 404, { error: "页面不存在" });
    } catch (error) {
      logger.error("[AI novel] request failed", error);
      if (!response.headersSent) sendJson(response, 500, { error: error.message || "服务器错误" });
      else response.end();
    }
  });

  server.on("close", () => { memory.close(); runtime.dispose(); });
  return { server, storyStore, jobs, memory, get storyPackage() { return storyPackage; }, getRuntime: () => runtime };
}

async function main() {
  const { server, storyPackage } = await createAppServer();
  const port = Number.parseInt(process.env.PORT ?? "4317", 10);
  const host = process.env.HOST ?? "0.0.0.0";
  server.listen(port, host, () => console.log(`[AI novel] listening on ${host}:${port} (${storyPackage.id}, Pi connected)`));
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error("[AI novel] startup failed", error);
    process.exitCode = 1;
  });
}
