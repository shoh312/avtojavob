import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Logo } from '../components/Logo'
import { Button, LangSwitch } from '../components/ui'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t, lang } = useI18n()
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const reg = mode === 'register'
  const [params] = useSearchParams()
  const [google, setGoogle] = useState(false)
  useEffect(() => { api.get<{ google: boolean }>('/api/auth/config').then(r => setGoogle(r.google)).catch(() => {}) }, [])
  useEffect(() => {
    const e = params.get('error')
    if (e) setError(e === 'blocked' ? t('err.blocked') : t('err.google'))
  }, [params, t])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.post(`/api/auth/${mode}`, { ...form, lang })
      await refresh()
      navigate('/app')
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'error'
      const known = ['email_invalid', 'password_short', 'email_taken', 'login_failed', 'password_wrong', 'blocked']
      setError(known.includes(code) ? t(`err.${code}` as TKey) : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <Link to="/"><Logo size={28} /></Link>
          <LangSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t(reg ? 'auth.register.title' : 'auth.login.title')}</h1>
          <p className="mt-1.5 text-[15px] text-ink-3">{t(reg ? 'auth.register.sub' : 'auth.login.sub')}</p>
          {google && (
            <div className="mt-8">
              <a href="/auth/google" className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white text-[14.5px] font-semibold hover:bg-soft">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                {t('auth.google')}
              </a>
              <div className="my-6 flex items-center gap-3 text-[12px] uppercase tracking-wider text-ink-4"><span className="h-px flex-1 bg-line" />{t('auth.or')}<span className="h-px flex-1 bg-line" /></div>
            </div>
          )}
          <form onSubmit={submit} className={`${google ? '' : 'mt-8 '}space-y-4`}>
            {reg && (
              <label className="block"><span className="label">{t('auth.name')}</span>
                <input className="input h-11" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
            )}
            <label className="block"><span className="label">{t('auth.email')}</span>
              <input className="input h-11" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
            <label className="block"><span className="label">{t('auth.password')}</span>
              <input className="input h-11" type="password" required minLength={reg ? 8 : undefined} value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} autoComplete={reg ? 'new-password' : 'current-password'} />
              {reg ? <p className="hint">{t('auth.password_hint')}</p>
                : <Link to="/forgot" className="mt-1.5 inline-block text-[13px] font-medium text-brand-600 hover:text-brand-700">{t('auth.forgot')}</Link>}</label>
            {error && <div className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13.5px] font-medium text-brand-700">{error}</div>}
            <Button type="submit" size="lg" loading={busy} className="w-full">{t(reg ? 'auth.register.btn' : 'auth.login.btn')}</Button>
          </form>
          <p className="mt-6 text-center text-[14px] text-ink-3">
            {t(reg ? 'auth.have_account' : 'auth.no_account')}{' '}
            <Link to={reg ? '/login' : '/register'} className="font-semibold text-brand-600 hover:text-brand-700">
              {t(reg ? 'auth.login.btn' : 'auth.register.btn')}
            </Link>
          </p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-black lg:block">
        <img src="/brand/logo-glow.png" alt="ChatFlow" className="absolute inset-0 h-full w-full object-cover opacity-95" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-12">
          <p className="max-w-md text-[22px] font-bold leading-snug text-white">{t('land.sub')}</p>
        </div>
      </div>
    </div>
  )
}
