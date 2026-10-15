import { PHASES, type Action, type Scene, type StoryResponse } from './data.ts'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
export async function checked(response: Response): Promise<Response> {
  if (response.ok) return response
  const data = await response.json().catch(() => ({}))
  throw new ApiError(data.error || '请求失败，请稍后重试', response.status)
}
export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await checked(await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...options.headers } }))
  return response.json() as Promise<T>
}
export type AgentRole = 'environment' | 'character' | 'plot' | 'main' | 'choices' | 'recorder'
export type AgentStatus = 'waiting' | 'started' | 'retrying' | 'done' | 'failed'
export type Beat = { role: 'environment' | 'character'; text: string }
export type Outcome = { outcomeType: string; label: string; ending: boolean; summary?: string }
export type TurnEvent = {
  type: string; turnId: string; seq: number; action?: string; trustedChoice?: boolean
  phase?: string; scene?: Scene; text?: string; story?: StoryResponse; message?: string; recoverable?: boolean
  role?: AgentRole | Beat['role']; status?: AgentStatus; attempt?: number; durationMs?: number
  outcomeType?: string; label?: string; ending?: boolean; summary?: string; createdAt?: string
}
export type StreamSession = {
  turnId: string | null; seq: number; prepared: boolean; action: Action; text: string; scene: Scene | null
  phase: number; phaseKey: string; label: string; terminal: boolean; complete: StoryResponse | null; message: string; recoverable: boolean; rejected: boolean
  agents: Partial<Record<AgentRole, AgentStatus>>; beats: Beat[]; outcome: Outcome | null; startedAt: number
}
export function newSession(action: Action, scene: Scene | null): StreamSession {
  return { turnId: null, seq: 0, prepared: false, action, text: '', scene, phase: 0, phaseKey: 'analyzing', label: PHASES.analyzing.label, terminal: false, complete: null, message: '', recoverable: false, rejected: false, agents: {}, beats: [], outcome: null, startedAt: Date.now() }
}
// Event sequence numbers prevent replays from duplicating already-visible prose.
export function applyTurnEvent(s: StreamSession, event: TurnEvent): boolean {
  if (s.turnId && event.turnId !== s.turnId) return false
  if (event.seq <= s.seq) return false
  s.turnId = event.turnId
  s.seq = event.seq
  if (event.type === 'start') {
    if (event.action && !s.action.text) s.action = { mode: 'do', text: event.action }
    // Reattached turns keep their real start time so the elapsed counter is honest.
    const started = Date.parse(event.createdAt ?? '')
    if (Number.isFinite(started)) s.startedAt = started
  }
  if (event.type === 'phase') { const phase = PHASES[event.phase ?? '']; if (phase) { s.phase = phase.index; s.phaseKey = event.phase!; s.label = phase.label } }
  if (event.type === 'agent_progress' && event.role && event.status) s.agents = { ...s.agents, [event.role]: event.status }
  if (event.type === 'beat' && event.text && (event.role === 'environment' || event.role === 'character')) s.beats = [...s.beats.filter((b) => b.role !== event.role), { role: event.role, text: event.text }]
  if (event.type === 'outcome' && event.label) s.outcome = { outcomeType: event.outcomeType ?? '', label: event.label, ending: Boolean(event.ending), summary: event.summary }
  if (event.type === 'prepared') s.prepared = true
  if (event.type === 'scene' && event.scene) s.scene = event.scene
  if (event.type === 'prose_delta') s.text += event.text ?? ''
  if (event.type === 'complete' && event.story) { s.complete = event.story; s.terminal = true }
  if (['cancelled', 'rejected', 'failed'].includes(event.type)) { s.terminal = true; s.rejected = event.type === 'rejected'; s.recoverable = false; s.message = event.message ?? '本回合未保存' }
  if (event.type === 'error') { s.message = event.message ?? '连接暂时中断，已显示的正文会保留'; s.recoverable = event.recoverable === true }
  return true
}
export async function readTurnStream(response: Response, onEvent: (event: TurnEvent) => void): Promise<void> {
  await checked(response)
  if (!response.body) throw new Error('当前浏览器无法读取故事流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as TurnEvent)
      if (done) break
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as TurnEvent)
  } finally { reader.releaseLock() }
}
