import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Instagram, MessageSquareText, Play, Users, Workflow } from 'lucide-react'
import { api, type FlowSummary, type Stats } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo } from '../i18n'
import { TemplateCard, useCreateFlow, useTemplates } from '../components/NewFlowModal'
import { TRIGGER_META } from '../editor/meta'

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: number | string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-3"><Icon className="h-4 w-4" />{label}</div>
      <div className="mt-3 text-[30px] font-extrabold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] font-medium text-emerald-600">{sub}</div>}
    </div>
  )
}

export function Onboarding() {
  const { t } = useI18n()
  return (
    <div className="relative overflow-hidden rounded-3xl bg-ink p-8 text-white sm:p-10">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
      <div className="relative max-w-xl">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]"><Instagram className="h-6 w-6" /></span>
        <h2 className="mt-5 text-[26px] font-extrabold tracking-tight">{t('home.onb.title')}</h2>
        <p className="mt-2 text-[15px] text-white/70">{t('home.onb.sub')}</p>
        <ol className="mt-6 space-y-2.5">
          {(['home.onb.s1', 'home.onb.s2', 'home.onb.s3'] as const).map((k, i) => (
            <li key={k} className="flex items-center gap-3 text-[14.5px] text-white/90">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-bold">{i + 1}</span>{t(k)}
            </li>
          ))}
        </ol>
        <a href="/instagram/connect" className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-semibold hover:bg-brand-500">
          {t('home.onb.btn')}<ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}

export default function Home() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const { me, account } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const templates = useTemplates()
  const create = useCreateFlow(account?.id)

  useEffect(() => {
    if (!account) return
    api.get<Stats>(`/api/stats?account_id=${account.id}`).then(setStats).catch(() => {})
    api.get<{ items: FlowSummary[] }>(`/api/flows?account_id=${account.id}`).then(r => setFlows(r.items.slice(0, 5))).catch(() => {})
  }, [account])

  const name = me?.user.name?.split(' ')[0]
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{name ? t('home.hello', { name }) : t('home.hello_anon')}</h1>
        <p className="mt-1 text-[14.5px] text-ink-3">{t('home.sub')}</p>
      </div>

      {!account ? <Onboarding /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={MessageSquareText} label={t('home.stat.sent')} value={stats?.sent_24h ?? '—'} />
            <StatCard icon={Users} label={t('home.stat.contacts')} value={stats?.contacts ?? '—'}
              sub={stats?.contacts_7d ? t('home.stat.new7', { n: stats.contacts_7d }) : undefined} />
            <StatCard icon={Workflow} label={t('home.stat.flows')} value={stats ? `${stats.flows_active}/${stats.flows_total}` : '—'} />
            <StatCard icon={Play} label={t('home.stat.runs')} value={stats?.runs_total ?? '—'} />
          </div>

          <section>
            <h2 className="mb-4 text-[17px] font-bold">{t('home.templates')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {templates.map(tpl => <TemplateCard key={tpl.key} tpl={tpl} onClick={() => create(tpl.key)} />)}
            </div>
          </section>

          {flows.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[17px] font-bold">{t('home.recent')}</h2>
                <Link to="/app/flows" className="text-[13.5px] font-semibold text-brand-600 hover:text-brand-700">{t('home.all_flows')} →</Link>
              </div>
              <div className="card divide-y divide-line">
                {flows.map(f => {
                  const tm = f.trigger.kind ? TRIGGER_META[f.trigger.kind] : null
                  const Icon = tm?.icon ?? Workflow
                  return (
                    <Link key={f.id} to={`/app/flows/${f.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-soft/60">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${f.active ? 'bg-emerald-500' : 'bg-[#d4d4dc]'}`} />
                      <Icon className="h-4 w-4 shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{f.name}</span>
                      <span className="text-[12.5px] tabular-nums text-ink-3">{f.runs} {t('flows.runs')}</span>
                      <span className="hidden w-28 text-right text-[12.5px] text-ink-4 sm:block">{ago(f.updated_at)}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
