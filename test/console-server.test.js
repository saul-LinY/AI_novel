import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConsoleReader, createConsoleServer, stateChanges } from "../src/console-server.js";

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), "novel-console-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const root = join(dataDir, "stories", "dragon-raja");
  async function save(path, value) {
    const full = join(root, path); await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, typeof value === "string" ? value : JSON.stringify(value));
  }
  const action = "找钥匙";
  const time = "2026-09-11T01:00:00.000Z";
  const later = "2026-09-11T01:01:00.000Z";
  const sessionPath = join(root, "session.jsonl");
  const entry = (id, parentId, message) => ({ type: "message", id, parentId, timestamp: time, message });
  const session = [
    entry("old", null, { role: "user", content: [{ type: "text", text: "上一轮的输入，不属于当前轮" }] }),
    entry("input", "old", { role: "user", content: [{ type: "text", text: `<player_action>\n${action}\n</player_action>` }] }),
    entry("bad", "input", { role: "assistant", content: [{ type: "thinking", thinking: "not an output" }, { type: "toolCall", id: "bad-call", name: "submit_environment_analysis", arguments: { locationId: "missing" } }] }),
    entry("bad-result", "bad", { role: "toolResult", toolCallId: "bad-call", isError: true, content: [{ type: "text", text: "地点不存在" }] }),
    entry("good", "bad-result", { role: "assistant", model: "test-model", content: [{ type: "toolCall", id: "good-call", name: "submit_environment_analysis", arguments: { locationId: "room" } }] }),
    entry("leaf", "good", { role: "toolResult", toolCallId: "good-call", details: { accepted: true }, content: [{ type: "text", text: "已通过校验" }] }),
    entry("other-branch", "old", { role: "user", content: [{ type: "text", text: "另一条分支的输入" }] }),
  ];
  await save("session.jsonl", session.map(JSON.stringify).join("\n") + "\n");
  await save("index.json", { story: { title: "测试故事", piSessionFiles: { environment: sessionPath } }, currentBranchId: "main", branches: [{ id: "main", name: "主线" }] });
  await save("branches/main/branch.json", { id: "main", name: "主线", eventIds: ["opening", "turn"], headEventId: "turn" });
  await save("branches/main/turns/opening/event.json", { id: "opening", type: "opening", stateAfter: { locationId: "room", inventory: { key: 0 } }, piEntryIds: { environment: "old" } });
  await save("branches/main/turns/turn/event.json", { id: "turn", type: "turn", action, branchId: "main", parentEventId: "opening", stateAfter: { locationId: "room", inventory: { key: 1 } }, piEntryIds: { environment: "leaf" }, prose: "你找到了钥匙。", agentReports: { environment: { locationId: "room" } }, sharedContext: { worldState: { locationId: "room" }, domainContexts: { environment: { locationId: "room" }, character: {}, plot: {} } }, turnResult: { outcome: { summary: "找到钥匙" } }, createdAt: later });
  await save("turn-jobs/job/job.json", { turnId: "job", eventId: "turn", headEventId: "opening", branchId: "main", action, status: "complete", createdAt: time, updatedAt: later });
  await save("turn-jobs/job/events.ndjson", JSON.stringify({ type: "complete", createdAt: later }) + "\n");
  return { dataDir, root, save };
}

test("console reads the correct round and preserves failed and accepted submissions", async (t) => {
  const { dataDir } = await fixture(t);
  const reader = createConsoleReader({ dataDir });
  const list = await reader.list();
  assert.equal(list.runs.length, 1);
  assert.equal(list.runs[0].number, 1);
  const detail = await reader.detail("job");
  assert.equal(detail.steps.length, 8);
  assert.deepEqual(detail.steps.map((step) => step.id), ["shared", "environment", "character", "plot", "decision", "prose", "recorder", "commit"]);
  const environment = detail.steps.find((s) => s.id === "environment");
  assert.deepEqual(environment.attempts.map((a) => a.status), ["failed", "accepted"]);
  assert.equal(environment.attempts[0].feedback, "地点不存在");
  assert.equal(environment.input.length, 1);
  assert.match(environment.input[0].text, /找钥匙/);
  assert.doesNotMatch(JSON.stringify(detail), /上一轮的输入|另一条分支的输入|not an output/);
  assert.deepEqual(detail.steps.at(-1).output.changes, [{ path: "inventory.key", before: 0, after: 1 }]);
  assert.equal(await reader.detail("absent"), null);
});

test("failed attempts remain visible without claiming output or state was committed", async (t) => {
  const { dataDir, save } = await fixture(t);
  await save("turn-jobs/failed/job.json", { turnId: "failed", eventId: "no-event", headEventId: "turn", branchId: "main", action: "下一步失败", status: "failed", createdAt: "2026-09-11T02:00:00.000Z", updatedAt: "2026-09-11T02:01:00.000Z" });
  await save("turn-jobs/failed/events.ndjson", JSON.stringify({ type: "failed", message: "模型中断", createdAt: "2026-09-11T02:01:00.000Z" }) + '\n{"partial":');
  const reader = createConsoleReader({ dataDir });
  const list = await reader.list();
  assert.equal(list.runs[0].status, "failed");
  const detail = await reader.detail("failed");
  assert.equal(detail.error, "模型中断");
  assert.equal(detail.steps.at(-1).output, null);
  assert.equal(detail.steps.at(-1).status, "stopped");
  assert.deepEqual(detail.steps[1].attempts, []);
});

test("standalone HTTP console is read only and handles an empty data directory", async (t) => {
  const { dataDir, root } = await fixture(t);
  const before = await readFile(join(root, "index.json"), "utf8");
  const server = createConsoleServer({ dataDir });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin)).status, 200);
  assert.equal((await fetch(`${origin}/api/console/runs/job`)).status, 200);
  assert.equal((await fetch(`${origin}/api/console/runs/missing`)).status, 404);
  assert.equal((await fetch(`${origin}/api/console/runs`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${origin}/package.json`)).status, 404);
  // Every module the console page imports must actually be served.
  const app = await (await fetch(`${origin}/app.js`)).text();
  for (const [, module] of app.matchAll(/from '\.\/([\w-]+\.js)'/g)) {
    assert.equal((await fetch(`${origin}/${module}`)).status, 200, `${module} is not served`);
  }
  assert.equal((await fetch(`${origin}/api/console/performance`)).status, 200);
  assert.equal(await readFile(join(root, "index.json"), "utf8"), before);
  const empty = createConsoleReader({ dataDir: join(dataDir, "empty") });
  assert.deepEqual((await empty.list()).runs, []);
});

test("a running round exposes a saved domain report before the main proposal is ready", async (t) => {
  const { dataDir, save } = await fixture(t);
  await save("branches/main/branch.json", { id: "main", name: "主线", eventIds: ["opening"], headEventId: "opening" });
  await save("turn-jobs/job/job.json", { turnId: "job", eventId: "pending", headEventId: "opening", branchId: "main", action: "找钥匙", status: "running", createdAt: "2026-09-11T01:00:00.000Z", updatedAt: "2026-09-11T01:00:00.000Z" });
  await save("turn-jobs/job/events.ndjson", JSON.stringify({ type: "phase", phase: "analyzing", createdAt: "2026-09-11T01:00:00.000Z" }) + "\n");
  const detail = await createConsoleReader({ dataDir }).detail("job");
  assert.equal(detail.steps[1].status, "complete");
  assert.deepEqual(detail.steps[1].output, { locationId: "room" });
  assert.equal(detail.steps.find((s) => s.id === "decision").status, "waiting");
  assert.equal(detail.steps.at(-1).output, null);
});

test("state diff keeps nested, added, removed, and array changes", () => {
  assert.deepEqual(stateChanges({ inventory: { key: 0 }, gone: true, facts: [] }, { inventory: { key: 1 }, added: "new", facts: ["door"] }), [
    { path: "inventory.key", before: 0, after: 1 }, { path: "gone", before: true, after: null }, { path: "facts", before: [], after: ["door"] }, { path: "added", before: null, after: "new" },
  ]);
});

test("telemetry becomes per-step metrics and a performance summary; older runs show none", async (t) => {
  const { dataDir, save } = await fixture(t);
  const reader = createConsoleReader({ dataDir });
  const legacy = await reader.detail("job");
  assert.equal(legacy.steps.find((s) => s.id === "environment").metrics, null);
  assert.equal((await reader.performance()).turns.length, 0);

  const usage = (total) => ({ input: total - 100, output: 100, cacheRead: 50, cacheWrite: 0, totalTokens: total, cost: 0 });
  const call = (role, phase, durationMs, extra = {}) => ({ role, phase, durationMs, firstTokenMs: 200, usage: usage(1000), toolFailures: 0, autoRetries: 0, validationErrors: [], model: "m", outcome: "ok", ...extra });
  const telemetry = {
    version: 1, totalMs: 9000, marks: { prepared: 5000, firstProse: 6000, committed: 9000 },
    calls: [call("environment", "analysis", 2000, { toolFailures: 1, validationErrors: ["地点不存在：nowhere"] }), call("character", "analysis", 2500), call("plot", "analysis", 3000), call("main", "prepare", 2000), call("main", "narration", 3000)],
    totals: { usage: usage(5000) }, quality: { issues: [{ code: "too_short", severity: "minor" }] }, critic: null,
  };
  const event = JSON.parse(await readFile(join(dataDir, "stories/dragon-raja/branches/main/turns/turn/event.json"), "utf8"));
  await save("branches/main/turns/turn/event.json", { ...event, telemetry });
  const detail = await reader.detail("job");
  const environment = detail.steps.find((s) => s.id === "environment").metrics;
  assert.equal(environment.durationMs, 2000);
  assert.equal(environment.toolFailures, 1);
  assert.deepEqual(environment.validationErrors, ["地点不存在：nowhere"]);
  assert.equal(detail.steps.find((s) => s.id === "decision").metrics.durationMs, 2000);
  assert.equal(detail.steps.find((s) => s.id === "prose").metrics.durationMs, 3000);
  const performance = await reader.performance();
  assert.equal(performance.summary.totalP50, 9000);
  assert.equal(performance.summary.firstProseP50, 6000);
  assert.equal(performance.turns[0].byRole["main:narration"], 3000);
  assert.equal(performance.turns[0].failures[0].role, "environment");
});

test("控制台读取提案闸门、写作简报、连续性记录与提交后的叙事账本，状态差异不含账本", async (t) => {
  const { dataDir, save } = await fixture(t);
  const narrative = { version: 1, turn: 1, arc: [{ turn: 1, beat: "reversal", tension: 7 }], ledger: [{ id: "L1-1", turn: 1, kind: "item", text: "钥匙到手", quote: "你找到了钥匙", characterIds: [], knownByIds: [], importance: 2, status: "active" }], openLoops: [], seeds: {}, continuityNotes: [] };
  const gate = { mode: "enforce", bounces: 1, waived: [], checks: [{ id: "world", label: "世界因果", passed: true, issues: [], detail: "ok" }, { id: "pacing", label: "节奏曲线", passed: true, issues: [], detail: "开篇 → 反转7" }] };
  await save("branches/main/turns/turn/event.json", { id: "turn", type: "turn", action: "找钥匙", branchId: "main", parentEventId: "opening", stateAfter: { locationId: "room", inventory: { key: 1 }, narrative }, piEntryIds: { environment: "leaf" }, prose: "你找到了钥匙。", proposalGate: gate, beatSheet: { beat: { type: "reversal", label: "反转", tension: 7 } }, continuityRecord: { source: "agent", entries: narrative.ledger }, turnResult: { outcome: { summary: "找到钥匙" } }, createdAt: "2026-09-11T01:01:00.000Z" });
  const detail = await createConsoleReader({ dataDir }).detail("job");
  assert.equal(detail.narrative.gate.bounces, 1);
  assert.equal(detail.narrative.beatSheet.beat.type, "reversal");
  assert.equal(detail.narrative.after.ledger[0].quote, "你找到了钥匙");
  assert.equal(detail.steps.find((step) => step.id === "recorder").status, "complete");
  const commit = detail.steps.find((step) => step.id === "commit").output;
  assert.deepEqual(commit.changes, [{ path: "inventory.key", before: 0, after: 1 }]);
  assert.equal(commit.stateAfter.narrative, undefined);
});
