import { Link } from 'react-router-dom'
import { ArrowRight, AtSign, BarChart3, GitBranch, MessageCircle, MessageSquareText, MousePointerClick, ShieldCheck, Users, Workflow, Zap } from 'lucide-react'
import { useI18n, type TKey } from '../i18n'
import { useAuth } from '../auth'
import { Logo, LogoMark } from '../components/Logo'
import { LangSwitch } from '../components/ui'

const FEATURES: { icon: typeof Zap; t: TKey; d: TKey }[] = [
  { icon: Workflow, t: 'land.f1.t', d: 'land.f1.d' },
  { icon: MessageCircle, t: 'land.f2.t', d: 'land.f2.d' },
  { icon: ShieldCheck, t: 'land.f3.t', d: 'land.f3.d' },
  { icon: Users, t: 'land.f4.t', d: 'land.f4.d' },
  { icon: AtSign, t: 'land.f5.t', d: 'land.f5.d' },
  { icon: BarChart3, t: 'land.f6.t', d: 'land.f6.d' },
]

/** Bosh sahifadagi jonli ssenariy namoyishi: Izoh -> Xabar -> Shart */
function HeroFlow() {
  const { t } = useI18n()
  return (
    <div className="relative mx-auto h-[400px] w-full max-w-[560px] select-none">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 560 400" fill="none" aria-hidden>
        <path d="M232 92 C 290 92, 270 196, 318 196" stroke="#e5161f" strokeWidth="2" strokeDasharray="6 5" className="animate-dash" />
        <path d="M232 262 C 268 262, 262 300, 300 316" stroke="#d4d4dc" strokeWidth="2" />
      </svg>
      {/* izoh */}
      <div className="absolute left-0 top-6 w-[232px] animate-float rounded-[18px] border border-line bg-white p-3.5 shadow-node">
        <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white"><Zap className="h-4 w-4" /></span>
          <span className="text-[13px] font-semibold">{t('trig.comment')}</span></div>
        <div className="mt-3 flex items-start gap-2">
          <span className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-brand-300 to-brand-600" />
          <div className="rounded-2xl rounded-tl-md bg-soft px-3 py-2 text-[13px]"><b>@aziza</b> {t('land.demo.comment')}</div>
        </div>
        <div className="ml-9 mt-1.5 text-[12px] text-ink-3">↳ {t('land.demo.reply')}</div>
      </div>
      {/* xabar */}
      <div className="absolute right-0 top-[132px] w-[244px] rounded-[18px] border border-line bg-white p-3.5 shadow-pop" style={{ animation: 'float 5s ease-in-out 1.2s infinite' }}>
        <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-white"><MessageSquareText className="h-4 w-4" /></span>
          <span className="text-[13px] font-semibold">Direct</span></div>
        <div className="mt-3 rounded-2xl rounded-tl-md bg-soft px-3 py-2 text-[13px]">{t('land.demo.dm')}</div>
        <div className="mt-2 space-y-1.5">
          {['Katalog', 'WhatsApp'].map(b => (
            <div key={b} className="flex items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[12.5px] font-semibold text-sky-700"><MousePointerClick className="h-3 w-3" />{b}</div>
          ))}
        </div>
      </div>
      {/* shart */}
      <div className="absolute bottom-6 left-10 w-[200px] rounded-[18px] border border-line bg-white p-3.5 shadow-node" style={{ animation: 'float 5s ease-in-out 2.4s infinite' }}>
        <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f59e0b] text-white"><GitBranch className="h-4 w-4" /></span>
          <span className="text-[13px] font-semibold">{t('insp.check.follows')}</span></div>
        <div className="mt-2.5 flex gap-2 text-[12px] font-semibold"><span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">{t('node.yes')}</span><span className="rounded-md bg-brand-50 px-2 py-0.5 text-brand-700">{t('node.no')}</span></div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { t } = useI18n()
  const { me } = useAuth()
  const cta = me ? '/app' : '/register'
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/"><Logo size={30} /></Link>
          <nav className="hidden items-center gap-1 text-[14px] font-medium text-ink-2 md:flex">
            <a href="#features" className="rounded-lg px-3 py-2 hover:bg-soft">{t('land.nav.features')}</a>
            <a href="#how" className="rounded-lg px-3 py-2 hover:bg-soft">{t('land.nav.how')}</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <LangSwitch />
            {!me && <Link to="/login" className="hidden rounded-lg px-3 py-2 text-[14px] font-semibold text-ink-2 hover:bg-soft sm:block">{t('land.login')}</Link>}
            <Link to={cta} className="rounded-xl bg-brand-600 px-4 py-2 text-[14px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(229,22,31,.55)] hover:bg-brand-700">
              {me ? 'Dashboard' : t('land.start')}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-100/60 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div className="relative animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[12.5px] font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />{t('land.badge')}
            </span>
            <h1 className="mt-6 text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[58px]">
              {t('land.title1')} <span className="text-brand-600">{t('land.title2')}</span> {t('land.title3')}
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-3">{t('land.sub')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={cta} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(229,22,31,.6)] hover:bg-brand-700">
                {t('land.cta')}<ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="inline-flex h-12 items-center justify-center rounded-xl border border-line px-6 text-[15px] font-semibold hover:bg-soft">{t('land.cta2')}</a>
            </div>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-ink-3"><ShieldCheck className="h-4 w-4 text-emerald-500" />{t('land.trust')}</p>
          </div>
          <HeroFlow />
        </div>
      </section>

      <section id="features" className="border-t border-line bg-soft py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="max-w-xl text-[32px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[40px]">{t('land.f.title')}</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, t: tk, d }) => (
              <div key={tk} className="rounded-3xl border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-pop">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-[17px] font-bold">{t(tk)}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{t(d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-[32px] font-extrabold tracking-[-0.03em] sm:text-[40px]">{t('land.how.title')}</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {([['land.how1.t', 'land.how1.d'], ['land.how2.t', 'land.how2.d'], ['land.how3.t', 'land.how3.d']] as [TKey, TKey][]).map(([a, b], i) => (
              <div key={a} className="relative">
                <span className="text-[56px] font-extrabold italic leading-none tracking-tight text-brand-600/15">0{i + 1}</span>
                <h3 className="-mt-4 text-[19px] font-bold">{t(a)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{t(b)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-ink px-8 py-14 text-white sm:px-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl" />
          <LogoMark size={72} className="absolute right-10 top-1/2 hidden -translate-y-1/2 text-ink opacity-90 md:block" />
          <h2 className="relative max-w-xl text-[30px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[38px]">{t('land.band.t')}</h2>
          <p className="relative mt-3 text-[16px] text-white/70">{t('land.band.d')}</p>
          <Link to={cta} className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-semibold hover:bg-brand-500">
            {t('land.cta')}<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-[13px] text-ink-3 sm:flex-row sm:px-6">
          <div className="flex items-center gap-3"><Logo size={22} /><span>© {new Date().getFullYear()}</span></div>
          <div className="flex gap-5">
            <a href="/privacy" className="hover:text-ink">Privacy</a>
            <a href="/terms" className="hover:text-ink">Terms</a>
            <a href="/data-deletion" className="hover:text-ink">Data deletion</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
