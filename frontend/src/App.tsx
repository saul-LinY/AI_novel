import { useEffect } from 'react'
import Entry from './components/Entry'
import Ending from './components/Ending'
import Intro from './components/Intro'
import Reader from './components/Reader'
import Roles from './components/Roles'
import { useGame, type Game } from './story/useGame'
import { InkDefs, MotionContext } from './components/fx'
import { Btn, Icon, Seal } from './components/ui'

export default function App() {
  const g = useGame()
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }, [g.screen])
  return (
    <MotionContext.Provider value={g.settings.motion}>
      <div data-motion={g.settings.motion} data-mode={g.screen === 'reader' ? g.settings.mode : 'theater'} data-screen={g.screen}>
        <InkDefs />
        {g.loading || !g.content ? (
          <main className="grain grid min-h-dvh place-items-center bg-bg p-8 text-center text-ink" aria-busy={g.loading}>
            <div className="max-w-md"><Seal ch="卷" size={48} /><h1 className="my-8 font-serif text-3xl tracking-widest">东京出走</h1>
              {g.loadError ? <><p className="mb-6 leading-relaxed text-ink2" role="alert">{g.loadError}</p><Btn onClick={() => void g.reload()}><Icon n="refresh" />重新连接</Btn></> : <p className="font-serif text-ink2" role="status">正在翻开你的故事…</p>}
            </div>
          </main>
        ) : <div key={g.screen} className="page-in"><Screen g={g} /></div>}
        {g.notice && <div className="glass fixed top-20 left-1/2 z-[100] flex w-max max-w-[92vw] -translate-x-1/2 items-center gap-4 rounded-2xl px-5 py-4 text-sm text-ink shadow-xl" role="status"><span>{g.notice}</span><button aria-label="关闭提示" onClick={() => g.setNotice('')}><Icon n="x" /></button></div>}
      </div>
    </MotionContext.Provider>
  )
}
function Screen({ g }: { g: Game }) {
  const { screen, save } = g
  if (screen === 'intro') return <Intro content={g.content!} onBack={() => g.setScreen('entry')} onDone={() => g.setScreen(save ? 'reader' : 'roles')} continuing={Boolean(save)} />
  if (screen === 'roles') return <Roles roles={g.content!.roles} pending={g.operation} onBack={() => g.setScreen('intro')} onPick={(id) => void g.startNew(id)} />
  if (screen === 'reader' && save && g.role) return <Reader g={g} />
  if (screen === 'ending' && save?.ending) return <Ending g={g} />
  return <Entry g={g} />
}
