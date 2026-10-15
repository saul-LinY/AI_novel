import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { buildGraphSnapshot, verifyGraphHits } from './graphiti-projection.js';

export const DEFAULT_GRAPHITI_CONFIG = Object.freeze({ enabled: false, url: 'http://127.0.0.1:4320', timeoutMs: 10000, readyWaitMs: 10000, topK: 5 });

export async function readGraphitiConfig(dataDir) {
  let input = {};
  try { input = JSON.parse(await readFile(join(dataDir, 'graphiti', 'config.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const config = { ...DEFAULT_GRAPHITI_CONFIG, ...input };
  if (process.env.AI_NOVEL_GRAPHITI === 'off' || process.env.AI_NOVEL_MEMORY === 'off') config.enabled = false;
  const url = new URL(config.url);
  if (typeof config.enabled !== 'boolean' || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Invalid local Graphiti configuration');
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 50 || config.timeoutMs > 120000 || !Number.isInteger(config.readyWaitMs) || config.readyWaitMs < 0 || config.readyWaitMs > 300000 || !Number.isInteger(config.topK) || config.topK < 1 || config.topK > 20) throw new Error('Invalid Graphiti retrieval limits');
  return config;
}

export class GraphitiMemory {
  constructor({ config, token, fetchImpl = fetch, logger = console }) {
    this.config = config;
    this.token = token;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.pending = new Map();
    this.lifecycle = new Map();
    this.running = null;
    this.closed = false;
    this.retry = null;
    this.controllers = new Set();
    this.stats = { enabled: true, healthy: null, indexing: false, lastSyncAt: null, lastError: null, streams: [] };
  }

  status() {
    const { streams, ...stats } = this.stats;
    // This status reaches the reader API; perspective identities belong only
    // in the local author's console, not in the public health response.
    return { ...stats, perspectives: streams.length, readyPerspectives: streams.filter((s) => s.status === 'ready').length,
      indexedSources: streams.reduce((n, s) => n + s.indexed, 0), totalSources: streams.reduce((n, s) => n + s.total, 0),
      stateReadyPerspectives: streams.filter((s) => s.statesReady).length };
  }

  async refreshStatus() {
    const scope = this.stats.streams[0]?.scope;
    if (!scope || this.closed) return;
    try {
      const result = await this.request('/status?' + new URLSearchParams({ scope }));
      this.stats.streams = result.streams;
      this.stats.indexing = result.streams.some((s) => s.status !== 'ready');
      this.stats.healthy = !result.streams.some((s) => s.status === 'failed');
      this.stats.lastError = this.stats.healthy ? null : 'Graphiti indexing awaiting retry';
    } catch (e) { this.stats.healthy = false; this.stats.lastError = e.message; }
  }

  async request(path, body, timeoutMs = this.config.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    this.controllers.add(controller);
    try {
      const response = await this.fetch(this.config.url + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Graphiti HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      // Never forward provider errors, tokens or request bodies into player APIs.
      throw Object.assign(new Error(controller.signal.aborted ? 'Graphiti request timed out' : 'Graphiti service unavailable'), { code: 'GRAPHITI_UNAVAILABLE' });
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }

  enqueue(snapshot) {
    if (this.closed || (!snapshot.streams.length && !snapshot.owner)) return;
    if (snapshot.owner) {
      this.lifecycle.set(snapshot.owner, snapshot.activeScopes);
      for (const [key, old] of this.pending) {
        if (old.owner === snapshot.owner && (!old.streams.length || !snapshot.activeScopes.includes(old.streams[0].scope))) this.pending.delete(key);
      }
    }
    this.pending.set(snapshot.streams[0]?.scope ?? `lifecycle:${snapshot.owner}`, snapshot);
    this.startQueue();
  }

  startQueue() {
    if (this.running || this.closed) return;
    clearTimeout(this.retry);
    this.running = this.runQueue().finally(() => {
      this.running = null;
      if (this.pending.size && !this.closed) {
        this.retry = setTimeout(() => this.startQueue(), 15000);
        this.retry.unref();
      }
    });
  }

  async runQueue() {
    while (this.pending.size && !this.closed) {
      const [scope, snapshot] = this.pending.entries().next().value;
      this.pending.delete(scope);
      const live = () => !snapshot.owner || (snapshot.streams.length
        ? this.lifecycle.get(snapshot.owner)?.includes(snapshot.streams[0].scope)
        : this.lifecycle.get(snapshot.owner) === snapshot.activeScopes);
      if (!live()) continue;
      try {
        const response = await this.request('/sync', snapshot.owner ? { ...snapshot, activeScopes: this.lifecycle.get(snapshot.owner) } : snapshot, 5000);
        if (!live()) continue;
        this.stats = { ...this.stats, healthy: true, lastError: null, lastSyncAt: new Date().toISOString(), indexing: response.streams.some((s) => s.status !== 'ready'), streams: response.streams };
      } catch (e) {
        if (this.closed) return;
        if (!live()) continue; // A failed pre-reset request must never resurrect its old scope.
        if (!this.pending.has(scope)) this.pending.set(scope, snapshot);
        this.stats.healthy = false;
        this.stats.lastError = e.message;
        this.logger.warn?.('[AI novel graphiti] synchronization deferred:', e.message);
        return;
      }
    }
  }

  async recall(stream, allowed, query, candidateIds = []) {
    if (this.closed || !stream) return { hits: [], rejected: 0, state: 'disabled' };
    try {
      const started = Date.now();
      const waitBudget = this.config.readyWaitMs ?? DEFAULT_GRAPHITI_CONFIG.readyWaitMs;
      const deadline = started + waitBudget;
      const body = { scope: stream.scope, view: stream.view, fingerprint: stream.fingerprint, query, limit: this.config.topK, candidateIds };
      let response = await this.request('/search', body);
      let waited = false;
      // A stale historical snapshot is never waited on or substituted. Only
      // transient readiness states may be retried against this exact snapshot.
      while (!this.closed && ['pending', 'indexing', 'initializing', 'updating'].includes(response.state) && Date.now() < deadline) {
        waited = true;
        const controller = new AbortController();
        this.controllers.add(controller);
        try {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, Math.min(1000, deadline - Date.now()));
            controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
          });
        } finally { this.controllers.delete(controller); }
        if (this.closed) return { hits: [], rejected: 0, state: 'disabled' };
        if (Date.now() >= deadline) break;
        response = await this.request('/search', body, Math.min(this.config.timeoutMs, Math.max(1, deadline - Date.now())));
      }
      this.stats.healthy = true;
      this.stats.lastError = null;
      return { ...verifyGraphHits(response, allowed), state: response.state, ranking: response.ranking, waitedForIndex: waited, elapsedMs: Date.now() - started, groupId: response.groupId, indexedThroughEventId: response.indexedThroughEventId };
    } catch (e) {
      this.stats.healthy = false;
      this.stats.lastError = e.message;
      return { hits: [], rejected: 0, state: 'unavailable', error: e.message };
    }
  }

  async drain() { while (this.running) await this.running; }
  close() { this.closed = true; this.pending.clear(); clearTimeout(this.retry); for (const c of this.controllers) c.abort(); }
}

export async function createGraphitiMemory({ dataDir, logger, config }) {
  config ??= await readGraphitiConfig(dataDir);
  if (!config.enabled) return null;
  const env = parseEnv(await readFile(join(dataDir, 'graphiti', 'service.env'), 'utf8'));
  if (!env.GRAPHITI_API_TOKEN) throw new Error('Graphiti service token is missing');
  return new GraphitiMemory({ config, token: env.GRAPHITI_API_TOKEN, logger });
}

export { buildGraphSnapshot };
