import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, ArrowRight, Instagram, MessageSquareText, Play, UserCheck, Users, Workflow } from 'lucide-react'
import { api, type FlowSummary, type SeriesPoint, type Stats } from '../api'
import { AreaChart, BarChart, ChartCard, HBars, fmtNum } from '../components/charts'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo } from '../i18n'
import { TemplateCard, useCreateFlow, useTemplates } from '../components/NewFlowModal'
import { TRIGGER_META } from '../editor/meta'
import OnboardingChecklist from '../components/Onboarding'

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

/** Menejer (va egasi) uchun: menga biriktirilgan mijozlar va yaqin eslatmalar. */
function MyWork({ accountId }: { accountId: number }) {
  const { t } = useI18n()
  const [d, setD] = useState<{ items: { id: number; text: string; remind_at: string; contact_id: number; contact: string }[]; my_leads: number } | null>(null)
  useEffect(() => { api.get<typeof d>(`/api/reminders?account_id=${accountId}`).then(setD).catch(() => {}) }, [accountId])
  if (!d || (!d.items.length && !d.my_leads)) return null
  const now = Date.now()
  return (
    <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Link to="/app/crm?assigned=me" className="card flex flex-col justify-between p-5 hover:shadow-pop">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-3"><UserCheck className="h-4 w-4" />{t('home.my_leads')}</div>
        <div className="mt-3 text-[30px] font-extrabold tabular-nums tracking-tight">{d.my_leads}</div>
        <div className="text-[12.5px] font-semibold text-brand-600">{t('home.open_crm')} →</div>
      </Link>
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink-3"><AlarmClock className="h-4 w-4" />{t('home.reminders')}</div>
        {d.items.length === 0 ? <p className="text-[13px] text-ink-4">{t('home.no_reminders')}</p> : (
          <div className="divide-y divide-line">
            {d.items.slice(0, 5).map(r => {
              const late = new Date(r.remind_at).getTime() < now
              return (
                <Link key={r.id} to={`/app/inbox?c=${r.contact_id}`} className="flex items-center gap-3 py-2 text-[13.5px] hover:text-brand-700">
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums ${late ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>
                    {new Date(r.remind_at).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.text}</span>
                  <span className="shrink-0 text-[12px] text-ink-3">{r.contact}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default function Home() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const { me, account } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [series, setSeries] = useState<{ sent: SeriesPoint[]; contacts: SeriesPoint[]; top_flows: { id: number; name: string; value: number }[] } | null>(null)
  const templates = useTemplates()
  const create = useCreateFlow(account?.id)

  useEffect(() => {
    if (!account) return
    api.get<Stats>(`/api/stats?account_id=${account.id}`).then(setStats).catch(() => {})
    api.get<{ items: FlowSummary[] }>(`/api/flows?account_id=${account.id}`).then(r => setFlows(r.items.slice(0, 5))).catch(() => {})
    api.get<typeof series>(`/api/stats/series?account_id=${account.id}&days=30`).then(setSeries).catch(() => {})
  }, [account])

  const name = me?.user.name?.split(' ')[0]
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{name ? t('home.hello', { name }) : t('home.hello_anon')}</h1>
        <p className="mt-1 text-[14.5px] text-ink-3">{t('home.sub')}</p>
      </div>

      {account && <OnboardingChecklist />}

      {!account ? <Onboarding /> : (
        <>
          <MyWork accountId={account.id} />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={MessageSquareText} label={t('home.stat.sent')} value={stats?.sent_24h ?? '—'} />
            <StatCard icon={Users} label={t('home.stat.contacts')} value={stats?.contacts ?? '—'}
              sub={stats?.contacts_7d ? t('home.stat.new7', { n: stats.contacts_7d }) : undefined} />
            <StatCard icon={Workflow} label={t('home.stat.flows')} value={stats ? `${stats.flows_active}/${stats.flows_total}` : '—'} />
            <StatCard icon={Play} label={t('home.stat.runs')} value={stats?.runs_total ?? '—'} />
          </div>

          {series && (
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ChartCard title={t('home.chart.sent')} value={fmtNum(series.sent.reduce((a, p) => a + p.value, 0))} sub={t('home.chart.period')}>
                  <AreaChart data={series.sent} label={t('home.chart.sent')} />
                </ChartCard>
              </div>
              <ChartCard title={t('home.chart.top')} sub={t('home.chart.period')}>
                <HBars items={series.top_flows} empty={t('home.chart.empty')} />
              </ChartCard>
              <div className="lg:col-span-3">
                <ChartCard title={t('home.chart.contacts')} value={fmtNum(series.contacts.reduce((a, p) => a + p.value, 0))} sub={t('home.chart.period')}>
                  <BarChart data={series.contacts} label={t('home.chart.contacts')} height={180} />
                </ChartCard>
              </div>
            </section>
          )}

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
