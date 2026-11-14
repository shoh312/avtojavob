import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Instagram, MessageCircle, PenLine, Search, Sparkles, Workflow, X } from 'lucide-react'
import { api, type Contact } from '../../api'
import { useAuth } from '../../auth'
import { useI18n, useTimeAgo, type TKey } from '../../i18n'
import { Avatar, Spinner, useToast } from '../../components/ui'
import { fmtNum } from '../../components/charts'
import { ContactPanel, STAGE_DOT, type Stage } from '../Crm'
import type { Summary } from './Hub'

type Row = Contact & { stage: string | null; deal_value: number; assigned_to: number | null; assignee: string | null
  last_message_at: string | null; manual: boolean; unread: number; messages: number }
type TeamOpt = { id: number; name: string; role: 'owner' | 'manager' | 'ai' }
type Resp = { items: Row[]; total: number; per_page: number; funnel: { total: number; leads: number; clients: number; manual: number }
  stages: Stage[]; team: TeamOpt[]; tags: string[]; ai_collect_leads: boolean; ai_enabled: boolean }

const LISTS = ['', 'leads', 'attention', 'forgotten'] as const
const PERIODS = ['all', 'today', 'week', 'month'] as const

function Step({ n, label, first }: { n: number; label: string; first?: boolean }) {
  return (
    <div className={first ? '' : 'text-right sm:text-left'}>
      <div className="text-[30px] font-bold leading-none tabular-nums tracking-tight">{fmtNum(n)}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-3">{label}</div>
    </div>
  )
}

function Arrow({ pct }: { pct: number }) {
  return (
    <div className="relative mx-2 hidden flex-1 items-center sm:flex">
      <div className="h-px flex-1 bg-gradient-to-r from-line via-ink-4/40 to-line" />
      <span className="mx-2 rounded-full border border-line bg-white px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-ink-2">{pct}%</span>
      <div className="h-px flex-1 bg-gradient-to-r from-line via-ink-4/40 to-line" />
      <ChevronRight className="-ml-1.5 h-3.5 w-3.5 text-ink-4" />
    </div>
  )
}

export default function Clients({ list, onList, summary, onChanged }: {
  list: string; onList: (l: string) => void; summary: Summary | null; onChanged: () => void
}) {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const { account } = useAuth()
  const [params, setParams] = useSearchParams()
  const tag = params.get('tag') || ''
  const flow = params.get('flow') || ''
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('all')
  const [stage, setStage] = useState('')
  const [assigned, setAssigned] = useState('')
  const [page, setPage] = useState(1)
  const [d, setD] = useState<Resp | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [reload, setReload] = useState(0)
  const [flowName, setFlowName] = useState('')

  useEffect(() => { if (flow) api.get<{ name: string }>(`/api/flows/${flow}`).then(f => setFlowName(f.name)).catch(() => {}) }, [flow])
  useEffect(() => {
    if (!account) return
    const timer = setTimeout(() => {
      const p = new URLSearchParams({ account_id: String(account.id), q, period, list, stage, assigned, tag, page: String(page), ...(flow ? { flow } : {}) })
      api.get<Resp>(`/api/crm/clients?${p}`).then(setD).catch(() => {})
    }, 200)
    return () => clearTimeout(timer)
  }, [account, q, period, list, stage, assigned, tag, flow, page, reload])

  if (!account) return null
  const clearParam = (k: string) => { params.delete(k); setParams(params); setPage(1) }
  const enableLeads = async () => {
    await api.put(`/api/accounts/${account.id}/integrations`, { ai_collect_leads: true })
    toast(t('crm2.ai_on')); setReload(r => r + 1); onChanged()
  }
  const pages = d ? Math.max(1, Math.ceil(d.total / d.per_page)) : 1
  const stageOf = (id: string | null) => d?.stages.find(s => s.id === id)
  const exportUrl = `/api/contacts/export.csv?${new URLSearchParams({ account_id: String(account.id), q, tag })}`

  return (
    <>
      {/* voronka — bitta chiziq */}
      {d && (
        <div className="mb-5 flex items-end justify-between gap-2 rounded-3xl border border-line bg-white px-6 py-5">
          <Step n={d.funnel.total} label={t('crm2.fn.total')} first />
          <Arrow pct={d.funnel.total ? Math.round(d.funnel.leads * 100 / d.funnel.total) : 0} />
          <Step n={d.funnel.leads} label={t('crm2.fn.leads')} />
          <Arrow pct={d.funnel.leads ? Math.round(d.funnel.clients * 100 / d.funnel.leads) : 0} />
          <Step n={d.funnel.clients} label={t('crm2.fn.clients')} />
        </div>
      )}

      {d && !d.ai_collect_leads && d.ai_enabled && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#f3f0ff] to-white px-4 py-3">
          <Sparkles className="h-5 w-5 shrink-0 text-violet-600" />
          <p className="flex-1 text-[13px] text-ink-2"><b>{t('crm2.ai_off_t')}</b> {t('crm2.ai_off_d')}</p>
          <button onClick={enableLeads} className="shrink-0 rounded-xl bg-ink px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-black">{t('crm2.ai_enable')}</button>
        </div>
      )}

      {/* filtrlar */}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-ink-4" />
          <input className="input pl-10" placeholder={t('crm2.search')} value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
        </div>
        <div className="flex rounded-xl bg-white p-1 ring-1 ring-line">
          {PERIODS.map(p => (
            <button key={p} onClick={() => { setPeriod(p); setPage(1) }}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${period === p ? 'bg-soft text-ink' : 'text-ink-3 hover:text-ink'}`}>{t(`crm2.p.${p}` as TKey)}</button>
          ))}
        </div>
        <a href={exportUrl} title="CSV" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-3 ring-1 ring-line hover:bg-white hover:text-ink"><Download className="h-4 w-4" /></a>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {LISTS.map(l => (
          <button key={l || 'all'} onClick={() => { onList(l); setPage(1) }}
            className={`rounded-full px-3 py-1 text-[12.5px] font-semibold transition ${list === l ? 'bg-ink text-white' : 'bg-white text-ink-2 ring-1 ring-line hover:ring-ink-4'}`}>
            {t(`crm2.l.${l || 'all'}` as TKey)}
            {summary && l && <span className={`ml-1.5 ${list === l ? 'text-white/60' : 'text-ink-4'}`}>{summary[l as 'leads']}</span>}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        {d?.stages.map(s => (
          <button key={s.id} onClick={() => { setStage(stage === s.id ? '' : s.id); setPage(1) }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition ${stage === s.id ? 'bg-soft text-ink ring-1 ring-ink' : 'text-ink-3 hover:text-ink'}`}>
            <span className={`h-2 w-2 rounded-full ${STAGE_DOT[s.color] || STAGE_DOT.slate}`} />{s.name}
          </button>
        ))}
        {d && d.team.length > 1 && (
          <select value={assigned} onChange={e => { setAssigned(e.target.value); setPage(1) }}
            className="ml-auto rounded-full border-0 bg-transparent py-1 pl-3 pr-8 text-[12.5px] font-medium text-ink-2 ring-1 ring-line focus:ring-ink">
            <option value="">{t('crm.all_people')}</option>
            <option value="me">{t('crm.mine')}</option>
            <option value="none">{t('crm.unassigned')}</option>
            {d.team.map(m => <option key={m.id} value={m.id}>{m.role === 'ai' ? '🤖 ' : ''}{m.name}</option>)}
          </select>
        )}
      </div>

      {(tag || flow) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {tag && <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-[12.5px] font-medium text-brand-700"># {tag}
            <button onClick={() => clearParam('tag')} className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand-100"><X className="h-3 w-3" /></button></span>}
          {flow && <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-[12.5px] font-medium text-brand-700"><Workflow className="h-3.5 w-3.5" />{flowName || `#${flow}`}
            <button onClick={() => clearParam('flow')} className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand-100"><X className="h-3 w-3" /></button></span>}
        </div>
      )}

      {/* ro'yxat */}
      {!d ? <Spinner /> : d.items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-white py-16 text-center">
          <div className="text-[15px] font-semibold">{t('crm2.empty_t')}</div>
          <div className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">{t(list ? `crm2.empty.${list}` as TKey : 'crm2.empty_d')}</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-line bg-white">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_56px] gap-4 border-b border-line px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-4 md:grid">
            <span>{t('crm2.col.person')}</span><span>{t('crm2.col.contact')}</span><span>{t('crm2.col.stage')}</span><span>{t('crm2.col.activity')}</span><span />
          </div>
          {d.items.map(c => {
            const s = stageOf(c.stage)
            const title = c.name || (c.username ? `@${c.username}` : c.igsid)
            return (
              <div key={c.id} onClick={() => setOpen(c.id)}
                className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line/70 px-5 py-3.5 transition last:border-0 hover:bg-[#fafafb] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_56px]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative">
                    <Avatar name={title} src={c.avatar_url || null} size={40} />
                    {c.unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-sky-500" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
                      <span className="truncate">{title}</span>
                      {c.manual ? <PenLine className="h-3 w-3 shrink-0 text-ink-4" /> : <Instagram className="h-3 w-3 shrink-0 text-[#dd2a7b]" />}
                    </div>
                    <div className="truncate text-[12.5px] text-ink-3">{c.name && c.username ? `@${c.username}` : c.manual ? t('crm2.manual') : c.fields.phone || 'Instagram'}</div>
                  </div>
                </div>
                <div className="hidden min-w-0 md:block">
                  {c.fields.phone ? <a href={`tel:${c.fields.phone.replace(/[^\d+]/g, '')}`} onClick={e => e.stopPropagation()} className="block truncate font-mono text-[13px] hover:text-brand-700">{c.fields.phone}</a>
                    : c.fields.email ? <span className="block truncate text-[13px]">{c.fields.email}</span> : <span className="text-ink-4">—</span>}
                  {c.deal_value > 0 && <div className="text-[12px] font-semibold text-emerald-700">{fmtNum(c.deal_value)}</div>}
                </div>
                <div className="hidden min-w-0 md:block">
                  {s ? <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-soft px-2.5 py-1 text-[12px] font-medium"><span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[s.color] || STAGE_DOT.slate}`} />{s.name}</span>
                    : <span className="text-[12.5px] text-ink-4">{t('crm2.no_stage')}</span>}
                  {c.assignee && <div className="mt-1 truncate text-[11.5px] text-ink-3">{d.team.find(m => m.id === c.assigned_to)?.role === 'ai' ? '🤖 ' : '→ '}{c.assignee}</div>}
                </div>
                <div className="hidden text-[12.5px] md:block">
                  <div className="text-ink-2">{ago(c.last_message_at || c.last_seen_at)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-ink-4">
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{c.messages}</span>
                    {c.unread > 0 && <span className="font-semibold text-sky-600">{t('crm2.waiting')}</span>}
                  </div>
                </div>
                <div className="flex justify-end">
                  {!c.manual && <Link to={`/app/inbox?c=${c.id}`} onClick={e => e.stopPropagation()} title={t('nav.inbox')}
                    className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-line hover:bg-ink hover:text-white hover:ring-ink"><MessageCircle className="h-4 w-4" /></Link>}
                </div>
              </div>
            )
          })}
          {pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 text-[13px] text-ink-3">
              <span>{t('crm2.shown', { n: d.items.length, total: d.total })}</span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-soft disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                <span className="tabular-nums">{page} / {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-soft disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}
      {open !== null && <ContactPanel id={open} onClose={() => setOpen(null)} onChanged={() => { setReload(r => r + 1); onChanged() }} />}
    </>
  )
}
