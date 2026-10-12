import { createContext, useContext, useEffect, useRef, useState } from 'react'

export const MotionContext = createContext<'full' | 'calm' | 'off'>('full')

/** SVG filters shared across the app: organic ink edges + paper warp */
export const InkDefs = () => (
  <svg width="0" height="0" className="absolute" aria-hidden>
    <filter id="ink-edge">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="7" />
      <feDisplacementMap in="SourceGraphic" scale="46" />
    </filter>
    <filter id="ink-soft">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" />
      <feDisplacementMap in="SourceGraphic" scale="14" />
      <feGaussianBlur stdDeviation="0.6" />
    </filter>
  </svg>
)

/** Floating embers / dust that drift upward and lean away from the cursor */
export function Embers({ density = 60, color = '196,164,108', off = false }: { density?: number; color?: string; off?: boolean }) {
  const motion = useContext(MotionContext)
  off = off || motion !== 'full'
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    if (off) { c.getContext('2d')?.clearRect(0, 0, c.width, c.height); return }
    const ctx = c.getContext('2d')!
    let w = 0, h = 0, raf = 0
    const mouse = { x: -999, y: -999 }
    const resize = () => { w = c.width = innerWidth * devicePixelRatio; h = c.height = innerHeight * devicePixelRatio }
    resize()
    const ps = Array.from({ length: density }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + 0.4,
      vy: -(Math.random() * 0.25 + 0.05), vx: (Math.random() - 0.5) * 0.15, a: Math.random() * 0.6 + 0.15, t: Math.random() * 6.28,
    }))
    const mm = (e: PointerEvent) => { mouse.x = e.clientX * devicePixelRatio; mouse.y = e.clientY * devicePixelRatio }
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of ps) {
        p.t += 0.01
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy)
        if (d > 0 && d < 160) { p.x += (dx / d) * 1.2; p.y += (dy / d) * 1.2 }
        p.x += p.vx + Math.sin(p.t) * 0.2
        p.y += p.vy * devicePixelRatio
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4 * devicePixelRatio)
        g.addColorStop(0, `rgba(${color},${p.a * (0.6 + Math.sin(p.t * 3) * 0.4)})`)
        g.addColorStop(1, `rgba(${color},0)`)
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4 * devicePixelRatio, 0, 6.28); ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    addEventListener('resize', resize); addEventListener('pointermove', mm)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', mm) }
  }, [density, color, off])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
}

/** A soft lantern glow that trails the pointer */
export function Lantern({ off = false }: { off?: boolean }) {
  const motion = useContext(MotionContext)
  off = off || motion !== 'full'
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (off) return
    let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, raf = 0
    const mm = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY }
    const loop = () => {
      x += (tx - x) * 0.06; y += (ty - y) * 0.06
      if (ref.current) ref.current.style.transform = `translate3d(${x - 400}px,${y - 400}px,0)`
      raf = requestAnimationFrame(loop)
    }
    loop(); addEventListener('pointermove', mm)
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', mm) }
  }, [off])
  if (off) return null
  return <div ref={ref} className="pointer-events-none absolute left-0 top-0 size-[800px] rounded-full bg-[radial-gradient(circle,rgb(196_164_108/.13),transparent_60%)] mix-blend-screen" aria-hidden />
}

/** Mouse parallax offset hook (-1..1) */
export function useParallax() {
  const motion = useContext(MotionContext)
  const [p, setP] = useState({ x: 0, y: 0 })
  useEffect(() => {
    if (motion !== 'full') { setP({ x: 0, y: 0 }); return }
    const f = (e: PointerEvent) => setP({ x: e.clientX / innerWidth - 0.5, y: e.clientY / innerHeight - 0.5 })
    addEventListener('pointermove', f)
    return () => removeEventListener('pointermove', f)
  }, [motion])
  return p
}

/** Staggered, ink-bleeding characters */
export const InkText = ({ text, delay = 0, step = 90, className = '' }: { text: string; delay?: number; step?: number; className?: string }) => (
  <span className={className} aria-label={text}>
    {[...text].map((ch, i) => (
      <span key={i} aria-hidden className="ink-bleed inline-block" style={{ animationDelay: `${delay + i * step}ms` }}>{ch}</span>
    ))}
  </span>
)

/** Burst of ink + sparks at a screen point */
export function InkBurst({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1600); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
      <div className="burst-ink absolute size-40 rounded-full" style={{ left: x - 80, top: y - 80 }} />
      {[0, 1, 2].map((i) => <div key={i} className="burst-ring absolute size-24 rounded-full border border-brass/60" style={{ left: x - 48, top: y - 48, animationDelay: `${i * 140}ms` }} />)}
      {Array.from({ length: 22 }).map((_, i) => {
        const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3, d = 90 + Math.random() * 160
        return <span key={i} className="burst-spark absolute size-1.5 rounded-full bg-brass" style={{ left: x, top: y, ['--dx' as string]: `${Math.cos(a) * d}px`, ['--dy' as string]: `${Math.sin(a) * d - 40}px`, animationDelay: `${Math.random() * 120}ms` }} />
      })}
    </div>
  )
}

/** Full-screen ink wash that announces a new scene */
export function SceneWash({ place, time, onDone }: { place: string; time: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t) }, [onDone])
  const [main, sub] = place.split(' · ')
  return (
    <div className="scene-wash pointer-events-none fixed inset-0 z-[55] grid place-items-center" aria-live="polite">
      <div className="scene-wash-ink absolute left-1/2 top-1/2 size-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="relative text-center text-[#ece4d2]">
        <div className="ink-bleed mb-5 font-mono text-[11px] tracking-[0.5em] text-[#c4a46c]">{time}</div>
        <div className="font-serif text-6xl font-black tracking-[0.3em] lg:text-8xl"><InkText text={main} step={120} delay={200} /></div>
        {sub && <div className="ink-bleed mt-6 font-serif text-lg tracking-[0.6em] text-[#b9ae98]" style={{ animationDelay: '700ms' }}>{sub}</div>}
      </div>
    </div>
  )
}
