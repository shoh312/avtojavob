import { useCallback, useEffect, useState } from 'react'
import { Ban, Search, ShieldCheck, Users } from 'lucide-react'
import { api, type AdminUser, type AdminUserDetail, type PlanKey } from '../../api'
import { useI18n, useTimeAgo, type TKey } from '../../i18n'
import { Avatar, Button, Empty, Modal, PageHeader, Spinner, useToast } from '../../components/ui'
import { PlanBadge } from '../../components/Plan'
import { fmtNum } from '../../components/charts'

const PRICES: Record<PlanKey, number> = { trial: 0, pro: 199, business: 499 }

function UserModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { t, lang } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const [u, setU] = useState<AdminUserDetail | null>(null)
  const [form, setForm] = useState({ plan: 'pro' as PlanKey, days: 30, amount: 199, note: '' })
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState('')
  useEffect(() => { api.get<AdminUserDetail>(`/api/admin/users/${id}`).then(setU).catch(() => {}) }, [id])
  const date = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString(lang === 'tj' ? 'ru' : lang) : '—'

  const act = async (fn: () => Promise<AdminUserDetail>, msg?: string) => {
    setBusy(true)
    try { setU(await fn()); onChanged(); if (msg) toast(msg) } catch { toast(t('common.error'), 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} wide title={u ? <span className="flex items-center gap-3"><Avatar name={u.name || u.email} size={36} />{u.name || u.email}</span> : '…'}>
      {!u ? <Spinner className="py-10" /> : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-5">
            <div className="rounded-2xl bg-soft p-4">
              <div className="flex flex-wrap items-center gap-2">
                <PlanBadge status={u.status} />
                <span className="text-[13px] text-ink-3">{u.status === 'expired' || u.status === 'blocked' ? date(u.plan.expires_at) : `${t('bill.until', { d: date(u.plan.expires_at) })}`}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[13px]">
                <dt className="text-ink-3">Email</dt><dd className="truncate font-medium">{u.email}</dd>
                <dt className="text-ink-3">Instagram</dt><dd className="truncate font-medium">{u.accounts.map(a => `@${a}`).join(', ') || '—'}</dd>
                <dt className="text-ink-3">{t('adm.flows_n')}</dt><dd className="font-medium">{u.flows}</dd>
                <dt className="text-ink-3">{t('adm.col.sent')}</dt><dd className="font-medium">{fmtNum(u.sent_30d)}</dd>
                <dt className="text-ink-3">{t('adm.col.joined')}</dt><dd className="font-medium">{date(u.created_at)}</dd>
                <dt className="text-ink-3">{t('adm.last_login')}</dt><dd className="font-medium">{ago(u.last_login_at)}</dd>
              </dl>
            </div>
            <div>
              <div className="label">{t('adm.history')}</div>
              {u.grants.length ? (
                <div className="divide-y divide-line rounded-xl border border-line">
                  {u.grants.map(g => (
                    <div key={g.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                      <PlanBadge plan={g.plan} />
                      <span className="text-ink-3">{g.days} {t('adm.days').toLowerCase()}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-4">{g.note}</span>
                      <b className="tabular-nums">{g.amount} {t('bill.cur')}</b>
                      <span className="text-[12px] text-ink-4">{date(g.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[13px] text-ink-4">{t('adm.no_history')}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-line p-4">
              <div className="mb-3 text-[14px] font-bold">{t('adm.grant')}</div>
              <div className="grid grid-cols-3 gap-2">
                {(['trial', 'pro', 'business'] as PlanKey[]).map(p => (
                  <button key={p} type="button" onClick={() => setForm({ ...form, plan: p, amount: PRICES[p] * Math.max(1, Math.round(form.days / 30)) })}
                    className={`rounded-xl border px-2 py-2 text-[13px] font-semibold ${form.plan === p ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line hover:bg-soft'}`}>
                    {t(`plan.${p}` as TKey)}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label><span className="label">{t('adm.days')}</span>
                  <input type="number" min={1} className="input" value={form.days}
                    onChange={e => { const days = Number(e.target.value); setForm({ ...form, days, amount: PRICES[form.plan] * Math.max(1, Math.round(days / 30)) }) }} /></label>
                <label><span className="label">{t('adm.amount')}</span>
                  <input type="number" min={0} className="input" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></label>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[7, 30, 90, 365].map(d => (
                  <button key={d} type="button" onClick={() => setForm({ ...form, days: d, amount: PRICES[form.plan] * Math.max(1, Math.round(d / 30)) })}
                    className={`chip ${form.days === d ? 'bg-ink text-white' : 'hover:bg-[#efeff3]'}`}>{d}</button>
                ))}
              </div>
              <label className="mt-3 block"><span className="label">{t('adm.note')}</span>
                <input className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
              <Button className="mt-4 w-full" loading={busy}
                onClick={() => act(() => api.post(`/api/admin/users/${u.id}/grant`, form), t('adm.granted'))}>
                <ShieldCheck className="h-4 w-4" />{t('adm.grant_btn')}
              </Button>
            </div>
            <div className="flex gap-2">
              <input type="text" className="input h-9 flex-1 py-1.5" placeholder={t('adm.set_password')} value={pw} onChange={e => setPw(e.target.value)} />
              <Button variant="secondary" size="sm" disabled={busy || pw.length < 8}
                onClick={async () => { await api.post(`/api/admin/users/${u.id}/password`, { password: pw }); setPw(''); toast(t('adm.password_set')) }}>{t('common.save')}</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" disabled={busy}
                onClick={() => act(() => api.post(`/api/admin/users/${u.id}/expire`))}>{t('adm.expire')}</Button>
              {!u.is_admin && (
                <Button variant="danger" size="sm" className="flex-1" disabled={busy}
                  onClick={() => act(() => api.post(`/api/admin/users/${u.id}/block`, { blocked: !u.is_blocked }))}>
                  <Ban className="h-4 w-4" />{u.is_blocked ? t('adm.unblock') : t('adm.block')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function AdminUsers() {
  const { t, lang } = useI18n()
  const ago = useTimeAgo()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: AdminUser[]; total: number; per_page: number } | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const load = useCallback(() => {
    const p = new URLSearchParams({ q, status, page: String(page) })
    api.get<{ items: AdminUser[]; total: number; per_page: number }>(`/api/admin/users?${p}`).then(setData).catch(() => {})
  }, [q, status, page])
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer) }, [load])

  const date = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString(lang === 'tj' ? 'ru' : lang) : '—'
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1

  return (
    <>
      <PageHeader title={t('nav.admin_users')} sub={data ? `${t('adm.users')}: ${data.total}` : undefined} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-ink-4" />
          <input className="input pl-10" placeholder={t('adm.search')} value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
        </div>
        <select className="input sm:w-52" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">{t('adm.all')}</option>
          {(['trial', 'pro', 'business', 'expired', 'blocked'] as const).map(s => <option key={s} value={s}>{t(`plan.${s}`)}</option>)}
        </select>
      </div>
      {!data ? <Spinner /> : data.items.length === 0 ? <Empty icon={<Users className="h-6 w-6" />} title={t('common.empty')} /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="border-b border-line text-[12px] font-semibold uppercase tracking-wide text-ink-4">
                <tr>
                  <th className="px-5 py-3">{t('adm.col.user')}</th><th className="px-3 py-3">{t('adm.col.plan')}</th>
                  <th className="px-3 py-3">{t('adm.col.until')}</th><th className="hidden px-3 py-3 md:table-cell">{t('adm.col.accounts')}</th>
                  <th className="px-3 py-3 text-right">{t('adm.col.sent')}</th><th className="hidden px-5 py-3 text-right lg:table-cell">{t('adm.last_login')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map(u => (
                  <tr key={u.id} onClick={() => setOpen(u.id)} className="cursor-pointer hover:bg-soft/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name || u.email} size={32} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{u.name || u.email.split('@')[0]}{u.is_admin && <span className="ml-1.5 text-[11px] font-bold text-brand-600">ADMIN</span>}</div>
                          <div className="truncate text-[12px] text-ink-3">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><PlanBadge status={u.status} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-3">{u.is_admin ? '∞' : date(u.plan.expires_at)}</td>
                    <td className="hidden max-w-[180px] truncate px-3 py-3 text-ink-2 md:table-cell">{u.accounts.map(a => `@${a}`).join(', ') || '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtNum(u.sent_30d)}</td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-right text-ink-3 lg:table-cell">{ago(u.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 text-[13px] text-ink-3">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-line px-3 py-1 font-medium disabled:opacity-40">{t('ct.prev')}</button>
              <span className="tabular-nums">{page}/{pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-line px-3 py-1 font-medium disabled:opacity-40">{t('ct.next')}</button>
            </div>
          )}
        </div>
      )}
      {open !== null && <UserModal id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  )
}
