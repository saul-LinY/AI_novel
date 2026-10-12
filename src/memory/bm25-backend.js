import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BM25Index } from './bm25.js';
import { digest } from './cards.js';

export function bm25IndexPath(dataDir, scope) { return join(dataDir, 'memory', 'bm25', digest(scope) + '.json'); }

export async function readBM25Snapshot(dataDir, scope) {
  try {
    const value = JSON.parse(await readFile(bm25IndexPath(dataDir, scope), 'utf8'));
    if (value.version !== 1 || value.scope !== scope || !Array.isArray(value.records)) throw new Error('Invalid BM25 index snapshot');
    return value;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export class BM25Backend {
  constructor(dataDir) { this.dataDir = dataDir; this.cache = new Map(); this.kind = 'bm25'; }
  async replaceScope(scope, records) {
    let previous;
    try { previous = await readBM25Snapshot(this.dataDir, scope); } catch { previous = null; }
    const fingerprint = digest(records.map((record) => [record.id, record.contentHash]));
    if (previous?.fingerprint === fingerprint && previous.records.length === records.length && previous.records.every((record, i) => record.id === records[i].id && record.text === records[i].text && record.contentHash === records[i].contentHash)) return records.map((record) => record.id);
    const old = new Map((previous?.records ?? []).map((record) => [record.id, record]));
    const now = new Date().toISOString();
    const snapshot = { version: 1, backend: 'bm25', scope, fingerprint, updatedAt: now, records: records.map((record) => ({ ...record, indexedAt: old.get(record.id)?.indexedAt ?? now })) };
    const directory = join(this.dataDir, 'memory', 'bm25');
    await mkdir(directory, { recursive: true });
    const path = bm25IndexPath(this.dataDir, scope);
    const temporary = path + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
    await rename(temporary, path);
    return records.map((record) => record.id);
  }
  async existing(scope) { return (await readBM25Snapshot(this.dataDir, scope))?.records.map((record) => record.id) ?? []; }
  async search({ scope, view, query, limit, records, aliasGroups = [] }) {
    if (!Array.isArray(records) || records.some((record) => record.scope !== scope || record.view !== view)) throw new Error('BM25 requires a verified role-scoped corpus');
    const key = digest([scope, view, records.map((record) => record.id), aliasGroups]);
    let index = this.cache.get(key);
    if (!index) {
      index = new BM25Index(records, aliasGroups); this.cache.set(key, index);
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
    }
    return { results: index.search(query, limit).map(({ record, score, matchedTerms }) => ({ memory: record.text, score, matchedTerms, metadata: { card_id: record.id, content_hash: record.contentHash, source_event_id: record.sourceEventId } })) };
  }
  metrics() { return Promise.resolve({ backend: 'bm25', remoteRequests: 0, cachedIndexes: this.cache.size }); }
  close() { this.cache.clear(); }
}
