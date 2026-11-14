import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, AlertTriangle, Bot, Check, CheckCircle2, ExternalLink, Instagram, KeyRound, MessageCircle, MoreHorizontal, Pause, Play, Plus, RefreshCw, Send, Trash2, Users, Workflow } from 'lucide-react'
import { api, type Account } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Button, PageHeader, Spinner, useToast } from '../components/ui'
import { IgAvatar } from '../components/Phone'

type Acc = Account & {
  contacts: number; flows_active: number; sent_7d: number; inbound_7d: number
  last_event_at: string | null; token_days: number | null; ai: boolean; telegram: boolean
}
type Overview = { items: Acc[]; limit: number; used: number; ig_ready: boolean }

function Menu({ items }: { items: { icon: typeof Trash2; label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-ink-3 hover:bg-soft hover:text-ink"><MoreHorizontal className="h-4 w-4" /></button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-line bg-white p-1 shadow-pop animate-fade-up">
          {items.map(it => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick() }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium ${it.danger ? 'text-brand-700 hover:bg-brand-50' : 'hover:bg-soft'}`}>
              <it.icon className="h-4 w-4" />{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Health({ ok, warn, icon, label, to }: { ok: boolean; warn?: boolean; icon: typeof Bot; label: string; to?: string }) {
  const Icon = icon
  const cls = warn ? 'bg-amber-50 text-amber-800' : ok ? 'bg-emerald-50 text-emerald-700' : 'bg-soft text-ink-3'
  const body = <><Icon className="h-3.5 w-3.5" />{label}{ok && !warn && <Check className="h-3 w-3" />}</>
  return to
    ? <Link to={to} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition hover:brightness-95 ${cls}`}>{body}</Link>
    : <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${cls}`}>{body}</span>
}

export default function Accounts() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const { me, refresh, setAccountId, account } = useAuth()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Overview | null>(null)

  const load = useCallback(() => api.get<Overview>('/api/accounts/overview').then(setData).catch(() => setData({ items: [], limit: 1, used: 0, ig_ready: true })), [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ok = params.get('connected'), bad = params.get('ig_error')
    if (!ok && !bad) return
    if (ok) {
      toast(t('acc.connected', { u: ok }))
      refresh().then(() => {
        const acc = me?.accounts.find(a => a.username === ok)
        if (acc) setAccountId(acc.id)
      })
      load()
    }
    if (bad) toast(bad === 'not_configured' ? t('acc.not_configured') : bad === 'plan_limit' ? t('acc.limit', { n: me?.user.plan.accounts_limit ?? 1 }) : t('acc.error', { e: bad }), 'error')
    setParams({}, { replace: true })
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Spinner />
  const reload = async () => { await refresh(); await load() }
  const toggle = async (id: number) => { await api.post(`/api/accounts/${id}/toggle`); reload() }
  const disconnect = async (id: number, username: string) => {
    if (!confirm(t('acc.disconnect_q', { u: username }))) return
    await api.del(`/api/accounts/${id}`)
    reload()
  }
  const full = data.used >= data.limit
  const pct = Math.min(100, (data.used / Math.max(1, data.limit)) * 100)

  return (
    <>
      <PageHeader title={t('acc.title')} sub={t('acc.sub')}
        action={full ? <Link to="/app/billing"><Button variant="secondary">{t('acc2.upgrade')}</Button></Link>
          : <a href="/instagram/connect"><Button><Plus className="h-4 w-4" />{t('acc.connect')}</Button></a>} />

      {/* tarif limiti */}
      <div className="mb-6 flex flex-col gap-3 rounded-3xl border border-line bg-white p-4 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white"><Instagram className="h-5 w-5" /></span>
        <div className="flex-1">
          <div className="text-[14px] font-semibold">{t('acc2.used', { used: data.used, limit: data.limit })}</div>
          <div className="mt-1.5 h-1.5 max-w-sm overflow-hidden rounded-full bg-soft">
            <div className={`h-full rounded-full transition-all duration-700 ${full ? 'bg-amber-500' : 'bg-gradient-to-r from-[#dd2a7b] to-[#8134af]'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        {full && <span className="text-[12.5px] text-ink-3">{t('acc2.full')}</span>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {data.items.map(a => {
            const current = account?.id === a.id
            const tokenWarn = a.token_days !== null && a.token_days < 10
            return (
              <div key={a.id} className={`overflow-hidden rounded-3xl border bg-white transition ${current ? 'border-ink/20 shadow-card' : 'border-line'}`}>
                <div className="h-1.5 bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af]" style={{ opacity: a.active ? 1 : 0.25 }} />
                <div className="p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className={a.active ? '' : 'grayscale'}><IgAvatar account={a} size={60} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={`https://instagram.com/${a.username}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-[17px] font-bold hover:underline">
                          @{a.username}<ExternalLink className="h-3.5 w-3.5 text-ink-4" />
                        </a>
                        {current && <span className="chip bg-ink text-white">{t('acc2.current')}</span>}
                        <span className={`chip ${a.active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${a.active ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />{a.active ? t('acc2.live') : t('common.paused')}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[13px] text-ink-3">
                        {a.name}{a.followers ? ` · ${t('sim.followers', { n: a.followers.toLocaleString('ru-RU') })}` : ''}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-4">
                        <Activity className="h-3.5 w-3.5" />{a.last_event_at ? t('acc2.last', { ago: ago(a.last_event_at) }) : t('acc2.no_events')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!current && <Button size="sm" variant="secondary" onClick={() => setAccountId(a.id)}>{t('acc2.select')}</Button>}
                      <Menu items={[
                        { icon: a.active ? Pause : Play, label: a.active ? t('acc.pause') : t('acc.resume'), onClick: () => toggle(a.id) },
                        { icon: RefreshCw, label: t('acc2.reconnect'), onClick: () => { window.location.href = '/instagram/connect' } },
                        { icon: Trash2, label: t('acc.disconnect'), onClick: () => disconnect(a.id, a.username), danger: true },
                      ]} />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { icon: Users, v: a.contacts, l: t('acc2.contacts'), to: '/app/crm?view=list' },
                      { icon: Workflow, v: a.flows_active, l: t('acc2.flows'), to: '/app/flows' },
                      { icon: MessageCircle, v: a.inbound_7d, l: t('acc2.inbound'), to: '/app/inbox' },
                      { icon: Send, v: a.sent_7d, l: t('acc2.sent'), to: '/app/activity' },
                    ].map(x => (
                      <Link key={x.l} to={x.to} onClick={() => setAccountId(a.id)} className="group rounded-2xl bg-soft px-3.5 py-3 transition hover:bg-[#ececf0]">
                        <x.icon className="h-4 w-4 text-ink-4 group-hover:text-ink-2" />
                        <div className="mt-2 text-[20px] font-extrabold tabular-nums leading-none">{x.v}</div>
                        <div className="mt-1 text-[11.5px] text-ink-3">{x.l}</div>
                      </Link>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <Health ok={a.token_days === null || a.token_days > 0} warn={tokenWarn} icon={KeyRound}
                      label={a.token_days === null ? t('acc2.token_ok') : tokenWarn ? t('acc2.token_soon', { n: Math.max(0, a.token_days) }) : t('acc2.token_days', { n: a.token_days })} />
                    <Health ok={a.ai} icon={Bot} label={a.ai ? t('acc2.ai_on') : t('acc2.ai_off')} to="/app/integrations?open=ai" />
                    <Health ok={a.telegram} icon={Send} label={a.telegram ? t('acc2.tg_on') : t('acc2.tg_off')} to="/app/integrations?open=telegram" />
                    <Health ok={a.flows_active > 0} icon={Workflow} label={a.flows_active ? t('acc2.flows_on', { n: a.flows_active }) : t('acc2.flows_off')} to="/app/flows" />
                  </div>
                </div>
              </div>
            )
          })}

          {/* yangi akkaunt */}
          {full ? (
            <Link to="/app/billing" className="flex items-center gap-4 rounded-3xl border-2 border-dashed border-line px-6 py-6 transition hover:border-amber-300 hover:bg-amber-50/40">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600"><AlertTriangle className="h-5 w-5" /></span>
              <span><span className="block text-[15px] font-bold">{t('acc2.full')}</span><span className="block text-[13px] text-ink-3">{t('acc.limit', { n: data.limit })}</span></span>
            </Link>
          ) : (
            <a href="/instagram/connect" className="group flex flex-col items-center rounded-3xl border-2 border-dashed border-line px-6 py-10 text-center transition hover:border-[#dd2a7b]/40 hover:bg-[#fdf2f8]/50">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white shadow-[0_10px_24px_-10px_rgba(221,42,123,.7)] transition group-hover:scale-105"><Plus className="h-6 w-6" /></span>
              <span className="mt-4 text-[16px] font-bold">{data.items.length ? t('acc2.add_more') : t('acc.connect')}</span>
              <span className="mt-1 max-w-sm text-[13px] text-ink-3">{t('acc2.add_d')}</span>
            </a>
          )}
        </div>

        {/* talablar */}
        <aside className="h-fit rounded-3xl border border-line bg-white p-5 xl:sticky xl:top-6">
          <h3 className="text-[15px] font-bold">{t('acc2.how')}</h3>
          <ol className="mt-4 space-y-4">
            {(['acc.req1', 'acc.req2', 'acc2.req3'] as TKey[]).map((k, i) => (
              <li key={k} className="relative flex gap-3">
                {i < 2 && <span className="absolute left-[13px] top-8 h-[calc(100%-16px)] w-px bg-line" />}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-[12px] font-bold text-white">{i + 1}</span>
                <span className="pt-1 text-[13px] leading-snug text-ink-2">{t(k)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex gap-2 rounded-2xl bg-soft p-3 text-[12px] leading-snug text-ink-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{t('acc2.safe')}
          </div>
        </aside>
      </div>
    </>
  )
}
