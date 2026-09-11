import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roles = ["environment", "character", "plot", "main"];
const terminal = new Set(["complete", "failed", "cancelled", "rejected"]);
const toolsByRole = { environment: "submit_environment_analysis", character: "submit_character_analysis", plot: "submit_plot_analysis", main: "prepare_story_turn" };

async function jsonFile(path, fallback = null) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
async function directories(path) {
  try { return (await readdir(path, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
async function lines(path) {
  try {
    const content = await readFile(path, "utf8");
    const rows = content.split("\n");
    return rows.flatMap((line, i) => {
      if (!line.trim()) return [];
      try { return [JSON.parse(line)]; }
      catch (error) { if (i === rows.length - 1) return []; throw error; }
    });
  } catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
function messageText(message) {
  if (typeof message?.content === "string") return message.content;
  return (message?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}
function visibleMessage(entry) {
  const m = entry.message;
  return { id: entry.id, timestamp: entry.timestamp, role: m.role, text: messageText(m), toolName: m.toolName,
    toolCalls: Array.isArray(m.content) ? m.content.filter((c) => c.type === "toolCall").map(({ id, name, arguments: args }) => ({ id, name, arguments: args })) : [] };
}

export function stateChanges(before, after, path = "") {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => stateChanges(before[key], after[key], path ? `${path}.${key}` : key));
  }
  return [{ path, before: before ?? null, after: after ?? null }];
}

export function createConsoleReader({ dataDir = join(projectRoot, ".ai-novel"), storyId = "dragon-raja" } = {}) {
  const storyDir = join(dataDir, "stories", storyId);
  const sessionCache = new Map();
  async function sessionEntries(path) {
    if (!path) return [];
    let info;
    try { info = await stat(path); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const cached = sessionCache.get(path);
    if (cached?.mtime === info.mtimeMs && cached.size === info.size) return cached.entries;
    const entries = await lines(path);
    sessionCache.set(path, { mtime: info.mtimeMs, size: info.size, entries });
    return entries;
  }
  async function records() {
    const index = await jsonFile(join(storyDir, "index.json"));
    if (!index) return { story: { id: storyId, title: "互动小说" }, branches: [], runs: [], events: new Map(), index: null };
    const events = new Map();
    const branchRecords = await Promise.all(index.branches.map((b) => jsonFile(join(storyDir, "branches", b.id, "branch.json"))));
    for (const branch of branchRecords.filter(Boolean)) {
      const entries = await Promise.all(branch.eventIds.map((id) => jsonFile(join(storyDir, "branches", branch.id, "turns", id, "event.json"))));
      for (const event of entries.filter(Boolean)) {
        events.set(`${branch.id}/${event.id}`, event);
      }
    }
    const jobs = (await Promise.all((await directories(join(storyDir, "turn-jobs"))).map((id) => jsonFile(join(storyDir, "turn-jobs", id, "job.json"))))).filter(Boolean);
    const runs = [];
    for (const branch of branchRecords.filter(Boolean)) {
      const turns = branch.eventIds.map((id) => events.get(`${branch.id}/${id}`)).filter((e) => e?.type === "turn");
      for (const [i, event] of turns.entries()) {
        const job = jobs.find((j) => j.eventId === event.id && j.branchId === branch.id);
        runs.push({ id: job?.turnId ?? `${branch.id}:${event.id}`, number: i + 1, branchId: branch.id, branchName: branch.name, action: event.action, status: "complete", createdAt: job?.createdAt ?? event.createdAt, updatedAt: job?.updatedAt ?? event.createdAt, event, job });
      }
      for (const job of jobs.filter((j) => j.branchId === branch.id && !turns.some((e) => e.id === j.eventId))) {
        const parentPosition = branch.eventIds.indexOf(job.headEventId);
        // Jobs from a reset story do not belong to the active branch history.
        if (parentPosition < 0) continue;
        const number = branch.eventIds.slice(0, parentPosition + 1).filter((id) => events.get(`${branch.id}/${id}`)?.type === "turn").length + 1;
        runs.push({ id: job.turnId, number, branchId: branch.id, branchName: branch.name, action: job.action, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, event: null, job });
      }
    }
    runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { story: { id: storyId, title: index.story.title, subtitle: index.story.subtitle }, currentBranchId: index.currentBranchId, branches: index.branches.map(({ id, name }) => ({ id, name })), runs, events, index };
  }

  async function trace(role, run, data) {
    const result = run.event ?? run.job?.completedTurn;
    const parentId = run.event?.parentEventId ?? run.job?.headEventId;
    const parent = data.events.get(`${run.branchId}/${parentId}`);
    const base = run.job?.prepared?.basePiEntryIds?.[role] ?? parent?.piEntryIds?.[role];
    const leaf = result?.piEntryIds?.[role];
    let entries = await sessionEntries(data.index.story.piSessionFiles?.[role]);
    if (leaf && !entries.some((e) => e.id === leaf)) {
      const folder = join(dataDir, "pi-sessions", storyId, role);
      let files = [];
      try { files = (await readdir(folder)).filter((p) => p.endsWith(".jsonl")); } catch (error) { if (error.code !== "ENOENT") throw error; }
      for (const file of files) {
        const candidates = await sessionEntries(join(folder, file));
        if (candidates.some((e) => e.id === leaf)) { entries = candidates; break; }
      }
    }
    let selected = [];
    if (leaf) {
      const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
      let node = byId.get(leaf);
      const visited = new Set();
      while (node && node.id !== base && !visited.has(node.id)) {
        visited.add(node.id); selected.unshift(node); node = byId.get(node.parentId);
      }
    } else if (run.job) {
      selected = entries.filter((e) => e.timestamp >= run.createdAt && (!terminal.has(run.status) || e.timestamp <= run.updatedAt));
    }
    // Anchor to the saved player action as well as session ancestry/time bounds.
    const start = selected.findIndex((e) => e.message?.role === "user" && messageText(e.message).includes(`<player_action>\n${run.action}\n</player_action>`));
    selected = start < 0 ? [] : selected.slice(start);
    const messages = selected.filter((e) => e.message).map(visibleMessage);
    const attempts = [];
    for (const entry of selected) {
      for (const call of Array.isArray(entry.message?.content) ? entry.message.content : []) {
        if (call.type !== "toolCall" || call.name !== toolsByRole[role]) continue;
        const reply = selected.find((e) => e.message?.role === "toolResult" && e.message.toolCallId === call.id)?.message;
        attempts.push({ id: call.id, timestamp: entry.timestamp, output: call.arguments,
          status: !reply ? "pending" : reply.isError || reply.details?.accepted === false ? "failed" : "accepted", feedback: reply ? messageText(reply) : "等待校验结果" });
      }
    }
    const lastAssistant = [...selected].reverse().find((e) => e.message?.role === "assistant");
    return { messages, attempts, model: lastAssistant?.message?.model ?? null };
  }

  async function list() {
    const data = await records();
    return { story: data.story, currentBranchId: data.currentBranchId, branches: data.branches, runs: data.runs.map(({ event, job, ...run }) => run), refreshedAt: new Date().toISOString() };
  }
  async function detail(id) {
    const data = await records();
    const run = data.runs.find((r) => r.id === id);
    if (!run) return null;
    const { job, event } = run;
    const result = event ? { reports: event.agentReports, sharedContext: event.sharedContext, proposal: event.turnResult, prose: event.prose } : job?.completedTurn ?? job?.prepared ?? {};
    const stream = job ? await lines(join(storyDir, "turn-jobs", job.turnId, "events.ndjson")) : [];
    const traces = Object.fromEntries(await Promise.all(roles.map(async (role) => [role, await trace(role, run, data)])));
    const parent = data.events.get(`${run.branchId}/${event?.parentEventId ?? job?.headEventId}`);
    let shared = result.sharedContext ?? null;
    if (!shared) {
      const contexts = {};
      for (const role of ["environment", "character", "plot"]) {
        const prompt = traces[role].messages.find((m) => m.role === "user")?.text;
        const match = prompt?.match(/<shared_context>\n([\s\S]*?)\n<\/shared_context>/);
        if (match) { try { contexts[role] = JSON.parse(match[1]); } catch { /* Preserve absent output when not recorded. */ } }
      }
      if (Object.keys(contexts).length) shared = { domainContexts: contexts };
    }
    const proposal = result.proposal ?? traces.main.attempts.findLast((a) => a.status === "accepted")?.output ?? null;
    const phase = stream.findLast((e) => e.type === "phase")?.phase;
    function status(output, active) {
      if (output != null) return "complete";
      if (terminal.has(run.status)) return run.status === "complete" ? "missing" : active && run.status === "failed" ? "failed" : "stopped";
      return active ? "running" : "waiting";
    }
    const mainMessages = traces.main.messages;
    const narrationStart = mainMessages.findIndex((m) => m.role === "user" && m.text.includes("<narration_contract>"));
    const steps = [{ id: "shared", title: "信息共享", description: "这一轮分别给三个 agent 的资料", kind: "程序处理", output: shared?.domainContexts ?? null,
      input: shared ? { action: run.action, worldState: shared.worldState ?? parent?.stateAfter ?? null, relevant: shared.relevant ?? null, unknowns: shared.unknowns ?? [] } : null, inputNote: "保存的世界状态与筛选记录", status: status(shared, phase === "analyzing"), attempts: [] }];
    for (const role of roles.slice(0, 3)) {
      const output = result.reports?.[role] ?? traces[role].attempts.findLast((a) => a.status === "accepted")?.output ?? null;
      steps.push({ id: role, title: { environment: "环境 agent", character: "人物 agent", plot: "情节 agent" }[role],
        description: { environment: "行动是否可行，有哪些现场限制", character: "人物会怎样反应，依据是什么", plot: "行动会怎样推动故事，接下来有哪些可能" }[role], kind: "并行分析", output, input: traces[role].messages.filter((m) => m.role === "user"), inputNote: "本轮实际输入消息 · 来自会话存档（不含未记录的系统提示词及历史上下文）", attempts: traces[role].attempts, model: traces[role].model,
        status: status(output, phase === "analyzing") });
    }
    steps.push({ id: "decision", title: "主创裁决", description: "综合三份报告，决定本轮最终结果", kind: "主创 agent", output: proposal,
      input: (narrationStart < 0 ? mainMessages : mainMessages.slice(0, narrationStart)).filter((m) => m.role === "user"), inputNote: "本轮实际输入消息 · 来自会话存档（不含未记录的系统提示词及历史上下文）", attempts: traces.main.attempts, model: traces.main.model, status: status(proposal, phase === "synthesizing") });
    const prose = result.prose || stream.filter((e) => e.type === "prose_delta").map((e) => e.text).join("") || null;
    steps.push({ id: "prose", title: "正文写作", description: "主创实际写出的小说正文", kind: "主创 agent", output: prose,
      input: narrationStart < 0 ? [] : mainMessages.slice(narrationStart).filter((m) => m.role === "user"), inputNote: "本轮实际写作与续写输入消息 · 来自会话存档", attempts: [], model: traces.main.model,
      status: result.prose ? "complete" : terminal.has(run.status) ? (prose ? "partial" : "stopped") : status(null, !!prose || ["narrating", "recovering"].includes(phase)) });
    steps.push({ id: "commit", title: "状态保存", description: "实际写入存档、供下一轮使用的变化", kind: "程序处理", output: event ? { changes: parent ? stateChanges(parent.stateAfter, event.stateAfter) : null, stateAfter: event.stateAfter } : null,
      input: proposal, inputNote: "主创提交的最终提案", attempts: [], status: status(event, phase === "committing") });
    const names = {};
    const ambiguousNames = new Set(["default"]);
    function collect(value) {
      if (!value || typeof value !== "object") return;
      if (value.id && (value.name || value.title) && !ambiguousNames.has(value.id)) {
        const name = value.name || value.title;
        if (names[value.id] && names[value.id] !== name) { delete names[value.id]; ambiguousNames.add(value.id); }
        else names[value.id] = name;
      }
      for (const item of Object.values(value)) collect(item);
    }
    collect(parent?.stateAfter); collect(event?.stateAfter); collect(shared);
    const catalog = traces.environment.messages.find((m) => m.role === "user")?.text.match(/<location_catalog>\n([\s\S]*?)\n<\/location_catalog>/);
    if (catalog) { try { collect(JSON.parse(catalog[1])); } catch { /* IDs remain readable without a catalog. */ } }
    const { event: _event, job: _job, ...meta } = run;
    return { ...meta, story: data.story, steps, names, error: stream.findLast((e) => ["failed", "error", "rejected", "cancelled"].includes(e.type))?.message ?? null,
      timeline: stream.filter((e) => ["start", "phase", "prepared", "complete", "failed", "error", "rejected", "cancelled"].includes(e.type)).map(({ type, phase, createdAt, message }) => ({ type, phase, createdAt, message })) };
  }
  return { list, detail };
}

export function createConsoleServer(options = {}) {
  const reader = createConsoleReader(options);
  const files = { "/": ["index.html", "text/html"], "/app.js": ["app.js", "text/javascript"], "/styles.css": ["styles.css", "text/css"] };
  return createServer(async (request, response) => {
    const send = (code, data) => { response.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(data)); };
    try {
      if (request.method !== "GET") return send(405, { error: "仅支持查看记录" });
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/api/console/runs") return send(200, await reader.list());
      if (url.pathname.startsWith("/api/console/runs/")) {
        const detail = await reader.detail(decodeURIComponent(url.pathname.slice("/api/console/runs/".length)));
        return send(detail ? 200 : 404, detail ?? { error: "找不到这次运行记录" });
      }
      const file = files[url.pathname];
      if (!file) return send(404, { error: "页面不存在" });
      const content = await readFile(join(projectRoot, "console", file[0]));
      response.writeHead(200, { "content-type": `${file[1]}; charset=utf-8`, "cache-control": "no-cache" }); response.end(content);
    } catch (error) {
      console.error("[workflow console]", error);
      send(500, { error: "读取记录失败，请稍后刷新。" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.CONSOLE_PORT ?? 4318);
  const server = createConsoleServer({ dataDir: process.env.AI_NOVEL_DATA_DIR, storyId: process.env.AI_NOVEL_STORY_ID ?? "dragon-raja" });
  server.listen(port, "127.0.0.1", () => console.log(`工作流控制台 http://127.0.0.1:${port}`));
}
