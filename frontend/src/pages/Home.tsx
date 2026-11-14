import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, CheckCircle2, Clock, Hand, Inbox as InboxIcon, Instagram, Megaphone, MessageCircle, Phone, Plus, Send, Smartphone, Sparkles, UserCheck, UserPlus, Workflow } from 'lucide-react'
import { api, type Contact, type FlowSummary, type SeriesPoint, type Stats } from '../api'
import { AreaChart, BarChart, HBars, fmtNum } from '../components/charts'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Avatar } from '../components/ui'
import { IgAvatar } from '../components/Phone'
import { MONTHS } from './Activity'
import { TemplateCard, useCreateFlow, useTemplates } from '../components/NewFlowModal'
import { TRIGGER_META } from '../editor/meta'
import OnboardingChecklist from '../components/Onboarding'

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

type Conv = Contact & { preview: string; last_message_at: string; unread: number; bot_paused: boolean; avatar_url?: string }
type HomeData = {
  kpi: Record<'in_24h' | 'out_24h' | 'contacts_7d' | 'leads_7d', [number, number]>
  attention: { unread: number; closing: number; overdue: number; unassigned: number; human: number }
  sources_7d: Record<'flow' | 'ai' | 'agent' | 'app' | 'broadcast', number>
  recent: Conv[]; ai: boolean; ai_name: string
}

function Kpi({ icon, label, pair, to }: { icon: ReactNode; label: string; pair?: [number, number]; to: string }) {
  const [now, prev] = pair || [0, 0]
  const delta = prev ? Math.round(((now - prev) / prev) * 100) : now ? 100 : 0
  const up = delta >= 0
  return (
    <Link to={to} className="group rounded-3xl border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-card">
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-soft text-ink-2 transition group-hover:bg-ink group-hover:text-white">{icon}</span>
        {pair && (now || prev) ? (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'}`}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(delta)}%
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-[30px] font-extrabold leading-none tabular-nums tracking-tight">{pair ? fmtNum(now) : '—'}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-3">{label}</div>
    </Link>
  )
}

export default function Home() {
  const { t, lang } = useI18n()
  const ago = useTimeAgo()
  const { me, account } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [home, setHome] = useState<HomeData | null>(null)
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [days, setDays] = useState<7 | 30>(30)
  const [metric, setMetric] = useState<'sent' | 'contacts'>('sent')
  const [series, setSeries] = useState<{ sent: SeriesPoint[]; contacts: SeriesPoint[]; top_flows: { id: number; name: string; value: number }[] } | null>(null)
  const templates = useTemplates()
  const create = useCreateFlow(account?.id)

  useEffect(() => {
    if (!account) return
    api.get<Stats>(`/api/stats?account_id=${account.id}`).then(setStats).catch(() => {})
    api.get<HomeData>(`/api/home?account_id=${account.id}`).then(setHome).catch(() => {})
    api.get<{ items: FlowSummary[] }>(`/api/flows?account_id=${account.id}`).then(r => setFlows(r.items.slice(0, 5))).catch(() => {})
  }, [account])
  useEffect(() => {
    if (account) api.get<typeof series>(`/api/stats/series?account_id=${account.id}&days=${days}`).then(setSeries).catch(() => {})
  }, [account, days])

  const name = me?.user.name?.split(' ')[0]
  const hour = new Date().getHours()
  const greet = t(hour < 5 ? 'home2.night' : hour < 12 ? 'home2.morning' : hour < 18 ? 'home2.day' : 'home2.evening')
  const today = new Date()
  const dateLine = `${today.getDate()} ${(MONTHS[lang] || MONTHS.en)[today.getMonth()]}`

  if (!account) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{name ? t('home.hello', { name }) : t('home.hello_anon')}</h1>
          <p className="mt-1 text-[14.5px] text-ink-3">{t('home.sub')}</p>
        </div>
        <Onboarding />
      </div>
    )
  }

  const att = home?.attention
  const attention: { icon: typeof Clock; n: number; label: TKey; to: string; tone: string }[] = att ? [
    { icon: MessageCircle, n: att.unread, label: 'home2.a_unread' as TKey, to: '/app/inbox', tone: 'bg-brand-50 text-brand-700' },
    { icon: Clock, n: att.closing, label: 'home2.a_closing' as TKey, to: '/app/inbox', tone: 'bg-amber-50 text-amber-700' },
    { icon: AlarmClock, n: att.overdue, label: 'home2.a_overdue' as TKey, to: '/app/crm?view=tasks', tone: 'bg-brand-50 text-brand-700' },
    { icon: UserPlus, n: att.unassigned, label: 'home2.a_unassigned' as TKey, to: '/app/crm?view=list', tone: 'bg-violet-50 text-violet-700' },
    { icon: Hand, n: att.human, label: 'home2.a_human' as TKey, to: '/app/inbox', tone: 'bg-sky-50 text-sky-700' },
  ].filter(x => x.n > 0) : []

  const src = home?.sources_7d
  const srcItems = src ? ([
    ['flow', Workflow, 'bg-brand-600', 'home2.s_flow'], ['ai', Sparkles, 'bg-violet-500', 'home2.s_ai'],
    ['agent', UserCheck, 'bg-ink', 'home2.s_agent'], ['app', Smartphone, 'bg-slate-400', 'home2.s_app'],
    ['broadcast', Megaphone, 'bg-amber-500', 'home2.s_broadcast'],
  ] as const).map(([k, Icon, color, label]) => ({ k, Icon, color, label, n: src[k] })) : []
  const srcTotal = srcItems.reduce((a, x) => a + x.n, 0)
  const autoShare = srcTotal ? Math.round(((src!.flow + src!.ai) / srcTotal) * 100) : 0

  const chartData = series ? (metric === 'sent' ? series.sent : series.contacts) : []

  return (
    <div className="space-y-6">
      {/* salomlashish */}
      <section className="relative overflow-hidden rounded-[28px] border border-line bg-white p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,#ffe1e3,transparent_65%)]" />
        <div className="pointer-events-none absolute -bottom-28 right-40 h-60 w-60 rounded-full bg-[radial-gradient(circle,#efe9ff,transparent_65%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex-1">
            <div className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-4">{dateLine}</div>
            <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] sm:text-[32px]">{greet}{name ? `, ${name}` : ''} 👋</h1>
            <p className="mt-1.5 max-w-xl text-[14.5px] text-ink-3">
              {home ? t('home2.summary', { n: home.kpi.in_24h[0], u: home.attention.unread }) : t('home.sub')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/app/accounts" className="mr-1 flex items-center gap-2 rounded-2xl border border-line bg-white/80 py-1.5 pl-1.5 pr-3 backdrop-blur hover:bg-soft">
              <IgAvatar account={account} size={32} /><span className="text-[13px] font-semibold">@{account.username}</span>
            </Link>
            <Link to="/app/inbox" className="relative inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[13.5px] font-semibold text-white hover:bg-black">
              <InboxIcon className="h-4 w-4" />{t('nav.inbox' as TKey)}
              {!!home?.attention.unread && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-bold">{home.attention.unread}</span>}
            </Link>
            <Link to="/app/flows" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13.5px] font-semibold hover:bg-soft"><Plus className="h-4 w-4" />{t('home2.new_flow')}</Link>
            <Link to="/app/broadcasts" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13.5px] font-semibold hover:bg-soft"><Send className="h-4 w-4" />{t('home2.broadcast')}</Link>
          </div>
        </div>
      </section>

      <OnboardingChecklist />
      <MyWork accountId={account.id} />

      {/* ko'rsatkichlar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<MessageCircle className="h-4 w-4" />} label={t('home2.k_in')} pair={home?.kpi.in_24h} to="/app/inbox" />
        <Kpi icon={<Send className="h-4 w-4" />} label={t('home2.k_out')} pair={home?.kpi.out_24h} to="/app/activity" />
        <Kpi icon={<UserPlus className="h-4 w-4" />} label={t('home2.k_contacts')} pair={home?.kpi.contacts_7d} to="/app/crm?view=list" />
        <Kpi icon={<Phone className="h-4 w-4" />} label={t('home2.k_leads')} pair={home?.kpi.leads_7d} to="/app/crm" />
      </div>

      {/* grafik + diqqat */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-3xl border border-line bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-soft p-1">
              {([['sent', 'home.chart.sent'], ['contacts', 'home.chart.contacts']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setMetric(k)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${metric === k ? 'bg-white text-ink shadow-card' : 'text-ink-3 hover:text-ink'}`}>{t(l)}</button>
              ))}
            </div>
            <span className="text-[20px] font-extrabold tabular-nums">{fmtNum(chartData.reduce((a, p) => a + p.value, 0))}</span>
            <div className="ml-auto flex rounded-xl bg-soft p-1">
              {([7, 30] as const).map(d => (
                <button key={d} onClick={() => setDays(d)} className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${days === d ? 'bg-white text-ink shadow-card' : 'text-ink-3 hover:text-ink'}`}>{t('home2.days', { n: d })}</button>
              ))}
            </div>
          </div>
          {series ? (metric === 'sent' ? <AreaChart data={chartData} label={t('home.chart.sent')} height={230} /> : <BarChart data={chartData} label={t('home.chart.contacts')} height={230} />)
            : <div className="h-[230px] animate-pulse rounded-2xl bg-soft" />}
        </section>

        <section className="flex flex-col rounded-3xl border border-line bg-white p-5">
          <h2 className="text-[15px] font-bold">{t('home2.attention')}</h2>
          {!home ? <div className="mt-4 h-40 animate-pulse rounded-2xl bg-soft" /> : attention.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></span>
              <div className="mt-3 text-[14px] font-semibold">{t('home2.all_good')}</div>
              <div className="mt-0.5 text-[12.5px] text-ink-3">{t('home2.all_good_d')}</div>
            </div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {attention.map(x => (
                <Link key={x.label} to={x.to} className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-soft">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${x.tone}`}><x.icon className="h-4 w-4" /></span>
                  <span className="flex-1 text-[13px] text-ink-2">{t(x.label)}</span>
                  <span className="text-[17px] font-extrabold tabular-nums">{x.n}</span>
                  <ArrowRight className="h-4 w-4 text-ink-4 transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* kim javob beradi + so'nggi suhbatlar */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-line bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold">{t('home2.who')}</h2>
              <p className="text-[12.5px] text-ink-3">{t('home2.who_d')}</p>
            </div>
            {srcTotal > 0 && <div className="text-right"><div className="text-[24px] font-extrabold leading-none text-emerald-600">{autoShare}%</div><div className="text-[11px] text-ink-4">{t('home2.auto')}</div></div>}
          </div>
          {srcTotal === 0 ? <p className="py-10 text-center text-[13px] text-ink-4">{t('home.chart.empty')}</p> : (
            <>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-soft">
                {srcItems.filter(x => x.n).map(x => <div key={x.k} className={`${x.color} h-full transition-all duration-700`} style={{ width: `${(x.n / srcTotal) * 100}%` }} title={`${t(x.label)}: ${x.n}`} />)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {srcItems.map(x => (
                  <div key={x.k} className="flex items-center gap-2 rounded-xl bg-soft px-3 py-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${x.color}`} />
                    <x.Icon className="h-3.5 w-3.5 shrink-0 text-ink-4" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{t(x.label)}</span>
                    <span className="text-[13px] font-bold tabular-nums">{x.n}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <Link to="/app/integrations?open=ai" className={`mt-4 flex items-center gap-3 rounded-2xl p-3 transition hover:brightness-[.98] ${home?.ai ? 'bg-violet-50' : 'border border-dashed border-line'}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${home?.ai ? 'bg-gradient-to-br from-[#6d5dfc] to-[#e5161f] text-white' : 'bg-soft text-ink-3'}`}><Bot className="h-4 w-4" /></span>
            <span className="flex-1 text-[13px]"><b>{home?.ai ? (home.ai_name || t('ai3.title')) : t('ai3.title')}</b> · {home?.ai ? t('home2.ai_on') : t('home2.ai_off')}</span>
            <ArrowRight className="h-4 w-4 text-ink-4" />
          </Link>
        </section>

        <section className="rounded-3xl border border-line bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">{t('home2.recent')}</h2>
            <Link to="/app/inbox" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700">{t('home2.all_chats')} →</Link>
          </div>
          {!home ? <div className="h-48 animate-pulse rounded-2xl bg-soft" /> : home.recent.length === 0 ? <p className="py-10 text-center text-[13px] text-ink-4">{t('inbox.empty')}</p> : (
            <div className="space-y-0.5">
              {home.recent.map(c => (
                <Link key={c.id} to={`/app/inbox?c=${c.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-soft">
                  <span className={`shrink-0 rounded-full p-[2px] ${c.unread ? 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]' : ''}`}>
                    <span className="block rounded-full bg-white"><Avatar name={c.username || c.name || '?'} src={c.avatar_url || null} size={38} /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-[13.5px] ${c.unread ? 'font-bold' : 'font-semibold'}`}>{c.name || (c.username ? `@${c.username}` : c.igsid)}</span>
                      {c.bot_paused && <Hand className="h-3 w-3 shrink-0 text-amber-600" />}
                      <span className="ml-auto shrink-0 text-[11px] text-ink-4">{ago(c.last_message_at)}</span>
                    </span>
                    <span className={`block truncate text-[12.5px] ${c.unread ? 'font-semibold text-ink' : 'text-ink-3'}`}>{c.preview}</span>
                  </span>
                  {c.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ssenariylar */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-line bg-white p-5">
          <h2 className="text-[15px] font-bold">{t('home.chart.top')}</h2>
          <p className="mb-3 text-[12.5px] text-ink-3">{t('home2.days', { n: days })}</p>
          <HBars items={(series?.top_flows || []).map(f => ({ ...f, href: `/app/flows/${f.id}/analytics` }))} empty={t('home.chart.empty')} />
        </section>
        <section className="rounded-3xl border border-line bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">{t('home.recent')}</h2>
            <Link to="/app/flows" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700">{t('home.all_flows')} →</Link>
          </div>
          {flows.length === 0 ? <p className="py-10 text-center text-[13px] text-ink-4">{t('home.chart.empty')}</p> : (
            <div className="space-y-0.5">
              {flows.map(f => {
                const tm = f.trigger.kind ? TRIGGER_META[f.trigger.kind] : null
                const Icon = tm?.icon ?? Workflow
                return (
                  <Link key={f.id} to={`/app/flows/${f.id}/analytics`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-soft">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${f.active ? 'bg-emerald-50 text-emerald-600' : 'bg-soft text-ink-4'}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{f.name}</span>
                      <span className="block text-[11.5px] text-ink-4">{f.active ? t('common.active') : t('common.paused')} · {ago(f.updated_at)}</span>
                    </span>
                    <span className="text-[13px] font-bold tabular-nums">{fmtNum(f.runs)}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {(stats?.flows_total ?? 0) < 3 && templates.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-bold">{t('home.templates')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {templates.slice(0, 4).map(tpl => <TemplateCard key={tpl.key} tpl={tpl} onClick={() => create(tpl.key)} />)}
          </div>
        </section>
      )}
    </div>
  )
}
