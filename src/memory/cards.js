import { createHash } from 'node:crypto';

export const MEMORY_SCHEMA = 1;
export const digest = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const clean = (value) => typeof value === 'string' ? value.trim() : '';

// Index the complete source in bounded chunks; the event remains authoritative.
export function chunks(text, size = 600) {
  const result = [];
  for (let offset = 0; offset < text.length; offset += size) result.push({ text: text.slice(offset, offset + size), offset });
  return result;
}

export function memoryScope(store, branchId, storyPackage, instanceId = 'default') {
  const branch = store.branches[branchId];
  if (!branch) throw new Error('Memory branch does not exist');
  return `novel-${digest([MEMORY_SCHEMA, instanceId, storyPackage.id, storyPackage.packageHash, store.story.createdAt, branch.eventIds[0], branchId]).slice(0, 32)}`;
}

export function buildMemoryCorpus({ store, branchId = store.currentBranchId, storyPackage, instanceId }) {
  const scope = memoryScope(store, branchId, storyPackage, instanceId);
  const branch = store.branches[branchId];
  const records = [];
  const ancestors = new Set(branch.eventIds);
  const factMap = new Map((storyPackage.facts ?? []).map((fact) => [fact.id, fact]));
  const openingId = branch.eventIds[0];
  const add = (text, view, kind, event, ordinal, source, factId = null) => {
    if (!clean(text)) return;
    for (const part of chunks(text)) {
      const contentHash = digest(part.text);
      const id = digest([scope, view, event.id, source, part.offset, contentHash]);
      records.push({ id, scope, view, kind, text: part.text, contentHash, sourceEventId: event.id, ordinal, source, offset: part.offset, factId, storyId: storyPackage.id, branchId, timeMinutes: event.stateAfter?.timeMinutes ?? null });
    }
  };
  let previousKnowledge = {};
  for (const [ordinal, eventId] of branch.eventIds.entries()) {
    const event = store.events[eventId];
    if (!event || !['opening', 'turn'].includes(event.type)) continue;
    if (event.parentEventId && !ancestors.has(event.parentEventId)) throw new Error('Memory history has a missing ancestor');
    const state = event.stateAfter;
    if (!state) continue;
    for (const fact of Object.values(state.generatedFacts ?? {})) {
      if (!fact.sourceEventId || ancestors.has(fact.sourceEventId)) factMap.set(fact.id, fact);
    }
    add(event.prose, 'global', 'narrative', event, ordinal, 'prose');
    if (eventId === openingId) {
      for (const fact of storyPackage.facts ?? []) add(fact.truth ?? fact.text, 'global', 'canon', event, ordinal, `canon:${fact.id}`, fact.id);
      for (const [i, rule] of (storyPackage.world?.rules ?? []).entries()) {
        add(rule, 'global', 'world-rule', event, ordinal, `world-rule:${i}`);
        add(rule, 'environment', 'world-rule', event, ordinal, `world-rule:${i}`);
      }
    }
    const turn = event.turnResult;
    if (turn) {
      add(turn.outcome?.summary, 'global', 'outcome', event, ordinal, 'outcome');
      for (const [i, note] of (turn.memoryNotes ?? []).entries()) add(note, 'global', 'narrator-note', event, ordinal, `narrator-note:${i}`);
      // Prose-grounded ledger entries carry a verbatim quote; each witness gets its own copy.
      for (const entry of state.narrative?.ledger ?? []) {
        if (entry.eventId !== event.id || entry.source === 'proposal') continue;
        const text = entry.quote ? `${entry.text}（原文：「${entry.quote}」）` : entry.text;
        add(text, 'global', 'ledger', event, ordinal, `ledger:${entry.id}`);
        for (const characterId of entry.knownByIds ?? []) if (state.characters?.[characterId]) add(text, `character:${characterId}`, 'ledger', event, ordinal, `ledger:${entry.id}`);
      }
      for (const loop of state.narrative?.openLoops ?? []) {
        if (loop.eventId !== event.id) continue;
        add(`未兑现的${{ promise: '承诺', threat: '威胁', question: '疑问', plan: '计划', debt: '人情' }[loop.kind] ?? '事项'}：${loop.text}（原文：「${loop.quote}」）`, 'global', 'open-loop', event, ordinal, `loop:${loop.id}`);
      }
      for (const [i, note] of (turn.characterMemoryNotes ?? []).entries()) {
        if (!state.characters?.[note.characterId]) continue;
        add(note.note, `character:${note.characterId}`, 'character-memory', event, ordinal, `character-note:${i}`);
        add(`${state.characters[note.characterId].name ?? note.characterId}的认知记录：${note.note}`, 'global', 'perspective-report', event, ordinal, `character-report:${i}`);
      }
      for (const [i, note] of (turn.environmentMemoryNotes ?? []).entries()) {
        add(note, 'environment', 'environment-memory', event, ordinal, `environment-note:${i}`);
        add(note, 'global', 'environment-memory', event, ordinal, `environment-note:${i}`);
      }
      for (const [i, change] of (turn.delta?.characterUpdates ?? []).entries()) {
        if (!state.characters?.[change.characterId]) continue;
        const text = `此回合自身状态变化：${JSON.stringify(change)}`;
        add(text, `character:${change.characterId}`, 'personal-transition', event, ordinal, `character-change:${i}`);
        add(text, 'global', 'state-transition', event, ordinal, `character-change:${i}`);
      }
      for (const [i, change] of (turn.delta?.relationshipChanges ?? []).entries()) {
        if (!state.characters?.[change.characterId]) continue;
        // The other person does not automatically know this character's attitude.
        const text = `此回合关系态度变化：${JSON.stringify(change)}`;
        add(text, `character:${change.characterId}`, 'relationship-memory', event, ordinal, `relationship:${i}`);
        add(text, 'global', 'perspective-report', event, ordinal, `relationship:${i}`);
      }
      // A delta is a committed transition, not a claim about the present forever.
      for (const key of ['locationId', 'sceneStateId', 'timeAdvanceMinutes', 'addItemIds', 'removeItemIds']) {
        const value = turn.delta?.[key];
        if (value === undefined || (Array.isArray(value) && !value.length)) continue;
        const labels = { locationId: '移动到地点', sceneStateId: '场景变为', timeAdvanceMinutes: '经过分钟', addItemIds: '获得物品', removeItemIds: '失去物品' };
        const text = `此回合已提交的环境变化：${labels[key]} ${JSON.stringify(value)}`;
        add(text, 'global', 'state-transition', event, ordinal, `delta:${key}`);
        add(text, 'environment', 'state-transition', event, ordinal, `delta:${key}`);
      }
    }
    const nextKnowledge = {};
    for (const [characterId, character] of Object.entries(state.characters ?? {})) {
      const known = new Set(character.knowledgeFactIds ?? []);
      nextKnowledge[characterId] = known;
      for (const factId of known) {
        if (previousKnowledge[characterId]?.has(factId)) continue;
        const fact = factMap.get(factId);
        if (!fact) continue;
        add(fact.revealText ?? fact.text ?? fact.truth, `character:${characterId}`, 'known-fact', event, ordinal, `knowledge:${characterId}:${factId}`, factId);
      }
    }
    previousKnowledge = nextKnowledge;
  }
  return { scope, records, byId: new Map(records.map((record) => [record.id, record])), ancestors };
}

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
export function terms(value) {
  return [...new Set([...segmenter.segment(String(value).normalize('NFKC').toLowerCase())].filter((part) => part.isWordLike).map((part) => part.segment))];
}

export function lexicalSearch(records, query, limit = 5) {
  const tokens = terms(query);
  if (!tokens.length) return [];
  return records.map((record) => {
    const body = record.text.toLowerCase();
    const score = tokens.reduce((sum, token) => sum + (body.includes(token) ? Math.min(token.length, 4) : 0), 0);
    return { record, score };
  }).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score || b.record.ordinal - a.record.ordinal || a.record.id.localeCompare(b.record.id)).slice(0, limit);
}

export function memoryExcerpt(record, score = null) {
  return { id: record.id, kind: record.kind, text: record.text, sourceEventId: record.sourceEventId, source: record.source, ordinal: record.ordinal, timeMinutes: record.timeMinutes, view: record.view, score };
}
