import { useEffect, useState } from 'react'
import { Check, Crown, Gift, MessageCircle, Send } from 'lucide-react'
import { api, type PlanKey, type Plans } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { PageHeader, Spinner, useToast } from '../components/ui'
import { PlanBadge, planStatus, telegramLink } from '../components/Plan'

const FEATURES: Record<PlanKey, TKey[]> = {
  trial: ['bill.accounts1', 'bill.f_flows', 'bill.f_all', 'bill.f_contacts'],
  pro: ['bill.accounts1', 'bill.f_flows', 'bill.f_all', 'bill.f_contacts', 'bill.f_stats'],
  business: ['bill.accounts3', 'bill.f_flows', 'bill.f_all', 'bill.f_contacts', 'bill.f_stats', 'bill.f_priority'],
}

export default function Billing() {
  const { t, lang } = useI18n()
  const toast = useToast()
  const { me } = useAuth()
  const [data, setData] = useState<Plans | null>(null)
  useEffect(() => { api.get<Plans>('/api/plans').then(setData).catch(() => {}) }, [])
  if (!data || !me) return <Spinner />

  const cur = data.current
  const date = new Date(cur.expires_at).toLocaleDateString(lang === 'tj' ? 'ru' : lang)
  const buy = (key: PlanKey) => {
    if (!data.telegram) return toast(t('bill.no_tg'), 'error')
    const name = t(`plan.${key}` as TKey)
    window.open(telegramLink(data.telegram, t('bill.tg_msg', { plan: name, email: me.user.email })), '_blank', 'noopener')
  }

  return (
    <>
      <PageHeader title={t('bill.title')} sub={t('bill.sub')} />

      <div className="card mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Crown className="h-6 w-6" /></span>
        <div className="flex-1">
          <div className="text-[13px] text-ink-3">{t('bill.current')}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-[19px] font-extrabold tracking-tight">{t(`plan.${cur.plan}` as TKey)}</span>
            <PlanBadge status={cur.unlimited ? cur.plan : planStatus(cur)} />
          </div>
          <div className="mt-0.5 text-[13px] text-ink-3">
            {cur.unlimited ? t('bill.unlimited') : cur.active ? `${t('bill.until', { d: date })} · ${t('adm.days_left', { n: cur.days_left })}` : t('banner.expired')}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {data.plans.map(p => {
          const popular = p.key === 'pro'
          const isCurrent = cur.plan === p.key && cur.active
          return (
            <div key={p.key} className={`relative flex flex-col rounded-3xl border p-6 ${p.key === 'business' ? 'border-ink bg-ink text-white' : popular ? 'border-brand-500 bg-white shadow-[0_20px_50px_-24px_rgba(229,22,31,.45)]' : 'border-line bg-white'}`}>
              {popular && <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-white">{t('bill.popular')}</span>}
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-bold">{p.key === 'trial' ? t('bill.trial_name') : t(`plan.${p.key}` as TKey)}</span>
                {isCurrent && <span className={`chip ${p.key === 'business' ? 'bg-white/10 text-white' : 'bg-emerald-50 text-emerald-700'}`}>{t('bill.current_badge')}</span>}
              </div>
              <div className="mt-5 flex items-baseline gap-1.5">
                {p.price === 0
                  ? <span className="text-[38px] font-extrabold tracking-tight">{t('bill.free')}</span>
                  : <><span className="text-[44px] font-extrabold tabular-nums tracking-tight">{p.price}</span>
                      <span className={`text-[14px] font-medium ${p.key === 'business' ? 'text-white/60' : 'text-ink-3'}`}>{t('bill.cur')} {t('bill.per_month')}</span></>}
              </div>
              {p.key === 'trial' && <p className="mt-2 text-[13px] text-ink-3">{t('bill.trial_d', { n: data.trial_days })}</p>}
              <ul className="mt-6 flex-1 space-y-3">
                {FEATURES[p.key].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px]">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.key === 'business' ? 'text-brand-400' : 'text-brand-600'}`} />{t(f)}
                  </li>
                ))}
              </ul>
              {p.key === 'trial' ? (
                <div className="mt-8 flex h-11 items-center justify-center gap-2 rounded-xl bg-soft text-[14px] font-semibold text-ink-3"><Gift className="h-4 w-4" />{t('bill.trial_name')}</div>
              ) : (
                <button onClick={() => buy(p.key)}
                  className={`mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition ${p.key === 'business' ? 'bg-white text-ink hover:bg-brand-50' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
                  <Send className="h-4 w-4" />{isCurrent ? t('bill.extend') : t('bill.buy')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="card mt-8 p-6">
        <h3 className="flex items-center gap-2 text-[15px] font-bold"><MessageCircle className="h-4 w-4 text-brand-600" />{t('bill.how')}</h3>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {(['bill.how1', 'bill.how2', 'bill.how3'] as const).map((k, i) => (
            <li key={k} className="flex gap-3 text-[14px] text-ink-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-[13px] font-bold text-white">{i + 1}</span>{t(k)}
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
