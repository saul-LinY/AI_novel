import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { actionPayload, getContent, mapSave, paragraphs, FALLBACK_IMAGE, type Action, type StoryResponse, type Turn } from './data'
import { ApiError, applyTurnEvent, checked, newSession, readTurnStream, requestJson, type AgentRole, type AgentStatus, type Beat, type Outcome, type StreamSession } from './api'
import type { Scene } from './data'
export type { Turn, Save } from './data'
export type Screen = 'entry' | 'intro' | 'roles' | 'reader' | 'ending'
export type Settings = { size: number; mode: 'theater' | 'focus'; motion: 'full' | 'calm' | 'off'; width: 'standard' | 'wide' | 'full' }
// What the reader can see of the turn while it is being written.
export type Live = { phaseKey: string; agents: Partial<Record<AgentRole, AgentStatus>>; beats: Beat[]; outcome: Outcome | null; startedAt: number; scene: Scene | null; prepared: boolean }
export type Gen =
  | { status: 'idle' }
  | { status: 'thinking'; phase: number; action: Action; live: Live }
  | { status: 'writing'; turn: Turn; shown: number; total: number; action: Action; live: Live }
  | { status: 'error'; action: Action; message: string; recoverable: boolean }
type Active = { turnId: string; status: string; branchId: string } | null
const SET_KEY = 'ai-novel:reading:v2'
function loadSettings(): Settings {
  try {
    const current = JSON.parse(localStorage.getItem(SET_KEY) ?? 'null')
    const old = JSON.parse(localStorage.getItem('ai-novel:reading') ?? 'null')
    const value = current ?? (old && { size: old.size, mode: old.mode === 'focus' ? 'focus' : 'theater', motion: old.reduced ? 'off' : 'full' })
    if (value) return { size: Math.min(25, Math.max(15, Number(value.size) || 19)), mode: value.mode === 'focus' ? 'focus' : 'theater', motion: ['full', 'calm', 'off'].includes(value.motion) ? value.motion : 'full', width: ['standard', 'wide', 'full'].includes(value.width) ? value.width : 'wide' }
  } catch { /* Preferences must not prevent story access. */ }
  return { size: 19, mode: 'theater', motion: 'full', width: 'wide' }
}
const messageOf = (e: unknown) => e instanceof Error ? e.message : '连接暂时中断，请重试'
export function useGame() {
  const [story, setStory] = useState<StoryResponse | null>(null)
  const storyRef = useRef<StoryResponse | null>(null)
  const [previous, setPrevious] = useState<StoryResponse | null>(null)
  const [preferences, setSettings] = useState<Settings>(loadSettings)
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const settings = { ...preferences, motion: systemReduced ? 'off' as const : preferences.motion }
  const [screen, setScreen] = useState<Screen>('entry')
  const [gen, setGen] = useState<Gen>({ status: 'idle' })
  const [liveTurn, setLiveTurn] = useState<Turn | null>(null)
  const [phaseLabel, setPhaseLabel] = useState('正在连接故事')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [operation, setOperation] = useState(false)
  const busyRef = useRef(false)
  const operationRef = useRef(false)
  const session = useRef<StreamSession | null>(null)
  const streamAbort = useRef<AbortController | null>(null)
  const bootAbort = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const headBefore = useRef<string | null>(null)
  const content = useMemo(() => story ? getContent(story) : null, [story])
  const save = useMemo(() => story ? mapSave(story, previous) : null, [story, previous])
  const role = content?.roles.find((r) => r.id === save?.roleId) ?? null

  const accept = useCallback((next: StoryResponse) => {
    setPrevious(storyRef.current)
    storyRef.current = next
    setStory(next)
  }, [])
  useEffect(() => { try { localStorage.setItem(SET_KEY, JSON.stringify(preferences)) } catch { /* Storage can be unavailable. */ } }, [preferences])
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystemReduced(m.matches)
    m.addEventListener('change', update)
    return () => m.removeEventListener('change', update)
  }, [])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer) } }, [notice])

  const publish = useCallback((s: StreamSession) => {
    setPhaseLabel(s.label)
    const live: Live = { phaseKey: s.phaseKey, agents: s.agents, beats: s.beats, outcome: s.outcome, startedAt: s.startedAt, scene: s.scene, prepared: s.prepared }
    let draft: Turn | null = null
    if (s.text) {
      const last = storyRef.current?.state
      draft = { id: s.turnId ?? 'pending', action: s.action, place: s.scene?.locationName ?? last?.location?.name ?? '故事现场', time: last?.time ?? '', img: s.scene?.image.src ?? FALLBACK_IMAGE, fallback: s.scene?.fallbackImage ?? FALLBACK_IMAGE, imagePosition: s.scene?.image.position, title: s.scene?.title ?? '', paras: paragraphs(s.text), choices: [] }
    }
    setLiveTurn(draft)
    if (s.message) setGen({ status: 'error', action: s.action, message: s.message, recoverable: s.recoverable || !s.terminal })
    else if (draft) setGen({ status: 'writing', turn: draft, shown: s.text.length, total: s.text.length, action: s.action, live })
    else setGen({ status: 'thinking', phase: s.phase, action: s.action, live })
  }, [])

  const follow = useCallback(async (s: StreamSession, first?: Response, controller = new AbortController()) => {
    streamAbort.current?.abort()
    streamAbort.current = controller
    busyRef.current = true
    s.message = ''; s.recoverable = false
    publish(s)
    let failures = 0
    let response = first
    try {
      while (!s.terminal && !s.recoverable && !controller.signal.aborted) {
        try {
          if (!response) response = await checked(await fetch('/api/turns/' + encodeURIComponent(s.turnId!) + '/stream?afterSeq=' + s.seq, { signal: controller.signal }))
          await readTurnStream(response, (event) => {
            if (!mounted.current || controller.signal.aborted) return
            if (!applyTurnEvent(s, event)) return
            if (s.complete) {
              accept(s.complete); setGen({ status: 'idle' }); setLiveTurn(null); setNotice('本回合已保存')
            } else if (event.type === 'cancelled') {
              setGen({ status: 'idle' }); setLiveTurn(null); setNotice(event.message ?? '已停止，本回合没有保存')
            } else publish(s)
          })
          response = undefined
          if (s.terminal || s.recoverable) break
          throw new Error('连接中断，正在接续已显示的正文')
        } catch (error) {
          if (controller.signal.aborted) return
          if (error instanceof ApiError || ++failures > 3) throw error
          s.label = '连接中断，正在恢复'; publish(s)
          await new Promise<void>((resolve) => {
            const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve() }
            const timer = setTimeout(finish, 400 * failures)
            controller.signal.addEventListener('abort', finish, { once: true })
          })
          response = undefined
        }
      }
      if (s.recoverable && !controller.signal.aborted) publish(s)
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) { s.message = messageOf(error); s.recoverable = !s.terminal; publish(s) }
    } finally {
      if (streamAbort.current === controller) { busyRef.current = false; streamAbort.current = null }
    }
  }, [accept, publish])

  const attach = useCallback(async (active: NonNullable<Active>) => {
    let s = session.current
    if (!s || s.turnId !== active.turnId) {
      s = newSession({ mode: 'do', text: '' }, storyRef.current?.state.scene ?? null)
      s.turnId = active.turnId
      s.prepared = ['prepared', 'recovering', 'paused'].includes(active.status)
      session.current = s
    }
    await follow(s)
  }, [follow])

  const reload = useCallback(async () => {
    bootAbort.current?.abort()
    const controller = new AbortController()
    bootAbort.current = controller
    setLoading(true); setLoadError('')
    try {
      const [next, active] = await Promise.all([requestJson<StoryResponse>('/api/story', { signal: controller.signal }), requestJson<Active>('/api/turns/active', { signal: controller.signal })])
      if (controller.signal.aborted || !mounted.current) return
      accept(next); setLoading(false)
      headBefore.current = next.events[next.events.length - 1]?.id ?? null
      if (active) void attach(active)
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) { setLoadError(messageOf(error)); setLoading(false) }
    }
  }, [accept, attach])
  useEffect(() => {
    mounted.current = true
    void reload()
    return () => { mounted.current = false; bootAbort.current?.abort(); streamAbort.current?.abort() }
  }, [reload])

  const act = useCallback(async (action: Action) => {
    const current = storyRef.current
    if (!current?.story.player || current.state.status === 'ended' || busyRef.current || operationRef.current) return
    if (session.current?.turnId && !session.current.terminal) return
    const payload = actionPayload(action, current.currentBranchId)
    if (typeof payload.action === 'string' && (!payload.action.trim() || payload.action.length > 300)) { setNotice('请输入 1 到 300 个字符的行动'); return }
    const s = newSession(action, current.state.scene)
    session.current = s
    headBefore.current = current.events[current.events.length - 1]?.id ?? null
    busyRef.current = true
    publish(s)
    const controller = new AbortController()
    streamAbort.current = controller
    try {
      const response = await checked(await fetch('/api/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }))
      // The POST and stream share this controller; follow must not abort its own request.
      streamAbort.current = null
      await follow(s, response, controller)
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return
      // A dropped POST response can still mean the server accepted the job.
      if (!(error instanceof ApiError) || error.status === 409) {
        try {
          const [active, next] = await Promise.all([requestJson<Active>('/api/turns/active'), requestJson<StoryResponse>('/api/story')])
          accept(next)
          if (active) { streamAbort.current = null; await attach(active); return }
          if (next.events[next.events.length - 1]?.id !== headBefore.current) { s.terminal = true; setGen({ status: 'idle' }); setLiveTurn(null); return }
        } catch { /* Retrying reconciles with the server before submitting again. */ }
      }
      s.terminal = error instanceof ApiError && error.status !== 409
      s.recoverable = !s.terminal
      s.message = messageOf(error)
      publish(s)
    } finally {
      busyRef.current = false
      if (streamAbort.current === controller) streamAbort.current = null
    }
  }, [accept, attach, follow, publish])

  const retry = useCallback(async () => {
    if (busyRef.current) return
    const s = session.current
    if (!s) return
    busyRef.current = true
    try {
      const [active, next] = await Promise.all([requestJson<Active>('/api/turns/active'), requestJson<StoryResponse>('/api/story')])
      accept(next)
      if (active) { await attach(active); return }
      if (next.events[next.events.length - 1]?.id !== headBefore.current || next.state.status === 'ended') {
        s.terminal = true; setGen({ status: 'idle' }); setLiveTurn(null); return
      }
      s.terminal = true
      busyRef.current = false
      await act(s.action)
    } catch (error) { s.message = messageOf(error); s.recoverable = true; publish(s) }
    finally { busyRef.current = false }
  }, [accept, act, attach, publish])

  const stop = useCallback(async () => {
    const s = session.current
    if (!s?.turnId || s.prepared || s.terminal) return
    try { await requestJson('/api/turns/' + encodeURIComponent(s.turnId) + '/cancel', { method: 'POST', body: '{}' }) }
    catch (error) { setNotice(messageOf(error)) }
  }, [])
  const dismissError = useCallback(() => {
    if (session.current && !session.current.terminal) return
    session.current = null; setGen({ status: 'idle' }); setLiveTurn(null)
  }, [])
  const startNew = useCallback(async (roleId: string) => {
    if (busyRef.current || operationRef.current || (session.current?.turnId && !session.current.terminal)) return
    const current = storyRef.current
    if (current?.story.player) { setScreen(current.state.status === 'ended' ? 'ending' : 'reader'); return }
    operationRef.current = true; setOperation(true)
    try {
      const response = await requestJson<{ story: StoryResponse }>('/api/roles/select', { method: 'POST', body: JSON.stringify({ characterId: roleId }) })
      accept(response.story); session.current = null; setGen({ status: 'idle' }); setScreen('reader')
    } catch (error) { setNotice(messageOf(error)) }
    finally { operationRef.current = false; setOperation(false) }
  }, [accept])
  const reset = useCallback(async (next: Screen = 'entry') => {
    if (busyRef.current || operationRef.current || (session.current?.turnId && !session.current.terminal)) { setNotice('请先完成或取消当前回合'); return false }
    operationRef.current = true; setOperation(true)
    try {
      const response = await requestJson<{ story: StoryResponse }>('/api/reset', { method: 'POST', body: '{}' })
      accept(response.story); session.current = null; setGen({ status: 'idle' }); setLiveTurn(null); setScreen(next); return true
    } catch (error) { setNotice(messageOf(error)); return false }
    finally { operationRef.current = false; setOperation(false) }
  }, [accept])
  const busy = gen.status === 'thinking' || gen.status === 'writing'
  const locked = busy || Boolean(session.current?.turnId && !session.current.terminal)
  return { save, role, content, story, settings, setSettings, screen, setScreen, gen, act, retry, stop, startNew, reset, dismissError, savedAt: save?.updatedAt ?? null, loading, loadError, reload, notice, setNotice, operation, locked, liveTurn, phaseLabel, canCancel: busy && Boolean(session.current?.turnId) && !session.current?.prepared, systemReduced }
}
export type Game = ReturnType<typeof useGame>
