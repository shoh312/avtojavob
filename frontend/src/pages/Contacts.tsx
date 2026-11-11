import { useEffect, useState } from 'react'
import { Download, Search, Users } from 'lucide-react'
import { api, type Contact } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo } from '../i18n'
import { Avatar, Empty, PageHeader, Spinner } from '../components/ui'
import { ContactPanel, STAGE_DOT, type Stage } from './Crm'
import { Onboarding } from './Home'

type ListResp = { items: Contact[]; total: number; per_page: number; tags: string[] }

export default function Contacts() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const { account } = useAuth()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListResp | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!account) return
    const timer = setTimeout(() => {
      const p = new URLSearchParams({ account_id: String(account.id), q, tag, page: String(page) })
      api.get<ListResp>(`/api/contacts?${p}`).then(setData).catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [account, q, tag, page, reload])
  useEffect(() => { if (account) api.get<{ stages: Stage[] }>(`/api/crm/stages?account_id=${account.id}`).then(r => setStages(r.stages)).catch(() => {}) }, [account])

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
                  <th className="px-5 py-3">{t('ct.user')}</th><th className="px-3 py-3">{t('crm.stage')}</th><th className="px-3 py-3">{t('ct.phone')}</th>
                  <th className="hidden px-3 py-3 md:table-cell">{t('ct.email')}</th><th className="px-3 py-3">{t('ct.tags')}</th>
                  <th className="px-5 py-3 text-right">{t('ct.last_seen')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map(c => (
                  <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer hover:bg-soft/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.username || c.name} size={32} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{c.username ? `@${c.username}` : c.name || c.igsid}</div>
                          {c.name && c.username && <div className="truncate text-[12px] text-ink-3">{c.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{(() => { const st = stages.find(x => x.id === c.stage); return st
                      ? <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"><span className={`h-2 w-2 rounded-full ${STAGE_DOT[st.color] || STAGE_DOT.slate}`} />{st.name}</span>
                      : <span className="text-ink-4">—</span> })()}</td>
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
      {open !== null && <ContactPanel id={open} onClose={() => setOpen(null)} onChanged={() => setReload(r => r + 1)} />}
    </>
  )
}
