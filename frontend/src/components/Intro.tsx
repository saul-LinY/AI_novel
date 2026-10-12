import { useEffect, useRef, useState } from 'react'
import type { Content } from '../story/data'
import { Btn, Icon, Modal, Seal } from './ui'

const TABS = [{ k: 'bg', n: '壹', t: '背景' }, { k: 'comic', n: '贰', t: '前情' }, { k: 'cast', n: '叁', t: '人物' }] as const
type K = (typeof TABS)[number]['k']
export function IntroBody({ tab, setTab, content }: { tab: K; setTab: (k: K) => void; content: Content }) {
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(false)
  const touch = useRef<number | null>(null)
  const current = content.comic[page]
  const turnPage = (delta: number) => setPage((p) => Math.min(content.comic.length - 1, Math.max(0, p + delta)))
  // Arrow keys page through the prologue while the comic tab is open.
  useEffect(() => {
    if (tab !== 'comic') return
    const key = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return
      if (e.key === 'ArrowRight') turnPage(1)
      if (e.key === 'ArrowLeft') turnPage(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }) // eslint-disable-line
  // Preload the next page so turning feels instant.
  useEffect(() => { const next = content.comic[page + 1]; if (next) new Image().src = next.image.src }, [page, content.comic])
  return <div>
    <nav className="mb-10 flex gap-8 border-b border-line" aria-label="故事介绍章节">
      {TABS.map((t) => <button key={t.k} aria-label={t.t} aria-pressed={tab === t.k} onClick={() => setTab(t.k)} className={'relative -mb-px flex items-baseline gap-2 pb-4 font-serif text-lg transition ' + (tab === t.k ? 'text-ink border-b border-brass' : 'text-ink3 hover:text-ink2')}><span className="text-xs text-brass">{t.n}</span>{t.t}</button>)}
    </nav>
    {tab === 'bg' && <div className="anim-rise grid gap-12 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5 font-serif text-[18px] leading-[2.1]">{content.story.background.body.split('\n\n').filter(Boolean).map((p, i) => <p key={i} className="indent-[2em]">{p}</p>)}</div>
      <dl className="space-y-4 self-start">
        {[['故事', content.story.subtitle], ['身份', content.roles.map((r) => r.name).join('、')], ['此刻', content.story.synopsis]].map(([k, v], i) => <div key={k} className="soft-in rounded-2xl bg-ink/[.03] px-5 py-5"><dt className="mb-3 flex items-center gap-4 font-serif text-brass"><span className="font-mono text-xs text-ink3">0{i + 1}</span>{k}</dt><dd className="text-[15px] leading-relaxed text-ink2">{v}</dd></div>)}
      </dl>
    </div>}
    {tab === 'comic' && current && <div className="anim-rise">
      <figure className="overflow-hidden rounded-[28px] bg-bg2">
        <button onClick={() => setZoom(true)} aria-label="放大本页漫画" className="group relative block w-full cursor-zoom-in"
          onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
          onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 48) turnPage(dx < 0 ? 1 : -1) }}>
          <img key={current.id} src={current.image.src} alt={current.image.alt} className="soft-in max-h-[72dvh] w-full object-contain" />
          <span className="glass absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink2 opacity-0 transition group-hover:opacity-100"><Icon n="expand" /></span>
        </button>
        <figcaption className="p-5 font-serif leading-relaxed sm:p-8"><span className="label mr-4 text-brass">{String(page + 1).padStart(2, '0')} / {content.comic.length}</span><strong className="mr-3 text-lg">{current.title}</strong><p className="mt-3 text-ink2">{current.caption}</p></figcaption>
      </figure>
      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap gap-1.5">{content.comic.map((_, i) => <button key={i} onClick={() => setPage(i)} aria-label={'第 ' + (i + 1) + ' 页漫画'} aria-current={i === page ? 'page' : undefined} className="grid h-8 min-w-5 place-items-center"><span className={'block h-[3px] transition-all ' + (i === page ? 'w-8 bg-brass' : 'w-3 bg-line')} /></button>)}</div>
        <div className="flex shrink-0 gap-2"><button disabled={page === 0} onClick={() => setPage(page - 1)} className="btn-ghost grid size-10 place-items-center disabled:opacity-30" aria-label="上一页漫画"><Icon n="arrowLeft" /></button><button disabled={page === content.comic.length - 1} onClick={() => setPage(page + 1)} className="btn-ghost grid size-10 place-items-center disabled:opacity-30" aria-label="下一页漫画"><Icon n="arrowRight" /></button></div>
      </div>
      <Modal wide open={zoom} onClose={() => setZoom(false)} label={'漫画第 ' + (page + 1) + ' 页'}>
        <img src={current.image.src} alt={current.image.alt} className="max-h-[86dvh] w-auto rounded-xl" />
      </Modal>
      {current.panels && <details className="mt-5 rounded-2xl border border-line p-5 text-sm text-ink2"><summary className="cursor-pointer font-serif">分镜与对白</summary><ol className="mt-5 space-y-5">{current.panels.map((p) => <li key={p.id}><p className="mb-2 text-brass">{p.scene}</p>{p.lines.map((line, i) => <p key={i} className="leading-relaxed">{line.speaker}：{line.text}</p>)}</li>)}</ol></details>}
    </div>}
    {tab === 'cast' && <div className="anim-rise grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {content.cast.map((c) => <article key={c.id} className="group">
        <div className="relative mb-4 grid aspect-[3/4] place-items-center overflow-hidden rounded-[999px_999px_24px_24px] bg-bg2">
          {c.image ? <img src={c.image.src} alt={c.image.alt} loading="lazy" className="size-full object-cover object-top saturate-[.7] transition duration-700 group-hover:scale-105 group-hover:saturate-100" /> : <div className="flex flex-col items-center gap-5"><Seal ch={c.name[0]} size={70} /><span className="font-serif tracking-[.3em] text-ink3">人物档案</span></div>}
          {c.playable && <span className="absolute left-3 top-3 bg-seal px-2 py-0.5 font-serif text-xs text-[#f6ead8]">可扮演</span>}
        </div>
        <h3 className="font-serif text-xl font-semibold">{c.name}</h3><p className="label mb-2 mt-1 !normal-case !tracking-[0.08em]">{c.role}</p><p className="text-[13.5px] leading-relaxed text-ink2">{c.publicSummary}</p>
      </article>)}
    </div>}
  </div>
}
export default function Intro({ onDone, onBack, content, continuing = false }: { onDone: () => void; onBack: () => void; content: Content; continuing?: boolean }) {
  const [tab, setTab] = useState<K>('bg')
  const idx = TABS.findIndex((t) => t.k === tab)
  return <main className="grain relative min-h-dvh bg-bg" data-mode="theater">
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-bg to-transparent px-5 py-5 lg:px-14"><Btn variant="text" onClick={onBack}><Icon n="arrowLeft" />返回</Btn><span className="label">卷首 · 故事介绍</span><Btn variant="text" onClick={onDone}>{continuing ? '继续阅读' : '跳过'}<Icon n="arrowRight" /></Btn></header>
    <div className="mx-auto max-w-[1200px] px-6 py-10 lg:px-14 lg:py-14">
      <h1 className="mb-10 font-serif text-4xl font-bold tracking-wide lg:text-6xl">{content.story.title}<span className="mt-4 block text-sm font-normal tracking-[0.2em] text-ink3">{content.story.subtitle}</span></h1>
      <IntroBody tab={tab} setTab={setTab} content={content} />
      <div className="mt-12 flex justify-end pt-8">{idx < TABS.length - 1 ? <Btn variant="ghost" onClick={() => setTab(TABS[idx + 1].k)}>下一页 · {TABS[idx + 1].t}<Icon n="arrowRight" /></Btn> : <Btn onClick={onDone}>{continuing ? '继续阅读' : '选择你的身份'}<Icon n="arrowRight" /></Btn>}</div>
    </div>
  </main>
}
