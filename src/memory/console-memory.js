import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildMemoryCorpus } from './cards.js';
import { readBM25Snapshot } from './bm25-backend.js';
import { loadStoryPackage, resolvePlayableRole } from '../story-package.js';

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export function createMemoryInspector({ dataDir, storyId, projectRoot, loadPackage }) {
  let packageCache = null;
  let packageKey = null;

  async function indexState(scope, receipt) {
    // Read only the local index; observation never invokes models or changes memory.
    const config = await readJson(join(dataDir, 'memory', 'config.json'), {});
    if (!config.enabled) return { state: 'disabled', backend: 'bm25', points: new Map(), receipt, checkedAt: null };
    try {
      const snapshot = await readBM25Snapshot(dataDir, scope);
      const points = new Map((snapshot?.records ?? []).map((card) => [card.id, { user_id: scope, card_id: card.id, content_hash: card.contentHash, source_event_id: card.sourceEventId, data: card.text, created_at: card.indexedAt }]));
      return { state: 'available', backend: 'bm25', points, receipt, checkedAt: new Date().toISOString() };
    } catch { return { state: 'unavailable', backend: 'bm25', points: new Map(), receipt, checkedAt: new Date().toISOString() }; }
  }

  return async function inspect(data, run = null) {
    if (!data.index) return { available: false, reason: '还没有故事存档', added: [], retained: [], recalled: [], owners: [], summary: { added: 0, retained: 0, recalled: 0, indexed: 0, pending: 0, unknown: 0, characters: 0 } };
    const branchId = run?.branchId ?? data.currentBranchId;
    const branch = data.branchRecords.find((item) => item?.id === branchId);
    if (!branch) return null;
    const targetEventId = run ? (run.event?.id ?? run.job?.headEventId) : branch.headEventId;
    const position = branch.eventIds.indexOf(targetEventId);
    if (position < 0) return null;
    const ids = branch.eventIds.slice(0, position + 1);
    const events = Object.fromEntries(ids.map((id) => [id, data.events.get(branchId + '/' + id)]).filter(([, event]) => event));
    const store = { story: data.index.story, currentBranchId: branchId, branches: { [branchId]: { ...branch, eventIds: ids, headEventId: targetEventId } }, events };
    const selectedRole = data.index.story.selectedPlayerCharacterId;
    const wantedKey = [selectedRole, data.index.story.packageHash].join('|');
    if (packageKey !== wantedKey || !packageCache) {
      const base = await (loadPackage ? loadPackage() : loadStoryPackage(projectRoot, storyId));
      packageCache = selectedRole && base.playableRoles ? resolvePlayableRole(base, selectedRole) : base;
      packageKey = wantedKey;
    }
    const corpus = buildMemoryCorpus({ store, branchId, storyPackage: packageCache, instanceId: resolve(dataDir) });
    const checkpoint = await readJson(join(dataDir, 'memory', 'checkpoints', corpus.scope + '.json'));
    const receipt = new Set(checkpoint?.indexedIds ?? []);
    const index = await indexState(corpus.scope, receipt);
    const characters = events[targetEventId]?.stateAfter?.characters ?? {};
    const names = Object.fromEntries(Object.entries(characters).map(([id, character]) => [id, character.name ?? id]));
    const ownerLabel = (view) => view === 'global' ? '全局记忆' : view === 'environment' ? '环境记忆' : names[view.slice(10)] ?? view.slice(10);
    const sources = new Map(data.runs.filter((item) => item.branchId === branchId && item.event).map((item) => [item.event.id, { runId: item.id, number: item.number, action: item.action }]));
    function storedState(card) {
      const found = index.points.get(card.id);
      if (found) return found.content_hash === card.contentHash && found.source_event_id === card.sourceEventId && found.data === card.text ? 'indexed' : 'mismatch';
      if (index.state === 'available') return 'pending';
      if (index.state === 'disabled') return 'disabled';
      return receipt.has(card.id) ? 'receipt' : 'unknown';
    }
    const retained = corpus.records.map((card) => ({ ...card, ownerLabel: ownerLabel(card.view), indexState: storedState(card), sourceRunId: sources.get(card.sourceEventId)?.runId ?? null, sourceRound: sources.get(card.sourceEventId)?.number ?? 0, sourceAction: sources.get(card.sourceEventId)?.action ?? '初始设定', indexedAt: index.points.get(card.id)?.created_at ?? null }));
    const added = run?.event ? retained.filter((card) => card.sourceEventId === run.event.id) : [];
    const result = run?.event ?? run?.job?.completedTurn ?? run?.job?.prepared;
    const shared = result?.sharedContext;
    const recalled = [];
    const groups = [['global', shared?.domainContexts?.plot?.longTermMemory], ['environment', shared?.domainContexts?.environment?.longTermMemory], ...Object.entries(shared?.domainContexts?.character?.longTermMemoryByCharacter ?? {}).map(([id, cards]) => ['character:' + id, cards])];
    for (const [view, cards] of groups) {
      for (const hit of Array.isArray(cards) ? cards : []) {
        const source = retained.find((card) => card.id === hit.id && card.view === view);
        recalled.push({ ...hit, view, ownerLabel: ownerLabel(view), indexState: source?.indexState ?? 'unknown', sourceRunId: sources.get(hit.sourceEventId)?.runId ?? null, sourceRound: sources.get(hit.sourceEventId)?.number ?? 0, sourceAction: sources.get(hit.sourceEventId)?.action ?? '初始设定', sourceVerified: Boolean(source && source.sourceEventId === hit.sourceEventId && source.text.startsWith(hit.text)) });
      }
    }
    const owners = [...new Set(['global', 'environment', ...Object.keys(characters).map((id) => 'character:' + id), ...retained.map((card) => card.view), ...recalled.map((card) => card.view)])].map((view) => ({ id: view, label: ownerLabel(view), count: retained.filter((card) => card.view === view).length }));
    return {
      available: true, runId: run?.id ?? null, round: run?.number ?? 0, branchId, committed: Boolean(run?.event), initial: !run,
      added, retained, recalled, owners, names, retrievalTrace: shared?.memoryTrace ?? null,
      retrievalRecorded: Boolean(shared?.memoryTrace), index: { backend: index.backend, state: index.state, checkedAt: index.checkedAt, receiptAt: checkpoint?.updatedAt ?? null },
      summary: { added: added.length, retained: retained.length, recalled: recalled.length, characters: owners.filter((owner) => owner.id.startsWith('character:')).length, indexed: retained.filter((card) => card.indexState === 'indexed').length, pending: retained.filter((card) => card.indexState === 'pending').length, unknown: retained.filter((card) => !['indexed', 'pending'].includes(card.indexState)).length },
    };
  };
}
