import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bot, BotOff, Clock, Inbox as InboxIcon, Search, Send } from 'lucide-react'
import { api, ApiError, type Contact } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Avatar, Empty, Spinner, useToast } from '../components/ui'
import { Onboarding } from './Home'

type Conv = Contact & { preview: string; last_message_at: string; unread: number; bot_paused: boolean; bot_paused_until: string | null; can_message: boolean }
type Msg = { id: number; direction: 'in' | 'out'; source: string; text: string; created_at: string }

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function Thread({ id, onBack, onChanged }: { id: number; onBack: () => void; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [data, setData] = useState<{ contact: Conv; messages: Msg[] } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const lastId = useRef(0)

  const load = useCallback(() => api.get<{ contact: Conv; messages: Msg[] }>(`/api/inbox/${id}`).then(setData).catch(() => {}), [id])
  useEffect(() => { setData(null); lastId.current = 0; load(); const timer = setInterval(load, 5000); return () => clearInterval(timer) }, [load])
  useEffect(() => {
    const msgs = data?.messages ?? []
    const last = msgs.length ? msgs[msgs.length - 1].id : 0
    if (last !== lastId.current) { lastId.current = last; bottom.current?.scrollIntoView({ block: 'end' }) }
  }, [data])

  if (!data) return <Spinner className="flex-1" />
  const c = data.contact

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      setData(await api.post(`/api/inbox/${id}/send`, { text }))
      setText('')
      onChanged()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      toast(['window_closed', 'plan_inactive', 'message_text'].includes(code) ? t(`err.${code}` as TKey) : `${t('common.error')} ${code}`, 'error')
    } finally {
      setBusy(false)
    }
  }
  const pause = async (minutes: number) => {
    const conv = await api.post<Conv>(`/api/inbox/${id}/pause`, { minutes })
    setData(d => d && { ...d, contact: conv })
    onChanged()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-ink-3 hover:bg-soft md:hidden"><ArrowLeft className="h-5 w-5" /></button>
        <Avatar name={c.username || c.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold">{c.username ? `@${c.username}` : c.name || c.igsid}</div>
          <div className="flex flex-wrap gap-1">{c.tags.slice(0, 4).map(tg => <span key={tg} className="chip bg-brand-50 py-0 text-[11px] text-brand-700">{tg}</span>)}</div>
        </div>
        {c.bot_paused ? (
          <button onClick={() => pause(0)} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-[12.5px] font-semibold text-amber-800 hover:bg-amber-100">
            <BotOff className="h-4 w-4" /><span className="hidden sm:inline">{t('inbox.resume')}</span>
          </button>
        ) : (
          <div className="flex gap-1">
            <button onClick={() => pause(60)} title={t('inbox.pause_1h')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-[12.5px] font-semibold text-emerald-700 hover:bg-emerald-100">
              <Bot className="h-4 w-4" /><span className="hidden sm:inline">{t('inbox.bot_on')}</span>
            </button>
            <button onClick={() => pause(1440)} title={t('inbox.pause_24h')} className="rounded-xl p-1.5 text-ink-3 hover:bg-soft"><Clock className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto bg-soft/60 px-4 py-4">
        {data.messages.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug shadow-card ${m.direction === 'out'
              ? m.source === 'agent' ? 'rounded-br-md bg-ink text-white' : 'rounded-br-md bg-brand-600 text-white'
              : 'rounded-bl-md bg-white text-ink'}`}>
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
              <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10.5px] ${m.direction === 'out' ? 'text-white/60' : 'text-ink-4'}`}>
                {m.direction === 'out' && m.source !== 'user' && <span>{t(`inbox.src.${m.source}` as TKey)}</span>}
                {m.direction === 'in' && m.source === 'comment' && <span>{t('inbox.src.comment')}</span>}
                <span>{time(m.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="border-t border-line bg-white p-3">
        {!c.can_message ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">{t('inbox.window_closed')}</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <textarea value={text} onChange={e => setText(e.target.value)} rows={1} maxLength={1000} placeholder={t('inbox.placeholder')}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as unknown as FormEvent) } }}
                className="input max-h-40 min-h-[44px] flex-1 resize-none" />
              <button disabled={busy || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-4">{t('inbox.paused_hint')}</p>
          </>
        )}
      </form>
    </div>
  )
}

export default function Inbox() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const { account } = useAuth()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Conv[] | null>(null)
  const selected = Number(params.get('c')) || null

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: Conv[] }>(`/api/inbox?account_id=${account.id}&q=${encodeURIComponent(q)}`).then(r => setItems(r.items)).catch(() => setItems([]))
  }, [account, q])
  useEffect(() => { load(); const timer = setInterval(load, 6000); return () => clearInterval(timer) }, [load])

  if (!account) return <Onboarding />
  const pick = (id: number | null) => setParams(id ? { c: String(id) } : {}, { replace: true })

  return (
    <div>
      <div className="flex h-[calc(100vh-56px)] bg-white lg:h-screen">
        <aside className={`w-full shrink-0 flex-col border-r border-line md:flex md:w-[320px] ${selected ? 'hidden' : 'flex'}`}>
          <div className="border-b border-line p-4">
            <h1 className="text-[20px] font-bold tracking-tight">{t('inbox.title')}</h1>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-4" />
              <input className="input h-9 py-1.5 pl-9" placeholder={t('inbox.search')} value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {items === null ? <Spinner /> : items.length === 0 ? <p className="p-8 text-center text-[13px] text-ink-4">{t('inbox.empty')}</p> : items.map(c => (
              <button key={c.id} onClick={() => pick(c.id)}
                className={`flex w-full items-center gap-3 border-b border-line/60 px-4 py-3 text-left transition ${selected === c.id ? 'bg-brand-50/70' : 'hover:bg-soft'}`}>
                <Avatar name={c.username || c.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{c.username ? `@${c.username}` : c.name || c.igsid}</span>
                    {c.bot_paused && <BotOff className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                    <span className="ml-auto shrink-0 text-[11px] text-ink-4">{ago(c.last_message_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className={`truncate text-[13px] ${c.unread ? 'font-semibold text-ink' : 'text-ink-3'}`}>{c.preview}</span>
                    {c.unread > 0 && <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>
        <section className={`min-w-0 flex-1 flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
          {selected ? <Thread key={selected} id={selected} onBack={() => pick(null)} onChanged={load} />
            : <div className="grid flex-1 place-items-center p-8"><Empty icon={<InboxIcon className="h-6 w-6" />} title={t('inbox.pick')} text={t('inbox.sub')} /></div>}
        </section>
      </div>
    </div>
  )
}
