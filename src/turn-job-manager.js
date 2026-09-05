import { appendFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const TERMINAL_STATUSES = new Set(["complete", "rejected", "cancelled", "failed"]);

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

function parseEvents(contents) {
  return contents.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export class TurnJobManager {
  constructor(rootDir, storyId) {
    this.jobsDir = join(rootDir, "stories", storyId, "turn-jobs");
    this.jobs = new Map();
  }

  jobDir(turnId) {
    return join(this.jobsDir, turnId);
  }

  async initialize() {
    let ids = [];
    try {
      ids = await readdir(this.jobsDir);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const turnId of ids) {
      try {
        const record = JSON.parse(await readFile(join(this.jobDir(turnId), "job.json"), "utf8"));
        const events = parseEvents(await readFile(join(this.jobDir(turnId), "events.ndjson"), "utf8"));
        this.jobs.set(turnId, { ...record, events, listeners: new Set() });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  activeJob() {
    return [...this.jobs.values()]
      .filter((job) => !TERMINAL_STATUSES.has(job.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  recoverableJobs() {
    return [...this.jobs.values()].filter((job) => !TERMINAL_STATUSES.has(job.status));
  }

  get(turnId) {
    return this.jobs.get(turnId) ?? null;
  }

  async create(input) {
    if (this.activeJob()) throw new Error("上一回合还没有完成");
    const createdAt = new Date().toISOString();
    const job = {
      ...structuredClone(input),
      status: "queued",
      prepared: null,
      createdAt,
      updatedAt: createdAt,
      events: [],
      listeners: new Set(),
    };
    await mkdir(this.jobDir(job.turnId), { recursive: true });
    await writeFile(join(this.jobDir(job.turnId), "events.ndjson"), "", { flag: "wx" }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    this.jobs.set(job.turnId, job);
    await this.persist(job);
    this.emit(job, { type: "start", status: "queued", action: job.action, trustedChoice: job.trustedChoice });
    return job;
  }

  serializable(job) {
    const { events: _events, listeners: _listeners, ...record } = job;
    return record;
  }

  async persist(job) {
    job.updatedAt = new Date().toISOString();
    await atomicJson(join(this.jobDir(job.turnId), "job.json"), this.serializable(job));
  }

  emit(job, event) {
    const envelope = {
      ...event,
      turnId: job.turnId,
      seq: job.events.length + 1,
      createdAt: new Date().toISOString(),
    };
    job.events.push(envelope);
    appendFileSync(join(this.jobDir(job.turnId), "events.ndjson"), `${JSON.stringify(envelope)}\n`, "utf8");
    for (const response of job.listeners) {
      if (!response.writableEnded) response.write(`${JSON.stringify(envelope)}\n`);
    }
    if (["complete", "rejected", "cancelled", "failed"].includes(envelope.type)) {
      job.status = envelope.type;
      for (const response of job.listeners) if (!response.writableEnded) response.end();
      job.listeners.clear();
    }
    return envelope;
  }

  async setStatus(job, status) {
    job.status = status;
    await this.persist(job);
  }

  async setPrepared(job, prepared) {
    job.status = "prepared";
    job.prepared = structuredClone(prepared);
    await this.persist(job);
  }

  prosePrefix(job) {
    return job.events.filter((event) => event.type === "prose_delta").map((event) => event.text).join("");
  }

  closeStreams(job) {
    for (const response of job.listeners) if (!response.writableEnded) response.end();
    job.listeners.clear();
  }

  stream(turnId, response, afterSeq = 0) {
    const job = this.get(turnId);
    if (!job) return false;
    response.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-content-type-options": "nosniff",
    });
    for (const event of job.events) {
      if (event.seq > afterSeq) response.write(`${JSON.stringify(event)}\n`);
    }
    if (TERMINAL_STATUSES.has(job.status)) {
      response.end();
      return true;
    }
    job.listeners.add(response);
    response.on("close", () => job.listeners.delete(response));
    return true;
  }
}
