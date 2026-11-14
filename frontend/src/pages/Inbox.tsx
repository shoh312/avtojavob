import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, AtSign, Bot, Clock, ExternalLink, Hand, Inbox as InboxIcon, Mail, Megaphone, MessageCircle, PanelRightClose,
  PanelRightOpen, Pencil, Phone, Plus, RefreshCw, Search, Send, Smartphone, Sparkles, Trash2, UserRound, Workflow, X, Zap,
} from 'lucide-react'
import { api, ApiError, type Contact } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Avatar, Button, Modal, Spinner, useToast } from '../components/ui'
import { ContactPanel, STAGE_DOT, type Stage } from './Crm'
import { MONTHS } from './Activity'
import { Onboarding } from './Home'

type Conv = Contact & {
  preview: string; last_message_at: string; unread: number; bot_paused: boolean; bot_paused_until: string | null
  can_message: boolean; window_left_h: number | null; stage: string | null; assignee: string | null; deal_value: number
}
type Msg = { id: number; direction: 'in' | 'out'; source: string; text: string; created_at: string; author: { name: string; avatar_url: string } | null }
type Tab = 'all' | 'unread' | 'mine' | 'human'
type QR = { title: string; text: string }

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const who = (c: Conv) => (c.username ? `@${c.username}` : c.name || c.igsid)

function useDayLabel() {
  const { t, lang } = useI18n()
  return (iso: string) => {
    const d = new Date(iso), now = new Date()
    const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5)
    if (days === 0) return t('inbox2.today')
    if (days === 1) return t('inbox2.yesterday')
    return `${d.getDate()} ${(MONTHS[lang] || MONTHS.en)[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`
  }
}

function WindowPill({ c }: { c: Conv }) {
  const { t } = useI18n()
  if (!c.can_message) return <span className="chip bg-soft text-ink-3"><Clock className="mr-1 h-3 w-3" />{t('inbox2.window_closed')}</span>
  const h = c.window_left_h ?? 24
  return <span className={`chip ${h < 3 ? 'bg-brand-50 text-brand-700' : 'bg-emerald-50 text-emerald-700'}`}><Clock className="mr-1 h-3 w-3" />{t('inbox2.window_left', { h: h < 1 ? '<1' : Math.floor(h) })}</span>
}

/** Tayyor javoblar ro'yxatini tahrirlash */
function QuickRepliesModal({ items, onSave, onClose }: { items: QR[]; onSave: (v: QR[]) => Promise<void>; onClose: () => void }) {
  const { t } = useI18n()
  const [list, setList] = useState<QR[]>(items.length ? items : [{ title: '', text: '' }])
  const [busy, setBusy] = useState(false)
  const set = (i: number, p: Partial<QR>) => setList(l => l.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <Modal open onClose={onClose} wide title={t('inbox2.qr_title')} sub={t('inbox2.qr_sub')} icon={<Zap className="h-5 w-5" />}>
      <div className="space-y-2.5">
        {list.map((r, i) => (
          <div key={i} className="flex gap-2 rounded-2xl border border-line p-2.5">
            <div className="flex-1 space-y-1.5">
              <input className="input h-9 text-[13px] font-semibold" maxLength={40} value={r.title} placeholder={t('inbox2.qr_name')} onChange={e => set(i, { title: e.target.value })} />
              <textarea rows={2} className="input resize-y text-[13px]" maxLength={1000} value={r.text} placeholder={t('inbox2.qr_text')} onChange={e => set(i, { text: e.target.value })} />
            </div>
            <button onClick={() => setList(l => l.filter((_, j) => j !== i))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-4 hover:bg-brand-50 hover:text-brand-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {list.length < 30 && (
          <button onClick={() => setList(l => [...l, { title: '', text: '' }])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
            <Plus className="h-4 w-4" />{t('inbox2.qr_add')}
          </button>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={busy} onClick={async () => { setBusy(true); try { await onSave(list.filter(x => x.text.trim())); onClose() } finally { setBusy(false) } }}>{t('common.save')}</Button>
      </div>
    </Modal>
  )
}

function InfoPanel({ c, stages, onOpenCard, onClose }: { c: Conv; stages: Stage[]; onOpenCard: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const st = stages.find(s => s.id === c.stage)
  const rows: [typeof Phone, string, string | undefined][] = [
    [Phone, t('inbox2.phone'), c.fields?.phone],
    [Mail, 'Email', c.fields?.email],
    [UserRound, t('inbox2.assignee'), c.assignee || undefined],
  ]
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-line bg-white xl:flex">
      <div className="flex justify-end p-2"><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-4 hover:bg-soft hover:text-ink"><PanelRightClose className="h-4 w-4" /></button></div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-5">
        <div className="flex flex-col items-center text-center">
          <Avatar name={c.username || c.name || '?'} src={c.avatar_url || null} size={72} />
          <div className="mt-3 text-[16px] font-bold">{c.name || who(c)}</div>
          {c.username && c.name && <a href={`https://instagram.com/${c.username}`} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">@{c.username}<ExternalLink className="h-3 w-3" /></a>}
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {st && <span className="chip"><span className={`mr-1.5 h-2 w-2 rounded-full ${STAGE_DOT[st.color] || 'bg-slate-400'}`} />{st.name}</span>}
            {c.follows && <span className="chip bg-violet-50 text-violet-700">{t('inbox2.follows')}</span>}
            {!!c.deal_value && <span className="chip bg-emerald-50 text-emerald-700">{c.deal_value.toLocaleString('ru-RU')}</span>}
          </div>
        </div>
        <div className="mt-5 space-y-2">
          {rows.map(([Icon, label, val]) => (
            <div key={label} className="flex items-center gap-3 rounded-xl bg-soft px-3 py-2.5">
              <Icon className="h-4 w-4 shrink-0 text-ink-4" />
              <div className="min-w-0"><div className="text-[11px] text-ink-4">{label}</div><div className={`truncate text-[13px] ${val ? 'font-semibold' : 'text-ink-4'}`}>{val || '—'}</div></div>
            </div>
          ))}
        </div>
        {c.tags.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-4">{t('ct.tags')}</div>
            <div className="flex flex-wrap gap-1">{c.tags.map(tg => <span key={tg} className="chip bg-brand-50 text-[11.5px] text-brand-700">{tg}</span>)}</div>
          </div>
        )}
        <div className="mt-4 text-[12px] text-ink-4">{t('inbox2.since', { ago: ago(c.created_at) })}</div>
        <Button variant="secondary" className="mt-4 w-full" onClick={onOpenCard}><Pencil className="h-4 w-4" />{t('inbox2.open_card')}</Button>
      </div>
    </aside>
  )
}

function Bubble({ m, account }: { m: Msg; account: { username: string; picture_url: string } }) {
  const { t } = useI18n()
  const out = m.direction === 'out'
  const src = m.source
  const style = !out ? 'rounded-bl-md bg-white text-ink ring-1 ring-line'
    : src === 'ai' ? 'rounded-br-md bg-gradient-to-br from-[#6d5dfc] to-[#a855f7] text-white'
      : src === 'agent' || src === 'app' ? 'rounded-br-md bg-ink text-white'
        : src === 'broadcast' ? 'rounded-br-md bg-amber-500 text-white'
          : 'rounded-br-md bg-brand-600 text-white'
  const SrcIcon = src === 'ai' ? Sparkles : src === 'flow' ? Workflow : src === 'broadcast' ? Megaphone : src === 'app' ? Smartphone : src === 'comment' ? MessageCircle : null
  const label = out ? (src === 'agent' ? (m.author?.name || t('inbox.src.agent')) : t(`inbox.src.${src}` as TKey)) : src === 'comment' ? t('inbox.src.comment') : ''
  return (
    <div className={`flex items-end gap-2 ${out ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] sm:max-w-[68%] ${out ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-[20px] px-3.5 py-2 text-[14px] leading-snug ${style}`}>
          <div className="whitespace-pre-wrap break-words">{m.text}</div>
        </div>
        <div className="mt-1 flex items-center gap-1 px-1 text-[10.5px] text-ink-4">
          {SrcIcon && <SrcIcon className="h-2.5 w-2.5" />}{label && <span>{label} ·</span>}<span>{time(m.created_at)}</span>
        </div>
      </div>
      {out && (src === 'agent' ? <Avatar name={m.author?.name || '?'} src={m.author?.avatar_url || null} size={24} />
        : src === 'ai' ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6d5dfc] to-[#e5161f] text-white"><Bot className="h-3 w-3" /></span>
          : <Avatar name={account.username} src={account.picture_url} size={24} />)}
    </div>
  )
}

function Thread({ id, stages, onBack, onChanged }: { id: number; stages: Stage[]; onBack: () => void; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const dayLabel = useDayLabel()
  const { account } = useAuth()
  const [data, setData] = useState<{ contact: Conv; messages: Msg[] } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [info, setInfo] = useState(() => { try { return localStorage.getItem('cf.inbox_info') !== '0' } catch { return true } })
  const [card, setCard] = useState(false)
  const [qr, setQr] = useState<QR[]>([])
  const [qrOpen, setQrOpen] = useState(false)
  const [qrEdit, setQrEdit] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const lastId = useRef(0)
  const ta = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(() => api.get<{ contact: Conv; messages: Msg[] }>(`/api/inbox/${id}`).then(setData).catch(() => {}), [id])
  useEffect(() => { setData(null); lastId.current = 0; load(); const timer = setInterval(load, 5000); return () => clearInterval(timer) }, [load])
  useEffect(() => { if (account) api.get<{ items: QR[] }>(`/api/accounts/${account.id}/quick-replies`).then(r => setQr(r.items)).catch(() => {}) }, [account])
  useEffect(() => {
    const msgs = data?.messages ?? []
    const last = msgs.length ? msgs[msgs.length - 1].id : 0
    if (last !== lastId.current) { lastId.current = last; bottom.current?.scrollIntoView({ block: 'end' }) }
  }, [data])
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 160)}px` } }, [text])

  const slash = text.startsWith('/') ? text.slice(1).toLowerCase() : null
  const qrList = useMemo(() => (slash === null ? qr : qr.filter(r => `${r.title} ${r.text}`.toLowerCase().includes(slash))), [qr, slash])
  if (!data || !account) return <Spinner className="flex-1" />
  const c = data.contact
  const st = stages.find(s => s.id === c.stage)

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || slash !== null) return
    setBusy(true)
    try {
      setData(await api.post(`/api/inbox/${id}/send`, { text }))
      setText('')
      onChanged()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      toast(['window_closed', 'plan_inactive', 'message_text'].includes(code) ? t(`err.${code}` as TKey) : `${t('common.error')} ${code}`, 'error')
    } finally { setBusy(false) }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (slash !== null && qrList[0]) { setText(qrList[0].text); return }
      send()
    }
    if (e.key === 'Escape') setQrOpen(false)
  }
  const sync = async () => {
    setSyncing(true)
    try {
      const r = await api.post<{ added: number; contact: Conv; messages: Msg[] }>(`/api/inbox/${id}/sync`)
      setData(r)
      toast(r.added ? t('inbox.synced', { n: r.added }) : t('inbox.synced_none'))
    } catch { toast(t('common.error'), 'error') } finally { setSyncing(false) }
  }
  const pause = async (minutes: number) => {
    const conv = await api.post<Conv>(`/api/inbox/${id}/pause`, { minutes })
    setData(d => d && { ...d, contact: conv })
    onChanged()
  }
  const toggleInfo = () => setInfo(v => { try { localStorage.setItem('cf.inbox_info', v ? '0' : '1') } catch { /* */ } return !v })
  const saveQr = async (items: QR[]) => setQr((await api.put<{ items: QR[] }>(`/api/accounts/${account.id}/quick-replies`, { items })).items)
  const showQr = (qrOpen || slash !== null) && c.can_message

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
          <button onClick={onBack} className="rounded-lg p-1.5 text-ink-3 hover:bg-soft md:hidden"><ArrowLeft className="h-5 w-5" /></button>
          <button onClick={() => setCard(true)} className="shrink-0"><Avatar name={c.username || c.name || '?'} src={c.avatar_url || null} size={40} /></button>
          <div className="min-w-0 flex-1">
            <button onClick={() => setCard(true)} className="block max-w-full truncate text-left text-[15px] font-bold hover:underline">{c.name || who(c)}</button>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              {c.name && c.username && <span className="text-ink-3">@{c.username}</span>}
              {st && <span className="inline-flex items-center gap-1 text-ink-3"><span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[st.color] || 'bg-slate-400'}`} />{st.name}</span>}
              <WindowPill c={c} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="hidden rounded-xl bg-soft p-0.5 sm:flex">
              <button onClick={() => c.bot_paused && pause(0)} title={t('inbox.resume')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${!c.bot_paused ? 'bg-white text-emerald-700 shadow-card' : 'text-ink-3 hover:text-ink'}`}>
                <Bot className="h-3.5 w-3.5" />{t('inbox2.mode_bot')}
              </button>
              <button onClick={() => !c.bot_paused && pause(1440)} title={t('inbox.pause_24h')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${c.bot_paused ? 'bg-white text-amber-700 shadow-card' : 'text-ink-3 hover:text-ink'}`}>
                <Hand className="h-3.5 w-3.5" />{t('inbox2.mode_human')}
              </button>
            </div>
            <button onClick={() => pause(c.bot_paused ? 0 : 1440)} className={`grid h-9 w-9 place-items-center rounded-xl sm:hidden ${c.bot_paused ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {c.bot_paused ? <Hand className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </button>
            <button onClick={sync} disabled={syncing} title={t('inbox.sync')} className="grid h-9 w-9 place-items-center rounded-xl text-ink-3 hover:bg-soft hover:text-ink disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            {!info && <button onClick={toggleInfo} className="hidden h-9 w-9 place-items-center rounded-xl text-ink-3 hover:bg-soft hover:text-ink xl:grid"><PanelRightOpen className="h-4 w-4" /></button>}
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-[#f7f7f9] px-4 py-4"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #ececf0 1px, transparent 0)', backgroundSize: '20px 20px' }}>
          <div className="mx-auto max-w-3xl space-y-2.5">
            {data.messages.map((m, i) => {
              const prev = data.messages[i - 1]
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
              return (
                <Fragment key={m.id}>
                  {newDay && <div className="flex justify-center py-2"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink-3 shadow-card">{dayLabel(m.created_at)}</span></div>}
                  <Bubble m={m} account={account} />
                </Fragment>
              )
            })}
            {c.bot_paused && (
              <div className="flex justify-center pt-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11.5px] font-semibold text-amber-800"><Hand className="h-3 w-3" />{t('inbox2.human_note')}</span></div>
            )}
            <div ref={bottom} />
          </div>
        </div>

        <form onSubmit={send} className="relative border-t border-line bg-white p-3">
          {!c.can_message ? (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-3 text-[12.5px] leading-snug text-amber-800"><Clock className="mt-0.5 h-4 w-4 shrink-0" />{t('inbox.window_closed')}</p>
          ) : (
            <>
              {showQr && (
                <div className="absolute bottom-full left-3 right-3 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-pop animate-fade-up">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t('inbox2.qr_title')}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => { setQrEdit(true); setQrOpen(false) }} className="rounded-lg px-2 py-0.5 text-[12px] font-semibold text-brand-700 hover:bg-brand-50">{t('inbox2.qr_manage')}</button>
                      <button type="button" onClick={() => { setQrOpen(false); if (slash !== null) setText('') }} className="rounded-lg p-1 text-ink-4 hover:bg-soft"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  {qrList.length === 0 ? <p className="px-2 py-3 text-[12.5px] text-ink-4">{qr.length ? t('common.empty') : t('inbox2.qr_empty')}</p> : qrList.map((r, i) => (
                    <button key={i} type="button" onClick={() => { setText(r.text); setQrOpen(false); ta.current?.focus() }}
                      className="flex w-full flex-col rounded-xl px-2.5 py-2 text-left hover:bg-soft">
                      <span className="text-[13px] font-semibold">{r.title}</span>
                      <span className="line-clamp-1 text-[12px] text-ink-3">{r.text}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-1.5 focus-within:border-ink/30 focus-within:ring-4 focus-within:ring-ink/5">
                <button type="button" onClick={() => setQrOpen(o => !o)} title={t('inbox2.qr_title')}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${qrOpen ? 'bg-amber-100 text-amber-700' : 'text-ink-3 hover:bg-soft hover:text-ink'}`}><Zap className="h-4 w-4" /></button>
                <textarea ref={ta} value={text} onChange={e => setText(e.target.value)} rows={1} maxLength={1000} placeholder={t('inbox2.placeholder')}
                  onKeyDown={onKey} className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2.5 text-[14px] outline-none" />
                <button disabled={busy || !text.trim() || slash !== null} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-30">
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1.5 flex justify-between px-1 text-[11px] text-ink-4">
                <span>{t('inbox2.hint')}</span>
                {text.length > 800 && <span className="tabular-nums">{text.length}/1000</span>}
              </div>
            </>
          )}
        </form>
      </div>
      {info && <InfoPanel c={c} stages={stages} onOpenCard={() => setCard(true)} onClose={toggleInfo} />}
      {card && <ContactPanel id={c.id} onClose={() => { setCard(false); load() }} onChanged={() => { load(); onChanged() }} />}
      {qrEdit && <QuickRepliesModal items={qr} onSave={saveQr} onClose={() => setQrEdit(false)} />}
    </div>
  )
}

export default function Inbox() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const { account } = useAuth()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [items, setItems] = useState<Conv[] | null>(null)
  const [counts, setCounts] = useState<Record<Tab, number>>({ all: 0, unread: 0, mine: 0, human: 0 })
  const [stages, setStages] = useState<Stage[]>([])
  const selected = Number(params.get('c')) || null

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: Conv[]; counts: Record<Tab, number> }>(`/api/inbox?account_id=${account.id}&tab=${tab}&q=${encodeURIComponent(q)}`)
      .then(r => { setItems(r.items); setCounts(r.counts) }).catch(() => setItems([]))
  }, [account, q, tab])
  useEffect(() => { load(); const timer = setInterval(load, 6000); return () => clearInterval(timer) }, [load])
  useEffect(() => { if (account) api.get<{ stages: Stage[] }>(`/api/crm/stages?account_id=${account.id}`).then(r => setStages(r.stages)).catch(() => {}) }, [account])

  if (!account) return <Onboarding />
  const pick = (id: number | null) => setParams(id ? { c: String(id) } : {}, { replace: true })
  const stageOf = (id: string | null) => stages.find(s => s.id === id)
  const TABS: { k: Tab; icon: typeof InboxIcon; label: TKey }[] = [
    { k: 'all', icon: InboxIcon, label: 'inbox2.t_all' }, { k: 'unread', icon: MessageCircle, label: 'inbox2.t_unread' },
    { k: 'mine', icon: AtSign, label: 'inbox2.t_mine' }, { k: 'human', icon: Hand, label: 'inbox2.t_human' },
  ]

  return (
    <div className="flex h-[calc(100vh-56px)] bg-white lg:h-screen">
      <aside className={`w-full shrink-0 flex-col border-r border-line md:flex md:w-[340px] ${selected ? 'hidden' : 'flex'}`}>
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold tracking-tight">{t('inbox.title')}</h1>
            {counts.unread > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11.5px] font-bold text-white">{counts.unread}</span>}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
            <input className="input h-10 rounded-xl bg-soft pl-9 focus:bg-white" placeholder={t('inbox2.search')} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
            {TABS.map(x => (
              <button key={x.k} onClick={() => setTab(x.k)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${tab === x.k ? 'bg-ink text-white' : 'bg-soft text-ink-2 hover:bg-[#ececf0]'}`}>
                <x.icon className="h-3.5 w-3.5" />{t(x.label)}
                {counts[x.k] > 0 && <span className={`rounded-full px-1.5 text-[10.5px] ${tab === x.k ? 'bg-white/20' : 'bg-white text-ink-3'}`}>{counts[x.k]}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {items === null ? <Spinner /> : items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-4"><InboxIcon className="h-5 w-5" /></span>
              <p className="mt-3 text-[13px] text-ink-4">{t('inbox.empty')}</p>
            </div>
          ) : items.map(c => {
            const st = stageOf(c.stage)
            const active = selected === c.id
            const urgent = c.can_message && (c.window_left_h ?? 24) < 3
            return (
              <button key={c.id} onClick={() => pick(c.id)}
                className={`mb-0.5 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? 'bg-ink text-white' : 'hover:bg-soft'}`}>
                <span className={`relative shrink-0 rounded-full p-[2px] ${c.unread && !active ? 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]' : ''}`}>
                  <span className="block rounded-full bg-white"><Avatar name={c.username || c.name || '?'} src={c.avatar_url || null} size={42} /></span>
                  {c.bot_paused && <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-white ring-2 ring-white"><Hand className="h-2.5 w-2.5" /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {st && <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[st.color] || 'bg-slate-400'}`} title={st.name} />}
                    <span className={`truncate text-[14px] ${c.unread ? 'font-bold' : 'font-semibold'}`}>{who(c)}</span>
                    <span className={`ml-auto shrink-0 text-[11px] ${active ? 'text-white/60' : 'text-ink-4'}`}>{ago(c.last_message_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={`truncate text-[12.5px] ${active ? 'text-white/70' : c.unread ? 'font-semibold text-ink' : 'text-ink-3'}`}>{c.preview}</span>
                    {urgent && !active && <Clock className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                    {c.unread > 0 && <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </aside>
      <section className={`min-w-0 flex-1 flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
        {selected ? <Thread key={selected} id={selected} stages={stages} onBack={() => pick(null)} onChanged={load} />
          : (
            <div className="grid flex-1 place-items-center bg-[#f7f7f9] p-8" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #ececf0 1px, transparent 0)', backgroundSize: '20px 20px' }}>
              <div className="flex max-w-sm flex-col items-center text-center">
                <span className="grid h-16 w-16 place-items-center rounded-3xl bg-white shadow-card"><MessageCircle className="h-7 w-7 text-brand-600" /></span>
                <div className="mt-4 text-[18px] font-bold">{t('inbox.pick')}</div>
                <p className="mt-1 text-[13.5px] text-ink-3">{t('inbox2.empty_d')}</p>
                <div className="mt-5 grid w-full grid-cols-2 gap-2 text-left text-[12px]">
                  {([[Zap, 'inbox2.tip_qr'], [Hand, 'inbox2.tip_human'], [Clock, 'inbox2.tip_window'], [Bot, 'inbox2.tip_ai']] as const).map(([Icon, k]) => (
                    <div key={k} className="flex items-start gap-2 rounded-2xl bg-white p-3 shadow-card"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" /><span className="text-ink-2">{t(k)}</span></div>
                  ))}
                </div>
              </div>
            </div>
          )}
      </section>
    </div>
  )
}
