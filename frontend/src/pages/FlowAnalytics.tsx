import { useEffect, useState } from 'react'
import Simulator from '../editor/Simulator'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Pencil, Users } from 'lucide-react'
import { api, type FlowFull, type FlowSummary } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { Spinner } from '../components/ui'
import { AreaChart, type Point } from '../components/charts'
import { IgAvatar } from '../components/Phone'

type Data = { flow: FlowSummary; days: number; started: number; converted: number; conversion: number
  series: { started: Point[]; converted: Point[] } }

export default function FlowAnalytics() {
  const { id } = useParams()
  const { t } = useI18n()
  const { me } = useAuth()
  const [days, setDays] = useState(30)
  const [d, setD] = useState<Data | null>(null)
  const [full, setFull] = useState<FlowFull | null>(null)
  useEffect(() => { api.get<FlowFull>(`/api/flows/${id}`).then(setFull).catch(() => {}) }, [id])

  useEffect(() => { api.get<Data>(`/api/flows/${id}/analytics?days=${days}`).then(setD).catch(() => {}) }, [id, days])
  if (!d) return <Spinner />
  const account = me?.accounts.find(a => a.id === d.flow.account_id) ?? null
  const hasData = d.series.started.some(p => p.value > 0)

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/app/flows" className="inline-flex items-center gap-2 text-[15px] text-ink-2 hover:text-ink"><ArrowLeft className="h-5 w-5" />{t('common.back')}</Link>
          <Link to={`/app/flows/${d.flow.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[14px] font-semibold text-white hover:bg-brand-700"><Pencil className="h-4 w-4" />{t('common.edit')}</Link>
        </div>

        <div className="mb-6 flex items-center gap-3.5">
          <IgAvatar account={account} size={56} />
          <div className="min-w-0">
            <div className="text-[13px] text-ink-3">{account?.username}</div>
            <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight">{d.flow.name}</h1>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-3 rounded-xl bg-soft p-1">
          {[7, 30, 90].map(n => (
            <button key={n} onClick={() => setDays(n)}
              className={`rounded-lg py-2 text-[14px] font-medium transition ${days === n ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}>
              {t('fa.days', { n })}
            </button>
          ))}
        </div>

        <section className="mb-5 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-[17px] font-bold">{t('fa.results')}</h2>
          <p className="mt-0.5 text-[13.5px] text-ink-3">{t('fa.results_d')}</p>
          <div className="relative mt-5 grid grid-cols-2 gap-3">
            {[
              { label: t('fa.started'), value: d.started, pct: d.started ? 100 : 0, dot: 'bg-ink-4', bar: 'bg-ink-3' },
              { label: t('fa.converted'), value: d.converted, pct: d.conversion, dot: 'bg-brand-600', bar: 'bg-brand-600' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl bg-soft p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[13.5px] text-ink-2"><span className={`h-2 w-2 rounded-full ${s.dot}`} />{s.label}</div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-[38px] font-bold leading-none tabular-nums">{s.value}</span>
                  {s.bar === 'bg-brand-600' && d.started > 0 && <span className="text-[14px] font-semibold text-brand-600">{d.conversion}%</span>}
                </div>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#e4e4e9]"><div className={`h-full rounded-full ${s.bar} transition-all`} style={{ width: `${s.pct}%` }} /></div>
              </div>
            ))}
            <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink-3"><ArrowRight className="h-3.5 w-3.5" /></span>
          </div>
          <p className="mt-3 text-[12px] text-ink-4">{t('fa.conv_hint')}</p>
        </section>

        <section className="mb-4 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="mb-4 text-[17px] font-bold">{t('fa.by_day')}</h2>
          {hasData ? <AreaChart data={d.series.started} label={t('fa.started')} height={240} />
            : <div className="grid h-[200px] place-items-center rounded-2xl bg-soft text-[14px] text-ink-3">{t('fa.no_data')}</div>}
        </section>

        <Link to={`/app/contacts?flow=${d.flow.id}`} className="inline-flex items-center gap-2 text-[14px] font-semibold text-brand-700 hover:underline">
          <Users className="h-4 w-4" />{t('fl.clients')}<ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="hidden xl:block">
        <div className="sticky top-6">
          <div className="mb-3 flex items-center justify-center gap-2 text-[13.5px] font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${d.flow.active ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.15)]' : 'bg-ink-4'}`} />
            {d.flow.active ? t('fa.running') : t('fa.paused')}
            <span className="font-normal text-ink-4">· {t('sim.sub_short')}</span>
          </div>
          {full ? <Simulator embedded nodes={full.graph.nodes} edges={full.graph.edges} startId={null} accountId={full.account_id} /> : <Spinner />}
        </div>
      </div>
    </div>
  )
}
