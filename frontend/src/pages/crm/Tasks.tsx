import { useCallback, useEffect, useState } from 'react'
import { Check, CheckCircle2, Phone, Trash2 } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useI18n, type TKey } from '../../i18n'
import { Spinner } from '../../components/ui'
import { ContactPanel } from '../Crm'

type Task = { id: number; text: string; remind_at: string; done: boolean; author: string; contact_id: number; contact: string; phone: string }

const when = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function Tasks({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n()
  const { account } = useAuth()
  const [done, setDone] = useState(false)
  const [items, setItems] = useState<Task[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [leaving, setLeaving] = useState<Set<number>>(new Set())

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: Task[] }>(`/api/crm/tasks?account_id=${account.id}&done=${done ? 1 : 0}`).then(r => setItems(r.items)).catch(() => setItems([]))
  }, [account, done])
  useEffect(() => { setItems(null); load() }, [load])

  const toggle = async (task: Task) => {
    setLeaving(s => new Set(s).add(task.id))
    await api.patch(`/api/notes/${task.id}`, { done: !task.done })
    setTimeout(() => { setLeaving(s => { const n = new Set(s); n.delete(task.id); return n }); load(); onChanged() }, 350)
  }
  const remove = async (task: Task) => {
    if (!confirm(t('common.confirm_delete'))) return
    await api.del(`/api/notes/${task.id}`); load(); onChanged()
  }

  const now = Date.now()
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999)
  const groups: { key: TKey; tone: string; rows: Task[] }[] = done
    ? [{ key: 'crm2.t.done', tone: 'text-ink-3', rows: items || [] }]
    : [
      { key: 'crm2.t.overdue', tone: 'text-brand-600', rows: (items || []).filter(i => new Date(i.remind_at).getTime() < now) },
      { key: 'crm2.t.today', tone: 'text-amber-600', rows: (items || []).filter(i => { const x = new Date(i.remind_at).getTime(); return x >= now && x <= endToday.getTime() }) },
      { key: 'crm2.t.later', tone: 'text-ink-3', rows: (items || []).filter(i => new Date(i.remind_at).getTime() > endToday.getTime()) },
    ]

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-[13px] text-ink-3">{t('crm2.t.hint')}</p>
        <div className="flex rounded-xl bg-white p-1 ring-1 ring-line">
          {[false, true].map(v => (
            <button key={String(v)} onClick={() => setDone(v)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${done === v ? 'bg-soft text-ink' : 'text-ink-3'}`}>{t(v ? 'crm2.t.done' : 'crm2.t.open')}</button>
          ))}
        </div>
      </div>
      {items === null ? <Spinner /> : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-white py-16 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <div className="mt-3 text-[15px] font-semibold">{t(done ? 'crm2.t.none_done' : 'crm2.t.clear')}</div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.filter(g => g.rows.length).map(g => (
            <section key={g.key}>
              <div className={`mb-2 px-1 text-[12px] font-bold uppercase tracking-wider ${g.tone}`}>{t(g.key)} · {g.rows.length}</div>
              <div className="space-y-2">
                {g.rows.map(task => (
                  <div key={task.id} className={`group flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition-all duration-300 ${leaving.has(task.id) ? 'translate-x-4 opacity-0' : ''}`}>
                    <button onClick={() => toggle(task)}
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${task.done || leaving.has(task.id) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[#d4d4da] hover:border-emerald-500'}`}>
                      {(task.done || leaving.has(task.id)) && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[14px] ${task.done ? 'text-ink-3 line-through' : 'font-medium'}`}>{task.text}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                        <button onClick={() => setOpen(task.contact_id)} className="font-semibold text-ink-2 hover:text-brand-700">{task.contact}</button>
                        <span>· {when(task.remind_at)}</span>
                        {task.author && <span className="text-ink-4">· {task.author}</span>}
                      </div>
                    </div>
                    {task.phone && !task.done && <a href={`tel:${task.phone.replace(/[^\d+]/g, '')}`} title={task.phone} className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Phone className="h-4 w-4" /></a>}
                    <button onClick={() => remove(task)} className="grid h-8 w-8 place-items-center rounded-full text-ink-4 opacity-0 hover:bg-brand-50 hover:text-brand-600 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {open !== null && <ContactPanel id={open} onClose={() => setOpen(null)} onChanged={() => { load(); onChanged() }} />}
    </div>
  )
}
