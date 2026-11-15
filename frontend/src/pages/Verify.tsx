import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, MailCheck } from 'lucide-react'
import { api, ApiError, type User } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Logo } from '../components/Logo'
import { LangSwitch, useToast } from '../components/ui'
import { OtpInput } from '../components/AppLayout'

/** Kirish/ro'yxatdan o'tishdan keyin — email 6 xonali kod bilan tasdiqlanmaguncha panelga o'tilmaydi. */
export default function Verify() {
  const { t } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const { me, setMe } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)

  // sahifa ochilganda kod yuboriladi (yaqinda yuborilgan bo'lsa — server faqat kutish vaqtini qaytaradi)
  useEffect(() => {
    if (!me?.verify_required) return
    api.post<{ ok: boolean; wait?: number }>('/api/auth/verify/send').then(r => setWait(r.wait || 0)).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (wait <= 0) return
    const id = window.setTimeout(() => setWait(w => w - 1), 1000)
    return () => window.clearTimeout(id)
  }, [wait])

  if (!me) return <Navigate to="/login" replace />
  if (!me.verify_required) return <Navigate to={me.user.onboarding?.pending ? '/welcome' : '/app'} replace />

  const submit = async (c = code) => {
    if (c.length !== 6 || busy) return
    setBusy(true); setError('')
    try {
      const r = await api.post<{ user: User }>('/api/auth/verify', { code: c })
      setMe({ ...me, user: r.user, verify_required: false })
      toast(t('verify.ok'))
      navigate(r.user.onboarding?.pending ? '/welcome' : '/app', { replace: true })
    } catch (e) {
      const k = e instanceof ApiError ? e.code : ''
      setError(['code_invalid', 'code_expired', 'code_too_many'].includes(k) ? t(`err.${k}` as TKey) : t('common.error'))
      setCode('')
    } finally { setBusy(false) }
  }
  const resend = async () => {
    try {
      const r = await api.post<{ ok: boolean; wait?: number }>('/api/auth/verify/send')
      setWait(r.wait || 60); setError(''); setCode('')
      if (r.ok) toast(t('verify.sent'))
    } catch { toast(t('common.error'), 'error') }
  }
  const logout = async () => { await api.post('/api/auth/logout'); setMe(null); navigate('/login', { replace: true }) }

  return (
    <div className="flex min-h-dvh flex-col bg-soft">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo size={28} />
        <LangSwitch />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="animate-fade-up w-full max-w-[440px] rounded-[28px] border border-line bg-white p-7 text-center shadow-pop sm:p-9">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand-50 text-brand-600"><MailCheck className="h-8 w-8" /></span>
          <h1 className="mt-5 text-[26px] font-extrabold tracking-[-0.03em]">{t('verify.code_t')}</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{t('verify.code_lead')}</p>
          <div className="mx-auto mt-1 max-w-full truncate text-[15px] font-bold">{me.user.email}</div>

          <div className="mt-7 flex justify-center">
            <OtpInput value={code} onChange={v => { setCode(v); setError('') }} onDone={submit} disabled={busy} autoFocus />
          </div>
          {error && <div className="mt-3 text-[13.5px] font-semibold text-brand-700">{error}</div>}

          <button disabled={busy || code.length !== 6} onClick={() => submit()}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(229,22,31,.6)] transition hover:bg-brand-700 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('verify.confirm')}
          </button>

          <div className="mt-5 text-[13.5px] text-ink-3">
            {wait > 0 ? t('verify.resend_in', { s: `0:${String(wait).padStart(2, '0')}` })
              : <button onClick={resend} className="font-semibold text-brand-600 hover:text-brand-700">{t('verify.resend')}</button>}
          </div>
          <p className="mt-2 text-[12.5px] text-ink-4">{t('verify.spam')}</p>
        </div>
      </main>
      <footer className="pb-6 text-center">
        <button onClick={logout} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" />{t('verify.other')}
        </button>
      </footer>
    </div>
  )
}
