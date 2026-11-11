import { useEffect, useState } from 'react'
import { CreditCard, Instagram, MessageSquareText, Users, Workflow } from 'lucide-react'
import { api, type AdminOverview } from '../../api'
import { useI18n } from '../../i18n'
import { PageHeader, Spinner } from '../../components/ui'
import { AreaChart, BarChart, ChartCard, fmtNum } from '../../components/charts'

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-3"><Icon className="h-4 w-4" />{label}</div>
      <div className="mt-3 text-[28px] font-extrabold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-ink-3">{sub}</div>}
    </div>
  )
}

export default function AdminOverviewPage() {
  const { t } = useI18n()
  const [d, setD] = useState<AdminOverview | null>(null)
  useEffect(() => { api.get<AdminOverview>('/api/admin/overview').then(setD).catch(() => {}) }, [])
  if (!d) return <Spinner />
  const cur = t('bill.cur')
  const st = d.status
  const segments = [
    { key: 'pro', label: t('plan.pro'), n: st.pro || 0, cls: 'bg-brand-600' },
    { key: 'business', label: t('plan.business'), n: st.business || 0, cls: 'bg-ink' },
    { key: 'trial', label: t('adm.trial'), n: st.trial || 0, cls: 'bg-amber-400' },
    { key: 'expired', label: t('adm.expired'), n: (st.expired || 0) + (st.blocked || 0), cls: 'bg-[#d4d4dc]' },
  ]
  const total = Math.max(1, segments.reduce((a, s) => a + s.n, 0))
  const revenue30 = d.series.revenue.reduce((a, p) => a + p.value, 0)

  return (
    <>
      <PageHeader title={t('adm.title')} sub={t('adm.sub')} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={Users} label={t('adm.users')} value={fmtNum(d.users_total)} sub={t('adm.new7', { n: d.users_7d })} />
        <Tile icon={CreditCard} label={t('adm.mrr')} value={`${fmtNum(d.mrr)} ${cur}`} sub={`${t('adm.paying')}: ${(st.pro || 0) + (st.business || 0)}`} />
        <Tile icon={CreditCard} label={t('adm.revenue_month')} value={`${fmtNum(d.revenue_month)} ${cur}`} sub={t('adm.revenue_total', { v: `${fmtNum(d.revenue_total)} ${cur}` })} />
        <Tile icon={MessageSquareText} label={t('adm.sent24')} value={fmtNum(d.sent_24h)} />
      </div>

      {/* tariflar bo'yicha taqsimot: bitta butun, qismlarga bo'lingan */}
      <div className="card mt-4 p-5">
        <div className="mb-3 text-[13px] font-medium text-ink-3">{t('adm.users')} · {t('adm.col.plan')}</div>
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
          {segments.filter(s => s.n > 0).map(s => <div key={s.key} className={`${s.cls} h-full`} style={{ width: `${(s.n / total) * 100}%` }} title={`${s.label}: ${s.n}`} />)}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {segments.map(s => (
            <span key={s.key} className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className={`h-2.5 w-2.5 rounded-sm ${s.cls}`} />{s.label}<b className="tabular-nums">{s.n}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title={t('adm.chart.revenue')} value={`${fmtNum(revenue30)} ${cur}`} sub={t('home.chart.period')}>
          <BarChart data={d.series.revenue} label={t('adm.chart.revenue')} unit={cur} />
        </ChartCard>
        <ChartCard title={t('adm.chart.signups')} value={fmtNum(d.series.signups.reduce((a, p) => a + p.value, 0))} sub={t('home.chart.period')}>
          <BarChart data={d.series.signups} label={t('adm.chart.signups')} />
        </ChartCard>
      </div>
      <div className="mt-4">
        <ChartCard title={t('adm.chart.sent')} value={fmtNum(d.series.sent.reduce((a, p) => a + p.value, 0))} sub={t('home.chart.period')}>
          <AreaChart data={d.series.sent} label={t('adm.chart.sent')} />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Tile icon={Instagram} label={t('adm.ig')} value={fmtNum(d.ig_accounts)} />
        <Tile icon={Workflow} label={t('adm.flows')} value={fmtNum(d.flows_active)} />
        <Tile icon={Users} label={t('home.stat.contacts')} value={fmtNum(d.contacts)} />
      </div>
    </>
  )
}
