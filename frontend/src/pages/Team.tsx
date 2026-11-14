import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CheckCircle2, Copy, KeyRound, Send, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { api, ApiError } from '../api'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Avatar, Button, Empty, Modal, PageHeader, Spinner, Toggle, useToast } from '../components/ui'

type Member = { id: number; name: string; email: string; avatar_url?: string; last_login_at: string | null; assigned: number
  telegram: { account_id: number; username: string; linked: boolean; link: string }[] }

function AiLink() {
  const { t } = useI18n()
  return (
    <Link to="/app/integrations?open=ai" className="group mb-6 flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition hover:border-[#d6d6dc] hover:shadow-card">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6d5dfc] to-[#e5161f] text-white"><Bot className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{t('ai3.team_t')}</span>
        <span className="block truncate text-[12.5px] text-ink-3">{t('ai3.team_d')}</span></span>
      <ArrowRight className="h-4 w-4 text-ink-4 transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  )
}

function CredentialsModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const text = `ChatFlow\n${window.location.origin}/login\nEmail: ${email}\n${t('auth.password')}: ${password}`
  return (
    <Modal open onClose={onClose} title={t('team.cred_title')}>
      <p className="text-[14px] text-ink-3">{t('team.cred_hint')}</p>
      <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-soft p-4 font-mono text-[13px]">{text}</pre>
      <Button className="mt-4 w-full" onClick={() => { navigator.clipboard?.writeText(text); toast(t('bill.copied')) }}><Copy className="h-4 w-4" />{t('bill.copy')}</Button>
    </Modal>
  )
}

export default function Team() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const [data, setData] = useState<{ members: Member[]; auto_assign: boolean } | null>(null)
  const [form, setForm] = useState({ name: '', email: '' })
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null)

  const load = useCallback(() => api.get<NonNullable<typeof data>>('/api/team').then(setData).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  if (!data) return <Spinner />

  const add = async () => {
    setBusy(true)
    try {
      const r = await api.post<Member & { password: string }>('/api/team', form)
      setCred({ email: r.email, password: r.password })
      setForm({ name: '', email: '' })
      setAdding(false)
      load()
    } catch (e) {
      toast(e instanceof ApiError && ['email_invalid', 'email_taken'].includes(e.code) ? t(`err.${e.code}` as TKey) : t('common.error'), 'error')
    } finally { setBusy(false) }
  }
  const resetPw = async (m: Member) => setCred({ email: m.email, password: (await api.post<{ password: string }>(`/api/team/${m.id}/password`)).password })
  const remove = async (m: Member) => {
    if (!confirm(t('team.remove_q', { name: m.name || m.email }))) return
    await api.del(`/api/team/${m.id}`)
    load()
  }

  return (
    <>
      <PageHeader title={t('team.title')} sub={t('team.sub')} action={<Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />{t('team.add')}</Button>} />

      <AiLink />

      <label className="card mb-6 flex items-start justify-between gap-4 p-5">
        <span>
          <span className="block text-[15px] font-bold">{t('team.auto')}</span>
          <span className="mt-1 block text-[13px] text-ink-3">{t('team.auto_d')}</span>
        </span>
        <Toggle checked={data.auto_assign} onChange={async v => { await api.put('/api/team/settings', { auto_assign: v }); load() }} />
      </label>

      {data.members.length === 0 ? (
        <Empty icon={<UsersRound className="h-6 w-6" />} title={t('team.empty_t')} text={t('team.empty_d')}
          action={<Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />{t('team.add')}</Button>} />
      ) : (
        <div className="space-y-3">
          {data.members.map(m => (
            <div key={m.id} className="card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar name={m.name || m.email} src={m.avatar_url || null} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold">{m.name || m.email}</div>
                  <div className="truncate text-[13px] text-ink-3">{m.email} · {t('adm.last_login')}: {ago(m.last_login_at)}</div>
                </div>
                <span className="chip">{t('team.assigned', { n: m.assigned })}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => resetPw(m)}><KeyRound className="h-4 w-4" />{t('team.new_pw')}</Button>
                  <button onClick={() => remove(m)} className="rounded-lg p-2 text-ink-4 hover:bg-brand-50 hover:text-brand-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {m.telegram.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  {m.telegram.map(tg => tg.linked ? (
                    <span key={tg.account_id} className="chip bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Telegram · @{tg.username}</span>
                  ) : tg.link ? (
                    <button key={tg.account_id} onClick={() => { navigator.clipboard?.writeText(tg.link); toast(t('team.link_copied')) }}
                      className="chip bg-[#e8f4fb] text-[#11577a] hover:bg-[#d5ebf7]"><Send className="h-3.5 w-3.5" />{t('team.tg_link')} · @{tg.username}<Copy className="h-3 w-3" /></button>
                  ) : null)}
                </div>
              )}
            </div>
          ))}
          <p className="text-[12.5px] text-ink-3">{t('team.tg_hint')}</p>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={t('team.add')}>
        <div className="space-y-4">
          <label className="block"><span className="label">{t('auth.name')}</span><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="label">{t('auth.email')}</span><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <p className="hint">{t('team.add_hint')}</p>
          <Button className="w-full" onClick={add} loading={busy} disabled={!form.email.includes('@')}>{t('team.add')}</Button>
        </div>
      </Modal>
      {cred && <CredentialsModal {...cred} onClose={() => setCred(null)} />}
    </>
  )
}
