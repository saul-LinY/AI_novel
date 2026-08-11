import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendTurn, createBranch, selectBranch, serializeStore } from "./story-domain.js";
import { PiStoryRuntime } from "./pi-story-runtime.js";
import { StoryStore } from "./story-store.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(sourceDir, "..");
const publicDir = join(projectRoot, "public");
const dataDir = join(projectRoot, ".ai-novel");
const lucidePath = join(projectRoot, "node_modules", "lucide", "dist", "umd", "lucide.min.js");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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

function writeStreamEvent(response, event) {
  response.write(`${JSON.stringify(event)}\n`);
}

async function serveFile(response, filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    response.writeHead(200, {
      "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
      "content-length": fileStat.size,
      "cache-control": "no-cache",
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function createAppServer(options = {}) {
  const storyStore = new StoryStore(options.dataDir ?? dataDir);
  const initialStore = await storyStore.load();
  const requestedMode = options.mode ?? process.env.AI_NOVEL_MODE ?? "auto";
  let runtime = new PiStoryRuntime({
    projectRoot,
    dataDir: options.dataDir ?? dataDir,
    requestedMode,
  });
  await runtime.initialize(initialStore);
  await storyStore.save();
  let busy = false;

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);

    try {
      if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, { ok: true, mode: runtime.mode, busy });
        return;
      }

      if (request.method === "GET" && pathname === "/api/story") {
        const store = await storyStore.load();
        sendJson(response, 200, serializeStore(store, runtime.mode));
        return;
      }

      if (request.method === "POST" && pathname === "/api/turn") {
        if (busy) {
          sendJson(response, 409, { error: "上一回合还没有完成" });
          return;
        }
        const body = await readJson(request);
        const action = typeof body.action === "string" ? body.action.trim() : "";
        if (!action || action.length > 300) {
          sendJson(response, 400, { error: "请输入 1 到 300 个字符的行动" });
          return;
        }

        const store = await storyStore.load();
        const branchId = body.branchId ?? store.currentBranchId;
        const branch = store.branches[branchId];
        if (!branch || branchId !== store.currentBranchId) {
          sendJson(response, 409, { error: "当前分支已经变化，请刷新后重试" });
          return;
        }
        const headEvent = store.events[branch.headEventId];
        const recentEvents = branch.eventIds.slice(-6).map((eventId) => store.events[eventId]);

        busy = true;
        response.writeHead(200, {
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-store",
          connection: "keep-alive",
          "x-content-type-options": "nosniff",
        });
        writeStreamEvent(response, { type: "start", mode: runtime.mode });

        try {
          const result = await runtime.generateTurn(
            {
              action,
              state: headEvent.stateAfter,
              recentEvents,
              piEntryId: headEvent.piEntryId,
            },
            (text) => writeStreamEvent(response, { type: "delta", text }),
          );
          appendTurn(store, {
            branchId,
            action,
            prose: result.prose,
            proposal: result.proposal,
            piEntryId: result.piEntryId,
          });
          store.story.piSessionFile = runtime.session?.sessionFile ?? store.story.piSessionFile;
          await storyStore.save();
          writeStreamEvent(response, { type: "complete", story: serializeStore(store, runtime.mode) });
        } catch (error) {
          console.error("[AI novel] turn failed", error);
          writeStreamEvent(response, { type: "error", error: error.message || "本回合生成失败" });
        } finally {
          busy = false;
          response.end();
        }
        return;
      }

      if (request.method === "POST" && pathname === "/api/cancel") {
        await runtime.abort();
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && pathname === "/api/branches") {
        if (busy) {
          sendJson(response, 409, { error: "故事生成时不能创建分支" });
          return;
        }
        const body = await readJson(request);
        const store = await storyStore.load();
        const branch = createBranch(store, body.eventId, body.name);
        await storyStore.save();
        sendJson(response, 201, { branch, story: serializeStore(store, runtime.mode) });
        return;
      }

      if (request.method === "POST" && pathname === "/api/branches/select") {
        if (busy) {
          sendJson(response, 409, { error: "故事生成时不能切换分支" });
          return;
        }
        const body = await readJson(request);
        const store = await storyStore.load();
        selectBranch(store, body.branchId);
        await storyStore.save();
        sendJson(response, 200, { story: serializeStore(store, runtime.mode) });
        return;
      }

      if (request.method === "POST" && pathname === "/api/reset") {
        if (busy) {
          sendJson(response, 409, { error: "故事生成时不能重置" });
          return;
        }
        runtime.dispose();
        const store = await storyStore.reset();
        runtime = new PiStoryRuntime({
          projectRoot,
          dataDir: options.dataDir ?? dataDir,
          requestedMode,
        });
        await runtime.initialize(store);
        await storyStore.save();
        sendJson(response, 200, { story: serializeStore(store, runtime.mode) });
        return;
      }

      if (request.method === "GET" && pathname === "/vendor/lucide.js") {
        if (await serveFile(response, lucidePath)) return;
        sendJson(response, 404, { error: "图标资源未安装" });
        return;
      }

      if (request.method === "GET") {
        const requestedPath = pathname === "/" ? "/index.html" : pathname;
        const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
        const filePath = resolve(publicDir, `.${normalizedPath}`);
        if (filePath.startsWith(publicDir) && (await serveFile(response, filePath))) return;
        if (!extname(pathname) && (await serveFile(response, join(publicDir, "index.html")))) return;
      }

      sendJson(response, 404, { error: "页面不存在" });
    } catch (error) {
      console.error("[AI novel] request failed", error);
      if (!response.headersSent) sendJson(response, 500, { error: error.message || "服务器错误" });
      else response.end();
    }
  });

  server.on("close", () => runtime.dispose());
  return { server, storyStore, getRuntime: () => runtime };
}

async function main() {
  const { server, getRuntime } = await createAppServer();
  const port = Number.parseInt(process.env.PORT ?? "4317", 10);
  server.listen(port, "127.0.0.1", () => {
    console.log(`[AI novel] http://127.0.0.1:${port} (${getRuntime().mode} mode)`);
  });
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error("[AI novel] startup failed", error);
    process.exitCode = 1;
  });
}
