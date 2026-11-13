import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { Spinner } from '../../components/ui'
import { AreaChart, fmtNum, type Point } from '../../components/charts'
import { STAGE_DOT, type Stage } from '../Crm'

type R = { days: number; new: number; leads: number; won: number; lost: number; revenue: number; conversion: number
  series: { new: Point[]; won: Point[] }; stages: (Stage & { count: number; sum: number })[]
  people: { id: number; name: string; role: string; assigned: number; won: number; revenue: number }[] }

export default function Report() {
  const { t } = useI18n()
  const { account } = useAuth()
  const [days, setDays] = useState(30)
  const [r, setR] = useState<R | null>(null)
  useEffect(() => { if (account) api.get<R>(`/api/crm/report?account_id=${account.id}&days=${days}`).then(setR).catch(() => {}) }, [account, days])
  if (!r) return <Spinner />
  const maxStage = Math.max(1, ...r.stages.map(s => s.count))

  return (
    <div>
      <div className="mb-5 flex justify-end">
        <div className="flex rounded-xl bg-white p-1 ring-1 ring-line">
          {[7, 30, 90].map(n => (
            <button key={n} onClick={() => setDays(n)} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${days === n ? 'bg-soft text-ink' : 'text-ink-3'}`}>{t('fa.days', { n })}</button>
          ))}
        </div>
      </div>

      {/* asosiy raqamlar — bitta qatorda, ajratgichlar bilan */}
      <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-3xl border border-line bg-white sm:grid-cols-5">
        {[
          { label: t('crm2.r.new'), v: fmtNum(r.new) },
          { label: t('crm2.r.leads'), v: fmtNum(r.leads) },
          { label: t('crm2.r.won'), v: fmtNum(r.won), accent: true },
          { label: t('crm2.r.revenue'), v: fmtNum(r.revenue) },
          { label: t('crm2.r.conv'), v: `${r.conversion}%` },
        ].map((x, i) => (
          <div key={x.label} className={`px-5 py-5 ${i ? 'border-l border-line' : ''} ${i >= 2 ? 'max-sm:border-t' : ''}`}>
            <div className={`text-[28px] font-bold leading-none tabular-nums tracking-tight ${x.accent ? 'text-emerald-600' : ''}`}>{x.v}</div>
            <div className="mt-2 text-[12.5px] text-ink-3">{x.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-3xl border border-line bg-white p-5">
          <h3 className="mb-4 text-[15px] font-bold">{t('crm2.r.new_by_day')}</h3>
          <AreaChart data={r.series.new} label={t('crm2.r.new')} height={230} />
        </section>
        <section className="rounded-3xl border border-line bg-white p-5">
          <h3 className="mb-4 text-[15px] font-bold">{t('crm2.r.pipeline')}</h3>
          <div className="space-y-3">
            {r.stages.map(s => (
              <div key={s.id}>
                <div className="mb-1 flex items-center gap-2 text-[13px]">
                  <span className={`h-2 w-2 rounded-full ${STAGE_DOT[s.color] || STAGE_DOT.slate}`} />
                  <span className="flex-1 truncate font-medium">{s.name}</span>
                  <span className="tabular-nums text-ink-3">{s.sum ? fmtNum(s.sum) + ' · ' : ''}<b className="text-ink">{s.count}</b></span>
                </div>
                <div className="h-1.5 rounded-full bg-soft"><div className={`h-full rounded-full ${STAGE_DOT[s.color] || STAGE_DOT.slate}`} style={{ width: `${Math.max(2, s.count / maxStage * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {r.people.length > 1 && (
        <section className="mt-5 overflow-hidden rounded-3xl border border-line bg-white">
          <h3 className="px-5 pb-2 pt-5 text-[15px] font-bold">{t('crm2.r.team')}</h3>
          <div className="grid grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] gap-3 border-b border-line px-5 py-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-4">
            <span /><span className="text-right">{t('crm2.r.in_work')}</span><span className="text-right">{t('crm2.r.won')}</span><span className="text-right">{t('crm2.r.revenue')}</span>
          </div>
          {[...r.people].sort((a, b) => b.revenue - a.revenue || b.won - a.won).map((p, i) => (
            <div key={p.id} className="grid grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] items-center gap-3 border-b border-line/60 px-5 py-3 text-[13.5px] last:border-0">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i === 0 && p.won ? 'bg-amber-100 text-amber-700' : 'bg-soft text-ink-3'}`}>{i + 1}</span>
                <span className="truncate font-medium">{p.role === 'ai' ? '🤖 ' : ''}{p.name}</span>
              </span>
              <span className="text-right tabular-nums">{p.assigned}</span>
              <span className="text-right font-semibold tabular-nums text-emerald-600">{p.won}</span>
              <span className="text-right tabular-nums">{fmtNum(p.revenue)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
