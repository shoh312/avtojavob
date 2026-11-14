import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlarmClock, ArrowDown, ArrowUp, KanbanSquare, MessageCircle, Phone, Plus, Search, Settings2, StickyNote, Trash2 } from 'lucide-react'
import { api, ApiError, type Contact } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Avatar, Button, Modal, Spinner, useToast } from '../components/ui'
import { fmtNum } from '../components/charts'

export type Stage = { id: string; name: string; color: string; type: 'open' | 'won' | 'lost' }
type TeamOpt = { id: number; name: string; role: 'owner' | 'manager' | 'ai' }
type Card = Contact & { stage: string; deal_value: number; notes: number; last_message_preview: string; assigned_to: number | null; assignee: string | null; next_reminder: string | null }
type Board = { stages: Stage[]; totals: Record<string, { count: number; sum: number }>; cards: Card[]; team: TeamOpt[] }
type TItem = { type: 'note' | 'stage' | 'message'; id: string; text: string; author?: string; direction?: string; source?: string; created_at: string; remind_at?: string | null; reminded?: boolean }

export const STAGE_DOT: Record<string, string> = {
  sky: 'bg-sky-500', violet: 'bg-violet-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500',
  rose: 'bg-rose-500', slate: 'bg-slate-400', orange: 'bg-orange-500', teal: 'bg-teal-500',
}

/** Mijoz kartochkasi: bosqich, summa, izohlar va tarix. Kontaktlar va CRM sahifalarida ishlatiladi. */
export function ContactPanel({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged?: () => void }) {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const [d, setD] = useState<{ contact: Card; stages: Stage[]; items: TItem[]; team: TeamOpt[] } | null>(null)
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [remind, setRemind] = useState('')
  const [tag, setTag] = useState('')
  const load = useCallback(() => api.get<{ contact: Card; stages: Stage[]; items: TItem[]; team: TeamOpt[] }>(`/api/contacts/${id}/timeline`)
    .then(r => { setD(r); setValue(String(r.contact.deal_value || '')) }), [id])
  useEffect(() => { load().catch(() => {}) }, [load])

  const patch = async (body: Record<string, unknown>) => {
    try { await api.patch(`/api/contacts/${id}`, body); await load(); onChanged?.() } catch { toast(t('common.error'), 'error') }
  }
  const addNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    setD(await api.post(`/api/contacts/${id}/notes`, { text: note, remind_at: remind ? new Date(remind).toISOString() : null }))
    setNote('')
    setRemind('')
    onChanged?.()
  }
  const c = d?.contact
  return (
    <Modal open onClose={onClose} wide title={c ? <span className="flex items-center gap-3"><Avatar name={c.username || c.name} src={c.avatar_url || null} size={36} />{c.username ? `@${c.username}` : c.name || c.igsid}</span> : '…'}>
      {!d || !c ? <Spinner className="py-12" /> : (
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <label className="block"><span className="label">{t('crm.stage')}</span>
              <select className="input" value={c.stage || ''} onChange={e => patch({ stage: e.target.value || null })}>
                <option value="">{t('crm.no_stage')}</option>
                {d.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></label>
            {d.team.length > 1 && (
              <label className="block"><span className="label">{t('crm.assignee')}</span>
                <select className="input" value={c.assigned_to ?? ''} onChange={e => patch({ assigned_to: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{t('crm.unassigned')}</option>
                  {d.team.map(m => <option key={m.id} value={m.id}>{m.role === 'ai' ? '🤖 ' : ''}{m.name}{m.role === 'owner' ? ' ★' : ''}</option>)}
                </select></label>
            )}
            <label className="block"><span className="label">{t('crm.value')}</span>
              <input type="number" min={0} className="input" value={value} placeholder="0" onChange={e => setValue(e.target.value)}
                onBlur={() => Number(value || 0) !== (c.deal_value || 0) && patch({ deal_value: Number(value || 0) })} /></label>
            <div>
              <span className="label">{t('ct.tags')}</span>
              <div className="flex flex-wrap gap-1.5">
                {c.tags.map(tg => <button key={tg} onClick={() => patch({ tags: c.tags.filter(x => x !== tg) })} className="chip bg-brand-50 text-brand-700 hover:line-through">{tg}</button>)}
                <input value={tag} onChange={e => setTag(e.target.value)} placeholder={t('ct.add_tag')}
                  onKeyDown={e => { if (e.key === 'Enter' && tag.trim()) { patch({ tags: [...c.tags, tag.trim()] }); setTag('') } }}
                  className="min-w-[100px] flex-1 rounded-full border border-dashed border-line px-3 py-1 text-[12.5px] outline-none focus:border-brand-300" />
              </div>
            </div>
            {Object.keys(c.fields).length > 0 && (
              <dl className="divide-y divide-line rounded-xl border border-line text-[13px]">
                {Object.entries(c.fields).map(([k, v]) => <div key={k} className="flex gap-3 px-3 py-2"><dt className="w-20 shrink-0 font-mono text-ink-3">{k}</dt><dd className="min-w-0 break-words font-medium">{v}</dd></div>)}
              </dl>
            )}
            <Link to={`/app/inbox?c=${c.id}`} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-ink text-[13.5px] font-semibold text-white hover:bg-black">
              <MessageCircle className="h-4 w-4" />{t('crm.open_chat')}
            </Link>
          </div>
          <div className="flex min-h-0 flex-col">
            <form onSubmit={addNote} className="space-y-2">
              <div className="flex gap-2">
                <input className="input flex-1" value={note} placeholder={t('crm.note_ph')} onChange={e => setNote(e.target.value)} />
                <Button type="submit" disabled={!note.trim()}><StickyNote className="h-4 w-4" />{t('crm.add_note')}</Button>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
                <AlarmClock className="h-3.5 w-3.5" />{t('crm.remind')}
                <input type="datetime-local" className="input h-8 w-auto py-1 text-[12.5px]" value={remind} onChange={e => setRemind(e.target.value)} />
              </label>
            </form>
            <div className="scrollbar-thin mt-4 max-h-[52vh] space-y-2.5 overflow-y-auto pr-1">
              {d.items.map(it => (
                <div key={it.id} className={`rounded-xl px-3.5 py-2.5 text-[13.5px] ${it.type === 'note' ? 'border border-amber-200 bg-amber-50' : it.type === 'stage' ? 'bg-soft text-ink-2' : 'border border-line'}`}>
                  <div className="mb-0.5 flex items-center gap-2 text-[11.5px] text-ink-4">
                    {it.type === 'note' ? <StickyNote className="h-3 w-3 text-amber-600" /> : it.type === 'stage' ? <KanbanSquare className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                    <span>{it.type === 'message' ? (it.direction === 'in' ? (c.username ? `@${c.username}` : '←') : t(`inbox.src.${it.source}` as TKey)) : it.author}</span>
                    <span className="ml-auto">{ago(it.created_at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{it.text}</div>
                  {it.remind_at && (
                    <div className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold ${it.reminded ? 'bg-white text-ink-4 line-through' : 'bg-white text-amber-700'}`}>
                      <AlarmClock className="h-3 w-3" />{new Date(it.remind_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function StagesModal({ stages, accountId, onClose, onSaved }: { stages: Stage[]; accountId: number; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [list, setList] = useState<Stage[]>(stages)
  const [busy, setBusy] = useState(false)
  const upd = (i: number, p: Partial<Stage>) => setList(l => l.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const move = (i: number, dir: -1 | 1) => setList(l => { const n = [...l]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; return n })
  const save = async () => {
    setBusy(true)
    try { await api.put('/api/crm/stages', { account_id: accountId, stages: list }); onSaved(); onClose() }
    catch (e) { toast(e instanceof ApiError && ['stages_count', 'stage_name'].includes(e.code) ? t(`err.${e.code}` as TKey) : t('common.error'), 'error') }
    finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} wide title={t('crm.settings')}>
      <div className="space-y-2">
        {list.map((s, i) => (
          <div key={s.id || i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
            <div className="flex flex-col">
              <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-ink-4 hover:text-ink disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-ink-4 hover:text-ink disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <input className="input h-9 min-w-[140px] flex-1 py-1.5" maxLength={30} value={s.name} onChange={e => upd(i, { name: e.target.value })} />
            <div className="flex gap-1">
              {Object.keys(STAGE_DOT).map(col => (
                <button key={col} onClick={() => upd(i, { color: col })} className={`h-5 w-5 rounded-full ${STAGE_DOT[col]} ${s.color === col ? 'ring-2 ring-ink ring-offset-2' : ''}`} />
              ))}
            </div>
            <select className="input h-9 w-36 py-1.5" value={s.type} onChange={e => upd(i, { type: e.target.value as Stage['type'] })}>
              {(['open', 'won', 'lost'] as const).map(tp => <option key={tp} value={tp}>{t(`crm.type.${tp}` as TKey)}</option>)}
            </select>
            <button disabled={list.length <= 1} onClick={() => setList(l => l.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-4 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {list.length < 10 && (
        <button onClick={() => setList(l => [...l, { id: '', name: '', color: 'slate', type: 'open' }])}
          className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-brand-600"><Plus className="h-4 w-4" />{t('crm.add_stage')}</button>
      )}
      <p className="hint mt-3">{t('crm.delete_hint')}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={save} loading={busy}>{t('common.save')}</Button>
      </div>
    </Modal>
  )
}

/** Bitimlar doskasi (Kanban). CRM markazining bir ko'rinishi. */
export function Board({ onChanged }: { onChanged?: () => void }) {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const { account } = useAuth()
  const [board, setBoard] = useState<Board | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [settings, setSettings] = useState(false)
  const [over, setOver] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const assigned = params.get('assigned') || ''

  const load = useCallback(() => {
    if (!account) return
    const p = new URLSearchParams({ account_id: String(account.id), q, assigned })
    api.get<Board>(`/api/crm?${p}`).then(setBoard).catch(() => {})
  }, [account, q, assigned])
  useEffect(() => { const timer = setTimeout(load, 200); return () => clearTimeout(timer) }, [load])

  if (!account) return null
  if (!board) return <Spinner />

  const drop = async (e: DragEvent, stageId: string) => {
    e.preventDefault()
    setOver(null)
    const id = Number(e.dataTransfer.getData('text/contact'))
    const card = board.cards.find(c => c.id === id)
    if (!card || card.stage === stageId) return
    setBoard(b => b && { ...b, cards: b.cards.map(c => (c.id === id ? { ...c, stage: stageId } : c)) })  // darhol ko'rinsin
    try { await api.patch(`/api/contacts/${id}`, { stage: stageId }) } catch { toast(t('common.error'), 'error') }
    load(); onChanged?.()
  }
  const openSum = board.stages.filter(s => s.type === 'open').reduce((a, s) => a + (board.totals[s.id]?.sum || 0), 0)
  const wonSum = board.stages.filter(s => s.type === 'won').reduce((a, s) => a + (board.totals[s.id]?.sum || 0), 0)

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-ink-4" />
          <input className="input pl-10" value={q} placeholder={t('ct.search')} onChange={e => setQ(e.target.value)} />
        </div>
        {board.team.length > 1 && (
          <select className="input sm:w-56" value={assigned} onChange={e => setParams(e.target.value ? { assigned: e.target.value } : {}, { replace: true })}>
            <option value="">{t('crm.all_people')}</option>
            <option value="me">{t('crm.mine')}</option>
            <option value="none">{t('crm.unassigned')}</option>
            {board.team.map(m => <option key={m.id} value={m.id}>{m.role === 'ai' ? '🤖 ' : ''}{m.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-4 sm:ml-auto">
          <div className="text-[12.5px] text-ink-3">{t('crm.pipeline_sum')} <b className="tabular-nums text-ink">{fmtNum(openSum)}</b></div>
          <div className="text-[12.5px] text-ink-3">{t('crm.won_sum')} <b className="tabular-nums text-emerald-600">{fmtNum(wonSum)}</b></div>
          <button onClick={() => setSettings(true)} title={t('crm.settings')} className="grid h-9 w-9 place-items-center rounded-xl text-ink-3 ring-1 ring-line hover:bg-white hover:text-ink"><Settings2 className="h-4 w-4" /></button>
        </div>
      </div>

      {board.cards.length === 0 && !q && !assigned && (
        <div className="mb-4 rounded-2xl border border-dashed border-line bg-white px-4 py-3 text-[13.5px] text-ink-3">{t('crm.add_hint')}</div>
      )}

      <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-4">
        {board.stages.map(s => {
          const cards = board.cards.filter(c => c.stage === s.id)
          const tot = board.totals[s.id] || { count: 0, sum: 0 }
          return (
            <div key={s.id} onDragOver={e => { e.preventDefault(); setOver(s.id) }} onDragLeave={() => setOver(o => (o === s.id ? null : o))} onDrop={e => drop(e, s.id)}
              className={`flex w-[280px] shrink-0 flex-col rounded-2xl p-2 transition ${over === s.id ? 'bg-brand-50 ring-2 ring-brand-200' : 'bg-[#f0f0f3]'}`}>
              <div className="flex items-center gap-2 px-2 pb-2.5 pt-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${STAGE_DOT[s.color] || STAGE_DOT.slate}`} />
                <span className="truncate text-[13.5px] font-bold">{s.name}</span>
                <span className="rounded-md bg-white px-1.5 text-[12px] font-semibold tabular-nums text-ink-3">{tot.count}</span>
                {tot.sum > 0 && <span className="ml-auto text-[12px] font-semibold tabular-nums text-ink-3">{fmtNum(tot.sum)}</span>}
              </div>
              <div className="scrollbar-thin flex max-h-[calc(100vh-260px)] min-h-[80px] flex-col gap-2 overflow-y-auto">
                {cards.map(c => (
                  <div key={c.id} draggable onDragStart={e => { e.dataTransfer.setData('text/contact', String(c.id)); e.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => setOpen(c.id)}
                    className="group relative cursor-grab rounded-xl border border-line bg-white p-3 shadow-card transition hover:-translate-y-px hover:shadow-pop active:cursor-grabbing">
                    {s.type === 'open' && Date.now() - new Date(c.last_message_at || c.last_seen_at).getTime() > 3 * 86400000 && (
                      <span title={t('crm.stale')} className="absolute -left-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-500" />
                    )}
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.username || c.name} src={c.avatar_url || null} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{c.username ? `@${c.username}` : c.name || c.igsid}</div>
                        {c.fields.phone && <div className="flex items-center gap-1 truncate font-mono text-[11.5px] text-ink-3"><Phone className="h-3 w-3" />{c.fields.phone}</div>}
                      </div>
                      {c.deal_value > 0 && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-emerald-700">{fmtNum(c.deal_value)}</span>}
                    </div>
                    {c.last_message_preview && <p className="mt-2 line-clamp-2 text-[12.5px] text-ink-3">{c.last_message_preview}</p>}
                    {c.next_reminder && (
                      <div className={`mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${new Date(c.next_reminder).getTime() < Date.now() ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>
                        <AlarmClock className="h-3 w-3" />{new Date(c.next_reminder).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5">
                      {c.assignee && (board.team.find(m => m.id === c.assigned_to)?.role === 'ai'
                        ? <span title={c.assignee} className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[#6d5dfc] to-[#e5161f] text-[10px] text-white">🤖</span>
                        : <span title={c.assignee} className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{c.assignee.charAt(0).toUpperCase()}</span>)}
                      {c.tags.slice(0, 2).map(tg => <span key={tg} className="chip bg-brand-50 py-0 text-[11px] text-brand-700">{tg}</span>)}
                      {c.notes > 0 && <span className="flex items-center gap-0.5 text-[11.5px] text-amber-600"><StickyNote className="h-3 w-3" />{c.notes}</span>}
                      <span className="ml-auto text-[11px] text-ink-4 group-hover:hidden">{ago(c.last_message_at || c.last_seen_at)}</span>
                      <span className="ml-auto hidden gap-1 group-hover:flex">
                        {c.fields.phone && <a href={`tel:${c.fields.phone.replace(/[^\d+]/g, '')}`} onClick={e => e.stopPropagation()} title={c.fields.phone}
                          className="grid h-6 w-6 place-items-center rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Phone className="h-3.5 w-3.5" /></a>}
                        <Link to={`/app/inbox?c=${c.id}`} onClick={e => e.stopPropagation()} className="grid h-6 w-6 place-items-center rounded-md bg-soft text-ink-2 hover:bg-[#ebebef]"><MessageCircle className="h-3.5 w-3.5" /></Link>
                      </span>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <div className="rounded-xl border border-dashed border-[#d9d9e0] py-6 text-center text-[12px] text-ink-4">{t('crm.empty_col')}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {open !== null && <ContactPanel id={open} onClose={() => setOpen(null)} onChanged={() => { load(); onChanged?.() }} />}
      {settings && <StagesModal stages={board.stages} accountId={account.id} onClose={() => setSettings(false)} onSaved={() => { load(); onChanged?.() }} />}
    </>
  )
}
