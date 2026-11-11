import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Instagram, Plus } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { Avatar, Button, PageHeader, useToast } from '../components/ui'

export default function Accounts() {
  const { t, lang } = useI18n()
  const toast = useToast()
  const { me, refresh, setAccountId } = useAuth()
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    const ok = params.get('connected'), bad = params.get('ig_error')
    if (!ok && !bad) return
    if (ok) {
      toast(t('acc.connected', { u: ok }))
      refresh().then(() => {
        const acc = me?.accounts.find(a => a.username === ok)
        if (acc) setAccountId(acc.id)
      })
    }
    if (bad) toast(bad === 'not_configured' ? t('acc.not_configured') : t('acc.error', { e: bad }), 'error')
    setParams({}, { replace: true })
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (id: number) => { await api.post(`/api/accounts/${id}/toggle`); refresh() }
  const disconnect = async (id: number, username: string) => {
    if (!confirm(t('acc.disconnect_q', { u: username }))) return
    await api.del(`/api/accounts/${id}`)
    refresh()
  }
  const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(lang === 'tj' ? 'ru' : lang) : '—'

  return (
    <>
      <PageHeader title={t('acc.title')} sub={t('acc.sub')}
        action={<a href="/instagram/connect"><Button><Plus className="h-4 w-4" />{t('acc.connect')}</Button></a>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {me?.accounts.length ? me.accounts.map(a => (
            <div key={a.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <Avatar name={a.username} src={a.picture_url} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-bold">@{a.username}</span>
                  <span className={`chip ${a.active ? 'bg-emerald-50 text-emerald-700' : ''}`}>{a.active ? t('common.active') : t('common.paused')}</span>
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink-3">{a.name} · {t('acc.token', { d: date(a.token_expires_at) })}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => toggle(a.id)}>{a.active ? t('acc.pause') : t('acc.resume')}</Button>
                <Button variant="danger" size="sm" onClick={() => disconnect(a.id, a.username)}>{t('acc.disconnect')}</Button>
              </div>
            </div>
          )) : (
            <a href="/instagram/connect" className="flex flex-col items-center rounded-3xl border-2 border-dashed border-line px-6 py-14 text-center hover:border-brand-300 hover:bg-brand-50/30">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white"><Instagram className="h-7 w-7" /></span>
              <span className="mt-4 text-[16px] font-bold">{t('acc.connect')}</span>
            </a>
          )}
        </div>
        <aside className="card h-fit p-5">
          <h3 className="text-[14px] font-bold">{t('acc.req.title')}</h3>
          <ul className="mt-3 space-y-3 text-[13px] leading-snug text-ink-2">
            {(['acc.req1', 'acc.req2'] as const).map(k => (
              <li key={k} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{t(k)}</li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  )
}
