import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, MoreHorizontal, Plus, Trash2, Workflow } from 'lucide-react'
import { api, type FlowFull, type FlowSummary } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo } from '../i18n'
import { Button, Empty, PageHeader, Spinner, Toggle, useToast } from '../components/ui'
import NewFlowModal from '../components/NewFlowModal'
import { TRIGGER_META } from '../editor/meta'
import { Onboarding } from './Home'

function RowMenu({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="rounded-lg p-2 text-ink-3 hover:bg-soft hover:text-ink"><MoreHorizontal className="h-4 w-4" /></button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-line bg-white p-1 shadow-pop">
          <button onClick={() => { setOpen(false); onDuplicate() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] hover:bg-soft"><Copy className="h-4 w-4" />{t('common.duplicate')}</button>
          <button onClick={() => { setOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] text-brand-700 hover:bg-brand-50"><Trash2 className="h-4 w-4" />{t('common.delete')}</button>
        </div>
      )}
    </div>
  )
}

export default function Flows() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const { account } = useAuth()
  const [flows, setFlows] = useState<FlowSummary[] | null>(null)
  const [modal, setModal] = useState(false)

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: FlowSummary[] }>(`/api/flows?account_id=${account.id}`).then(r => setFlows(r.items)).catch(() => setFlows([]))
  }, [account])
  useEffect(load, [load])

  if (!account) return <Onboarding />

  const toggle = async (f: FlowSummary, v: boolean) => {
    const res = await api.put<FlowFull>(`/api/flows/${f.id}`, { active: v })
    if (v && !res.active) toast(t('ed.fix_first'), 'error')
    else toast(t(v ? 'ed.activated' : 'ed.paused'))
    load()
  }
  const duplicate = async (f: FlowSummary) => { await api.post(`/api/flows/${f.id}/duplicate`); load() }
  const remove = async (f: FlowSummary) => {
    if (!confirm(`${f.name}\n${t('common.confirm_delete')}`)) return
    await api.del(`/api/flows/${f.id}`)
    load()
  }

  return (
    <>
      <PageHeader title={t('flows.title')} sub={t('flows.sub')}
        action={<Button onClick={() => setModal(true)}><Plus className="h-4 w-4" />{t('flows.new')}</Button>} />
      {flows === null ? <Spinner /> : flows.length === 0 ? (
        <Empty icon={<Workflow className="h-6 w-6" />} title={t('flows.empty.t')} text={t('flows.empty.d')}
          action={<Button onClick={() => setModal(true)}><Plus className="h-4 w-4" />{t('flows.new')}</Button>} />
      ) : (
        <div className="card divide-y divide-line">
          {flows.map(f => {
            const tm = f.trigger.kind ? TRIGGER_META[f.trigger.kind] : null
            const Icon = tm?.icon ?? Workflow
            const kws = f.trigger.match === 'any' ? t('flows.any_text') : f.trigger.kind === 'story_mention' ? t('flows.mention') : f.trigger.keywords
            return (
              <div key={f.id} className="flex items-center gap-4 px-4 py-4 sm:px-5">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${f.active ? 'bg-brand-50 text-brand-600' : 'bg-soft text-ink-4'}`}><Icon className="h-5 w-5" /></span>
                <Link to={`/app/flows/${f.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold hover:text-brand-700">{f.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 truncate text-[12.5px] text-ink-3">
                    {tm && <span>{t(tm.label)}</span>}
                    {kws && <><span className="text-ink-4">·</span><span className="truncate font-mono">{kws}</span></>}
                  </div>
                </Link>
                <div className="hidden text-right md:block">
                  <div className="text-[14px] font-bold tabular-nums">{f.runs}</div>
                  <div className="text-[11.5px] text-ink-4">{t('flows.runs')}</div>
                </div>
                <div className="hidden w-32 text-right text-[12px] text-ink-4 lg:block">{t('flows.updated', { t: ago(f.updated_at) })}</div>
                <Toggle checked={f.active} onChange={v => toggle(f, v)} />
                <RowMenu onDuplicate={() => duplicate(f)} onDelete={() => remove(f)} />
              </div>
            )
          })}
        </div>
      )}
      <NewFlowModal open={modal} onClose={() => setModal(false)} accountId={account.id} />
    </>
  )
}
