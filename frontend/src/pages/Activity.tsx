import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity as ActivityIcon, AlertCircle, AlertTriangle, CheckCircle2, CornerDownRight, Megaphone, MessageCircle, MousePointerClick, PauseCircle, Search, Send, Sparkles, Users, Webhook, Workflow } from 'lucide-react'
import { api, type Activity } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Avatar, Spinner } from '../components/ui'
import { ContactPanel } from './Crm'
import { Onboarding } from './Home'

type Row = Activity & { contact_id: number | null }
type Stats = { sent: number; contacts: number; actions: number; ai: number; errors: number; hours: number[] }
type Resp = { items: Row[]; more: boolean; flows: { id: number; name: string }[]; stats?: Stats }

const KIND: Record<string, { icon: typeof Send; cls: string }> = {
  comment_reply: { icon: MessageCircle, cls: 'bg-brand-600 text-white' },
  private_reply: { icon: Send, cls: 'bg-ink text-white' },
  dm_reply: { icon: Send, cls: 'bg-ink text-white' },
  click: { icon: MousePointerClick, cls: 'bg-sky-500 text-white' },
  answer: { icon: CheckCircle2, cls: 'bg-emerald-500 text-white' },
  skipped: { icon: PauseCircle, cls: 'bg-amber-400 text-white' },
  ai_reply: { icon: Sparkles, cls: 'bg-gradient-to-br from-[#6d5dfc] to-[#a855f7] text-white' },
  agent_reply: { icon: Send, cls: 'bg-ink text-white' },
  broadcast: { icon: Megaphone, cls: 'bg-sky-500 text-white' },
  webhook: { icon: Webhook, cls: 'bg-ink-3 text-white' },
  error: { icon: AlertCircle, cls: 'bg-brand-600 text-white' },
}
const OUTGOING = new Set(['comment_reply', 'private_reply', 'dm_reply', 'ai_reply', 'agent_reply', 'broadcast'])
const GROUPS = ['', 'replies', 'actions', 'ai', 'issues'] as const

const dayKey = (iso: string) => new Date(iso).toDateString()
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

function Hours({ data }: { data: number[] }) {
  const { t } = useI18n()
  const max = Math.max(1, ...data)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink-2">{t('act.h24')}</span>
        <span className="text-[11.5px] text-ink-4">{t('act.h24_d')}</span>
      </div>
      <div className="mt-3 flex flex-1 items-end gap-[3px]">
        {data.map((v, i) => (
          <div key={i} title={`${v}`} className="group relative flex h-full flex-1 items-end">
            <div className={`w-full rounded-[3px] transition-all ${v ? (i === 23 ? 'bg-brand-600' : 'bg-brand-600/70 group-hover:bg-brand-600') : 'bg-[#ececf0]'}`}
              style={{ height: v ? `${Math.max(10, (v / max) * 100)}%` : '6%' }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-4"><span>−24{t('act.h')}</span><span>−12{t('act.h')}</span><span>{t('act.now')}</span></div>
    </div>
  )
}

export const MONTHS: Record<string, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  tj: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

export default function ActivityPage() {
  const { t, lang } = useI18n()
  const { account } = useAuth()
  const [items, setItems] = useState<Row[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [flows, setFlows] = useState<{ id: number; name: string }[]>([])
  const [more, setMore] = useState(false)
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('')
  const [flow, setFlow] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const seen = useRef<Set<number>>(new Set())
  const [fresh, setFresh] = useState<Set<number>>(new Set())

  const params = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({
    account_id: String(account?.id || ''), group, q, ...(flow ? { flow } : {}), ...extra }), [account, group, q, flow])

  useEffect(() => {
    if (!account) return
    seen.current = new Set()
    let first = true
    const load = () => api.get<Resp>(`/api/activity?${params()}`).then(r => {
      const wasFirst = first
      const newIds = first ? new Set<number>() : new Set(r.items.filter(i => !seen.current.has(i.id)).map(i => i.id))
      r.items.forEach(i => seen.current.add(i.id))
      first = false
      if (wasFirst) setMore(r.more)
      setFresh(newIds)
      setItems(prev => {
        if (!prev) return r.items
        const tail = prev.filter(p => !r.items.some(i => i.id === p.id) && p.id < (r.items[r.items.length - 1]?.id ?? 0))
        return [...r.items, ...tail]
      })
      if (r.stats) setStats(r.stats)
      setFlows(r.flows)
    }).catch(() => setItems([]))
    setItems(null)
    const timer = setTimeout(load, q ? 250 : 0)
    const iv = setInterval(load, 15000)
    return () => { clearTimeout(timer); clearInterval(iv) }
  }, [account, params]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!account) return <Onboarding />

  const loadMore = async () => {
    if (!items?.length) return
    setLoadingMore(true)
    try {
      const r = await api.get<Resp>(`/api/activity?${params({ before: String(items[items.length - 1].id) })}`)
      r.items.forEach(i => seen.current.add(i.id))
      setItems([...items, ...r.items]); setMore(r.more)
    } finally { setLoadingMore(false) }
  }

  const dayLabel = (iso: string) => {
    const d = new Date(iso), now = new Date()
    const y = new Date(now); y.setDate(now.getDate() - 1)
    if (d.toDateString() === now.toDateString()) return t('act.today')
    if (d.toDateString() === y.toDateString()) return t('act.yesterday')
    const m = (MONTHS[lang] || MONTHS.en)[d.getMonth()]
    return lang === 'en' ? `${m} ${d.getDate()}` : `${d.getDate()} ${m}`
  }
  const detail = (a: Row) => {
    if (a.kind === 'skipped' && ['wait_user', 'limit', 'answer_attempts', 'ai_no_answer'].includes(a.detail)) return t(`act.skip.${a.detail}` as TKey)
    return a.detail
  }

  const tiles = stats && [
    { icon: Send, label: t('act.st.sent'), value: stats.sent, cls: 'bg-ink text-white' },
    { icon: Users, label: t('act.st.contacts'), value: stats.contacts, cls: 'bg-brand-50 text-brand-700' },
    { icon: MousePointerClick, label: t('act.st.actions'), value: stats.actions, cls: 'bg-sky-50 text-sky-700' },
    { icon: stats.errors ? AlertTriangle : Sparkles, label: stats.errors ? t('act.st.errors') : t('act.st.ai'), value: stats.errors || stats.ai,
      cls: stats.errors ? 'bg-brand-600 text-white' : 'bg-violet-50 text-violet-700' },
  ]

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">{t('act.title')}</h1>
          <p className="mt-1 text-[14px] text-ink-3">{t('act.sub2')}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink-2">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
          {t('act.live')}
        </span>
      </div>

      {stats && tiles && (
        <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-3">
            {tiles.map(s => (
              <div key={s.label} className="rounded-2xl border border-line bg-white p-4">
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${s.cls}`}><s.icon className="h-4 w-4" /></span>
                <div className="mt-3 text-[26px] font-bold leading-none tabular-nums">{s.value}</div>
                <div className="mt-1.5 text-[12.5px] text-ink-3">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="min-h-[170px] rounded-2xl border border-line bg-white p-4"><Hours data={stats.hours} /></div>
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-col gap-2 bg-soft/90 px-1 py-2 backdrop-blur lg:flex-row lg:items-center">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-line">
          {GROUPS.map(g => (
            <button key={g || 'all'} onClick={() => setGroup(g)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${group === g ? 'bg-ink text-white' : 'text-ink-3 hover:bg-soft hover:text-ink'}`}>
              {t(`act.g.${g || 'all'}` as TKey)}
            </button>
          ))}
        </div>
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-4" />
            <input className="input h-9 pl-9" placeholder={t('act.search')} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className="input h-9 w-44 py-0" value={flow} onChange={e => setFlow(e.target.value)}>
            <option value="">{t('act.all_flows')}</option>
            {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>

      {items === null ? <Spinner /> : items.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3"><ActivityIcon className="h-6 w-6" /></span>
          <div className="mt-3 text-[15px] font-semibold">{t('act.empty_t')}</div>
          <div className="mt-1 max-w-sm text-[13px] text-ink-3">{t('act.empty_d')}</div>
        </div>
      ) : (
        <div className="space-y-6">
          {items.reduce<{ day: string; rows: Row[] }[]>((acc, r) => {
            const k = dayKey(r.created_at)
            if (acc.length && acc[acc.length - 1].day === k) acc[acc.length - 1].rows.push(r)
            else acc.push({ day: k, rows: [r] })
            return acc
          }, []).map(g => (
            <section key={g.day}>
              <div className="mb-2 flex items-center gap-3 px-1">
                <span className="text-[12px] font-bold uppercase tracking-wider text-ink-3">{dayLabel(g.rows[0].created_at)}</span>
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11.5px] text-ink-4">{g.rows.length}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-white">
                {g.rows.map((a, i) => {
                  const k = KIND[a.kind] ?? KIND.skipped
                  const Icon = k.icon
                  const out = OUTGOING.has(a.kind)
                  const problem = a.kind === 'error' || a.kind === 'skipped'
                  return (
                    <div key={a.id} onClick={() => a.contact_id && setOpen(a.contact_id)}
                      className={`relative flex gap-3.5 px-4 py-3.5 transition sm:px-5 ${i ? 'border-t border-line/70' : ''} ${a.contact_id ? 'cursor-pointer hover:bg-[#fafafb]' : ''} ${fresh.has(a.id) ? 'animate-fade-up bg-emerald-50/40' : ''}`}>
                      <span className="relative mt-0.5 shrink-0">
                        {a.username ? <Avatar name={a.username} size={38} /> : <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-soft text-ink-4"><Icon className="h-4 w-4" /></span>}
                        <span className={`absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full ring-2 ring-white ${k.cls}`}><Icon className="h-2.5 w-2.5" strokeWidth={2.6} /></span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
                            {a.username && <span className="font-semibold">@{a.username}</span>}
                            <span className={a.username ? 'text-ink-3' : 'font-semibold'}>{t(`act.kind.${a.kind}` as TKey)}</span>
                            {a.flow_name && (
                              <Link to={`/app/flows/${a.flow_id}/analytics`} onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-[11.5px] font-medium text-ink-2 hover:bg-brand-50 hover:text-brand-700">
                                <Workflow className="h-3 w-3" />{a.flow_name}
                              </Link>
                            )}
                          </div>
                          <span className="shrink-0 pt-0.5 text-[12px] tabular-nums text-ink-4">{hhmm(a.created_at)}</span>
                        </div>
                        {(a.incoming || a.detail) && (
                          <div className="mt-2 space-y-1.5">
                            {a.incoming && (
                              <div className="w-fit max-w-full truncate rounded-2xl rounded-tl-md bg-[#f0f0f3] px-3 py-1.5 text-[13px] text-ink-2">{a.incoming}</div>
                            )}
                            {a.detail && (problem ? (
                              <div className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-[12.5px] ${a.kind === 'error' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-800'}`}>
                                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" /><span className="break-words">{detail(a)}</span>
                              </div>
                            ) : out ? (
                              <div className="flex items-start gap-1.5">
                                {a.incoming && <CornerDownRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-ink-4" />}
                                <div className="line-clamp-3 w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-line bg-white px-3 py-1.5 text-[13px] text-ink">{detail(a)}</div>
                              </div>
                            ) : (
                              <div className="text-[12.5px] text-ink-3">{detail(a)}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {more && (
            <div className="flex justify-center">
              <button onClick={loadMore} disabled={loadingMore} className="rounded-xl border border-line bg-white px-5 py-2 text-[13.5px] font-semibold hover:bg-soft disabled:opacity-50">
                {loadingMore ? '…' : t('act.more')}
              </button>
            </div>
          )}
        </div>
      )}
      {open !== null && <ContactPanel id={open} onClose={() => setOpen(null)} />}
    </>
  )
}
