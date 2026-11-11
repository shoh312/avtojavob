import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, Copy, KeyRound, Mail, Send, Sparkles } from 'lucide-react'
import { api, ApiError } from '../../api'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { Button, PageHeader, Spinner, useToast } from '../../components/ui'

type Platform = {
  telegram_username: string; smtp_host: string; smtp_port: string; smtp_user: string; smtp_from: string
  google_client_id: string; google_redirect: string
  smtp_password_set: boolean; google_client_secret_set: boolean; anthropic_api_key_set: boolean
}

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2.5 text-[16px] font-bold">{icon}{title}</h2>
      {hint && <div className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{hint}</div>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}

function Secret({ label, isSet, value, onChange }: { label: string; isSet: boolean; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  return (
    <label className="block"><span className="label flex items-center gap-2">{label}{isSet && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}</span>
      <input type="password" className="input" value={value} autoComplete="off" placeholder={isSet ? '••••••••' : ''} onChange={e => onChange(e.target.value)} />
      {isSet && <p className="hint">{t('adm.pl.set')}</p>}
    </label>
  )
}

export default function AdminSettings() {
  const { t } = useI18n()
  const toast = useToast()
  const { refresh } = useAuth()
  const [p, setP] = useState<Platform | null>(null)
  const [tg, setTg] = useState('')
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')

  const load = () => api.get<Platform>('/api/admin/platform').then(r => {
    setP(r)
    setTg(r.telegram_username)
    setForm({ smtp_host: r.smtp_host, smtp_port: r.smtp_port || '587', smtp_user: r.smtp_user, smtp_from: r.smtp_from,
      google_client_id: r.google_client_id, smtp_password: '', google_client_secret: '', anthropic_api_key: '' })
  })
  useEffect(() => { load().catch(() => {}) }, [])
  if (!p) return <Spinner />

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }))
  const save = async (key: string, fields: string[]) => {
    setBusy(key)
    try {
      await api.put('/api/admin/platform', Object.fromEntries(fields.map(f => [f, form[f]])))
      await load()
      toast(t('common.saved'))
      refresh()
    } catch { toast(t('common.error'), 'error') } finally { setBusy('') }
  }
  const saveTg = async () => {
    setBusy('tg')
    try {
      const r = await api.put<{ telegram_username: string }>('/api/admin/settings', { telegram_username: tg })
      setTg(r.telegram_username)
      toast(t('common.saved'))
      refresh()
    } catch { toast(t('common.error'), 'error') } finally { setBusy('') }
  }
  const testEmail = async () => {
    setBusy('test')
    try { await api.post('/api/admin/platform/test-email', {}); toast(t('adm.pl.test_ok')) }
    catch (e) { toast(e instanceof ApiError ? e.code : t('common.error'), 'error') } finally { setBusy('') }
  }
  const input = (k: string, label: string, ph = '') => (
    <label className="block"><span className="label">{label}</span><input className="input" value={form[k] ?? ''} placeholder={ph} onChange={e => set(k)(e.target.value)} /></label>
  )

  return (
    <>
      <PageHeader title={t('adm.pl.title')} />
      <div className="grid max-w-3xl gap-6">
        <Section icon={<Send className="h-4 w-4 text-[#229ED9]" />} title={t('adm.pl.payments')} hint={t('adm.tg_hint')}>
          <div className="flex gap-2">
            <div className="relative flex-1"><span className="absolute left-3.5 top-2.5 text-[14px] text-ink-4">@</span>
              <input className="input pl-8" value={tg} placeholder="username" onChange={e => setTg(e.target.value)} aria-label={t('adm.tg')} /></div>
            <Button onClick={saveTg} loading={busy === 'tg'}>{t('common.save')}</Button>
          </div>
        </Section>

        <Section icon={<Sparkles className="h-4 w-4 text-[#d97757]" />} title={t('adm.pl.ai')} hint={t('adm.pl.ai_hint')}>
          <Secret label={t('adm.pl.key')} isSet={p.anthropic_api_key_set} value={form.anthropic_api_key} onChange={set('anthropic_api_key')} />
          <Button onClick={() => save('ai', ['anthropic_api_key'])} loading={busy === 'ai'} disabled={!form.anthropic_api_key}>{t('common.save')}</Button>
        </Section>

        <Section icon={<Mail className="h-4 w-4 text-brand-600" />} title={t('adm.pl.email')} hint={t('adm.pl.email_hint')}>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            {input('smtp_host', t('adm.pl.host'), 'smtp.gmail.com')}
            {input('smtp_port', t('adm.pl.port'), '587')}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('smtp_user', t('adm.pl.user'), 'you@gmail.com')}
            <Secret label={t('adm.pl.pass')} isSet={p.smtp_password_set} value={form.smtp_password} onChange={set('smtp_password')} />
          </div>
          {input('smtp_from', t('adm.pl.from'), 'ChatFlow <you@gmail.com>')}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save('smtp', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'smtp_password'])} loading={busy === 'smtp'}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={testEmail} loading={busy === 'test'} disabled={!p.smtp_host}>{t('adm.pl.test')}</Button>
          </div>
        </Section>

        <Section icon={<KeyRound className="h-4 w-4 text-ink" />} title={t('adm.pl.google')} hint={<>
          {t('adm.pl.google_hint')}
          <button onClick={() => { navigator.clipboard?.writeText(p.google_redirect); toast(t('bill.copied')) }}
            className="mt-2 flex w-full items-center gap-2 rounded-lg bg-soft px-3 py-2 text-left font-mono text-[12.5px] text-ink hover:bg-[#efeff3]">
            <span className="flex-1 break-all">{p.google_redirect}</span><Copy className="h-3.5 w-3.5 shrink-0" />
          </button></>}>
          {input('google_client_id', t('adm.pl.client_id'), '….apps.googleusercontent.com')}
          <Secret label={t('adm.pl.client_secret')} isSet={p.google_client_secret_set} value={form.google_client_secret} onChange={set('google_client_secret')} />
          <Button onClick={() => save('google', ['google_client_id', 'google_client_secret'])} loading={busy === 'google'}>{t('common.save')}</Button>
        </Section>
      </div>
    </>
  )
}
