import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, Copy, KeyRound, Mail, Send, Sparkles } from 'lucide-react'
import { api, ApiError } from '../../api'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { Button, PageHeader, Spinner, useToast } from '../../components/ui'

type Platform = {
  telegram_username: string; smtp_host: string; smtp_port: string; smtp_user: string; smtp_from: string
  google_client_id: string; google_redirect: string; ai_provider: 'gemini' | 'claude' | 'auto'; gemini_model: string
  smtp_password_set: boolean; google_client_secret_set: boolean; anthropic_api_key_set: boolean; gemini_api_key_set: boolean
  claude_model: string; claude_model_creative: string; claude_models: { id: string; input: number; output: number }[]
  ai_alert_tjs: number; usd_tjs: number
}
type UsageRow = { provider: string; model: string; task: string; requests: number; avg_input: number; avg_output: number; cost_usd: number; per_1000_usd: number }

/** AI xarajati: oxirgi 30 kun, model va vazifa bo'yicha; 1000 ta so'rovning o'rtacha narxi. */
function AiUsage() {
  const { t } = useI18n()
  type Usage = { items: UsageRow[]; total_usd: number; month_usd: number; month_tjs: number; alert_tjs: number }
  const [u, setU] = useState<Usage | null>(null)
  useEffect(() => { api.get<Usage>('/api/admin/ai-usage?days=30').then(setU).catch(() => {}) }, [])
  if (!u) return null
  const over = u.alert_tjs > 0 && u.month_tjs >= u.alert_tjs
  return (
    <div className="rounded-xl border border-line">
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 text-[13px] ${over ? 'bg-brand-50' : 'bg-soft/60'}`}>
        <span>{t('adm.ai.month')}: <b className={over ? 'text-brand-700' : 'text-ink'}>{u.month_tjs.toFixed(2)} c.</b> <span className="text-ink-4">(${u.month_usd.toFixed(2)})</span></span>
        <span className="text-ink-3">{u.alert_tjs > 0 ? t('adm.ai.alert_at', { n: u.alert_tjs }) : t('adm.ai.alert_off')}</span>
      </div>
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5 text-[13px]">
        <b>{t('adm.ai.usage')}</b><span className="text-ink-3">{t('adm.ai.total')}: <b className="text-ink">${u.total_usd.toFixed(2)}</b></span>
      </div>
      {!u.items.length ? <div className="px-3.5 py-4 text-[13px] text-ink-4">{t('adm.ai.none')}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-ink-4"><tr>
              <th className="px-3.5 py-2 font-semibold">{t('adm.ai.model')}</th><th className="px-2 py-2 font-semibold">{t('adm.ai.requests')}</th>
              <th className="px-2 py-2 font-semibold">{t('adm.ai.tokens')}</th><th className="px-2 py-2 font-semibold">{t('adm.ai.spent')}</th>
              <th className="px-3.5 py-2 text-right font-semibold">{t('adm.ai.per1000')}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {u.items.map(r => (
                <tr key={`${r.provider}${r.model}${r.task}`}>
                  <td className="px-3.5 py-2"><div className="font-semibold">{r.model}</div><div className="text-ink-4">{t(r.task === 'creative' ? 'adm.ai.task_creative' : 'adm.ai.task_chat')}</div></td>
                  <td className="px-2 py-2 tabular-nums">{r.requests}</td>
                  <td className="px-2 py-2 tabular-nums text-ink-3">{r.avg_input} / {r.avg_output}</td>
                  <td className="px-2 py-2 tabular-nums">{r.provider === 'gemini' ? '—' : `$${r.cost_usd.toFixed(3)}`}</td>
                  <td className="px-3.5 py-2 text-right font-bold tabular-nums">{r.provider === 'gemini' ? t('adm.ai.free') : `$${r.per_1000_usd.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
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
      google_client_id: r.google_client_id, smtp_password: '', google_client_secret: '', anthropic_api_key: '',
      ai_provider: r.ai_provider, gemini_model: r.gemini_model, gemini_api_key: '',
      claude_model: r.claude_model, claude_model_creative: r.claude_model_creative,
      ai_alert_tjs: String(r.ai_alert_tjs), usd_tjs: String(r.usd_tjs) })
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
  const testAi = async () => {
    setBusy('testai')
    try {
      const r = await api.post<{ answer: string }>('/api/admin/platform/test-ai', {})
      toast(`✅ ${r.answer}`)
    } catch (e) {
      toast(e instanceof ApiError ? `${t('err.ai_failed')} ${e.detail ?? ''}` : t('common.error'), 'error')
    } finally { setBusy('') }
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

        <Section icon={<Sparkles className="h-4 w-4 text-[#d97757]" />} title={t('adm.pl.ai')}>
          <div>
            <span className="label">{t('adm.pl.provider')}</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['auto', 'gemini', 'claude'] as const).map(pv => (
                <button key={pv} type="button" onClick={() => set('ai_provider')(pv)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-semibold ${form.ai_provider === pv ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line hover:bg-soft'}`}>
                  {pv === 'gemini' ? t('adm.pl.gemini') : pv === 'auto' ? 'Gemini → Claude' : 'Claude (Anthropic)'}
                </button>
              ))}
            </div>
          </div>
          {form.ai_provider === 'auto' && <div className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-emerald-900">{t('adm.ai.auto_hint')}</div>}
          {form.ai_provider !== 'claude' && (
            <>
              <p className="text-[13px] leading-relaxed text-ink-3">{t('adm.pl.gemini_hint')}</p>
              <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-amber-900">{t('adm.pl.free_note')}</div>
              <Secret label={t('adm.pl.key')} isSet={p.gemini_api_key_set} value={form.gemini_api_key} onChange={set('gemini_api_key')} />
              {input('gemini_model', t('adm.pl.model'), 'gemini-flash-lite-latest')}
            </>
          )}
          {form.ai_provider !== 'gemini' && (
            <>
              <p className="text-[13px] leading-relaxed text-ink-3">{t('adm.pl.ai_hint')}</p>
              <Secret label={t('adm.pl.key')} isSet={p.anthropic_api_key_set} value={form.anthropic_api_key} onChange={set('anthropic_api_key')} />
              <div className="grid gap-3 sm:grid-cols-2">
                {(['claude_model', 'claude_model_creative'] as const).map(k => (
                  <label key={k} className="block"><span className="label">{t(k === 'claude_model' ? 'adm.ai.model_chat' : 'adm.ai.model_creative')}</span>
                    <select className="input" value={form[k] ?? ''} onChange={e => set(k)(e.target.value)}>
                      {p.claude_models.map(m => <option key={m.id} value={m.id}>{m.id} · ${m.input} / ${m.output}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <p className="text-[12px] text-ink-4">{t('adm.ai.price_hint')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {input('ai_alert_tjs', t('adm.ai.alert'), '20')}
                {input('usd_tjs', t('adm.ai.rate'), '11')}
              </div>
              <p className="text-[12px] text-ink-4">{t('adm.ai.alert_hint')}</p>
            </>
          )}
          <AiUsage />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save('ai', ['ai_provider', 'gemini_model', 'gemini_api_key', 'anthropic_api_key', 'claude_model', 'claude_model_creative', 'ai_alert_tjs', 'usd_tjs'])} loading={busy === 'ai'}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={testAi} loading={busy === 'testai'} disabled={!(form.ai_provider === 'gemini' ? p.gemini_api_key_set : form.ai_provider === 'claude' ? p.anthropic_api_key_set : p.gemini_api_key_set || p.anthropic_api_key_set)}>{t('adm.pl.test_ai')}</Button>
          </div>
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
