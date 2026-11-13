import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlarmClock, CopyCheck, Ghost, MessageCircleQuestion, Plus, Sparkle, Tags } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useI18n, type TKey } from '../../i18n'
import { Button } from '../../components/ui'
import { Onboarding } from '../Home'
import { Board } from '../Crm'
import Clients from './Clients'
import Tasks from './Tasks'
import Report from './Report'
import { AddContactModal, DuplicatesModal, TagsModal } from './Extras'

export type Summary = {
  clients: number; leads: number; attention: number; forgotten: number; deals: number
  tasks: number; urgent: number; overdue: number; tags: number; duplicates: number
  ai_collect_leads: boolean; ai_enabled: boolean
}
const VIEWS = ['board', 'list', 'tasks', 'report'] as const
type View = (typeof VIEWS)[number]

export default function CrmHub() {
  const { t } = useI18n()
  const { account } = useAuth()
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.includes(params.get('view') as View) ? params.get('view') : 'board') as View
  const list = params.get('list') || ''
  const [sum, setSum] = useState<Summary | null>(null)
  const [modal, setModal] = useState<'add' | 'tags' | 'dups' | null>(null)
  const [tick, setTick] = useState(0)  // modal o'zgarishlaridan keyin ko'rinishni qayta yuklash

  const refresh = useCallback(() => {
    if (!account) return
    api.get<Summary>(`/api/crm/summary?account_id=${account.id}`).then(setSum).catch(() => {})
  }, [account])
  useEffect(() => { refresh() }, [refresh])
  const bump = () => { refresh(); setTick(x => x + 1) }

  if (!account) return <Onboarding />

  const go = (v: View, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams()
    if (v !== 'board') p.set('view', v)
    Object.entries(extra).forEach(([k, val]) => val && p.set(k, val))
    setParams(p, { replace: false })
  }

  const focus: { key: string; n: number; label: TKey; icon: typeof AlarmClock; tone: string; on: () => void; active: boolean }[] = sum ? [
    { key: 'tasks', n: sum.urgent, label: sum.overdue ? 'crm2.f.overdue' : 'crm2.f.today', icon: AlarmClock,
      tone: sum.overdue ? 'text-brand-600' : 'text-amber-600', on: () => go('tasks'), active: view === 'tasks' },
    { key: 'attention', n: sum.attention, label: 'crm2.f.attention', icon: MessageCircleQuestion, tone: 'text-sky-600',
      on: () => go('list', { list: 'attention' }), active: view === 'list' && list === 'attention' },
    { key: 'forgotten', n: sum.forgotten, label: 'crm2.f.forgotten', icon: Ghost, tone: 'text-violet-600',
      on: () => go('list', { list: 'forgotten' }), active: view === 'list' && list === 'forgotten' },
    { key: 'leads', n: sum.leads, label: 'crm2.f.leads', icon: Sparkle, tone: 'text-emerald-600',
      on: () => go('list', { list: 'leads' }), active: view === 'list' && list === 'leads' },
    { key: 'dups', n: sum.duplicates, label: 'crm2.f.dups', icon: CopyCheck, tone: 'text-ink-3', on: () => setModal('dups'), active: false },
  ] : []

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* sarlavha + ko'rinish almashtirgich */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-[26px] font-bold tracking-tight">CRM</h1>
        <nav className="flex items-center gap-1 rounded-full border border-line bg-white p-1">
          {VIEWS.map(v => (
            <button key={v} onClick={() => go(v)}
              className={`relative rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition ${view === v ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink'}`}>
              {t(`crm2.v.${v}` as TKey)}
              {v === 'tasks' && !!sum?.overdue && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600" />}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setModal('tags')} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[13.5px] font-semibold text-ink-2 hover:bg-white">
            <Tags className="h-4 w-4" />{t('crm2.tags')}{!!sum?.tags && <span className="text-ink-4">{sum.tags}</span>}
          </button>
          <Button onClick={() => setModal('add')}><Plus className="h-4 w-4" />{t('crm2.add')}</Button>
        </div>
      </div>

      {/* bugungi fokus */}
      {sum && (
        <div className="scrollbar-thin -mx-1 mb-7 flex gap-2.5 overflow-x-auto px-1 pb-1">
          {focus.map(f => (
            <button key={f.key} onClick={f.on}
              className={`group flex min-w-[168px] flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition
                ${f.active ? 'border-ink bg-white shadow-card' : 'border-transparent bg-white/70 hover:border-line hover:bg-white'}`}>
              <span className={`relative ${f.n ? f.tone : 'text-ink-4'}`}>
                <f.icon className="h-5 w-5" strokeWidth={2} />
                {f.key === 'tasks' && !!sum.overdue && <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-brand-600" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-[22px] font-bold leading-none tabular-nums ${f.n ? 'text-ink' : 'text-ink-4'}`}>{f.n}</span>
                <span className="mt-1 block truncate text-[12px] text-ink-3">{t(f.label)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {view === 'board' && <Board key={tick} onChanged={refresh} />}
      {view === 'list' && <Clients key={`${list}-${tick}`} list={list} onList={l => go('list', { list: l })} summary={sum} onChanged={refresh} />}
      {view === 'tasks' && <Tasks key={tick} onChanged={refresh} />}
      {view === 'report' && <Report />}

      {modal === 'add' && <AddContactModal accountId={account.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); bump() }} />}
      {modal === 'tags' && <TagsModal accountId={account.id} onClose={() => setModal(null)} onChanged={bump}
        onPick={tag => { setModal(null); go('list', { tag }) }} />}
      {modal === 'dups' && <DuplicatesModal accountId={account.id} onClose={() => setModal(null)} onChanged={bump} />}
    </div>
  )
}
