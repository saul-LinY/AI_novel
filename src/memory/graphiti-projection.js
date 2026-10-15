import { digest, memoryScope } from './cards.js';

export const GRAPH_SCHEMA = 1;

export function graphLifecycle({ store, storyPackage, instanceId }) {
  const awaitingRole = store.story.roleSelectionRequired && !store.story.selectedPlayerCharacterId;
  return {
    owner: `novel-owner-${digest([instanceId, storyPackage.id]).slice(0, 32)}`,
    // Every saved branch remains live, including branches not currently selected.
    activeScopes: awaitingRole ? [] : Object.keys(store.branches).map((id) => memoryScope(store, id, storyPackage, instanceId)),
  };
}

// Only entities actually named in an authorized card enter that perspective.
// The source card is also a durable occurrence: repeated transfers never merge.
export function graphEntities(storyPackage, state) {
  return [
    ...Object.values(state?.characters ?? {}).map((x) => ({ id: x.id, name: x.name, kind: 'character', aliases: x.aliases ?? [] })),
    ...(storyPackage.items ?? []).map((x) => ({ ...x, kind: 'item', aliases: x.aliases ?? [] })),
    ...(storyPackage.locations ?? []).map((x) => ({ ...x, kind: 'location', aliases: x.aliases ?? [] })),
  ].map(({ id, name, kind, aliases }) => ({ id, name, kind, aliases }));
}

export function buildGraphSnapshot(corpus, { store, storyPackage, branchId = store.currentBranchId }) {
  if (store.story.roleSelectionRequired && !store.story.selectedPlayerCharacterId) return { version: GRAPH_SCHEMA, streams: [] };
  const branch = store.branches[branchId];
  const streams = [];
  const byView = new Map();
  const catalogs = new Map();
  for (const record of corpus.records) {
    if (!byView.has(record.view)) byView.set(record.view, new Map());
    const byEvent = byView.get(record.view);
    if (!byEvent.has(record.sourceEventId)) byEvent.set(record.sourceEventId, []);
    byEvent.get(record.sourceEventId).push(record);
  }
  for (const [view, byEvent] of byView) {
    const events = [];
    for (const [ordinal, eventId] of branch.eventIds.entries()) {
      const event = store.events[eventId];
      const cards = byEvent.get(eventId) ?? [];
      if (!cards.length) continue;
      if (!catalogs.has(eventId)) catalogs.set(eventId, graphEntities(storyPackage, event.stateAfter));
      const catalog = catalogs.get(eventId);
      const records = cards.map((card) => {
        const ledgerId = card.source.startsWith('ledger:') ? card.source.slice(7) : null;
        const entry = event.stateAfter?.narrative?.ledger?.find((x) => x.id === ledgerId && x.eventId === eventId);
        const explicit = new Set([...(entry?.entityIds ?? []), ...(entry?.characterIds ?? [])]);
        const entities = catalog.filter((x) => explicit.has(x.id) || [x.id, x.name, ...x.aliases].some((s) => s?.length >= 2 && card.text.includes(s)))
          .map(({ id, name, kind }) => ({ id, name, kind }));
        return { id: card.id, contentHash: card.contentHash, sourceEventId: card.sourceEventId, text: card.text, kind: card.kind, ordinal, source: card.source, entities };
      });
      // No wall-clock date is invented for a fictional timeline. This epoch is
      // only a sortable transport encoding; the UI uses turn + timeMinutes.
      const timeMinutes = Number.isFinite(event.stateAfter?.timeMinutes) ? event.stateAfter.timeMinutes : ordinal;
      const fingerprint = digest([GRAPH_SCHEMA, eventId, ordinal, timeMinutes, records]);
      events.push({ id: eventId, ordinal, timeMinutes, fingerprint, records });
    }
    const manifest = events.map((e) => e.fingerprint);
    const owner = store.events[branch.headEventId]?.stateAfter?.characters?.[view.slice(10)];
    const viewLabel = view === 'global' ? '全局视角' : view === 'environment' ? '环境视角' : `${owner?.name ?? view.slice(10)}视角`;
    streams.push({ scope: corpus.scope, view, viewLabel, headEventId: branch.headEventId, fingerprint: digest(manifest), events });
  }
  return { version: GRAPH_SCHEMA, streams };
}

// Hydrate graph candidates from this exact, authorized local snapshot. A graph
// fact, summary, stale hash, future event or other character's card is not evidence.
export function verifyGraphHits(response, allowed) {
  const byId = new Map(allowed.map((r) => [r.id, r]));
  const hits = [];
  const seen = new Set();
  let rejected = 0;
  for (const hit of response.hits ?? []) {
    const record = byId.get(hit.cardId);
    if (!record || hit.contentHash !== record.contentHash || hit.sourceEventId !== record.sourceEventId) { rejected++; continue; }
    let excerpt;
    if (hit.excerpt !== undefined) {
      const offset = typeof hit.excerpt === 'string' && hit.excerpt.length ? record.text.indexOf(hit.excerpt) : -1;
      if (offset < 0) { rejected++; continue; }
      excerpt = { text: record.text.slice(offset, offset + hit.excerpt.length), offset };
    }
    if (!seen.has(record.id)) { seen.add(record.id); hits.push({ record, score: Number.isFinite(hit.score) ? hit.score : null, ...(excerpt ? { excerpt } : {}) }); }
  }
  return { hits, rejected };
}
