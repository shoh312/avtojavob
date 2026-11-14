import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Bot, CheckCircle2, ExternalLink, FileSpreadsheet, Instagram, Lock, MessageCircle, Send, ShoppingBag, Sparkles, Webhook, Workflow, X, Zap } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Avatar, Button, Spinner, Toggle, useToast } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { Onboarding } from './Home'
import { AiSalesPanel, type AiSettings } from './AiSales'

type Integ = AiSettings & {
  telegram: { connected: boolean; chat: string; two_way: boolean; bot: string }
  tg_notify_leads: boolean; tg_notify_inbox: boolean; tg_notify_all: boolean
  instagram: { username: string; active: boolean; picture_url: string }
  products: number; webhook_flows: { id: number; name: string }[]
}
type Key = 'instagram' | 'ai' | 'telegram' | 'webhook' | 'catalog'
type State = 'on' | 'off' | 'setup'

const META: Record<Key, { icon: typeof Bot; bg: string; title: TKey; what: TKey }> = {
  instagram: { icon: Instagram, bg: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]', title: 'int2.ig.t', what: 'int2.ig.w' },
  ai: { icon: Sparkles, bg: 'bg-gradient-to-br from-[#6d5dfc] to-[#e5161f]', title: 'ai3.title', what: 'ai3.w' },
  telegram: { icon: Send, bg: 'bg-[#229ED9]', title: 'int.tg.title', what: 'int2.tg.w' },
  webhook: { icon: Webhook, bg: 'bg-ink', title: 'int.wh.title', what: 'int2.wh.w' },
  catalog: { icon: ShoppingBag, bg: 'bg-emerald-500', title: 'nav.products', what: 'int2.cat.w' },
}
// Xaritadagi joylashuv (foizda)
const POS: Record<Key, [number, number]> = {
  instagram: [12, 50], ai: [33, 14], telegram: [67, 14], webhook: [88, 50], catalog: [50, 86],
}

function StatusPill({ s }: { s: State }) {
  const { t } = useI18n()
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${s === 'on' ? 'bg-emerald-50 text-emerald-700' : s === 'off' ? 'bg-soft text-ink-3' : 'bg-amber-50 text-amber-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s === 'on' ? 'bg-emerald-500' : s === 'off' ? 'bg-ink-4' : 'bg-amber-500'}`} />
      {t(s === 'on' ? 'int2.s.on' : s === 'off' ? 'int2.s.off' : 'int2.s.setup')}
    </span>
  )
}

function Drawer({ k, onClose, children, footer, wide }: { k: Key; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { t } = useI18n()
  const m = META[k]
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside onMouseDown={e => e.stopPropagation()} className={`flex h-full w-full animate-fade-up flex-col bg-white text-ink shadow-pop ${wide ? 'max-w-[620px]' : 'max-w-[540px]'}`}>
        <div className="flex items-center gap-3 border-b border-line px-6 py-4">
          <span className={`grid h-10 w-10 place-items-center rounded-xl text-white ${m.bg}`}><m.icon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold">{t(m.title)}</div>
            <div className="truncate text-[12.5px] text-ink-3">{t(m.what)}</div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-ink-3 hover:bg-soft hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-line px-6 py-3">{footer}</div>}
      </aside>
    </div>
  )
}

function StepTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5 text-[14px] font-bold">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[12px] text-white">{n}</span>{children}
    </div>
  )
}

export default function Integrations() {
  const { t } = useI18n()
  const toast = useToast()
  const { account } = useAuth()
  const [d, setD] = useState<Integ | null>(null)
  const [params] = useSearchParams()
  const [open, setOpen] = useState<Key | null>(() => (['instagram', 'ai', 'telegram', 'webhook', 'catalog'].includes(params.get('open') || '') ? params.get('open') as Key : null))
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState('')
  const [aiDirty, setAiDirty] = useState<{ name: string; prompt: string } | null>(null)

  useEffect(() => {
    if (!account) return
    api.get<Integ>(`/api/accounts/${account.id}/integrations`).then(setD).catch(() => {})
  }, [account])
  if (!account) return <Onboarding />
  if (!d) return <Spinner />

  const base = `/api/accounts/${account.id}`
  const fail = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : ''
    toast(['tg_invalid', 'tg_no_chat', 'ai_unavailable', 'ai_failed'].includes(code) ? t(`err.${code}` as TKey) : t('common.error'), 'error')
  }
  const save = async (patch: Partial<Integ>) => {
    try { setD(await api.put<Integ>(`${base}/integrations`, patch)) } catch (e) { fail(e) }
  }
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn() } catch (e) { fail(e) } finally { setBusy('') } }

  const state: Record<Key, State> = {
    instagram: d.instagram.active ? 'on' : 'setup',
    ai: !d.ai_available ? 'setup' : d.ai_enabled ? 'on' : 'off',
    telegram: d.telegram.connected ? 'on' : 'setup',
    webhook: d.webhook_flows.length ? 'on' : 'off',
    catalog: d.products ? 'on' : 'setup',
  }
  const keys = Object.keys(META) as Key[]
  const onCount = keys.filter(k => state[k] === 'on').length
  const detail: Record<Key, string> = {
    instagram: `@${d.instagram.username}`,
    ai: d.ai_enabled ? `${d.ai_name || 'AI'} · ${t('int2.ai.d_on')}` : t('int2.ai.d_off'),
    telegram: d.telegram.connected ? (d.telegram.bot ? `@${d.telegram.bot}` : d.telegram.chat) : t('int2.tg.d_off'),
    webhook: d.webhook_flows.length ? t('int2.wh.d_on', { n: d.webhook_flows.length }) : t('int2.wh.d_off'),
    catalog: d.products ? t('int2.cat.d_on', { n: d.products }) : t('int2.cat.d_off'),
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight">{t('int.title')}</h1>
        <p className="mt-1 text-[14px] text-ink-3">{t('int2.sub', { n: onCount, total: keys.length })}</p>
      </div>

      {/* ulanish xaritasi */}
      <section className="relative mb-8 hidden h-[300px] overflow-hidden rounded-[28px] border border-line bg-white sm:block"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #ececf0 1px, transparent 0)', backgroundSize: '22px 22px' }}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {keys.map(k => {
            const [x, y] = POS[k]
            const on = state[k] === 'on'
            return <line key={k} x1="50" y1="50" x2={x} y2={y} vectorEffect="non-scaling-stroke"
              stroke={on ? '#10b981' : '#d4d4da'} strokeWidth={on ? 2 : 1.5} strokeDasharray={on ? '5 5' : '3 5'}
              className={on ? 'animate-[dash_1.2s_linear_infinite]' : ''} />
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="grid h-20 w-20 place-items-center rounded-[26px] bg-white shadow-[0_18px_40px_-16px_rgba(229,22,31,.55)] ring-1 ring-line">
            <LogoMark size={40} />
          </div>
        </div>
        {keys.map(k => {
          const m = META[k]
          const [x, y] = POS[k]
          return (
            <button key={k} onClick={() => setOpen(k)} style={{ left: `${x}%`, top: `${y}%` }}
              className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
              <span className={`relative grid h-12 w-12 place-items-center rounded-2xl text-white shadow-card transition group-hover:-translate-y-0.5 group-hover:shadow-pop ${m.bg} ${state[k] === 'on' ? '' : 'opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0'}`}>
                <m.icon className="h-5 w-5" />
                {state[k] === 'on' && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 ring-2 ring-white"><CheckCircle2 className="h-3 w-3" /></span>}
              </span>
              <span className="whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{t(m.title)}</span>
            </button>
          )
        })}
      </section>

      {/* kartalar */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {keys.map(k => {
          const m = META[k]
          return (
            <button key={k} onClick={() => setOpen(k)}
              className="group flex flex-col rounded-3xl border border-line bg-white p-5 text-left transition hover:border-[#d6d6dc] hover:shadow-card">
              <div className="flex items-start justify-between">
                <span className={`grid h-11 w-11 place-items-center rounded-2xl text-white ${m.bg}`}><m.icon className="h-5 w-5" /></span>
                <StatusPill s={state[k]} />
              </div>
              <div className="mt-4 text-[16px] font-bold">{t(m.title)}</div>
              <div className="mt-1 text-[13px] leading-snug text-ink-3">{t(m.what)}</div>
              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="truncate text-[12.5px] font-medium text-ink-2">{detail[k]}</span>
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink group-hover:text-brand-700">
                  {state[k] === 'setup' ? t('int2.connect') : t('int2.open')}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <h2 className="mb-3 mt-10 text-[13px] font-bold uppercase tracking-wider text-ink-3">{t('int2.soon')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: MessageCircle, name: 'WhatsApp', bg: 'bg-[#25D366]' },
          { icon: FileSpreadsheet, name: 'Google Sheets', bg: 'bg-[#0F9D58]' },
          { icon: Zap, name: 'amoCRM / Bitrix24', bg: 'bg-[#2fc6f6]' },
        ].map(x => (
          <div key={x.name} className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3.5">
            <span className={`grid h-9 w-9 place-items-center rounded-xl text-white opacity-60 ${x.bg}`}><x.icon className="h-4 w-4" /></span>
            <span className="flex-1 text-[14px] font-semibold text-ink-2">{x.name}</span>
            <Lock className="h-3.5 w-3.5 text-ink-4" />
          </div>
        ))}
      </div>

      {/* ---------------- panellar ---------------- */}
      {open === 'ai' && (
        <Drawer k="ai" wide onClose={() => { if (!aiDirty || confirm(t('ai3.leave'))) { setOpen(null); setAiDirty(null) } }} footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-ink-4">{aiDirty ? t('ed.unsaved') : t('int2.saved_state')}</span>
            <Button disabled={!aiDirty} loading={busy === 'aisave'}
              onClick={() => aiDirty && run('aisave', async () => { await save({ ai_name: aiDirty.name, ai_prompt: aiDirty.prompt }); toast(t('common.saved')) })}>{t('common.save')}</Button>
          </div>}>
          <AiSalesPanel accountId={account.id} s={d} save={save} onDirty={setAiDirty} />
        </Drawer>
      )}

      {open === 'telegram' && (
        <Drawer k="telegram" onClose={() => setOpen(null)}>
          {d.telegram.connected ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-2xl bg-[#e8f4fb] p-4">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#229ED9] text-white"><Send className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-[#0b3f5a]">{d.telegram.bot ? `@${d.telegram.bot}` : 'Telegram bot'}</div>
                  <div className="truncate text-[12.5px] text-[#11577a]">{t('int.tg.connected', { chat: d.telegram.chat })}</div>
                </div>
                {d.telegram.bot && <a href={`tg://resolve?domain=${d.telegram.bot}`} className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#229ED9]"><ExternalLink className="h-4 w-4" /></a>}
              </div>
              <p className="text-[13px] leading-relaxed text-ink-2">{d.telegram.two_way ? t('int.tg.reply_info') : t('int.tg.reply_https')}</p>
              <div>
                <div className="mb-2 text-[13px] font-bold">{t('int2.tg.notify')}</div>
                <div className="divide-y divide-line rounded-2xl border border-line">
                  {([['tg_notify_all', 'int.tg.all', 'int2.tg.all_d'], ['tg_notify_leads', 'int.tg.leads', 'int2.tg.leads_d'], ['tg_notify_inbox', 'int.tg.inbox', 'int2.tg.inbox_d']] as const)
                    .filter(([key]) => !(key === 'tg_notify_inbox' && d.tg_notify_all)).map(([key, label, desc]) => (
                      <label key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                        <span><span className="block text-[14px] font-semibold">{t(label)}</span><span className="block text-[12px] text-ink-3">{t(desc)}</span></span>
                        <Toggle checked={d[key]} onChange={v => save({ [key]: v })} />
                      </label>
                    ))}
                </div>
              </div>
              <button onClick={() => confirm(`${t('int.tg.disconnect')}?`) && run('tgdel', async () => setD(await api.del<Integ>(`${base}/telegram`)))}
                className="text-[13px] font-semibold text-brand-600 hover:underline">{t('int.tg.disconnect')}</button>
            </div>
          ) : (
            <div>
              {(['int.tg.step1', 'int.tg.step2', 'int.tg.step3'] as TKey[]).map((k, i) => (
                <div key={k} className="relative flex gap-3.5 pb-6">
                  {i < 2 && <span className="absolute left-[13px] top-8 h-[calc(100%-28px)] w-px bg-line" />}
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#229ED9] text-[12.5px] font-bold text-white">{i + 1}</span>
                  <div className="pt-0.5 text-[13.5px] leading-relaxed text-ink-2">
                    {t(k)}
                    {i === 0 && <a href="tg://resolve?domain=BotFather" className="mt-2 flex w-fit items-center gap-1.5 rounded-xl bg-[#e8f4fb] px-3 py-1.5 text-[13px] font-semibold text-[#11577a] hover:bg-[#d5ebf7]"><Send className="h-3.5 w-3.5" />@BotFather</a>}
                  </div>
                </div>
              ))}
              <label className="block"><span className="label">{t('int.tg.token')}</span>
                <input className="input font-mono text-[13px]" placeholder="123456789:AA..." value={token} onChange={e => setToken(e.target.value)} /></label>
              <Button className="mt-3 w-full" loading={busy === 'tg'} disabled={!token.trim()}
                onClick={() => run('tg', async () => { setD(await api.post<Integ>(`${base}/telegram`, { bot_token: token })); setToken(''); toast(t('int2.tg.ok')) })}>{t('int.tg.connect')}</Button>
            </div>
          )}
        </Drawer>
      )}

      {open === 'webhook' && (
        <Drawer k="webhook" onClose={() => setOpen(null)}>
          <p className="mb-5 text-[13.5px] leading-relaxed text-ink-2">{t('int.wh.desc')}</p>
          <StepTitle n={1}>{t('int2.wh.s1')}</StepTitle>
          <p className="mb-5 ml-8 text-[13px] text-ink-3">{t('int2.wh.s1d')}</p>
          <StepTitle n={2}>{t('int2.wh.s2')}</StepTitle>
          <pre className="mb-5 ml-8 overflow-x-auto rounded-2xl bg-[#16161b] p-4 font-mono text-[11.5px] leading-relaxed text-[#e6e6ea]">{`POST https://your-server.com/hook
{
  "event": "flow_webhook",
  "flow": { "id": 12, "name": "Lead" },
  "account": "${d.instagram.username}",
  "contact": {
    "id": 345,
    "username": "customer",
    "name": "Ali",
    "tags": ["vip"],
    "fields": { "phone": "+992 900 00 00 00" }
  }
}`}</pre>
          <div className="mb-2 text-[13px] font-bold">{t('int2.wh.used')}</div>
          {d.webhook_flows.length ? (
            <div className="space-y-1.5">{d.webhook_flows.map(f => (
              <Link key={f.id} to={`/app/flows/${f.id}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13.5px] font-medium hover:bg-soft"><Workflow className="h-4 w-4 text-ink-3" />{f.name}<ArrowRight className="ml-auto h-4 w-4 text-ink-4" /></Link>
            ))}</div>
          ) : <Link to="/app/flows" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-700 hover:underline">{t('int2.wh.go')}<ArrowRight className="h-4 w-4" /></Link>}
        </Drawer>
      )}

      {(open === 'instagram' || open === 'catalog') && (
        <Drawer k={open} onClose={() => setOpen(null)}>
          {open === 'instagram' && (
            <div className="flex items-center gap-3 rounded-2xl border border-line p-4">
              <Avatar name={d.instagram.username} src={d.instagram.picture_url} size={48} />
              <div className="flex-1"><div className="text-[15px] font-bold">@{d.instagram.username}</div><StatusPill s={state.instagram} /></div>
            </div>
          )}
          <p className="my-5 text-[13.5px] leading-relaxed text-ink-2">{t(open === 'instagram' ? 'int2.ig.long' : 'int2.cat.long')}</p>
          <Link to={open === 'instagram' ? '/app/accounts' : '/app/products'}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-[14px] font-semibold text-white hover:bg-black">
            {t(open === 'instagram' ? 'int2.ig.go' : 'int2.cat.go')}<ArrowRight className="h-4 w-4" />
          </Link>
        </Drawer>
      )}
    </>
  )
}
