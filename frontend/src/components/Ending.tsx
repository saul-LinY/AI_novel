import { useState } from 'react'
import { ENDING_LABELS } from '../story/data'
import type { Game } from '../story/useGame'
import { Btn, Drawer, Icon, Modal, Seal } from './ui'
import { Embers, InkText } from './fx'
export default function Ending({ g }: { g: Game }) {
  const s = g.save!
  const e = s.ending!
  const story = g.content!.story
  const [full, setFull] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const w = s.world
  const art = g.content!.endingArt[e.type]
  return <main className="grain relative min-h-dvh bg-bg" data-mode="theater">
    <section className="relative grid min-h-dvh place-items-center overflow-hidden px-6 py-24">
      <img src={art?.src ?? s.turns[s.turns.length - 1].img} alt={art?.alt ?? ''} className={`anim-drift absolute inset-0 size-full object-cover ${art ? 'opacity-55' : 'opacity-30 [filter:grayscale(.7)_sepia(.3)]'}`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(15_14_12/.72),rgb(15_14_12/.92)_70%,#0f0e0c)]" /><Embers density={90} />
      <div className="relative max-w-2xl text-center"><div className="anim-rise label mb-8">终章 · {story.title}</div><Seal ch="终" size={72} className="anim-rise mb-8 rotate-[-4deg]" />
        <h1 className="anim-rise mb-10 font-serif text-4xl font-black tracking-[0.12em] sm:text-6xl"><InkText text={ENDING_LABELS[e.type]} step={220} delay={300} /></h1>
        <p className="anim-rise mb-5 font-serif text-lg leading-[2.1] text-ink2">{e.coreQuestionResponse}</p>
        <p className="mb-10 font-serif leading-relaxed text-brass">{e.keyChoice}</p>
        <div className="space-y-6 text-left">{[['眼前的改变', e.directConsequences], ['此后的余波', e.longTermConsequences], ['付出的代价', e.costs], ['已有回答', e.resolvedQuestions], ['仍待回答', e.unresolvedQuestions]].filter(([, lines]) => Array.isArray(lines) && lines.length > 0).map(([label, lines], i) => <section key={String(label)} className="glass anim-rise rounded-2xl p-5" style={{ animationDelay: `${1.2 + i * 0.35}s` }}><h2 className="label mb-3">{label}</h2>{(lines as string[]).map((line, k) => <p key={k} className="font-serif leading-[1.9] text-ink2">{line}</p>)}</section>)}</div>
        <div className="mx-auto mt-12 grid max-w-lg grid-cols-3">{[['抉择', s.turns.length - 1], ['线索', w.clues.length], ['未解', w.questions.filter((q) => !q.solved).length]].map(([k, v]) => <div key={k} className="py-5"><div className="font-serif text-3xl">{v}</div><div className="label mt-1">{k}</div></div>)}</div>
        <div className="mt-10 flex flex-wrap justify-center gap-3"><Btn onClick={() => setFull(true)}><Icon n="scroll" />回看全篇</Btn><Btn variant="ghost" onClick={() => setConfirm(true)}><Icon n="refresh" />重新开始</Btn><Btn variant="ghost" onClick={() => g.setScreen('entry')}><Icon n="home" />返回入口</Btn></div>
      </div>
    </section>
    <div data-mode="focus"><Drawer open={full} onClose={() => setFull(false)} title={story.title} kicker="全篇回看" width="w-[760px]">
      <div className="mx-auto max-w-[640px] py-4" style={{ fontSize: g.settings.size }}><p className="label mb-12 text-center">以 {g.role?.name} 之身 · {ENDING_LABELS[e.type]}</p>
        {s.turns.map((t, i) => <article key={t.id}>{(i === 0 || s.turns[i - 1].place !== t.place) && <h2 className="mb-6 mt-8 font-serif text-[1.2em] font-semibold">{t.place}<span className="ml-3 text-xs font-normal text-ink3">{t.time}</span></h2>}<div className="prose-novel font-serif">{t.paras.map((p, k) => <p key={k}>{p}</p>)}</div></article>)}
        <div className="mt-12 text-center"><Seal ch="完" size={40} /></div>
      </div>
    </Drawer></div>
    <Modal open={confirm} onClose={() => { if (!g.operation) setConfirm(false) }} label="重新开始故事"><h2 className="mb-4 font-serif text-2xl">再启一卷</h2><p className="mb-8 leading-relaxed text-ink2">重新开始会重置当前进度，回到角色选择。确定继续吗？</p><div className="flex gap-3"><Btn variant="ghost" disabled={g.operation} onClick={() => setConfirm(false)}>保留此卷</Btn><Btn disabled={g.operation} onClick={() => void g.reset('roles')}>重新开始</Btn></div></Modal>
  </main>
}
