import { Link } from 'react-router-dom'
import { AlertTriangle, Gift } from 'lucide-react'
import type { PlanInfo, PlanKey } from '../api'
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
    <div className={`mb-6 flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center ${expired ? 'bg-brand-600 text-white' : 'border border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="flex flex-1 items-center gap-2.5 text-[14px] font-medium">
        {expired ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Gift className="h-4 w-4 shrink-0" />}
        {expired ? t('banner.expired') : t('banner.trial', { n: p.days_left })}
      </div>
      <Link to="/app/billing" className={`inline-flex h-9 items-center justify-center rounded-xl px-4 text-[13px] font-semibold ${expired ? 'bg-white text-brand-700 hover:bg-brand-50' : 'bg-amber-900 text-white hover:bg-black'}`}>
        {t('banner.cta')}
      </Link>
    </div>
  )
}
