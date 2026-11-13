import { useCallback, useEffect, useState } from 'react'
import { Bot, CheckCircle2, Copy, KeyRound, Send, Sparkles, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { api, ApiError } from '../api'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Avatar, Button, Empty, Modal, PageHeader, Spinner, Toggle, useToast } from '../components/ui'

type Member = { id: number; name: string; email: string; last_login_at: string | null; assigned: number
  telegram: { account_id: number; username: string; linked: boolean; link: string }[] }

type AiManager = { id: number; name: string; instructions: string; followup_hours: number; take_all: boolean; assigned: number }

function AiManagerCard({ ai, available, autoAssign, onChanged }: { ai: AiManager | null; available: boolean; autoAssign: boolean; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: ai?.name || 'AI Menejer', instructions: ai?.instructions || '', followup_hours: ai?.followup_hours ?? 4, take_all: ai?.take_all ?? true })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (ai) setF({ name: ai.name, instructions: ai.instructions, followup_hours: ai.followup_hours, take_all: ai.take_all }) }, [ai])
  const save = async () => {
    setBusy(true)
    try {
      await api.put('/api/team/ai', f)
      if (f.take_all && !autoAssign) await api.put('/api/team/settings', { auto_assign: true })
      toast(t('team.ai.saved')); setOpen(false); onChanged()
    } catch { toast(t('common.error'), 'error') } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!confirm(`${t('team.ai.remove')}?`)) return
    await api.del('/api/team/ai'); onChanged()
  }
  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b1b22] to-[#2a1530] p-6 text-white">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-600/30 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#6d5dfc] to-[#e5161f]"><Bot className="h-6 w-6" /></span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-bold">{ai ? ai.name : t('team.ai.title')}</h2>
            {ai && <span className="chip bg-white/10 text-white">{t('team.assigned', { n: ai.assigned })}</span>}
            {ai?.take_all && <span className="chip bg-emerald-400/20 text-emerald-200">⚡ {t('team.ai.take_all').split(' ').slice(0, 3).join(' ')}…</span>}
          </div>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-white/70">{t('team.ai.sub')}</p>
          {!available && <p className="mt-2 text-[12.5px] text-amber-300">{t('int.ai.unavailable')}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant={ai ? 'secondary' : 'primary'} onClick={() => setOpen(true)}><Sparkles className="h-4 w-4" />{ai ? t('common.edit') : t('team.ai.add')}</Button>
          {ai && <button onClick={remove} className="rounded-xl p-2.5 text-white/60 hover:bg-white/10 hover:text-white"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t('team.ai.title')} wide>
        <div className="space-y-4">
          <label className="block"><span className="label">{t('team.ai.name')}</span>
            <input className="input" value={f.name} maxLength={120} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label className="block"><span className="label">{t('team.ai.instructions')}</span>
            <textarea rows={6} className="input resize-y" maxLength={4000} value={f.instructions} placeholder={t('team.ai.instructions_ph')} onChange={e => setF({ ...f, instructions: e.target.value })} />
            <p className="hint">{t('int.ai.hint')}</p></label>
          <div>
            <span className="label">{t('team.ai.followup')}</span>
            <div className="flex flex-wrap gap-2">
              {[0, 2, 4, 8, 12].map(h => (
                <button key={h} type="button" onClick={() => setF({ ...f, followup_hours: h })}
                  className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold ${f.followup_hours === h ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line hover:bg-soft'}`}>
                  {h ? t('team.ai.hours', { n: h }) : t('team.ai.off')}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span><span className="block text-[14px] font-semibold">{t('team.ai.take_all')}</span>
              <span className="block text-[12.5px] text-ink-3">{t('team.ai.take_all_d')}</span></span>
            <Toggle checked={f.take_all} onChange={v => setF({ ...f, take_all: v })} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={save} loading={busy}>{t('common.save')}</Button>
          </div>
        </div>
      </Modal>
    </section>
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
  const [data, setData] = useState<{ members: Member[]; auto_assign: boolean; ai_manager: AiManager | null; ai_available: boolean } | null>(null)
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

      <AiManagerCard ai={data.ai_manager} available={data.ai_available} autoAssign={data.auto_assign} onChanged={load} />

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
                <Avatar name={m.name || m.email} size={44} />
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
