export function graphFixture() {
  const storyPackage = { id: 'graph-test', packageHash: 'v1', playerCharacterId: 'a', world: { rules: [] },
    facts: [], locations: [{ id: 'inn', name: '旅馆' }], stages: [],
    items: [{ id: 'notebook', name: '蓝色本子' }], characters: [] };
  const state = { characters: { a: { id: 'a', name: '阿青', status: 'active', locationId: 'inn', knowledgeFactIds: [] }, b: { id: 'b', name: '小白', status: 'active', locationId: 'inn', knowledgeFactIds: [] } }, locationId: 'inn', timeMinutes: 0, storyProgress: {}, generatedFacts: {} };
  const prose = ['阿青在旅馆拿着蓝色本子。本子封面有一道水痕。', '阿青将蓝色本子交给小白保管。', '小白把蓝色本子归还阿青。'];
  const events = Object.fromEntries(prose.map((text, i) => ['e' + i, { id: 'e' + i, type: i ? 'turn' : 'opening', parentEventId: i ? 'e' + (i - 1) : null, prose: text,
    stateAfter: { ...structuredClone(state), timeMinutes: i * 5 },
    ...(i ? { turnResult: { delta: {}, characterMemoryNotes: [{ characterId: 'a', note: text }, { characterId: 'b', note: i === 1 ? '我接过了蓝色本子。' : '我将蓝色本子还给阿青。' }] } } : {}) }]));
  return { storyPackage, store: { story: { createdAt: '2026-10-14T00:00:00Z' }, currentBranchId: 'main', branches: { main: { eventIds: ['e0', 'e1', 'e2'], headEventId: 'e2' } }, events } };
}
