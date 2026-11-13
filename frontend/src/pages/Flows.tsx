import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDownWideNarrow, ArrowRight, ArrowUpNarrowWide, ChartLine, Copy, Link2, MoreHorizontal, Pencil, Plus, Power, Search, Sparkles, Trash2, Users, Workflow } from 'lucide-react'
import { api, type FlowFull, type FlowSummary } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo } from '../i18n'
import { Button, Empty, Spinner, Toggle, useToast } from '../components/ui'
import NewFlowModal from '../components/NewFlowModal'
import { IgAvatar } from '../components/Phone'
import { TRIGGER_META } from '../editor/meta'
import { Onboarding } from './Home'

type Row = FlowSummary & { users: number; converted: number; conversion: number; last_run: string | null }

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, close])
  return ref
}

function CardMenu({ f, onToggle, onDuplicate, onDelete, onLink }: {
  f: Row; onToggle: (v: boolean) => void; onDuplicate: () => void; onDelete: () => void; onLink: () => void
}) {
  const { t } = useI18n()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutside(open, close)
  const item = (Icon: typeof Pencil, label: string, fn: () => void, danger = false) => (
    <button onClick={() => { setOpen(false); fn() }}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14px] ${danger ? 'text-brand-600 hover:bg-brand-50' : 'text-ink hover:bg-soft'}`}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />{label}
    </button>
  )
  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} className={`grid h-8 w-8 place-items-center rounded-lg ${open ? 'bg-soft text-ink' : 'text-ink-4 hover:bg-soft hover:text-ink'}`}>
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-64 rounded-2xl border border-line bg-white p-1.5 shadow-pop animate-fade-up">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px]">
            <Power className="h-[18px] w-[18px]" strokeWidth={1.8} /><span className="flex-1">{f.active ? t('fl.turn_off') : t('fl.turn_on')}</span>
            <Toggle checked={f.active} onChange={v => { setOpen(false); onToggle(v) }} size="sm" />
          </div>
          <div className="my-1 h-px bg-line" />
          {item(Pencil, t('common.edit'), () => nav(`/app/flows/${f.id}`))}
          {item(ChartLine, t('fl.analytics'), () => nav(`/app/flows/${f.id}/analytics`))}
          {item(Users, t('fl.clients'), () => nav(`/app/contacts?flow=${f.id}`))}
          {item(Link2, t('fl.bot_link'), onLink)}
          <div className="my-1 h-px bg-line" />
          {item(Copy, t('common.duplicate'), onDuplicate)}
          <div className="my-1 h-px bg-line" />
          {item(Trash2, t('fl.delete'), onDelete, true)}
        </div>
      )}
    </div>
  )
}

export default function Flows() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const nav = useNavigate()
  const { account } = useAuth()
  const [flows, setFlows] = useState<Row[] | null>(null)
  const [modal, setModal] = useState(false)
  const [q, setQ] = useState('')
  const [desc, setDesc] = useState(true)

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: Row[] }>(`/api/flows?account_id=${account.id}`).then(r => setFlows(r.items)).catch(() => setFlows([]))
  }, [account])
  useEffect(load, [load])

  const shown = useMemo(() => {
    const list = (flows || []).filter(f => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase()))
    return [...list].sort((a, b) => (desc ? -1 : 1) * (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id))
  }, [flows, q, desc])

  if (!account) return <Onboarding />

  const toggle = async (f: Row, v: boolean) => {
    const res = await api.put<FlowFull>(`/api/flows/${f.id}`, { active: v })
    if (v && !res.active) toast(t('ed.fix_first'), 'error')
    else toast(t(v ? 'ed.activated' : 'ed.paused'))
    load()
  }
  const duplicate = async (f: Row) => { await api.post(`/api/flows/${f.id}/duplicate`); load() }
  const remove = async (f: Row) => {
    if (!confirm(`${f.name}\n${t('common.confirm_delete')}`)) return
    await api.del(`/api/flows/${f.id}`)
    load()
  }
  const copyLink = () => {
    const link = `https://ig.me/m/${account.username}`
    navigator.clipboard?.writeText(link)
    toast(`${t('team.link_copied')} · ${link}`)
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <h1 className="flex-1 text-[24px] font-bold tracking-tight">{t('fl.all')} <span className="text-ink-4">{flows?.length ?? ''}</span></h1>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-4" />
            <input className="input h-9 pl-9" placeholder={t('fl.search')} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="flex rounded-xl bg-soft p-0.5">
            <button title={t('fl.newest')} onClick={() => setDesc(true)} className={`grid h-8 w-8 place-items-center rounded-lg ${desc ? 'bg-white shadow-sm' : 'text-ink-4'}`}><ArrowDownWideNarrow className="h-4 w-4" /></button>
            <button title={t('fl.oldest')} onClick={() => setDesc(false)} className={`grid h-8 w-8 place-items-center rounded-lg ${!desc ? 'bg-white shadow-sm' : 'text-ink-4'}`}><ArrowUpNarrowWide className="h-4 w-4" /></button>
          </div>
          <Button onClick={() => setModal(true)}><Plus className="h-4 w-4" /><span className="hidden sm:inline">{t('flows.new')}</span></Button>
        </div>
      </div>

      {flows === null ? <Spinner /> : flows.length === 0 ? (
        <Empty icon={<Workflow className="h-6 w-6" />} title={t('flows.empty.t')} text={t('flows.empty.d')}
          action={<Button onClick={() => setModal(true)}><Plus className="h-4 w-4" />{t('flows.new')}</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {!q && (
            <button onClick={() => setModal(true)}
              className="group relative flex min-h-[188px] flex-col overflow-hidden rounded-2xl border border-line bg-white p-5 text-left transition hover:border-[#d6d6dc] hover:shadow-card">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-50 blur-2xl" />
              <div className="relative flex items-start justify-between">
                <span className="flex -space-x-2">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-white ring-4 ring-white"><Plus className="h-5 w-5" /></span>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#6d5dfc] to-[#a855f7] text-white ring-4 ring-white"><Sparkles className="h-[18px] w-[18px]" /></span>
                </span>
                <ArrowRight className="h-5 w-5 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </div>
              <div className="relative mt-auto pt-6">
                <div className="text-[16px] font-bold">{t('fl.create_t')}</div>
                <div className="mt-1 text-[13px] leading-snug text-ink-3">{t('fl.create_d')}</div>
              </div>
            </button>
          )}
          {shown.map(f => {
            const tm = f.trigger.kind ? TRIGGER_META[f.trigger.kind] : null
            const TIcon = tm?.icon ?? Workflow
            return (
              <div key={f.id} onClick={() => nav(`/app/flows/${f.id}/analytics`)} className="group relative flex min-h-[188px] cursor-pointer flex-col rounded-2xl border border-line bg-white p-5 transition hover:border-[#d6d6dc] hover:shadow-card">
                <div className="flex items-start gap-3">
                  <Link to={`/app/flows/${f.id}/analytics`} className="flex min-w-0 flex-1 items-center gap-3">
                    <IgAvatar account={account} size={46} />
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] text-ink-3">{account.username}</div>
                      <div className="truncate text-[17px] font-semibold leading-tight group-hover:text-brand-700">{f.name}</div>
                    </div>
                  </Link>
                  <CardMenu f={f} onToggle={v => toggle(f, v)} onDuplicate={() => duplicate(f)} onDelete={() => remove(f)} onLink={copyLink} />
                </div>
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${f.active ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700' : 'border-line text-ink-3'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${f.active ? 'bg-emerald-500' : 'bg-ink-4'}`} />{f.active ? t('fl.on') : t('fl.off')}
                  </span>
                  {tm && <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-2"><TIcon className="h-3.5 w-3.5" />{t(tm.label)}</span>}
                </div>
                <Link to={`/app/flows/${f.id}/analytics`} className="mt-auto grid grid-cols-3 gap-2 pt-5">
                  <div><div className="text-[12px] text-ink-3">{t('fl.users')}</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{f.users}</div></div>
                  <div><div className="text-[12px] text-ink-3">{t('fl.conversion')}</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{f.conversion}%</div></div>
                  <div><div className="text-[12px] text-ink-3">{t('fl.last_run')}</div><div className="mt-1 truncate text-[14px] font-medium">{f.last_run ? ago(f.last_run) : '—'}</div></div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
      <NewFlowModal open={modal} onClose={() => setModal(false)} accountId={account.id} />
    </>
  )
}
