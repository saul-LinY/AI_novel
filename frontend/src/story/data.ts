// Only the public /api/story response enters the client. No canon or private memories.
export const FALLBACK_IMAGE = '/assets/scenes/dragon-raja/fallback.png'
export const COVER_IMAGE = '/assets/tokyo-departure.png'
export type Picture = { src: string; alt: string; position?: string }
export type Art = {
  cover?: { wide: Picture; tall?: Picture }; tagline?: string; volumeLabel?: string; genreTags?: string[]
  roleKeyArt?: Record<string, Picture>; endings?: Record<string, Picture>; textures?: Record<string, string>
}
export type Choice = { id: string; label: string; action: string; line?: string }
export type Scene = { locationId: string; locationName: string; stateId: string; title: string; image: Picture; fallbackImage: string }
export type Profile = { id: string; name: string; role: string; tagline: string; publicSummary: string; traits: string[]; abilities: string[]; image: Picture | null }
export type Comic = { id: string; title: string; caption?: string; image: Picture; panels?: { id: string; scene: string; lines: { speaker: string; text: string }[] }[] }
export type Ending = { type: 'normal' | 'deviation' | 'failure' | 'early'; coreQuestionResponse: string; keyChoice: string; directConsequences: string[]; longTermConsequences: string[]; costs: string[]; resolvedQuestions: string[]; unresolvedQuestions: string[] }
export type StoryResponse = {
  story: {
    id: string; title: string; subtitle: string; premise: string; visual: Picture | null; art?: Art | null
    player: { id: string; name: string; role: string } | null
    roleSelection: { required: boolean; selectedCharacterId: string | null; canSelect: boolean }
    onboarding: {
      background: { title: string; body: string }
      comicPages: Comic[]; characterProfiles: Profile[]; npcProfiles: Profile[]
      roleSelection: { title: string; body: string; roles: { characterId: string; hook: string; strengths: string[]; pressure: string; image: Picture }[] }
    }
  }
  currentBranchId: string
  events: { id: string; type: string; action: string; prose: string; choices: Choice[]; turn: number; createdAt: string; time?: string; location?: { id: string; name: string } | null; scene?: Scene | null }[]
  state: {
    status: string; time: string; location: { id: string; name: string } | null; scene: Scene | null
    characters: { id: string; name: string; role: string; attitude: number; status: string; present: boolean }[]
    relationshipGraph: { nodes: { id: string; name: string }[]; edges: { from: string; to: string; type: string; value: number }[] }
    inventory: { id: string; name: string; count: number }[]
    knownFacts: { id: string; text: string }[]
    threads: { id: string; title: string; status: string }[]
    ending: Ending | null
  }
}
export type Role = { id: string; name: string; title: string; portrait: string; keyArt: string | null; quote: string; bio: string; situation: string; traits: string[]; pressure: string; strengths: string[] }
export type Content = ReturnType<typeof getContent>
export function getContent(s: StoryResponse) {
  const m = s.story
  const onboarding = m.onboarding
  const roles: Role[] = onboarding.characterProfiles.map((p) => {
    const r = onboarding.roleSelection.roles.find((x) => x.characterId === p.id)
    return { id: p.id, name: p.name, title: p.role, portrait: p.image?.src ?? r?.image.src ?? FALLBACK_IMAGE, keyArt: m.art?.roleKeyArt?.[p.id]?.src ?? null, quote: p.tagline, bio: p.publicSummary, situation: r?.hook ?? p.publicSummary, traits: p.traits, pressure: r?.pressure ?? '', strengths: r?.strengths ?? p.abilities }
  })
  return {
    story: {
      title: m.subtitle.split(' · ')[0] || m.title, subtitle: m.title + ' · ' + m.subtitle, brand: m.title,
      genre: m.art?.genreTags ?? ['互动小说', roles.length + ' 个身份', '自由行动'],
      tagline: m.art?.tagline ?? '命运之外，还有一条路。', volume: m.art?.volumeLabel ?? '',
      cover: m.art?.cover?.wide ?? { src: COVER_IMAGE, alt: m.title + '封面' }, coverTall: m.art?.cover?.tall ?? null,
      synopsis: m.premise, background: onboarding.background,
    },
    endingArt: m.art?.endings ?? {},
    portraits: Object.fromEntries([...onboarding.characterProfiles, ...onboarding.npcProfiles].filter((p) => p.image).map((p) => [p.id, p.image!.src])) as Record<string, string>,
    roles,
    comic: onboarding.comicPages,
    cast: [...onboarding.characterProfiles, ...onboarding.npcProfiles].map((p) => ({ ...p, playable: roles.some((r) => r.id === p.id) })),
  }
}
export type Action = { mode: 'do' | 'say'; text: string; choiceId?: string }
export type Turn = { id: string; action?: Action; place: string; time: string; img: string; fallback: string; imagePosition?: string; title: string; paras: string[]; choices: Choice[] }
export type World = {
  place: string; time: string; chapter: number
  people: { id: string; name: string; tag: string; state: string; trust: number; present: boolean }[]
  relationships: { from: string; to: string; type: string; value: number }[]
  items: { id: string; name: string; note: string; isNew?: boolean }[]
  clues: { id: string; text: string; isNew?: boolean }[]
  questions: { id: string; text: string; solved: boolean; failed: boolean }[]
}
export type Save = { roleId: string; turns: Turn[]; world: World; ending?: Ending; updatedAt: number }
const statuses: Record<string, string> = { active: '行动中', missing: '下落不明', injured: '受伤', dead: '已故', departed: '已离开' }
export function paragraphs(text: string): string[] {
  // Keep the original reader's short-paragraph grouping without changing its text.
  const out: string[] = []
  let current = ''
  for (const part of text.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    if (current.length >= 140) { out.push(current); current = '' }
    current += part
  }
  if (current) out.push(current)
  return out
}
export function mapSave(s: StoryResponse, previous?: StoryResponse | null): Save | null {
  if (!s.story.player) return null
  const st = s.state
  const oldFacts = new Set(previous?.state.knownFacts.map((f) => f.id) ?? st.knownFacts.map((f) => f.id))
  const oldItems = new Map((previous?.state.inventory ?? st.inventory).map((i) => [i.id, i.count]))
  const names = new Map(st.relationshipGraph.nodes.map((n) => [n.id, n.name]))
  return {
    roleId: s.story.player.id,
    turns: s.events.map((event, i) => {
      const isLast = i === s.events.length - 1
      const scene = event.scene ?? (isLast ? st.scene : null)
      return { id: event.id, action: event.type === 'turn' ? { mode: 'do', text: event.action } : undefined, place: event.location?.name ?? scene?.locationName ?? (isLast ? st.location?.name ?? '故事现场' : '来时路'), time: event.time ?? (isLast ? st.time : ''), img: scene?.image.src ?? FALLBACK_IMAGE, fallback: scene?.fallbackImage ?? FALLBACK_IMAGE, imagePosition: scene?.image.position, title: scene?.title ?? '', paras: paragraphs(event.prose), choices: event.choices ?? [] }
    }),
    world: {
      place: st.location?.name ?? '故事现场', time: st.time, chapter: s.events.length,
      people: st.characters.map((p) => ({ id: p.id, name: p.name, tag: p.role, state: (statuses[p.status] ?? p.status) + (p.present ? ' · 在场' : ' · 不在场'), trust: p.attitude, present: p.present })),
      relationships: st.relationshipGraph.edges.map((e) => ({ from: names.get(e.from) ?? e.from, to: names.get(e.to) ?? e.to, type: e.type, value: e.value })),
      items: st.inventory.map((i) => ({ id: i.id, name: i.name, note: '数量 · ' + i.count, isNew: oldItems.get(i.id) !== i.count })),
      clues: st.knownFacts.map((f) => ({ ...f, isNew: !oldFacts.has(f.id) })),
      questions: st.threads.map((t) => ({ id: t.id, text: t.title, solved: t.status === 'resolved', failed: t.status === 'failed' })),
    },
    ending: st.status === 'ended' ? st.ending ?? undefined : undefined,
    updatedAt: Date.parse(s.events[s.events.length - 1]?.createdAt) || Date.now(),
  }
}
export const GEN_PHASES = ['正在理解你的行动', '人物与命运交汇', '故事正在继续', '正在保存这段经历']
export const PHASES: Record<string, { index: number; label: string }> = {
  recalling: { index: 0, label: '正在查阅故事记忆' },
  analyzing: { index: 0, label: GEN_PHASES[0] },
  synthesizing: { index: 1, label: GEN_PHASES[1] },
  narrating: { index: 2, label: GEN_PHASES[2] },
  recovering: { index: 2, label: '正在接续故事' },
  choosing: { index: 2, label: '命运岔路正在成形' },
  recording: { index: 3, label: '正在记下这段经历' },
  committing: { index: 3, label: GEN_PHASES[3] },
}
// The four writers behind each turn, described by what they are doing for the reader.
export const AGENT_SEALS = [
  { role: 'environment', name: '查看现场', task: '地点、时间与可用之物' },
  { role: 'character', name: '揣摩人物', task: '在场的人会如何反应' },
  { role: 'plot', name: '推演剧情', task: '这一步会把故事带向哪里' },
  { role: 'main', name: '定稿执笔', task: '决定结果，写出下一段' },
] as const
export const ENDING_LABELS = { normal: '本篇完', deviation: '另一种结局', failure: '未竟之路', early: '在此停笔' }
export function actionPayload(action: Action, branchId: string) {
  if (action.choiceId) return action.mode === 'say' ? { choiceId: action.choiceId, mode: 'say', branchId } : { choiceId: action.choiceId, branchId }
  return { action: action.mode === 'say' ? '我说：「' + action.text + '」' : action.text, branchId }
}

const CN_DIGITS = '零一二三四五六七八九'
// Chinese numerals for chapter and choice markers (1–99).
export function cnNumber(n: number): string {
  if (n <= 0) return CN_DIGITS[0]
  if (n < 10) return CN_DIGITS[n]
  if (n < 20) return '十' + (n % 10 ? CN_DIGITS[n % 10] : '')
  if (n < 100) return CN_DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? CN_DIGITS[n % 10] : '')
  return String(n)
}
