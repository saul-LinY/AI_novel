import { useEffect, useRef, type ReactNode } from 'react'

export const Seal = ({ ch, size = 44, className = '' }: { ch: string; size?: number; className?: string }) => (
  <span
    className={`inline-grid place-items-center rounded-[3px] bg-seal font-serif font-bold text-[#f6ead8] shadow-[inset_0_0_0_2px_rgb(246_234_216/0.25)] ${className}`}
    style={{ width: size, height: size, fontSize: size * 0.5 }}
  >
    {ch}
  </span>
)

const paths: Record<string, ReactNode> = {
  book: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13V4Z" />,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15 9-2 4-4 2 2-4 4-2Z" /></>,
  type: <path d="M5 7V5h14v2M12 5v14M9 19h6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
  send: <path d="M4 12 20 4l-6 16-3-7-7-1Z" />,
  scroll: <path d="M7 4h11v13a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2v-2h11M7 4a2 2 0 0 0-2 2v10M10 8h5M10 12h5" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
  home: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z" />,
  check: <path d="m5 12 5 5 9-10" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  folder: <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11ZM8 12h8M8 15.5h5" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
}
export const Icon = ({ n, className = 'size-4' }: { n: keyof typeof paths | string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {paths[n]}
  </svg>
)

export function Modal({ open, onClose, children, label, wide = false }: { open: boolean; onClose: () => void; children: ReactNode; label: string; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const el = ref.current!; if (open && !el.open) el.showModal(); if (!open && el.open) el.close() }, [open])
  return <dialog ref={ref} aria-label={label} onCancel={(e) => { e.preventDefault(); onClose() }} onClose={onClose} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-transparent p-0 text-ink">
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden onClick={onClose} />
    <div className="relative grid min-h-full place-items-center p-6 pointer-events-none"><div className={wide ? 'soft-in pointer-events-auto w-fit max-w-full' : 'glass soft-in pointer-events-auto w-full max-w-md rounded-[36px] p-7 sm:p-10'}>{children}</div></div>
  </dialog>
}
export function Drawer({ open, onClose, side = 'right', title, kicker, children, width = 'w-[420px]' }: { open: boolean; onClose: () => void; side?: 'right' | 'left'; title: string; kicker?: string; children: ReactNode; width?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const el = ref.current!; if (open && !el.open) el.showModal(); if (!open && el.open) el.close() }, [open])
  return <dialog ref={ref} aria-label={title} onCancel={(e) => { e.preventDefault(); onClose() }} onClose={onClose} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-ink">
    <div onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden />
    <aside className={'absolute top-3 bottom-3 glass flex max-w-[92vw] flex-col overflow-hidden rounded-[28px] soft-in ' + width + (side === 'right' ? ' right-3' : ' left-3')}>
      <header className="flex items-end justify-between px-6 pb-4 pt-8 sm:px-8"><div>{kicker && <div className="label mb-2">{kicker}</div>}<h2 className="font-serif text-2xl font-semibold tracking-wide">{title}</h2></div><button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-ink2 transition hover:bg-ink/5 hover:text-ink" aria-label="关闭"><Icon n="x" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-7">{children}</div>
    </aside>
  </dialog>
}

export const Btn = ({ children, onClick, variant = 'solid', className = '', disabled }: { children: ReactNode; onClick?: () => void; variant?: 'solid' | 'ghost' | 'text'; className?: string; disabled?: boolean }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className={`group inline-flex items-center justify-center gap-2.5 font-serif tracking-[0.2em] transition duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
      variant === 'solid'
        ? 'h-12 rounded-full bg-ink px-8 text-bg shadow-[0_0_0_0_rgb(196_164_108/0)] hover:bg-brass hover:shadow-[0_0_40px_4px_rgb(196_164_108/.35)]'
        : variant === 'ghost'
          ? 'btn-ghost h-12 rounded-full px-7 text-ink2 backdrop-blur'
          : 'h-10 px-2 text-ink2 hover:text-ink'
    } ${className}`}
  >
    {children}
  </button>
)
