import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MailCheck, Send } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Logo } from '../components/Logo'
import { Button, LangSwitch } from '../components/ui'
import { telegramAppLink } from '../components/Plan'

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="flex min-h-screen flex-col px-6 py-6 sm:px-12">
      <div className="flex items-center justify-between"><Link to="/"><Logo size={28} /></Link><LangSwitch /></div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{title}</h1>
        {sub && <p className="mt-1.5 text-[15px] text-ink-3">{sub}</p>}
        <div className="mt-8">{children}</div>
        <Link to="/login" className="mt-6 text-center text-[14px] font-semibold text-brand-600">{t('auth.back_login')}</Link>
      </div>
    </div>
  )
}

export function Forgot() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'no_email'>('idle')
  const [tg, setTg] = useState('')
  const [google, setGoogle] = useState(false)
  useEffect(() => {
    api.get<{ telegram: string; google: boolean }>('/api/auth/config').then(r => { setTg(r.telegram); setGoogle(r.google) }).catch(() => {})
  }, [])
  const googleBtn = google && (
    <a href="/auth/google" className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white text-[14.5px] font-semibold hover:bg-soft">
      <span className="text-[17px] font-bold text-[#4285F4]">G</span>{t('auth.google')}
    </a>
  )
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setState('busy')
    try {
      const r = await api.post<{ sent: boolean }>('/api/auth/forgot', { email })
      setState(r.sent ? 'sent' : 'no_email')
    } catch { setState('idle') }
  }
  return (
    <Shell title={t('auth.forgot.title')} sub={t('auth.forgot.sub')}>
      {state === 'sent' ? (
        <div className="flex gap-3 rounded-2xl bg-emerald-50 p-4 text-[14px] text-emerald-800"><MailCheck className="h-5 w-5 shrink-0" />{t('auth.forgot.sent')}</div>
      ) : state === 'no_email' ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-amber-50 p-4 text-[14px] text-amber-900">{t('auth.forgot.no_email')}</div>
          {googleBtn}
          {tg && <a href={telegramAppLink(tg, `ChatFlow: ${email}`)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#229ED9] text-[14px] font-semibold text-white"><Send className="h-4 w-4" />@{tg}</a>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><span className="label">{t('auth.email')}</span>
            <input type="email" required className="input h-11" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
          <Button type="submit" size="lg" className="w-full" loading={state === 'busy'}>{t('auth.forgot.btn')}</Button>
          {google && <div className="flex items-center gap-3 pt-2 text-[12px] uppercase tracking-wider text-ink-4"><span className="h-px flex-1 bg-line" />{t('auth.or')}<span className="h-px flex-1 bg-line" /></div>}
          {googleBtn}
        </form>
      )}
    </Shell>
  )
}

export function Reset() {
  const { t } = useI18n()
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/reset', { token: params.get('token') || '', password })
      await refresh()
      navigate('/app')
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      setError(['token_invalid', 'password_short'].includes(code) ? t(`err.${code}` as TKey) : t('common.error'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell title={t('auth.reset.title')}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block"><span className="label">{t('set.new_pw')}</span>
          <input type="password" required minLength={8} className="input h-11" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          <p className="hint">{t('auth.password_hint')}</p></label>
        {error && <div className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13.5px] font-medium text-brand-700">{error}</div>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t('auth.reset.btn')}</Button>
      </form>
    </Shell>
  )
}
