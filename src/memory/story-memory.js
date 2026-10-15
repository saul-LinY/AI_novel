import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildMemoryCorpus, lexicalSearch, memoryExcerpt } from './cards.js';
import { memoryFailure } from './errors.js';
import { BM25Backend } from './bm25-backend.js';
import { buildAliasGroups } from './bm25.js';
import { buildGraphSnapshot, createGraphitiMemory } from './graphiti-memory.js';
import { graphLifecycle } from './graphiti-projection.js';

export const DEFAULT_MEMORY_CONFIG = Object.freeze({
  enabled: false, retriever: 'bm25', searchTimeoutMs: 10000, topK: 5, maxContextChars: 6000,
});

export async function readMemoryConfig(dataDir) {
  let config = {};
  try { config = JSON.parse(await readFile(join(dataDir, 'memory', 'config.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (process.env.AI_NOVEL_MEMORY === 'off') config.enabled = false;
  return validateConfig(config);
}

function validateConfig(input) {
  const config = Object.fromEntries(Object.entries(DEFAULT_MEMORY_CONFIG).map(([key, fallback]) => [key, input[key] ?? fallback]));
  if (config.retriever !== 'bm25') throw new Error('Only the local BM25 memory retriever is supported');
  if (typeof config.enabled !== 'boolean') throw new Error('Invalid memory enabled');
  for (const [key, min, max] of [['topK', 1, 20], ['maxContextChars', 500, 20000], ['searchTimeoutMs', 10, 30000]]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error('Invalid memory ' + key);
  }
  return config;
}

async function bounded(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Memory retrieval timed out'), { code: 'MEMORY_RECALL_TIMEOUT', stage: 'recall-deadline', timeoutMs })), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

export class StoryMemory {
  constructor({ dataDir, config = {}, backend, graph = null, logger = console }) {
    this.dataDir = dataDir;
    this.instanceId = resolve(dataDir);
    this.config = validateConfig(config);
    this.backend = backend ?? (this.config.enabled ? new BM25Backend(dataDir) : null);
    this.logger = logger;
    this.graph = graph;
    this.indexed = new Map();
    this.pending = null;
    this.latestInput = null;
    this.running = null;
    this.retryTimer = null;
    this.closed = false;
    this.stats = { enabled: this.config.enabled, backend: this.config.enabled ? this.config.retriever : 'disabled', healthy: null, indexHealthy: null, recallHealthy: null, indexing: false, cards: 0, indexed: 0, lastError: null, lastIndexError: null, lastRecallError: null, lastRecallFailures: [], lastRecallAt: null, lastRecallMs: null, rejectedHits: 0 };
  }

  corpus(input) {
    const corpus = buildMemoryCorpus({ ...input, instanceId: this.instanceId });
    const branch = input.store.branches[input.branchId ?? input.store.currentBranchId];
    corpus.aliasGroups = buildAliasGroups(input.storyPackage, input.store.events[branch.headEventId]?.stateAfter);
    return corpus;
  }
  status() { return { ...this.stats, ...(this.graph ? { graphiti: this.graph.status() } : {}) }; }
  refreshHealth() {
    this.stats.healthy = this.stats.indexHealthy === null && this.stats.recallHealthy === null ? null : this.stats.indexHealthy !== false && this.stats.recallHealthy !== false;
    this.stats.lastError = this.stats.lastRecallError ?? this.stats.lastIndexError;
  }

  enqueue(store, storyPackage, branchId = store.currentBranchId) {
    if (!this.config.enabled || this.closed) return;
    if (this.graph) this.graph.enqueue({
      ...buildGraphSnapshot(this.corpus({ store, storyPackage, branchId }), { store, storyPackage, branchId }),
      ...graphLifecycle({ store, storyPackage, instanceId: this.instanceId }),
    });
    this.pending = { store: structuredClone(store), storyPackage, branchId };
    this.latestInput = this.pending;
    clearTimeout(this.retryTimer);
    if (!this.running) {
      this.running = this.runQueue().finally(() => {
        this.running = null;
        if (this.pending && !this.closed) this.enqueue(this.pending.store, this.pending.storyPackage, this.pending.branchId);
      });
    }
  }

  async runQueue() {
    while (this.pending && !this.closed) {
      const input = this.pending;
      this.pending = null;
      try { await this.sync(input); clearTimeout(this.retryTimer); }
      catch (error) {
        if (this.closed) return;
        this.stats.indexHealthy = false;
        this.stats.lastIndexError = memoryFailure(error, 'index').message;
        this.refreshHealth();
        this.logger.warn?.('[AI novel memory] indexing deferred:', JSON.stringify({ at: new Date().toISOString(), ...memoryFailure(error, 'index') }));
        this.retryTimer = setTimeout(() => {
          if (this.latestInput === input && !this.closed) this.enqueue(input.store, input.storyPackage, input.branchId);
        }, 15000);
        this.retryTimer.unref();
        if (!this.pending) return;
      }
    }
  }

  async checkpoint(scope, ids) {
    const directory = join(this.dataDir, 'memory', 'checkpoints');
    await mkdir(directory, { recursive: true });
    const file = join(directory, `${scope}.json`);
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, backend: this.config.retriever, indexedIds: [...ids], updatedAt: new Date().toISOString() }));
    await rename(temporary, file);
  }

  async sync(input) {
    if (!this.config.enabled || this.closed) return { cards: 0, indexed: 0 };
    const corpus = this.corpus(input);
    this.stats.indexing = true;
    this.stats.cards = corpus.records.length;
    let ids = new Set();
    try {
      ids = new Set(await this.backend.replaceScope(corpus.scope, corpus.records));
      this.indexed.set(corpus.scope, ids);
      this.stats.indexed = ids.size;
      this.stats.indexHealthy = true;
      this.stats.lastIndexError = null;
      this.refreshHealth();
      return { backend: 'bm25', cards: corpus.records.length, indexed: ids.size };
    } catch (error) {
      this.stats.indexHealthy = false;
      this.stats.lastIndexError = memoryFailure(error, 'index').message;
      this.refreshHealth();
      throw error;
    } finally {
      this.stats.indexing = false;
      await this.checkpoint(corpus.scope, ids);
    }
  }

  async searchView(corpus, view, query, { limit = this.config.topK, state, graphStream } = {}) {
    const allowed = corpus.records.filter((record) => record.view === view && (!record.factId || !view.startsWith('character:') || !state || state.characters[view.slice(10)]?.knowledgeFactIds?.includes(record.factId)));
    const byId = new Map(allowed.map((record) => [record.id, record]));
    const matched = new Map();
    let degraded = false;
    let rejected = 0;
    let failure = null;
    if (!allowed.length) return { hits: [], degraded: false, rejected: 0, failure: null };
    try {
      // Permission and historical-cutoff filtering precede local statistics and
      // ranking: hidden documents cannot influence a character's BM25 index.
      const response = await bounded(this.backend.search({ scope: corpus.scope, view, query, limit: Math.min(60, limit * 3), records: allowed, aliasGroups: corpus.aliasGroups ?? [] }), this.config.searchTimeoutMs);
      for (const [rank, hit] of (response.results ?? []).entries()) {
        const record = byId.get(hit.metadata?.card_id);
        if (!record || hit.metadata?.content_hash !== record.contentHash || hit.metadata?.source_event_id !== record.sourceEventId || hit.memory !== record.text) { rejected++; continue; }
        if (!matched.has(record.id)) matched.set(record.id, { record, rankScore: 1 / (60 + rank + 1), score: hit.score ?? null, matchedTerms: hit.matchedTerms });
      }
    } catch (error) {
      degraded = true;
      failure = memoryFailure(error);
    }
    const fallback = degraded || rejected ? allowed : [];
    for (const [rank, hit] of lexicalSearch(fallback, query, limit).entries()) {
      if (!matched.has(hit.record.id)) matched.set(hit.record.id, { record: hit.record, rankScore: 1 / (60 + rank + 1), score: null });
    }
    const graph = this.graph && graphStream ? await this.graph.recall(graphStream, allowed, query, [...matched.keys()].slice(0, 60)) : null;
    if (graph) {
      rejected += graph.rejected;
      for (const [rank, hit] of graph.hits.entries()) {
        const existing = matched.get(hit.record.id);
        if (existing) { existing.rankScore += 1 / (60 + rank + 1); existing.retrievalSources = ['bm25', 'graphiti']; }
        else matched.set(hit.record.id, { ...hit, rankScore: 1 / (60 + rank + 1), retrievalSources: ['graphiti'] });
      }
    }
    const ordered = [...matched.values()].sort((a, b) => b.rankScore - a.rankScore || b.record.ordinal - a.record.ordinal);
    const selected = ordered;
    const hits = selected.slice(0, limit).map((hit) => ({ ...memoryExcerpt(hit.record, hit.score),
      ...(hit.excerpt ? { text: hit.excerpt.text, sourceOffset: hit.excerpt.offset, truncated: hit.excerpt.text.length < hit.record.text.length } : {}),
      ...(hit.matchedTerms ? { matchedTerms: hit.matchedTerms } : {}), ...(hit.retrievalSources ? { retrievalSources: hit.retrievalSources } : {}) }));
    return { hits, degraded, rejected, failure, ...(graph ? { graph: { state: graph.state, ranking: graph.ranking, waitedForIndex: graph.waitedForIndex ?? false, elapsedMs: graph.elapsedMs ?? null, matched: graph.hits.length, rejected: graph.rejected, indexedThroughEventId: graph.indexedThroughEventId ?? null, ...(graph.error ? { error: graph.error } : {}) } } : {}) };
  }

  async recall({ store, storyPackage, branchId = store.currentBranchId, action, characterIds }) {
    if (!this.config.enabled || this.closed) return null;
    const started = performance.now();
    const corpus = this.corpus({ store, storyPackage, branchId });
    const branch = store.branches[branchId];
    const state = store.events[branch.headEventId].stateAfter;
    const location = storyPackage.locations?.find((item) => item.id === state.locationId)?.name ?? state.locationId;
    const currentStage = storyPackage.stages?.find((item) => item.id === state.storyProgress?.currentStageId);
    const ids = (characterIds ?? Object.values(state.characters).filter((character) => character.id === storyPackage.playerCharacterId || (character.status === 'active' && character.locationId === state.locationId) || [character.name, ...(character.aliases ?? [])].some((name) => name && action.includes(name))).map((character) => character.id)).filter((id) => state.characters[id]).slice(0, 8);
    // The player's immediate question/action drives relevance. A long stage
    // objective otherwise dominates short questions about a concrete detail.
    const query = action.trim() || [location, currentStage?.purpose ?? currentStage?.title ?? ''].join('；');
    const views = ['global', 'environment', ...ids.map((id) => `character:${id}`)];
    const graphSnapshot = this.graph ? buildGraphSnapshot(corpus, { store, storyPackage, branchId }) : null;
    const results = await Promise.all(views.map((view) => this.searchView(corpus, view, query, { state, graphStream: graphSnapshot?.streams.find((s) => s.view === view) })));
    const share = Math.floor(this.config.maxContextChars / views.length);
    const boundedHits = results.map(({ hits }) => {
      let remaining = share;
      return hits.flatMap((hit) => {
        if (remaining <= 0) return [];
        const text = hit.text.slice(0, remaining);
        remaining -= text.length;
        return [{ ...hit, text, truncated: Boolean(hit.truncated) || text.length < hit.text.length }];
      });
    });
    const elapsedMs = Math.round(performance.now() - started);
    const degraded = results.some((result) => result.degraded);
    const rejected = results.reduce((sum, result) => sum + result.rejected, 0);
    const failures = results.flatMap((result, index) => result.failure ? [{ view: views[index], ...result.failure }] : []);
    const recalledAt = new Date().toISOString();
    this.stats.lastRecallMs = elapsedMs;
    this.stats.lastRecallAt = recalledAt;
    this.stats.rejectedHits += rejected;
    this.stats.recallHealthy = !degraded;
    this.stats.lastRecallError = failures[0]?.message ?? null;
    this.stats.lastRecallFailures = failures;
    this.refreshHealth();
    if (degraded) this.logger.warn?.('[AI novel memory] recall degraded:', JSON.stringify({ at: recalledAt, sourceHeadEventId: branch.headEventId, failures }));
    return {
      global: boundedHits[0], environment: boundedHits[1],
      characters: Object.fromEntries(ids.map((id, i) => [id, boundedHits[i + 2]])),
      trace: { backend: this.graph ? 'bm25+graphiti' : this.config.retriever, degraded, elapsedMs, recalledAt, failures, retrievalBudgetMs: this.config.searchTimeoutMs, rejectedHits: rejected, query, scope: corpus.scope, sourceHeadEventId: branch.headEventId, counts: Object.fromEntries(views.map((view, i) => [view, boundedHits[i].length])), ...(this.graph ? { graphiti: Object.fromEntries(views.map((view, i) => [view, results[i].graph ?? { state: 'empty' }])) } : {}) },
    };
  }

  async drain() { while (this.running) await this.running; await this.graph?.drain(); }
  close() { this.closed = true; this.pending = null; clearTimeout(this.retryTimer); this.backend?.close?.(); this.graph?.close(); }
}

export async function createStoryMemory({ dataDir, logger, config, backend, graph }) {
  config ??= await readMemoryConfig(dataDir);
  if (graph === undefined && config.enabled) {
    try { graph = await createGraphitiMemory({ dataDir, logger }); }
    catch { logger?.warn?.('[AI novel graphiti] configuration unavailable; retaining local memory'); }
  }
  return new StoryMemory({ dataDir, logger, backend, graph, config });
}
