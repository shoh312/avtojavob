import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Camera, Check, CreditCard, Eye, EyeOff, Globe2, KeyRound, Loader2, LogOut, MailWarning, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { LANGS, useI18n, type Lang, type TKey } from '../i18n'
import { Avatar, Button, useToast } from '../components/ui'
import { PlanBadge, planStatus } from '../components/Plan'
import { uploadImage } from './Products'
import { MONTHS } from './Activity'

const SECTIONS = [
  { id: 'profile', icon: UserRound, label: 'set.profile' },
  { id: 'language', icon: Globe2, label: 'set.language' },
  { id: 'security', icon: ShieldCheck, label: 'set2.security' },
  { id: 'plan', icon: CreditCard, label: 'set2.plan' },
  { id: 'account', icon: LogOut, label: 'set2.account' },
] as const

const HELLO: Record<Lang, string> = { uz: 'Salom!', ru: 'Привет!', tj: 'Салом!', en: 'Hello!' }

function Card({ id, icon, title, sub, children }: { id: string; icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-3xl border border-line bg-white p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-soft text-ink-2">{icon}</span>
        <div><h2 className="text-[16px] font-bold leading-tight">{title}</h2>{sub && <p className="mt-0.5 text-[12.5px] text-ink-3">{sub}</p>}</div>
      </div>
      {children}
    </section>
  )
}

function PwInput({ value, onChange, placeholder, auto }: { value: string; onChange: (v: string) => void; placeholder: string; auto: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input className="input pr-10" type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} autoComplete={auto} />
      <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-ink-4 hover:bg-soft hover:text-ink">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function strength(p: string) {
  if (!p) return 0
  let s = p.length >= 8 ? 1 : 0
  if (p.length >= 12) s++
  if (/\d/.test(p) && /[a-zа-яё]/i.test(p)) s++
  if (/[^a-z0-9а-яё]/i.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) s++
  return Math.max(1, s)
}

export default function Settings() {
  const { t, lang, setLang } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const { me, refresh, setMe } = useAuth()
  const user = me?.user
  const [name, setName] = useState(user?.name || '')
  const [pw, setPw] = useState({ password: '', new_password: '' })
  const [busy, setBusy] = useState('')
  const [active, setActive] = useState<string>('profile')
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => { setName(user?.name || '') }, [user?.name])
  useEffect(() => {
    const els = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(es => {
      const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (v) setActive(v.target.id)
    }, { rootMargin: '-10% 0px -60% 0px' })
    els.forEach(e => io.observe(e))
    return () => io.disconnect()
  }, [])
  if (!user) return null

  const fail = (e: unknown) => toast(e instanceof ApiError ? t(`err.${e.code}` as TKey) : t('common.error'), 'error')
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn() } catch (e) { fail(e) } finally { setBusy('') } }

  const changeLang = (l: Lang) => run('lang', async () => { setLang(l); await api.patch('/api/me', { lang: l }); await refresh() })
  const saveName = () => run('name', async () => { await api.patch('/api/me', { name }); await refresh(); toast(t('set.saved')) })
  const savePw = () => run('pw', async () => { await api.patch('/api/me', pw); setPw({ password: '', new_password: '' }); toast(t('set2.pw_ok')) })
  const pickAvatar = (f: File | undefined) => f && run('avatar', async () => {
    const up = await uploadImage(f)
    await api.patch('/api/me', { avatar: up.image })
    await refresh()
    toast(t('set2.avatar_ok'))
  })
  const removeAvatar = () => run('avatar', async () => { await api.patch('/api/me', { avatar: '' }); await refresh() })
  const logout = async () => { await api.post('/api/auth/logout'); setMe(null); navigate('/') }

  const sPw = strength(pw.new_password)
  const plan = user.plan
  const created = user.created_at ? new Date(user.created_at) : null
  const since = created ? `${(MONTHS[lang] || MONTHS.en)[created.getMonth()]} ${created.getFullYear()}` : ''

  return (
    <>
      {/* profil sarlavhasi */}
      <div className="relative mb-6 overflow-hidden rounded-[28px] border border-line bg-white">
        <div className="h-28 bg-[radial-gradient(circle_at_20%_0%,#ffe1e3,transparent_55%),radial-gradient(circle_at_90%_120%,#fde7f1,transparent_50%)]"
          style={{ backgroundColor: '#fff6f6' }}>
          <svg className="h-full w-full opacity-[.35]" preserveAspectRatio="none" viewBox="0 0 400 100"><path d="M0 70 C 80 30, 160 100, 240 60 S 360 20, 400 50" fill="none" stroke="#e5161f" strokeWidth="1.2" strokeDasharray="4 6" /></svg>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="relative -mt-12 w-fit">
            <div className="rounded-full bg-white p-1 shadow-[0_12px_30px_-12px_rgba(20,20,30,.35)]">
              <Avatar name={user.name || user.email} src={user.avatar_url || null} size={96} />
            </div>
            <button onClick={() => file.current?.click()} disabled={busy === 'avatar'} title={t('set2.avatar_change')}
              className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-ink text-white ring-4 ring-white transition hover:bg-black disabled:opacity-60">
              {busy === 'avatar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { pickAvatar(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[24px] font-bold tracking-tight">{user.name || user.email.split('@')[0]}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
              <span className="truncate">{user.email}</span>
              {user.email_verified ? <span className="chip bg-emerald-50 text-emerald-700"><BadgeCheck className="mr-1 h-3 w-3" />{t('set2.verified')}</span>
                : <span className="chip bg-amber-50 text-amber-700"><MailWarning className="mr-1 h-3 w-3" />{t('set2.unverified')}</span>}
              <span className="chip">{user.role === 'manager' ? t('team.role_manager') : t('set2.owner')}</span>
              {user.role !== 'manager' && <PlanBadge status={planStatus(plan)} />}
            </div>
            {since && <div className="mt-1 text-[12px] text-ink-4">{t('set2.since', { date: since })}</div>}
          </div>
          {user.avatar_url && (
            <button onClick={removeAvatar} className="inline-flex items-center gap-1.5 self-start rounded-xl px-3 py-2 text-[12.5px] font-semibold text-ink-3 hover:bg-soft hover:text-brand-700 sm:self-end">
              <Trash2 className="h-3.5 w-3.5" />{t('set2.avatar_remove')}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
        {/* bo'limlar */}
        <nav className="hidden lg:block">
          <div className="sticky top-6 space-y-0.5">
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium transition ${active === s.id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-soft'}`}>
                <s.icon className="h-4 w-4" />{t(s.label as TKey)}
              </a>
            ))}
          </div>
        </nav>

        <div className="max-w-2xl space-y-5">
          <Card id="profile" icon={<UserRound className="h-4 w-4" />} title={t('set.profile')} sub={t('set2.profile_d')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="label">{t('auth.name')}</span>
                <input className="input" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
              <label className="block"><span className="label">{t('auth.email')}</span>
                <input className="input bg-soft text-ink-3" value={user.email} disabled /></label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={user.name || user.email} src={user.avatar_url || null} size={36} />
                <div className="text-[12.5px] leading-snug text-ink-3">{t('set2.avatar_d')}</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => file.current?.click()} loading={busy === 'avatar'}><Camera className="h-3.5 w-3.5" />{t('set2.avatar_change')}</Button>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={saveName} disabled={name.trim() === (user.name || '')} loading={busy === 'name'}>{t('common.save')}</Button>
            </div>
          </Card>

          <Card id="language" icon={<Globe2 className="h-4 w-4" />} title={t('set.language')} sub={t('set2.lang_d')}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {LANGS.map(l => {
                const on = lang === l.code
                return (
                  <button key={l.code} onClick={() => changeLang(l.code)}
                    className={`relative flex flex-col items-start rounded-2xl border p-3.5 text-left transition ${on ? 'border-ink bg-ink text-white' : 'border-line hover:border-[#cfcfd6] hover:bg-soft'}`}>
                    <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${on ? 'bg-white/15' : 'bg-soft text-ink-3'}`}>{l.code.toUpperCase()}</span>
                    <span className="mt-3 text-[14px] font-semibold">{l.label}</span>
                    <span className={`text-[12px] ${on ? 'text-white/60' : 'text-ink-4'}`}>{HELLO[l.code]}</span>
                    {on && <Check className="absolute right-3 top-3 h-4 w-4" />}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card id="security" icon={<ShieldCheck className="h-4 w-4" />} title={t('set2.security')} sub={t('set2.security_d')}>
            {user.google && (
              <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-line px-4 py-3 text-[13px]">
                <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.4-4.8 3.4-8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z" /></svg>
                <span className="flex-1 font-medium">{t('set2.google')}</span><Check className="h-4 w-4 text-emerald-600" />
              </div>
            )}
            <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold"><KeyRound className="h-4 w-4 text-ink-3" />{t('set.password')}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PwInput value={pw.password} onChange={v => setPw({ ...pw, password: v })} placeholder={t('set.current_pw')} auto="current-password" />
              <div>
                <PwInput value={pw.new_password} onChange={v => setPw({ ...pw, new_password: v })} placeholder={t('set.new_pw')} auto="new-password" />
                {pw.new_password && (
                  <div className="mt-2">
                    <div className="flex gap-1">{[1, 2, 3, 4].map(i => (
                      <span key={i} className={`h-1 flex-1 rounded-full ${i <= sPw ? (sPw <= 1 ? 'bg-brand-500' : sPw === 2 ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-soft'}`} />
                    ))}</div>
                    <div className="mt-1 text-[11.5px] text-ink-4">{t(pw.new_password.length < 8 ? 'auth.password_hint' : sPw <= 2 ? 'set2.pw_ok_weak' : 'set2.pw_strong')}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={savePw} disabled={!pw.password || pw.new_password.length < 8} loading={busy === 'pw'}>{t('set2.pw_change')}</Button>
            </div>
          </Card>

          {user.role !== 'manager' && (
            <Card id="plan" icon={<CreditCard className="h-4 w-4" />} title={t('set2.plan')} sub={t('set2.plan_d')}>
              <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-[#1b1b22] to-[#2a1530] p-5 text-white sm:flex-row sm:items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-2"><span className="text-[20px] font-extrabold tracking-tight">{t(`plan.${planStatus(plan)}` as TKey)}</span></div>
                  <div className="mt-1 text-[12.5px] text-white/70">
                    {plan.unlimited ? t('set2.unlimited') : plan.active ? t('set2.days_left', { n: plan.days_left }) : t('set2.expired')}
                    {' · '}{t('set2.accounts', { n: plan.accounts_limit })}
                  </div>
                  {!plan.unlimited && plan.active && (
                    <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(4, (plan.days_left / 30) * 100))}%` }} />
                    </div>
                  )}
                </div>
                <Link to="/app/billing" className="inline-flex h-10 items-center gap-2 self-start rounded-xl bg-white px-4 text-[13.5px] font-semibold text-ink hover:bg-white/90 sm:self-center">
                  {t('set2.plan_go')}<ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          )}

          <Card id="account" icon={<LogOut className="h-4 w-4" />} title={t('set2.account')} sub={t('set2.account_d')}>
            <button onClick={logout} className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-200 px-4 text-[13.5px] font-semibold text-brand-700 transition hover:bg-brand-50">
              <LogOut className="h-4 w-4" />{t('nav.logout')}
            </button>
          </Card>
        </div>
      </div>
    </>
  )
}
