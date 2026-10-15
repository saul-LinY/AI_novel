import { useEffect, useMemo, useRef, useState } from 'react'
import { cnNumber, type Choice } from '../story/data'
import { SceneBackdrop } from './SceneBackdrop'
import type { Game, Turn } from '../story/useGame'
import { IntroBody } from './Intro'
import { Btn, Drawer, Icon, Seal, Modal } from './ui'
import { Embers, InkBurst, InkText, Lantern, SceneWash } from './fx'
import { PendingTurn, TurnProgress } from './TurnProgress'

const CHOICE_MARKS = ['壹', '贰', '叁', '肆']
// Reading column widths. The prose and the action dock share one column so the
// page reads as a single spread rather than a strip floating in the middle.
const COLUMN = { standard: 'max-w-[720px]', wide: 'max-w-[min(1120px,90vw)]', full: 'max-w-none sm:px-[5vw]' } as const
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'sentence' })
type Panel = null | 'info' | 'settings' | 'history' | 'intro'

function TurnView({ t, idx, prev, partial, caret, wide }: { t: Turn; idx: number; prev?: Turn; partial?: string[]; caret?: boolean; wide?: boolean }) {
  const paras = partial ?? t.paras
  const newScene = !prev || prev.place !== t.place
  const [main, sub] = t.place.split(' · ')
  return (
    <article id={`turn-${idx}`} className="scroll-mt-24">
      {newScene && (
        <header className="relative mb-12 mt-10 flex flex-col items-center text-center">
          <span className="pointer-events-none absolute -top-10 select-none font-serif text-[6em] font-black leading-none text-ink/[.04]">{cnNumber(idx + 1)}</span>
          <div className="ink-bleed label mb-3" style={{ animationDelay: '.1s' }}>{t.time}</div>
          <h2 className="font-serif text-[1.6em] font-semibold tracking-[0.3em]"><InkText text={main} step={70} delay={200} /></h2>
          {sub && <div className="ink-bleed mt-2 font-serif text-[0.8em] tracking-[0.5em] text-ink2" style={{ animationDelay: '.6s' }}>{sub}</div>}
          <svg viewBox="0 0 200 12" className="mt-5 h-3 w-40 text-brass/60" aria-hidden><path d="M2 7 C 40 2, 80 11, 120 6 S 180 3, 198 7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="brush-auto" pathLength={1} /></svg>
        </header>
      )}
      <div className={`prose-novel font-serif ${wide ? 'prose-columns' : ''}`}>
        {paras.map((p, i) => {
          const live = partial && i === paras.length - 1
          return (
            <p key={i} aria-live={live ? 'polite' : undefined} className={`${partial ? '' : 'soft-in'} ${caret && live ? 'caret' : ''}`} style={partial ? undefined : { animationDelay: `${i * 120}ms` }}>
              {live ? [...segmenter.segment(p)].map((seg, k) => <span key={k} className="ink-sentence">{seg.segment}</span>) : p}
            </p>
          )
        })}
      </div>
    </article>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; t: string; d?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} aria-pressed={value === o.v} className={`rounded-2xl px-4 py-3 text-left transition duration-500 ${value === o.v ? 'bg-brass/15 text-ink shadow-[inset_0_0_0_1px_rgb(196_164_108/.5)]' : 'bg-ink/[.03] text-ink2 hover:bg-ink/[.06]'}`}>
          <div className="font-serif">{o.t}</div>
          {o.d && <div className="mt-1 text-[11px] text-ink3">{o.d}</div>}
        </button>
      ))}
    </div>
  )
}

export default function Reader({ g }: { g: Game }) {
  const { save, role, settings, gen } = g
  const [resetConfirm, setResetConfirm] = useState(false)
  const [reveal, setReveal] = useState(false)
  const dock = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(300)
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submitting = useRef(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [introTab, setIntroTab] = useState<'bg' | 'comic' | 'cast'>('bg')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'do' | 'say'>('do')
  const [atBottom, setAtBottom] = useState(true)
  const [picked, setPicked] = useState<number | null>(null)
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([])
  const [wash, setWash] = useState<{ place: string; time: string } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const prevPlace = useRef<string | null>(null)
  const turns = save!.turns
  const last = turns[turns.length - 1]
  const w = save!.world
  const busy = gen.status === 'thinking' || gen.status === 'writing'
  const newCount = w.clues.filter((c) => c.isNew).length + w.items.filter((i) => i.isNew).length
  const live = gen.status === 'thinking' || gen.status === 'writing' ? gen.live : null
  // The backdrop moves as soon as the scene is decided, before any prose arrives.
  const scene = g.liveTurn ?? (live?.scene ? { ...last, place: live.scene.locationName, img: live.scene.image.src, fallback: live.scene.fallbackImage, imagePosition: live.scene.image.position, title: live.scene.title } : last)
  const motionOff = settings.motion === 'off'
  const theater = settings.mode === 'theater'
  const ended = !!save!.ending && !busy
  const portraits = g.content?.portraits ?? {}

  const limit = mode === 'say' ? 294 : 300
  // Older saves have no spoken line; those cards stay actions in 对话 mode.
  const choiceMode = (c: Choice): 'do' | 'say' => mode === 'say' && c.line ? 'say' : 'do'
  const shownText = (c: Choice) => choiceMode(c) === 'say' ? c.line! : c.action
  const partial = useMemo(() => {
    return g.liveTurn?.paras ?? null
  }, [g.liveTurn])
  useEffect(() => {
    if (!dock.current) { setDockHeight(0); return }
    const observer = new ResizeObserver(([entry]) => setDockHeight(entry.target.getBoundingClientRect().height))
    observer.observe(dock.current)
    return () => observer.disconnect()
  }, [ended])
  useEffect(() => () => { if (submitTimer.current) clearTimeout(submitTimer.current) }, [])

  // announce a new scene with an ink wash as soon as writing moves somewhere else
  useEffect(() => {
    if (prevPlace.current && prevPlace.current !== scene.place && !motionOff) setWash({ place: scene.place, time: scene.time })
    prevPlace.current = scene.place
  }, [scene.place, motionOff]) // eslint-disable-line

  const toBottom = (smooth = true) => void scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: smooth && !motionOff ? 'smooth' : 'auto' })
  useEffect(() => { toBottom(false) }, [])
  useEffect(() => { if (atBottom) toBottom(false) }, [partial?.join('').length, turns.length, gen.status, dockHeight, live?.beats.length, Boolean(live?.outcome)]) // eslint-disable-line

  const onScroll = () => {
    const el = scroller.current!
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
  }

  const burst = (x: number, y: number) => !motionOff && setBursts((b) => [...b, { id: Date.now() + Math.random(), x, y }])

  const submit = (t: string, m: 'do' | 'say' = mode, from?: { x: number; y: number; i?: number }, choice?: Choice) => {
    const v = t.trim()
    if (!v || busy || picked !== null || submitting.current || g.locked || gen.status !== 'idle' || (!choice && v.length > limit)) return
    submitting.current = true
    if (from) burst(from.x, from.y)
    setPicked(from?.i ?? -1)
    // The request goes out immediately; the ink animation plays alongside it.
    setAtBottom(true)
    void g.act({ mode: m, text: v, choiceId: choice?.id })
    setText('')
    submitTimer.current = setTimeout(() => {
      setPicked(null)
      submitting.current = false
    }, motionOff ? 0 : 700)
  }

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (panel || busy || ended || reveal || resetConfirm || gen.status !== 'idle' || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return
      const n = Number(e.key)
      if (n >= 1 && n <= last.choices.length) {
        const el = document.getElementById(`choice-${n - 1}`)?.getBoundingClientRect()
        const c = last.choices[n - 1]
        submit(shownText(c), choiceMode(c), { x: el ? el.left + el.width / 2 : innerWidth / 2, y: el ? el.top + el.height / 2 : innerHeight - 200, i: n - 1 }, c)
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  const column = COLUMN[settings.width]

  return (
    <div data-mode={settings.mode} data-motion={settings.motion} className="grain relative h-dvh overflow-hidden bg-bg text-ink">
      {theater ? (
        <div className="absolute inset-0" aria-hidden>
          <SceneBackdrop src={scene.img} fallback={scene.fallback} position={scene.imagePosition} />
          <div className="fog absolute inset-[-20%]" />
          <div className={`absolute inset-0 ${settings.width === 'standard' ? 'bg-[radial-gradient(ellipse_42%_65%_at_50%_45%,rgb(15_14_12/.93)_0%,rgb(15_14_12/.8)_50%,rgb(15_14_12/.3)_100%)]' : 'bg-[linear-gradient(to_bottom,rgb(15_14_12/.78),rgb(15_14_12/.84)_60%,rgb(15_14_12/.9))]'}`} />
          <Lantern off={motionOff} />
          <Embers off={motionOff || settings.motion === 'calm'} density={55} />
        </div>
      ) : (
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute -left-40 -top-40 size-[640px] rounded-full bg-[radial-gradient(circle,rgb(138_106_51/.12),transparent_65%)] float-y" />
          <div className="absolute -bottom-60 -right-40 size-[720px] rounded-full bg-[radial-gradient(circle,rgb(165_58_38/.07),transparent_65%)] float-y" style={{ animationDelay: '-3s' }} />
          <Embers off={motionOff || settings.motion === 'calm'} density={25} color="138,106,51" />
        </div>
      )}

      {/* floating chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-bg via-bg/80 to-transparent" aria-hidden />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 p-4 sm:p-5">
        <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1 pr-3">
          <button onClick={() => g.setScreen('entry')} className="grid size-9 place-items-center rounded-full text-ink2 transition hover:bg-ink/10 hover:text-ink" aria-label="返回入口"><Icon n="home" /></button>
          <button onClick={() => setPanel('history')} className="flex items-center gap-2 rounded-full px-2 py-1.5 text-ink2 transition hover:text-ink">
            <Icon n="scroll" />
            <span className="hidden font-serif text-sm tracking-widest sm:inline">第{cnNumber(w.chapter)}章</span>
          </button>
        </div>
        <div key={scene.place} className="ink-bleed min-w-0 pt-2 text-center">
          <div className="truncate font-serif text-xs tracking-[0.25em] text-ink/80 sm:text-sm sm:tracking-[0.4em]">{scene.place}</div>
          <div className="mt-1 hidden font-mono text-[10px] tracking-[0.3em] text-ink3 sm:block">{w.time}</div>
        </div>
        <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-full p-1">
          <span className="mx-2 hidden items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] text-ink3 lg:flex" aria-live="polite">
            <span className={`size-1.5 rounded-full ${g.locked ? 'animate-pulse bg-brass' : 'bg-[#7f9d78]'}`} />
            {g.locked ? '落笔中' : `已存 ${g.savedAt ? new Date(g.savedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}`}
          </span>
          {theater && <button onClick={() => setReveal(!reveal)} className="grid size-9 place-items-center rounded-full text-ink2 hover:bg-ink/10" aria-label={reveal ? '返回正文' : '欣赏场景'} aria-pressed={reveal}><Icon n="eye" /></button>}
          <button onClick={() => setPanel('intro')} className="grid size-9 place-items-center rounded-full text-ink2 transition hover:bg-ink/10 hover:text-ink" aria-label="故事介绍"><Icon n="book" /></button>
          <button onClick={() => setPanel('info')} className="relative grid size-9 place-items-center rounded-full text-ink2 transition hover:bg-ink/10 hover:text-ink" aria-label="卷宗">
            <Icon n="folder" />
            {newCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-seal font-mono text-[9px] text-[#f6ead8] shadow-[0_0_12px_rgb(184_67_45/.8)]">{newCount}</span>}
          </button>
          <button onClick={() => setPanel('settings')} className="grid size-9 place-items-center rounded-full text-ink2 transition hover:bg-ink/10 hover:text-ink" aria-label="阅读设置"><Icon n="type" /></button>
        </div>
      </header>

      {/* body */}
      <div ref={scroller} onScroll={onScroll} data-reading-scroll inert={reveal} aria-label="故事正文" tabIndex={0} className={'relative z-10 h-full overflow-y-auto pt-32 transition-opacity [mask-image:linear-gradient(to_bottom,transparent,#000_110px,#000)] ' + (reveal ? 'pointer-events-none opacity-0' : '')} style={{ paddingBottom: dockHeight + 48, maskImage: reveal ? undefined : 'linear-gradient(to bottom, transparent, #000 110px, #000 calc(100% - ' + (dockHeight + 16) + 'px), transparent calc(100% - ' + Math.max(0, dockHeight - 18) + 'px))' }}>
        <div className={`mx-auto px-6 sm:px-10 ${column}`} style={{ fontSize: settings.size }}>
          <div className="mb-16 flex flex-col items-center">
            <Seal ch={role!.name[0]} size={34} className="rotate-[-4deg]" />
            <div className="label mt-4">以 {role!.name} 之身</div>
          </div>
          {turns.map((t, i) => <TurnView key={t.id} t={t} idx={i} prev={turns[i - 1]} wide={settings.width === 'full'} />)}
          {live && (gen.status === 'thinking' || gen.status === 'writing') && <PendingTurn action={gen.action} />}
          {g.liveTurn && partial && <TurnView t={g.liveTurn} idx={turns.length} prev={last} partial={partial} caret={busy} wide={settings.width === 'full'} />}
          {ended && (
            <div className="soft-in mt-20 flex flex-col items-center text-center">
              <div className="orb mb-8 size-16 rounded-full" />
              <div className="label mb-6">故 事 已 至 终 章</div>
              <Btn onClick={() => g.setScreen('ending')}>翻开结局 <Icon n="arrowRight" /></Btn>
            </div>
          )}
        </div>
      </div>

      {!atBottom && !reveal && (
        <button onClick={() => toBottom()} style={{ bottom: dockHeight + 12 }} className="glass soft-in absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2.5 font-serif text-sm text-ink2 hover:text-ink">
          <Icon n="arrowDown" className="size-3.5 animate-bounce" /> 回到最新
        </button>
      )}

      {/* dock */}
      {!ended && !reveal && (
        <div ref={dock} data-action-dock className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg/90 to-transparent pt-10">
          <div className={`action-dock-content pointer-events-auto mx-auto max-h-[46dvh] overflow-y-auto px-5 pb-5 sm:px-10 ${column}`}>
            {gen.status === 'error' ? (
              <div className="glass soft-in rounded-[28px] p-6 text-center" role="alert">
                <div className="mx-auto mb-4 size-8 rounded-full bg-[radial-gradient(circle,rgb(184_67_45/.9),transparent_70%)] [filter:url(#ink-soft)]" />
                <div className="mb-2 font-serif text-lg">{gen.rejected ? '行 动 未 成 立' : '墨 断 了'}</div>
                <p className="mb-5 text-sm leading-relaxed text-ink2">{gen.message}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {!gen.rejected && <Btn onClick={() => void g.retry()}><Icon n="refresh" /> {gen.recoverable ? '接续当前回合' : '重新落笔'}</Btn>}
                  {!gen.recoverable && <Btn variant={gen.rejected ? 'solid' : 'ghost'} onClick={() => { setText(gen.action.text); setMode(gen.action.mode); g.dismissError(); setTimeout(() => input.current?.focus()) }}>修改行动</Btn>}
                </div>
              </div>
            ) : busy && live ? (
              <TurnProgress live={live} label={g.phaseLabel} writing={gen.status === 'writing'} chars={gen.status === 'writing' ? gen.shown : 0} canCancel={g.canCancel} onStop={() => void g.stop()} />
            ) : (
              <div>
                <div className="mb-4 flex items-center justify-center gap-4">
                  <span className="label tracking-[0.5em]">此 刻 · 你 会</span>
                  <div className="relative flex shrink-0 rounded-full bg-ink/5 p-0.5" role="group" aria-label="行动或对话">
                    <span className={`absolute inset-y-0.5 w-[calc(50%-2px)] rounded-full bg-brass/25 transition-transform duration-500 ${mode === 'say' ? 'translate-x-full' : ''}`} />
                    {(['do', 'say'] as const).map((m) => (
                      <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`relative rounded-full px-3 py-1 font-serif text-xs transition ${mode === m ? 'text-ink' : 'text-ink3 hover:text-ink2'}`}>{m === 'do' ? '行动' : '对话'}</button>
                    ))}
                  </div>
                </div>
                <ol className={`mb-5 grid gap-3 ${settings.width === 'standard' ? '' : last.choices.length === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  {last.choices.map((c, i) => (
                    <li key={last.id + c.id} className={`choice ${picked === null ? '' : picked === i ? 'choice-chosen' : 'choice-away'}`} style={{ animationDelay: `${300 + i * 140}ms`, ['--sx' as string]: `${(i - 1) * 40}px` }}>
                      <div className="choice-inner h-full" style={{ animationDelay: `${-i * 1.7}s` }}>
                        <button
                          disabled={picked !== null}
                          data-choice-id={c.id}
                          id={`choice-${i}`}
                          onClick={(e) => submit(shownText(c), choiceMode(c), { x: e.clientX, y: e.clientY, i }, c)}
                          className="choice-card group relative flex h-full w-full items-start gap-4 rounded-2xl border border-ink/10 bg-bg/40 px-4 py-3.5 text-left outline-none backdrop-blur-sm transition duration-500 hover:-translate-y-0.5 hover:border-brass/50 hover:bg-brass/[.07] focus-visible:border-brass"
                        >
                          <span className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-[radial-gradient(ellipse_at_left,rgb(196_164_108/.18),transparent_70%)] opacity-0 blur-md transition duration-500 group-hover:opacity-100" />
                          <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center">
                            <span className="absolute inset-0 rounded-full border border-brass/40 transition duration-500 group-hover:scale-125 group-hover:border-brass" />
                            <span className="font-serif text-xs text-brass">{CHOICE_MARKS[i] ?? cnNumber(i + 1)}</span>
                          </span>
                          <span className="relative min-w-0 font-serif text-[17px] tracking-wide text-ink/85 transition group-hover:text-ink">
                            <span className="block">{c.label}</span>{choiceMode(c) === 'say'
                              ? <span className="choice-detail mt-1 block font-serif text-[13px] italic leading-relaxed tracking-normal text-ink/80">「{c.line}」</span>
                              : <span className="choice-detail mt-1 block font-sans text-xs leading-relaxed tracking-normal text-ink2">{c.action}</span>}
                          </span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className={`choice ${picked === -1 ? 'choice-chosen' : picked !== null ? 'choice-away' : ''}`} style={{ animationDelay: '800ms' }}>
                  <div className="glass flex items-center gap-2 rounded-full p-1.5 pl-2 transition focus-within:shadow-[0_0_0_1px_rgb(196_164_108/.5),0_0_40px_-6px_rgb(196_164_108/.4)]">
                    <span className="shrink-0 pl-2 font-serif text-xs tracking-[0.2em] text-brass" aria-hidden>{mode === 'do' ? '我' : '我说'}</span>
                    <textarea
                      ref={input}
                      rows={1}
                      maxLength={limit}
                      aria-label={mode === 'do' ? '下一步行动' : '想说的话'}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                          e.preventDefault()
                          const r = e.currentTarget.getBoundingClientRect()
                          submit(text, mode, { x: r.right - 20, y: r.top + r.height / 2 })
                        }
                      }}
                      placeholder={mode === 'do' ? '例如：把药盒塞进外套，先去门口听动静…' : '例如：我们先离开这里，好吗？'}
                      className="max-h-24 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 font-serif text-[15px] text-ink outline-none placeholder:italic placeholder:text-ink3"
                    />
                    <button onClick={(e) => submit(text, mode, { x: e.clientX, y: e.clientY })} disabled={!text.trim() || text.trim().length > limit || picked !== null} className="grid size-10 shrink-0 place-items-center rounded-full bg-brass text-bg transition duration-500 hover:scale-110 hover:shadow-[0_0_30px_rgb(196_164_108/.6)] disabled:scale-90 disabled:opacity-25" aria-label="提交">
                      <Icon n="send" />
                    </button>
                  </div>
                  <div className="mt-3 text-center font-mono text-[10px] tracking-[0.2em] text-ink3">
                    {last.choices.length > 0 && <span className="hidden sm:inline">按 1–{last.choices.length} 抉择 · </span>}Enter 落笔 · <span className={limit - text.length < 30 ? 'text-seal' : ''}>{text.length}/{limit}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {reveal && <div className="pointer-events-none absolute inset-x-0 bottom-12 text-center"><h2 className="font-serif text-3xl text-ink">{scene.title || scene.place}</h2><p className="mt-3 text-sm text-ink2">{scene.place} · {scene.time}</p></div>}
      <Modal open={resetConfirm} onClose={() => { if (!g.operation) setResetConfirm(false) }} label="重新开始故事"><h2 className="mb-4 font-serif text-2xl">再启一卷</h2><p className="mb-7 leading-relaxed text-ink2">重新开始会重置当前故事进度，并返回角色选择。</p><div className="flex gap-3"><Btn variant="ghost" disabled={g.operation} onClick={() => setResetConfirm(false)}>取消</Btn><Btn disabled={g.operation} onClick={() => void g.reset('roles')}>确认重新开始</Btn></div></Modal>
      {bursts.map((b) => <InkBurst key={b.id} x={b.x} y={b.y} onDone={() => setBursts((x) => x.filter((y) => y.id !== b.id))} />)}
      {wash && <SceneWash place={wash.place} time={wash.time} onDone={() => setWash(null)} />}

      {/* drawers */}
      <Drawer open={panel === 'history'} onClose={() => setPanel(null)} side="left" kicker="回看" title="来时路">
        <ol className="relative border-l border-line">
          {turns.map((t, i) => (
            <li key={t.id} className="relative mb-6 pl-6">
              <span className={`absolute -left-[5px] top-1.5 size-[9px] rounded-full border ${i === turns.length - 1 ? 'border-brass bg-brass' : 'border-ink3 bg-bg2'}`} />
              <button onClick={() => { setPanel(null); setTimeout(() => document.getElementById(`turn-${i}`)?.scrollIntoView({ behavior: motionOff ? 'auto' : 'smooth' }), 350) }} className="text-left">
                <div className="label mb-1">{t.time}</div>
                <div className="font-serif font-semibold hover:text-brass">{t.place}</div>
                {t.action && <div className="mt-1 text-sm text-brass/90">→ {t.action.text}</div>}
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink3">{t.paras[0]}</p>
              </button>
            </li>
          ))}
        </ol>
        <Btn variant="ghost" className="w-full" onClick={() => { setPanel(null); toBottom() }}><Icon n="arrowDown" /> 回到最新</Btn>
      </Drawer>

      <Drawer open={panel === 'info'} onClose={() => setPanel(null)} kicker={`第${cnNumber(w.chapter)}章 · 卷宗`} title="随行手记" width="w-[460px]">
        <section className="mb-9 grid grid-cols-2 overflow-hidden rounded-2xl bg-ink/[.035]">
          <div className="py-4 px-4"><div className="label mb-1">此地</div><div className="font-serif">{w.place}</div></div>
          <div className="py-4 pl-4"><div className="label mb-1">此时</div><div className="font-serif">{w.time}</div></div>
        </section>
        <section className="mb-9">
          <h3 className="label mb-4">人物 · 关系</h3>
          <ul className="space-y-4">
            {[{ id: 'me', name: role!.name, tag: '你', state: role!.title, trust: 99, present: true }, ...w.people].map((p) => (
              <li key={p.id} className="flex items-center gap-4">
                {portraits[p.id === 'me' ? role!.id : p.id]
                  ? <img src={portraits[p.id === 'me' ? role!.id : p.id]} alt="" loading="lazy" className={`size-11 shrink-0 rounded-full border object-cover object-top ${p.id === 'me' ? 'border-brass' : 'border-line'} ${p.present || p.id === 'me' ? '' : 'opacity-60 grayscale'}`} />
                  : <span className={`grid size-11 shrink-0 place-items-center rounded-full border font-serif ${p.id === 'me' ? 'border-brass text-brass' : 'border-line'}`}>{p.name[0]}</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><span className="font-serif font-semibold">{p.name}</span><span className="text-xs text-ink3">{p.tag}</span></div>
                  <div className="text-[13px] text-ink2">{p.state}</div>
                </div>
                {p.trust !== 99 && (
                  <div className="text-right">
                    <div className="mb-1 flex gap-0.5">
                      {[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((v) => (
                        <span key={v} className={`h-2 w-1.5 ${v === p.trust ? (v < 0 ? 'bg-seal' : 'bg-brass') : 'bg-line'}`} />
                      ))}
                    </div>
                    <div className="font-mono text-[10px] text-ink3">{p.trust <= -3 ? '敌视' : p.trust < 0 ? '疏离' : p.trust === 0 ? '中立' : p.trust < 3 ? '亲近' : '信赖'} · {p.trust > 0 ? '+' : ''}{p.trust}</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="mb-9"><h3 className="label mb-4">人物关系</h3><ul className="space-y-3">{w.relationships.map((edge, i) => <li key={i} className="rounded-2xl bg-ink/[.035] p-4 text-sm leading-relaxed"><span className="font-serif">{edge.from} → {edge.to}</span><p className="mt-1 text-xs text-ink3">{({ attitude: '态度', trust: '信任', family: '家人', alliance: '同盟', hostility: '敌意', protection: '保护' } as Record<string, string>)[edge.type] ?? edge.type} · {edge.value > 0 ? '+' : ''}{edge.value}</p></li>)}</ul>{!w.relationships.length && <p className="text-sm text-ink3">暂时没有已知的关系变化。</p>}</section>
        <section className="mb-9">
          <h3 className="label mb-4">随身之物</h3>
          <ul className="grid grid-cols-2 gap-2">
            {w.items.map((it) => (
              <li key={it.id} className={`rounded-2xl p-3.5 transition ${it.isNew ? 'bg-brass/10 shadow-[inset_0_0_0_1px_rgb(196_164_108/.45)]' : 'bg-ink/[.035]'}`}>
                <div className="flex items-center justify-between font-serif text-[15px]">{it.name}{it.isNew && <span className="font-mono text-[9px] text-brass">NEW</span>}</div>
                <div className="mt-1 text-xs text-ink3">{it.note}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="mb-9">
          <h3 className="label mb-4">已知线索 · {w.clues.length}</h3>
          <ol className="space-y-3">
            {w.clues.map((c, i) => (
              <li key={c.id} className="soft-in flex gap-3 font-serif text-[15px] leading-relaxed">
                <span className="mt-1 font-mono text-[10px] text-ink3">{String(i + 1).padStart(2, '0')}</span>
                <span className={c.isNew ? 'text-brass' : ''}>{c.text}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="label mb-4">悬而未决</h3>
          <ul className="space-y-2">
            {w.questions.map((q) => (
              <li key={q.id} className={`flex items-center gap-3 font-serif text-[15px] ${q.solved ? 'text-ink3 line-through decoration-ink3/60' : ''}`}>
                {q.solved ? <Icon n="check" className="size-4 text-brass" /> : <span className="grid size-4 place-items-center font-serif text-xs text-seal">？</span>}
                {q.failed ? '已失去机会 · ' : ''}{q.text}
              </li>
            ))}
          </ul>
        </section>
      </Drawer>

      <Drawer open={panel === 'settings'} onClose={() => setPanel(null)} kicker="阅读" title="灯下设置">
        <section className="mb-10">
          <div className="mb-3 flex justify-between"><h3 className="label">字号</h3><span className="font-mono text-xs text-ink2">{settings.size}px</span></div>
          <div className="flex items-center gap-4">
            <span className="font-serif text-sm text-ink3">文</span>
            <input type="range" min={15} max={25} value={settings.size} onChange={(e) => g.setSettings({ ...settings, size: +e.target.value })} className="flex-1 accent-[var(--brass)]" aria-label="字号" />
            <span className="font-serif text-2xl text-ink3">文</span>
          </div>
          <p className="mt-5 border-l-2 border-line pl-4 font-serif leading-[2] text-ink2" style={{ fontSize: settings.size }}>东京的雨还没有停。</p>
        </section>
        <section className="mb-10">
          <h3 className="label mb-3">版心宽度</h3>
          <Segmented value={settings.width} onChange={(v) => g.setSettings({ ...settings, width: v })} options={[{ v: 'standard', t: '书页', d: '窄栏 · 居中' }, { v: 'wide', t: '宽幅', d: '铺满大半屏' }, { v: 'full', t: '通栏', d: '整屏铺开' }]} />
        </section>
        <section className="mb-10">
          <h3 className="label mb-3">阅读模式</h3>
          <Segmented value={settings.mode} onChange={(v) => g.setSettings({ ...settings, mode: v })} options={[{ v: 'theater', t: '剧场', d: '夜幕 · 场景画面' }, { v: 'focus', t: '专注', d: '素纸 · 只留文字' }]} />
        </section>
        <section>
          <h3 className="label mb-3">动态效果</h3>
          <Segmented value={settings.motion} onChange={(v) => g.setSettings({ ...settings, motion: v })} options={[{ v: 'full', t: '完整', d: '墨迹 · 雾动' }, { v: 'calm', t: '柔和', d: '轻动 · 静景' }, { v: 'off', t: '关闭', d: '减弱动态' }]} />
        </section>
        {g.systemReduced && <p className="mt-5 text-xs leading-relaxed text-ink3">已遵循系统的减弱动态偏好。</p>}
        <section className="mt-10 border-t border-line pt-7"><Btn variant="ghost" disabled={g.locked} onClick={() => { setPanel(null); setResetConfirm(true) }}><Icon n="refresh" />重新开始故事</Btn></section>
      </Drawer>

      <Drawer open={panel === 'intro'} onClose={() => setPanel(null)} kicker="随时回看" title="故事介绍" width="w-[980px]">
        <IntroBody tab={introTab} setTab={setIntroTab} content={g.content!} />
      </Drawer>
    </div>
  )
}
