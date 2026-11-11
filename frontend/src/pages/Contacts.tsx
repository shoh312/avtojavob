import { useEffect, useState, type KeyboardEvent } from 'react'
import { Download, Search, Users, X } from 'lucide-react'
import { api, type Contact } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo } from '../i18n'
import { Avatar, Empty, Modal, PageHeader, Spinner } from '../components/ui'
import { Onboarding } from './Home'

type ListResp = { items: Contact[]; total: number; per_page: number; tags: string[] }

function ContactModal({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: (c: Contact) => void }) {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const [tag, setTag] = useState('')
  const saveTags = async (tags: string[]) => onSaved(await api.patch<Contact>(`/api/contacts/${contact.id}`, { tags }))
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tag.trim()) { saveTags([...contact.tags, tag.trim()]); setTag('') }
  }
  const fields = Object.entries(contact.fields)
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-3"><Avatar name={contact.username || contact.name} size={36} />{contact.username ? `@${contact.username}` : contact.name || contact.igsid}</span>}>
      <div className="space-y-6">
        <div>
          <div className="label">{t('ct.tags')}</div>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map(tg => (
              <span key={tg} className="chip bg-brand-50 text-brand-700">{tg}
                <button onClick={() => saveTags(contact.tags.filter(x => x !== tg))} className="hover:text-brand-900"><X className="h-3 w-3" /></button></span>
            ))}
            <input value={tag} onChange={e => setTag(e.target.value)} onKeyDown={onKey} placeholder={t('ct.add_tag')}
              className="min-w-[120px] flex-1 rounded-full border border-dashed border-line px-3 py-1 text-[12.5px] outline-none focus:border-brand-300" />
          </div>
        </div>
        <div>
          <div className="label">{t('ct.fields')}</div>
          {fields.length ? (
            <dl className="divide-y divide-line rounded-xl border border-line">
              {fields.map(([k, v]) => (
                <div key={k} className="flex gap-4 px-3.5 py-2.5 text-[13.5px]"><dt className="w-24 shrink-0 font-mono text-ink-3">{k}</dt><dd className="min-w-0 break-words font-medium">{v}</dd></div>
              ))}
            </dl>
          ) : <p className="text-[13px] text-ink-4">—</p>}
        </div>
        <div className="grid grid-cols-3 gap-3 text-[13px]">
          <div><div className="text-ink-4">{t('ct.follows')}</div><div className="mt-0.5 font-semibold">{contact.follows == null ? '—' : t(contact.follows ? 'common.yes' : 'common.no')}</div></div>
          <div><div className="text-ink-4">{t('ct.first_seen')}</div><div className="mt-0.5 font-semibold">{ago(contact.created_at)}</div></div>
          <div><div className="text-ink-4">{t('ct.last_seen')}</div><div className="mt-0.5 font-semibold">{ago(contact.last_seen_at)}</div></div>
        </div>
      </div>
    </Modal>
  )
}

export default function Contacts() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const { account } = useAuth()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResp | null>(null)
  const [open, setOpen] = useState<Contact | null>(null)

  useEffect(() => {
    if (!account) return
    const timer = setTimeout(() => {
      const p = new URLSearchParams({ account_id: String(account.id), q, tag, page: String(page) })
      api.get<ListResp>(`/api/contacts?${p}`).then(setData).catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [account, q, tag, page])

  if (!account) return <Onboarding />
  const exportUrl = `/api/contacts/export.csv?${new URLSearchParams({ account_id: String(account.id), q, tag })}`
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1

  return (
    <>
      <PageHeader title={t('ct.title')} sub={t('ct.sub')}
        action={<a href={exportUrl} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[14px] font-semibold hover:bg-soft"><Download className="h-4 w-4" />{t('common.export')}</a>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-ink-4" />
          <input className="input pl-10" placeholder={t('ct.search')} value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
        </div>
        <select className="input sm:w-56" value={tag} onChange={e => { setTag(e.target.value); setPage(1) }}>
          <option value="">{t('ct.all_tags')}</option>
          {data?.tags.map(tg => <option key={tg} value={tg}>{tg}</option>)}
        </select>
      </div>

      {!data ? <Spinner /> : data.total === 0 && !q && !tag ? (
        <Empty icon={<Users className="h-6 w-6" />} title={t('ct.empty.t')} text={t('ct.empty.d')} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="border-b border-line text-[12px] font-semibold uppercase tracking-wide text-ink-4">
                <tr>
                  <th className="px-5 py-3">{t('ct.user')}</th><th className="px-3 py-3">{t('ct.phone')}</th>
                  <th className="hidden px-3 py-3 md:table-cell">{t('ct.email')}</th><th className="px-3 py-3">{t('ct.tags')}</th>
                  <th className="px-5 py-3 text-right">{t('ct.last_seen')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map(c => (
                  <tr key={c.id} onClick={() => setOpen(c)} className="cursor-pointer hover:bg-soft/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.username || c.name} size={32} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{c.username ? `@${c.username}` : c.name || c.igsid}</div>
                          {c.name && c.username && <div className="truncate text-[12px] text-ink-3">{c.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-[12.5px]">{c.fields.phone || '—'}</td>
                    <td className="hidden px-3 py-3 md:table-cell">{c.fields.email || '—'}</td>
                    <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{c.tags.slice(0, 3).map(tg => <span key={tg} className="chip bg-brand-50 text-brand-700">{tg}</span>)}{c.tags.length > 3 && <span className="chip">+{c.tags.length - 3}</span>}</div></td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-ink-3">{ago(c.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-3">
            <span>{t('ct.total', { n: data.total })}</span>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-line px-3 py-1 font-medium disabled:opacity-40">{t('ct.prev')}</button>
                <span className="tabular-nums">{page}/{pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-line px-3 py-1 font-medium disabled:opacity-40">{t('ct.next')}</button>
              </div>
            )}
          </div>
        </div>
      )}
      {open && <ContactModal contact={open} onClose={() => setOpen(null)}
        onSaved={c => { setOpen(c); setData(d => d && { ...d, items: d.items.map(x => (x.id === c.id ? c : x)) }) }} />}
    </>
  )
}
