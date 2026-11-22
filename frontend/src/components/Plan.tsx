import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Gift } from 'lucide-react'
import { api, type PlanInfo, type PlanKey, type Plans } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'

export function telegramLink(username: string, text: string) {
  return `https://t.me/${encodeURIComponent(username)}?text=${encodeURIComponent(text)}`
}

/** Telegram ilovasini to'g'ridan-to'g'ri ochadi — t.me bloklangan tarmoqlarda ham ishlaydi. */
export function telegramAppLink(username: string, text: string) {
  return `tg://resolve?domain=${encodeURIComponent(username)}&text=${encodeURIComponent(text)}`
}

const PLAN_STYLE: Record<string, string> = {
  trial: 'bg-amber-50 text-amber-700',
  pro: 'bg-brand-50 text-brand-700',
  business: 'bg-ink text-white',
  expired: 'bg-soft text-ink-3',
  blocked: 'bg-brand-600 text-white',
}

export function PlanBadge({ plan, status }: { plan?: PlanKey; status?: string }) {
  const { t } = useI18n()
  const key = (status || plan || 'trial') as 'trial' | 'pro' | 'business' | 'expired' | 'blocked'
  return <span className={`chip ${PLAN_STYLE[key]}`}>{t(`plan.${key}`)}</span>
}

export const planStatus = (p: PlanInfo) => (p.active ? p.plan : 'expired')

/** Panel tepasidagi ogohlantirish: sinov davri yoki tarif tugagan. */
export function PlanBanner() {
  const { t } = useI18n()
  const { me } = useAuth()
  const p = me?.user.plan
  if (!p || p.unlimited) return null
  if (p.active && p.plan !== 'trial') return null
  const expired = !p.active
  return (
    <div className={`mb-5 flex items-center gap-3 rounded-2xl py-2 pl-3.5 pr-2 sm:mb-6 sm:px-4 sm:py-3 ${expired ? 'bg-brand-600 text-white' : 'border border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 text-[13px] font-medium leading-snug sm:text-[14px]">
        {expired ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Gift className="h-4 w-4 shrink-0" />}
        {expired ? t('banner.expired') : t('banner.trial', { n: p.days_left })}
      </div>
      <Link to="/app/billing" className={`inline-flex h-9 shrink-0 items-center justify-center rounded-xl px-3 text-[13px] font-semibold sm:px-4 ${expired ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-amber-900 text-white hover:bg-black'}`}>
        {t('banner.cta')}
      </Link>
    </div>
  )
}

/** Menyu pastidagi kartochka: tarif holati va shu oygi AI javoblar. */
export function PlanCard({ onNavigate }: { onNavigate?: () => void }) {
  const { t, lang } = useI18n()
  const { me } = useAuth()
  const loc = useLocation()
  const [usage, setUsage] = useState<Plans['usage'] | null>(null)
  useEffect(() => { api.get<Plans>('/api/plans').then(r => setUsage(r.usage || null)).catch(() => {}) }, [loc.pathname])
  const p = me?.user.plan
  if (!p) return null
  const fmt = (n: number) => n.toLocaleString(lang === 'en' ? 'en' : 'ru')
  const status = p.unlimited ? p.plan : planStatus(p)
  const badge = !p.active ? 'bg-brand-600 text-white' : p.plan === 'trial' ? 'bg-[#b8f59a] text-[#1d5a0c]' : p.plan === 'business' ? 'bg-ink text-white' : 'bg-brand-50 text-brand-700'
  const over = usage && usage.ai_limit != null && usage.ai_used >= usage.ai_limit
  return (
    <Link to="/app/billing" onClick={onNavigate} className="block rounded-2xl border border-line bg-white px-3.5 py-3 shadow-[0_2px_0_rgba(0,0,0,.04)] transition hover:bg-soft">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-2">{t('side.plan')}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${badge}`}>
          {t(`plan.${status}` as never)}{p.active && p.plan === 'trial' && !p.unlimited ? ` · ${t('side.days', { n: p.days_left })}` : ''}
        </span>
      </div>
      {usage && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
          <span className="text-ink-3">{t('side.ai')}</span>
          <span className="tabular-nums"><b className={over ? 'text-brand-600' : 'text-ink'}>{fmt(usage.ai_used)}</b>
            <span className="text-ink-4"> / {usage.ai_limit == null ? '∞' : fmt(usage.ai_limit)}</span></span>
        </div>
      )}
    </Link>
  )
}
