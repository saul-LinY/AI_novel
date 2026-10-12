import { useEffect, useState } from 'react'
import { AGENT_SEALS } from '../story/data'
import { Icon } from './ui'
import type { Live } from '../story/useGame'
import type { Action } from '../story/data'

// The player's own action, echoed at the end of the prose while it is answered.
export function PendingTurn({ action }: { action: Action }) {
  return (
    <section className="pending-turn soft-in mt-10" aria-label="正在书写的回合">
      <div className="mx-auto mb-4 flex max-w-[34em] items-start gap-3 rounded-2xl border border-brass/25 bg-brass/[.06] px-5 py-4">
        <span className="mt-0.5 font-serif text-xs tracking-[0.3em] text-brass">{action.mode === 'say' ? '你说' : '你'}</span>
        <p className="flex-1 font-serif text-[0.92em] leading-relaxed text-ink/90">{action.text}</p>
      </div>
    </section>
  )
}

function useElapsed(startedAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return Math.max(0, Math.round((now - startedAt) / 1000))
}

// The dock while a turn is in progress: player-safe glimpses of the scene, the
// four writing steps with plain status words, and a real elapsed counter.
export function TurnProgress({ live, label, writing, chars, canCancel, onStop }: { live: Live; label: string; writing: boolean; chars: number; canCancel: boolean; onStop: () => void }) {
  const elapsed = useElapsed(live.startedAt)
  return (
    <div className="soft-in mx-auto flex w-full max-w-[880px] flex-col items-center rounded-[28px] bg-bg/80 px-6 pb-4 pt-5 text-center shadow-[0_-20px_60px_-20px_rgb(0_0_0/.8)] backdrop-blur-md" aria-live="polite">
      {!writing && (live.beats.length > 0 || live.outcome) && (
        <div className="mb-5 space-y-2">
          {live.beats.map((beat) => (
            <p key={beat.role} className="beat-line mx-auto max-w-[30em] font-serif text-[15px] italic leading-relaxed text-ink2">{beat.text}</p>
          ))}
          {live.outcome && (
            <p className="beat-line mx-auto !mt-4 w-fit rounded-full border border-seal/50 px-4 py-1 font-serif text-xs tracking-[0.4em] text-seal">{live.outcome.label}</p>
          )}
        </div>
      )}
      <ol className="mb-5 grid w-full grid-cols-2 gap-2 sm:grid-cols-4" aria-label="幕后进度">
        {AGENT_SEALS.map(({ role, name, task }) => {
          const status = live.agents[role] ?? (role === 'main' && writing ? 'done' : 'waiting')
          const state = status === 'done' ? 'done' : status === 'started' || status === 'retrying' ? 'active' : status === 'failed' ? 'failed' : 'waiting'
          const word = { done: '已完成', active: status === 'retrying' ? '正在修正' : '进行中', failed: '出错', waiting: '等待中' }[state]
          return (
            <li key={role} className={`agent-step agent-step-${state} rounded-xl px-3 py-2.5 text-left`}>
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="whitespace-nowrap font-serif text-sm">{name}</span>
                <span className="agent-step-status flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px]">
                  {state === 'done' ? <Icon n="check" className="size-3" /> : <i className="size-1.5 rounded-full bg-current" />}
                  {word}
                </span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-ink3">{task}</div>
            </li>
          )
        })}
      </ol>
      <div key={label} className="ink-bleed mb-1 font-serif text-lg tracking-[0.3em]">{label}</div>
      <div className="mb-4 font-mono text-[10px] tracking-[0.2em] text-ink3">
        {writing ? `已落笔 ${chars} 字 · ` : ''}{elapsed} 秒 · {writing ? '完成后自动保存' : '可以离开页面，故事会在后台继续'}
      </div>
      <button onClick={onStop} disabled={!canCancel} title={canCancel ? '停止本回合，不写入存档' : '正文已经锁定，将继续生成并保存'} className="flex items-center gap-2 rounded-full px-4 py-1.5 font-serif text-xs tracking-widest text-ink2 transition hover:bg-ink/10 disabled:cursor-not-allowed disabled:opacity-40">
        {canCancel ? '停止生成' : '正文已锁定'}
      </button>
    </div>
  )
}
