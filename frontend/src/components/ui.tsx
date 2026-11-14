import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import { LANGS, useI18n, type Lang } from '../i18n'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-[0_6px_16px_-6px_rgba(229,22,31,.55)]',
  dark: 'bg-ink text-white hover:bg-black',
  secondary: 'bg-white text-ink border border-line hover:bg-soft',
  ghost: 'text-ink-2 hover:bg-soft',
  danger: 'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50',
}

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const sz = size === 'sm' ? 'h-8 px-3 text-[13px] rounded-lg' : size === 'lg' ? 'h-12 px-6 text-[15px] rounded-xl' : 'h-10 px-4 text-[14px] rounded-xl'
  return (
    <button {...rest} disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none ${sz} ${VARIANTS[variant]} ${className}`}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'
  const k = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const tx = size === 'sm' ? 'translate-x-4' : 'translate-x-5'
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full p-0.5 transition ${w} ${checked ? 'bg-brand-600' : 'bg-[#dcdce2]'}`}>
      <span className={`${k} rounded-full bg-white shadow transition ${checked ? tx : 'translate-x-0'}`} />
    </button>
  )
}

/** Oyna: body'ga portal orqali chiqadi (ota elementning rangi/transformi ta'sir qilmaydi). */
export function Modal({ open, onClose, title, sub, icon, children, wide }: {
  open: boolean; onClose: () => void; title?: ReactNode; sub?: ReactNode; icon?: ReactNode; children: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0b0b10]/45 p-0 text-left text-ink backdrop-blur-[3px] animate-[fade-in_.2s_ease-out] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}
        className={`modal-pop flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_40px_80px_-30px_rgba(10,10,20,.45)] ring-1 ring-black/5 sm:rounded-[28px] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}>
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#e2e2e8] sm:hidden" />
        <div className="flex shrink-0 items-start gap-3 px-6 pb-4 pt-5">
          {icon && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-[17px] font-bold leading-tight tracking-tight text-ink">{title}</h3>}
            {sub && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="close" className="-mr-1.5 -mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-soft hover:text-ink"><X className="h-[18px] w-[18px]" /></button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <h3 className="text-[17px] font-bold">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-[14px] text-ink-3">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <div className={`grid place-items-center py-24 text-ink-4 ${className}`}><Loader2 className="h-6 w-6 animate-spin" /></div>
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function LangSwitch({ onChange, dark }: { onChange?: (l: Lang) => void; dark?: boolean }) {
  const { lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const cur = LANGS.find(l => l.code === lang)!
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold ${dark ? 'text-white/80 hover:bg-white/10' : 'text-ink-2 hover:bg-soft'}`}>
        {cur.short}<ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-pop">
          {LANGS.map(l => (
            <button key={l.code} onClick={() => { setLang(l.code); onChange?.(l.code); setOpen(false) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] text-ink hover:bg-soft">
              {l.label}{l.code === lang && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- toast
type Toast = { id: number; text: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems(xs => [...xs, { id, text, kind }])
    setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), 3800)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map(t => (
          <div key={t.id} className={`animate-fade-up pointer-events-auto rounded-xl px-4 py-2.5 text-[14px] font-medium shadow-pop ${t.kind === 'error' ? 'bg-brand-600 text-white' : 'bg-ink text-white'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) return <img src={src} onError={() => setBroken(true)} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  const letter = (name || '?').replace('@', '').charAt(0).toUpperCase() || '?'
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-700" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {letter}
    </span>
  )
}
