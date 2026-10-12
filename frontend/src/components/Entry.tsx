import { useState } from 'react'
import type { Game } from '../story/useGame'
import { Btn, Icon, Seal } from './ui'
import { Embers, InkText, Lantern, useParallax } from './fx'

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前`
}

export default function Entry({ g }: { g: Game }) {
  const [confirm, setConfirm] = useState(false)
  const px = useParallax()
  const STORY = g.content!.story
  const s = g.save
  const role = g.role
  // The last sentence the reader saw, as a bookmark excerpt.
  const lastPara = s?.turns.at(-1)?.paras.at(-1) ?? ''
  const lastLine = lastPara.split(/(?<=[。！？])/).filter(Boolean).at(-1)?.slice(0, 40) ?? ''
  return (
    <main className="grain relative min-h-dvh overflow-x-clip bg-[#0b0a08] text-[#ece4d2]" data-mode="theater">
      <div className="absolute inset-[-4%] transition-transform duration-[1400ms] ease-out" style={{ transform: `translate3d(${px.x * -30}px,${px.y * -20}px,0)` }}><picture>
        {STORY.coverTall && <source media="(max-aspect-ratio: 4/5)" srcSet={STORY.coverTall.src} />}
        <img src={STORY.cover.src} alt={STORY.cover.alt} fetchPriority="high" className="anim-drift size-full object-cover object-[60%_20%] opacity-75 [filter:saturate(.85)_contrast(1.05)]" />
      </picture></div>
      <div className="pointer-events-none absolute right-[8%] top-[18%] size-[46vmin] rounded-full bg-[radial-gradient(circle,rgb(243_223_180/.22),rgb(196_164_108/.06)_45%,transparent_70%)] float-y" style={{ transform: `translate3d(${px.x * 40}px,${px.y * 30}px,0)` }} />
      <div className="fog absolute inset-[-20%]" />
      <Lantern />
      <Embers density={70} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#0b0a08_8%,rgb(11_10_8/.7)_45%,rgb(11_10_8/.2)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0b0a08] to-transparent" />

      <header className="relative z-10 flex items-center justify-between px-8 pt-7 lg:px-14">
        <div className="flex items-center gap-3">
          <Seal ch="異" size={30} />
          <span className="label !text-[#b9ae98]">{STORY.brand} · 互动小说</span>
        </div>
        {STORY.volume && <span className="label hidden sm:block">{STORY.volume}</span>}
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-80px)] max-w-[1400px] grid-cols-1 items-end gap-10 px-8 pb-14 lg:grid-cols-[1fr_auto] lg:px-14">
        <section className="anim-rise max-w-xl">
          <div className="mb-8 flex flex-wrap gap-x-5 gap-y-2">
            {STORY.genre.map((t) => (
              <span key={t} className="label !text-[#c4a46c]">{t}</span>
            ))}
          </div>
          <p className="mb-6 font-serif text-xl leading-relaxed text-[#ece4d2]/90 lg:text-2xl">「{STORY.tagline}」</p>
          <p className="mb-10 max-w-lg text-[15px] leading-[1.95] text-[#b9ae98]">{STORY.synopsis}</p>

          {s && role && !confirm ? (
            <div className="glass mb-7 flex items-center gap-5 rounded-full py-2 pl-2 pr-8">
              <img src={role.portrait} alt={role.name} className="size-14 rounded-full object-cover object-top" />
              <div className="flex-1">
                <div className="label mb-1">书签 · 自动保存于 {ago(s.updatedAt)}</div>
                <div className="font-serif text-lg">
                  以 {role.name} 之身 · {s.ending ? '已抵达结局' : `第 ${s.world.chapter} 章`}
                </div>
                <div className="text-[13px] text-[#958b78]">{s.world.place} · {s.world.time}</div>
                {lastLine && <p className="mt-1 line-clamp-1 font-serif text-[13px] italic text-[#b9ae98]">「{lastLine}」</p>}
              </div>
            </div>
          ) : null}

          {confirm ? (
            <div className="glass soft-in rounded-[28px] p-6">
              <p className="mb-4 font-serif">重新开始将重置当前故事进度。确定要重新选择身份吗？</p>
              <div className="flex gap-3">
                <Btn disabled={g.operation || g.locked} onClick={() => void g.reset('intro')}>覆盖并开始</Btn>
                <Btn variant="ghost" onClick={() => setConfirm(false)}>再想想</Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {s ? (
                <>
                  <Btn onClick={() => g.setScreen(s.ending ? 'ending' : 'reader')}>
                    {s.ending ? '重温结局' : '继续阅读'} <Icon n="arrowRight" className="size-4 transition group-hover:translate-x-1" />
                  </Btn>
                  <Btn variant="ghost" disabled={g.locked} onClick={() => setConfirm(true)}>新的故事</Btn>
                </>
              ) : (
                <Btn onClick={() => g.setScreen('intro')}>
                  启 卷 <Icon n="arrowRight" className="size-4 transition group-hover:translate-x-1" />
                </Btn>
              )}
            </div>
          )}
          {!confirm && <div className="mt-6 flex flex-wrap gap-5">
            <button onClick={() => g.setScreen('intro')} className="text-sm text-ink2 underline-offset-4 hover:text-brass hover:underline">翻开前情</button>
            {!s && <button onClick={() => g.setScreen('roles')} className="text-sm text-ink2 underline-offset-4 hover:text-brass hover:underline">人物预览 · 选择身份</button>}
          </div>}
        </section>

        <h1 className="anim-rise pointer-events-none order-first select-none font-serif lg:order-none lg:flex lg:flex-row-reverse lg:items-end lg:gap-5" style={{ animationDelay: '.2s' }}>
          <span className="block text-[18vw] font-black leading-[0.95] tracking-[0.05em] text-[#ece4d2] [text-shadow:0_0_60px_rgb(196_164_108/.25)] lg:[writing-mode:vertical-rl] lg:text-[min(17vh,170px)]" style={{ transform: `translate3d(${px.x * 14}px,${px.y * 10}px,0)` }}><InkText text={STORY.title} step={260} delay={300} /></span>
          <span className="mt-4 block text-sm tracking-[0.4em] text-[#b9ae98] lg:mt-0 lg:pb-2 lg:[writing-mode:vertical-rl]">{STORY.subtitle}</span>
        </h1>
      </div>
    </main>
  )
}
