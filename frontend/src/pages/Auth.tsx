import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
      const known = ['email_invalid', 'password_short', 'email_taken', 'login_failed', 'password_wrong']
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
          <form onSubmit={submit} className="mt-8 space-y-4">
            {reg && (
              <label className="block"><span className="label">{t('auth.name')}</span>
                <input className="input h-11" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
            )}
            <label className="block"><span className="label">{t('auth.email')}</span>
              <input className="input h-11" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
            <label className="block"><span className="label">{t('auth.password')}</span>
              <input className="input h-11" type="password" required minLength={reg ? 8 : undefined} value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} autoComplete={reg ? 'new-password' : 'current-password'} />
              {reg && <p className="hint">{t('auth.password_hint')}</p>}</label>
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
