import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Instagram, Rocket, Send, ShoppingBag, Sparkles, UsersRound, Workflow, X } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'

type Steps = Record<'instagram' | 'products' | 'ai' | 'flow' | 'telegram' | 'team', boolean>

const STEPS: { key: keyof Steps; icon: typeof Rocket; to: string; ext?: boolean }[] = [
  { key: 'instagram', icon: Instagram, to: '/instagram/connect', ext: true },
  { key: 'products', icon: ShoppingBag, to: '/app/products' },
  { key: 'ai', icon: Sparkles, to: '/app/integrations' },
  { key: 'flow', icon: Workflow, to: '/app/flows' },
  { key: 'telegram', icon: Send, to: '/app/integrations' },
  { key: 'team', icon: UsersRound, to: '/app/team' },
]

/** Bosh sahifadagi "Boshlash" ro'yxati: yangi foydalanuvchini qadamma-qadam olib boradi. */
export default function OnboardingChecklist() {
  const { t } = useI18n()
  const { me, account } = useAuth()
  const [steps, setSteps] = useState<Steps | null>(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('cf_onb_hidden') === '1' } catch { return false } })
  useEffect(() => {
    api.get<{ steps: Steps }>(`/api/onboarding?account_id=${account?.id ?? 0}`).then(r => setSteps(r.steps)).catch(() => {})
  }, [account])
  if (!steps || hidden || me?.user.role === 'manager') return null
  const done = STEPS.filter(s => steps[s.key]).length
  if (done === STEPS.length) return null
  const next = STEPS.find(s => !steps[s.key])
  const hide = () => { setHidden(true); try { localStorage.setItem('cf_onb_hidden', '1') } catch { /* ignore */ } }

  return (
    <section className="card relative overflow-hidden p-6">
      <button onClick={hide} title={t('common.close')} className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-4 hover:bg-soft hover:text-ink"><X className="h-4 w-4" /></button>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white"><Rocket className="h-5 w-5" /></span>
        <div>
          <h2 className="text-[17px] font-bold">{t('onb.title')}</h2>
          <p className="text-[13px] text-ink-3">{t('onb.progress', { done, total: STEPS.length })}</p>
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-soft"><div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${(done / STEPS.length) * 100}%` }} /></div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s, i) => {
          const ok = steps[s.key], Icon = s.icon, isNext = next?.key === s.key
          const inner = (
            <>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${ok ? 'bg-emerald-500 text-white' : isNext ? 'bg-brand-600 text-white' : 'bg-soft text-ink-3'}`}>
                {ok ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`flex items-center gap-1.5 text-[14px] font-semibold ${ok ? 'text-ink-3 line-through' : ''}`}><Icon className="h-3.5 w-3.5" />{t(`onb.${s.key}` as TKey)}</span>
                <span className="block truncate text-[12px] text-ink-3">{t(`onb.${s.key}_d` as TKey)}</span>
              </span>
              {!ok && <ChevronRight className="h-4 w-4 shrink-0 text-ink-4" />}
            </>
          )
          const cls = `flex items-center gap-3 rounded-xl border p-3 transition ${isNext ? 'border-brand-200 bg-brand-50/50' : 'border-line'} ${ok ? '' : 'hover:border-brand-300 hover:bg-brand-50/40'}`
          return <li key={s.key}>{s.ext ? <a href={s.to} className={cls}>{inner}</a> : <Link to={s.to} className={cls}>{inner}</Link>}</li>
        })}
      </ol>
    </section>
  )
}
