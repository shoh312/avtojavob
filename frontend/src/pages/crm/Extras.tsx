import { useEffect, useState } from 'react'
import { Check, Hash, Pencil, Phone, Trash2 } from 'lucide-react'
import { api, type Contact } from '../../api'
import { useI18n } from '../../i18n'
import { Avatar, Button, Modal, Spinner, useToast } from '../../components/ui'
import { ContactPanel, type Stage } from '../Crm'

export function AddContactModal({ accountId, onClose, onSaved }: { accountId: number; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [stages, setStages] = useState<Stage[]>([])
  const [f, setF] = useState({ name: '', phone: '', username: '', stage: '', deal_value: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get<{ stages: Stage[] }>(`/api/crm/stages?account_id=${accountId}`).then(r => { setStages(r.stages); setF(x => ({ ...x, stage: r.stages[0]?.id || '' })) }).catch(() => {}) }, [accountId])
  const save = async () => {
    setBusy(true)
    try {
      await api.post('/api/contacts', { account_id: accountId, ...f, deal_value: Number(f.deal_value) || 0 })
      toast(t('crm2.added')); onSaved()
    } catch { toast(t('common.error'), 'error') } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={t('crm2.add')}>
      <div className="space-y-3.5">
        <label className="block"><span className="label">{t('auth.name')}</span><input autoFocus className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">{t('crm2.phone')}</span><input className="input font-mono" placeholder="+992 …" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></label>
          <label className="block"><span className="label">Instagram</span><input className="input" placeholder="@username" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">{t('crm2.col.stage')}</span>
            <select className="input" value={f.stage} onChange={e => setF({ ...f, stage: e.target.value })}>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="block"><span className="label">{t('crm2.sum')}</span><input className="input" inputMode="numeric" value={f.deal_value} onChange={e => setF({ ...f, deal_value: e.target.value.replace(/\D/g, '') })} /></label>
        </div>
        <p className="hint">{t('crm2.add_hint')}</p>
        <Button className="w-full" loading={busy} disabled={!f.name.trim() && !f.phone.trim()} onClick={save}>{t('common.save')}</Button>
      </div>
    </Modal>
  )
}

export function TagsModal({ accountId, onClose, onChanged, onPick }: { accountId: number; onClose: () => void; onChanged: () => void; onPick: (tag: string) => void }) {
  const { t } = useI18n()
  const [items, setItems] = useState<{ tag: string; count: number }[] | null>(null)
  const [edit, setEdit] = useState<{ from: string; to: string } | null>(null)
  const load = () => api.get<{ items: { tag: string; count: number }[] }>(`/api/crm/tags?account_id=${accountId}`).then(r => setItems(r.items)).catch(() => setItems([]))
  useEffect(() => { load() }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps
  const apply = async (from: string, to: string) => {
    await api.post('/api/crm/tags', { account_id: accountId, from, to })
    setEdit(null); load(); onChanged()
  }
  const max = Math.max(1, ...(items || []).map(i => i.count))
  return (
    <Modal open onClose={onClose} title={t('crm2.tags')}>
      {items === null ? <Spinner /> : items.length === 0 ? <p className="py-8 text-center text-[13.5px] text-ink-3">{t('crm2.tags_empty')}</p> : (
        <div className="-mx-2 max-h-[60vh] space-y-0.5 overflow-y-auto">
          {items.map(i => edit?.from === i.tag ? (
            <form key={i.tag} onSubmit={e => { e.preventDefault(); if (edit.to.trim() && edit.to.trim() !== i.tag) apply(i.tag, edit.to.trim()); else setEdit(null) }} className="flex items-center gap-2 px-2 py-1">
              <input autoFocus className="input h-9" value={edit.to} onChange={e => setEdit({ ...edit, to: e.target.value })} />
              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink text-white"><Check className="h-4 w-4" /></button>
            </form>
          ) : (
            <div key={i.tag} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-soft">
              <button onClick={() => onPick(i.tag)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Hash className="h-3.5 w-3.5 shrink-0 text-ink-4" />
                <span className="truncate text-[14px] font-medium">{i.tag}</span>
                <span className="ml-auto h-1 w-16 shrink-0 overflow-hidden rounded-full bg-[#ececf0]"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${i.count / max * 100}%` }} /></span>
                <span className="w-8 shrink-0 text-right text-[12.5px] tabular-nums text-ink-3">{i.count}</span>
              </button>
              <button onClick={() => setEdit({ from: i.tag, to: i.tag })} className="grid h-7 w-7 place-items-center rounded-lg text-ink-4 opacity-0 hover:bg-white hover:text-ink group-hover:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => confirm(t('crm2.tag_del', { tag: i.tag, n: i.count })) && apply(i.tag, '')} className="grid h-7 w-7 place-items-center rounded-lg text-ink-4 opacity-0 hover:bg-white hover:text-brand-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <p className="hint mt-3">{t('crm2.tags_hint')}</p>
    </Modal>
  )
}

export function DuplicatesModal({ accountId, onClose, onChanged }: { accountId: number; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n()
  const [groups, setGroups] = useState<{ phone: string; items: Contact[] }[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const load = () => api.get<{ groups: { phone: string; items: Contact[] }[] }>(`/api/crm/duplicates?account_id=${accountId}`).then(r => setGroups(r.groups)).catch(() => setGroups([]))
  useEffect(() => { load() }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Modal open={open === null} onClose={onClose} title={t('crm2.f.dups')}>
        {groups === null ? <Spinner /> : groups.length === 0 ? <p className="py-8 text-center text-[13.5px] text-ink-3">{t('crm2.dups_none')}</p> : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            <p className="text-[13px] text-ink-3">{t('crm2.dups_hint')}</p>
            {groups.map(g => (
              <div key={g.phone} className="rounded-2xl border border-line p-3">
                <div className="mb-2 flex items-center gap-1.5 font-mono text-[13px] font-semibold"><Phone className="h-3.5 w-3.5 text-ink-4" />{g.phone}</div>
                {g.items.map(c => (
                  <button key={c.id} onClick={() => setOpen(c.id)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-soft">
                    <Avatar name={c.name || c.username || '?'} src={c.avatar_url || null} size={28} />
                    <span className="truncate text-[13.5px] font-medium">{c.name || `@${c.username}`}</span>
                    {c.username && c.name && <span className="truncate text-[12px] text-ink-3">@{c.username}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </Modal>
      {open !== null && <ContactPanel id={open} onClose={() => { setOpen(null); load(); onChanged() }} />}
    </>
  )
}
