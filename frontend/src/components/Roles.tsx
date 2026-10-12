import { useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Role } from '../story/data'
import { Btn, Icon, Seal, Modal } from './ui'
import { Embers, InkText, MotionContext, useParallax } from './fx'

export default function Roles({ roles: ROLES, pending, onPick, onBack }: { roles: Role[]; pending: boolean; onPick: (id: string) => void; onBack: () => void }) {
  const [i, setI] = useState(0)
  const motion = useContext(MotionContext)
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 1023px)').matches)
  useEffect(() => {
    const media = matchMedia('(max-width: 1023px)')
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const [secret, setSecret] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const r = ROLES[i]
  const px = useParallax()
  const go = (n: number) => { setI(n); setSecret(false) }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (confirm || pending) return
      let n = i
      if (e.key === 'ArrowRight') n = (i + 1) % ROLES.length
      else if (e.key === 'ArrowLeft') n = (i + ROLES.length - 1) % ROLES.length
      else if (e.key === 'Home') n = 0
      else if (e.key === 'End') n = ROLES.length - 1
      else return
      e.preventDefault(); go(n)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [i, confirm, pending, ROLES.length])
  const controls = (<div data-mode="theater" data-motion={motion} className="role-confirm-dock fixed inset-x-0 bottom-0 z-30 mt-auto flex flex-wrap items-center justify-center gap-3 border-t border-line bg-bg/95 px-4 py-4 backdrop-blur-lg lg:static lg:col-start-3 lg:justify-start lg:border-0 lg:bg-transparent lg:p-0">
            <Btn disabled={pending} onClick={() => setConfirm(true)}>以此身入局 <Icon n="arrowRight" /></Btn>
            <Btn variant="ghost" onClick={() => go((i + 1) % ROLES.length)}>下一位</Btn>
          </div>)
  return (
    <>
    <main className="grain relative min-h-dvh overflow-hidden bg-bg" data-mode="theater">
      <Embers density={40} />
      <div className="pointer-events-none absolute left-[22%] top-[30%] size-[60vmin] rounded-full bg-[radial-gradient(circle,rgb(196_164_108/.14),transparent_65%)] blur-2xl" />
      <header className="relative z-20 flex items-center justify-between px-5 py-5 lg:px-14">
        <Btn variant="text" onClick={onBack}><Icon n="arrowLeft" /> 故事介绍</Btn>
        <span className="label">择身 · 选择你的角色</span>
        <span className="font-mono text-xs text-ink3">{String(i + 1).padStart(2, '0')} / {String(ROLES.length).padStart(2, '0')}</span>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-10 px-8 pb-32 lg:pb-12 lg:grid-cols-[160px_minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:px-14">
        <nav className="flex flex-wrap gap-x-5 gap-y-3 lg:flex-col lg:pt-10" aria-label="角色">
          {ROLES.map((x, n) => (
            <button key={x.id} onClick={() => go(n)} aria-pressed={n === i} className={`group flex items-center gap-3 text-left transition ${n === i ? 'text-ink' : 'text-ink3 hover:text-ink2'}`}>
              <span className={`h-px transition-all duration-500 ${n === i ? 'w-8 bg-brass' : 'w-3 bg-ink3'}`} />
              <span className="font-serif text-lg tracking-widest">{x.name}</span>
            </button>
          ))}
        </nav>

        <figure key={r.id + 'img'} className="soft-in relative aspect-[2/3] max-h-[78vh]" style={{ transform: `perspective(1200px) rotateY(${px.x * 6}deg) rotateX(${px.y * -4}deg)`, transition: 'transform 1.2s cubic-bezier(.2,.7,.2,1)' }}>
          <img src={r.keyArt ?? r.portrait} alt={`${r.name}的角色主视觉`} className="feather size-full object-cover object-top" />
          <figcaption className="absolute bottom-6 left-6 right-6 font-serif text-lg italic leading-relaxed text-ink/90">「{r.quote}」</figcaption>
          <span className="absolute -right-6 top-0 font-serif text-[160px] font-black leading-none text-brass/10 float-y">{r.name[0]}</span>
        </figure>

        <section key={r.id} className="anim-rise flex flex-col lg:pt-10" style={{ animationDelay: '.08s' }}>
          <div className="label mb-3">{r.title}</div>
          <h1 className="mb-8 font-serif text-[clamp(2.4rem,7vw,4.5rem)] font-bold tracking-[0.04em]"><InkText text={r.name} step={140} /></h1>
          <p className="mb-10 max-w-xl text-[15.5px] leading-[1.95] text-ink2">{r.bio}</p>

          <div className="mb-10 flex max-w-xl flex-wrap gap-3">
            {r.traits.map((t) => <span key={t} className="rounded-full border border-brass/30 bg-brass/5 px-4 py-2 font-serif text-sm text-brass">{t}</span>)}
          </div>

          <div className="mb-6 max-w-xl">
            <div className="label mb-3">初始处境</div>
            <p className="font-serif italic text-[17px] leading-[1.9]">{r.situation}</p>
          </div>

          <button onClick={() => setSecret(!secret)} aria-expanded={secret} className="mb-10 max-w-xl text-left">
            <div className="label mb-3 flex items-center gap-2">角色压力 <span className="!tracking-normal text-ink3">{secret ? '· 点击收起' : '· 点击揭开'}</span></div>
            <p className={`font-serif text-[15px] leading-relaxed transition duration-700 ${secret ? 'text-seal blur-0' : 'select-none text-ink2 blur-[6px]'}`}>{r.pressure}</p>
          </button>


        </section>
          {!mobile && controls}
      </div>

      <Modal open={confirm} onClose={() => { if (!pending) setConfirm(false) }} label="确认角色">
        <div className="text-center"><Seal ch={r.name[0]} size={56} className="mb-6" /><h2 className="mb-3 font-serif text-2xl font-semibold">以「{r.name}」之身入局</h2><p className="mb-8 text-sm leading-relaxed text-ink2">确认后，将以这个身份开始故事。你的每一个抉择都将被记下。</p><div className="flex justify-center gap-3"><Btn disabled={pending} variant="ghost" onClick={() => setConfirm(false)}>再看看</Btn><Btn disabled={pending} onClick={() => onPick(r.id)}>{pending ? '正在启程…' : '确认'}</Btn></div></div>
      </Modal>
    </main>
    {mobile && createPortal(controls, document.body)}
    </>
  )
}
