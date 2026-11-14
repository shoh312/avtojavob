import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Hourglass, Info, Megaphone, MessageCircleReply, Plus, RotateCcw, Send, Tag, Trash2, Users, X, XCircle } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Avatar, Button, Modal, PageHeader, Spinner, useToast } from '../components/ui'
import { PhoneFrame } from '../components/Phone'
import { Onboarding } from './Home'

type Bc = {
  id: number; text: string; tag: string; stage: string; status: string; total: number; sent: number; failed: number
  replies: number; reply_rate: number; buttons: { title: string; url: string }[]; created_at: string
}
type Stats = { count: number; sent: number; replies: number; reply_rate: number }
type Stage = { id: string; name: string; color: string; n: number }
type Audience = { eligible: number; window: number; closing_soon: number; total: number; tags: { tag: string; n: number }[]; stages: Stage[] }
type Btn = { title: string; url: string }

const SAMPLE = { name: 'Ali', username: '@ali_client', phone: '+992 90 123 45 67' }
const fillSample = (s: string) => s.replace(/\{(name|username|phone)\}/g, (_, k: keyof typeof SAMPLE) => SAMPLE[k])

function Chip({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: ReactNode; dot?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition
        ${active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:border-[#cfcfd6]'}`}>
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {children}
    </button>
  )
}

function Step({ n, title, children, right }: { n: number; title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative pl-10">
      <span className="absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-[12.5px] font-bold text-brand-700">{n}</span>
      <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-[14.5px] font-bold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function Broadcasts() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const { account } = useAuth()
  const [items, setItems] = useState<Bc[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [aud, setAud] = useState<Audience | null>(null)
  const [form, setForm] = useState({ text: '', tag: '', stage: '', buttons: [] as Btn[] })
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: Bc[]; stats: Stats }>(`/api/broadcasts?account_id=${account.id}`)
      .then(r => { setItems(r.items); setStats(r.stats) }).catch(() => setItems([]))
  }, [account])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!account) return
    api.get<Audience>(`/api/broadcasts/audience?account_id=${account.id}&tag=${encodeURIComponent(form.tag)}&stage=${encodeURIComponent(form.stage)}`)
      .then(setAud).catch(() => {})
  }, [account, form.tag, form.stage])
  useEffect(() => {
    if (!items?.some(b => b.status === 'running')) return
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
  }, [items, load])

  const stageName = useMemo(() => Object.fromEntries((aud?.stages || []).map(s => [s.id, s])), [aud])

  if (!account) return <Onboarding />
  const max = form.buttons.length ? 640 : 1000
  const eligible = aud?.eligible ?? 0
  const minutes = Math.max(1, Math.ceil((eligible * 0.6) / 60))
  const btnsOk = form.buttons.every(b => b.title.trim() && /^https?:\/\/\S+/.test(b.url))
  const ready = !!form.text.trim() && form.text.length <= max && eligible > 0 && btnsOk

  const insert = (v: string) => {
    const el = textRef.current
    const s = el?.selectionStart ?? form.text.length, e = el?.selectionEnd ?? form.text.length
    setForm(f => ({ ...f, text: f.text.slice(0, s) + v + f.text.slice(e) }))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + v.length, s + v.length) })
  }
  const setBtn = (i: number, p: Partial<Btn>) => setForm(f => ({ ...f, buttons: f.buttons.map((x, j) => (j === i ? { ...x, ...p } : x)) }))

  const send = async () => {
    setBusy(true)
    try {
      await api.post('/api/broadcasts', { account_id: account.id, ...form, buttons: form.buttons.filter(b => b.title || b.url) })
      toast(t('bc.started'))
      setConfirmOpen(false)
      setForm(f => ({ ...f, text: '', buttons: [] }))
      load()
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      const known = ['no_audience', 'broadcast_running', 'plan_inactive', 'message_text', 'button_title', 'button_url']
      toast(known.includes(code) ? t((code.startsWith('button') ? `ve.${code}` : `err.${code}`) as TKey) : t('common.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const reuse = (b: Bc) => {
    setForm({ text: b.text, tag: b.tag, stage: b.stage, buttons: b.buttons || [] })
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const preview = fillSample(form.text)
  const win = aud?.window ?? 0

  return (
    <>
      <div ref={topRef} />
      <PageHeader title={t('bc.title')} sub={t('bc.sub')} />

      {/* 24 soatlik oyna + statistika */}
      <div className="mb-6 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="card relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-50" />
          <div className="relative flex items-center gap-4">
            <div className="relative grid h-16 w-16 shrink-0 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f1f1f4" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  className="text-brand-600 transition-all duration-700"
                  strokeDasharray={`${aud && aud.total ? Math.max(3, (win / aud.total) * 97.4) : 0} 97.4`} />
              </svg>
              <Hourglass className="h-5 w-5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-4">{t('bc2.window')}</div>
              <div className="text-[28px] font-extrabold leading-tight tracking-tight">{aud ? win : '…'}<span className="ml-1 text-[14px] font-medium text-ink-4">/ {aud?.total ?? '…'}</span></div>
              <div className="text-[12.5px] text-ink-3">{t('bc2.window_d')}</div>
            </div>
          </div>
          {!!aud?.closing_soon && (
            <div className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-800">
              <Clock className="h-3.5 w-3.5" />{t('bc2.closing', { n: aud.closing_soon })}
            </div>
          )}
        </div>
        {[
          { icon: Megaphone, label: t('bc2.s_count'), value: stats?.count ?? '…' },
          { icon: Send, label: t('bc2.s_sent'), value: stats?.sent ?? '…' },
          { icon: MessageCircleReply, label: t('bc2.s_rate'), value: stats ? `${stats.reply_rate}%` : '…', sub: stats?.replies ? `${stats.replies}` : '' },
        ].map(s => (
          <div key={s.label} className="card flex flex-col justify-between p-5">
            <s.icon className="h-4 w-4 text-ink-4" />
            <div className="mt-4">
              <div className="text-[24px] font-extrabold tracking-tight">{s.value}{s.sub && <span className="ml-1.5 text-[13px] font-medium text-ink-4">· {s.sub}</span>}</div>
              <div className="text-[12.5px] text-ink-3">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* tuzuvchi */}
        <section className="card space-y-8 p-6">
          <Step n={1} title={t('bc2.step1')} right={<span className={`chip ${eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-soft text-ink-3'}`}><Users className="mr-1 h-3.5 w-3.5" />{t('bc2.recipients', { n: aud ? eligible : '…' })}</span>}>
            {aud && win === 0 ? (
              <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] leading-snug text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('bc2.zero')}</div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={!form.tag && !form.stage} onClick={() => setForm(f => ({ ...f, tag: '', stage: '' }))}>{t('bc2.everyone')} <span className="opacity-60">{win}</span></Chip>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-4"><Tag className="h-3 w-3" />{t('bc2.by_tag')}</div>
                  {aud?.tags.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {aud.tags.map(x => (
                        <Chip key={x.tag} active={form.tag === x.tag} onClick={() => setForm(f => ({ ...f, tag: f.tag === x.tag ? '' : x.tag }))}>{x.tag} <span className="opacity-60">{x.n}</span></Chip>
                      ))}
                    </div>
                  ) : <p className="text-[12.5px] text-ink-4">{t('bc2.no_tags')}</p>}
                </div>
                {!!aud?.stages.length && (
                  <div>
                    <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-4">{t('bc2.by_stage')}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {aud.stages.map(s => (
                        <Chip key={s.id} dot={s.color} active={form.stage === s.id} onClick={() => setForm(f => ({ ...f, stage: f.stage === s.id ? '' : s.id }))}>{s.name} <span className="opacity-60">{s.n}</span></Chip>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Step>

          <Step n={2} title={t('bc2.step2')}>
            <textarea ref={textRef} rows={5} className="input resize-y leading-snug" maxLength={max} value={form.text}
              placeholder={t('bc2.ph')} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-ink-4">{t('bc2.vars')}</span>
              {['{name}', '{username}', '{phone}'].map(v => (
                <button key={v} type="button" onClick={() => insert(v)} className="rounded-md bg-soft px-1.5 py-0.5 font-mono text-[11px] text-ink-2 hover:bg-brand-50 hover:text-brand-700">{v}</button>
              ))}
              <span className={`ml-auto text-[11.5px] tabular-nums ${form.text.length > max * 0.9 ? 'font-semibold text-brand-600' : 'text-ink-4'}`}>{form.text.length}/{max}</span>
            </div>

            <div className="mt-4 space-y-2">
              {form.buttons.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input w-36" maxLength={20} placeholder={t('insp.btn_title')} value={b.title} onChange={e => setBtn(i, { title: e.target.value })} />
                  <div className="relative flex-1"><ExternalLink className="absolute left-3 top-3 h-3.5 w-3.5 text-ink-4" />
                    <input className="input pl-8 font-mono text-[13px]" placeholder="https://" value={b.url} onChange={e => setBtn(i, { url: e.target.value.trim() })} /></div>
                  <button onClick={() => setForm(f => ({ ...f, buttons: f.buttons.filter((_, j) => j !== i) }))} className="rounded-lg p-2 text-ink-4 hover:bg-brand-50 hover:text-brand-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {form.buttons.length < 3 && (
                <button onClick={() => setForm(f => ({ ...f, buttons: [...f.buttons, { title: '', url: '' }] }))}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
                  <Plus className="h-4 w-4" />{t('insp.add_button')} <span className="font-normal text-ink-4">· {t('bc2.buttons_hint')}</span>
                </button>
              )}
            </div>
          </Step>

          <Step n={3} title={t('bc2.step3')}>
            <div className="flex flex-col gap-3 rounded-2xl bg-soft p-4 sm:flex-row sm:items-center">
              <div className="flex-1 text-[13px] text-ink-2">
                {eligible ? t('bc2.summary', { n: eligible, m: minutes }) : t('bc2.recipients', { n: 0 })}
                <div className="mt-1 flex gap-1.5 text-[12px] leading-snug text-ink-4"><Info className="mt-0.5 h-3 w-3 shrink-0" />{t('bc.rule')}</div>
              </div>
              <Button onClick={() => setConfirmOpen(true)} disabled={!ready}><Megaphone className="h-4 w-4" />{t('bc.send')}</Button>
            </div>
          </Step>
        </section>

        {/* telefon ko'rinishi */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <span className="text-[13px] font-bold">{t('bc2.preview')}</span>
            <span className="text-[12px] text-ink-4">{t('bc2.preview_d')}</span>
          </div>
          <PhoneFrame account={account} className="h-[520px]">
            <div className="flex flex-1 flex-col justify-end gap-2 overflow-y-auto px-3 pb-4">
              {form.text.trim() ? (
                <div className="flex items-end gap-2 animate-fade-up">
                  <Avatar name={account.username} src={account.picture_url} size={24} />
                  <div className="max-w-[78%]">
                    <div className={`whitespace-pre-wrap break-words bg-[#efeff2] px-3.5 py-2 text-[13px] leading-snug ${form.buttons.length ? 'rounded-t-[18px] rounded-br-[18px]' : 'rounded-[18px] rounded-bl-md'}`}>{preview}</div>
                    {form.buttons.filter(b => b.title).map((b, i) => (
                      <div key={i} className={`mt-px flex items-center justify-center gap-1 bg-[#efeff2] py-2 text-[12.5px] font-semibold text-[#0a66c2] ${i === form.buttons.filter(x => x.title).length - 1 ? 'rounded-b-[18px]' : ''}`}>
                        {b.title}<ExternalLink className="h-3 w-3" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="m-auto max-w-[200px] text-center text-[12.5px] text-ink-4">
                  <Megaphone className="mx-auto mb-2 h-6 w-6 text-ink-4/60" />{t('bc2.empty_preview')}
                </div>
              )}
            </div>
          </PhoneFrame>
        </aside>
      </div>

      {/* tarix */}
      <section className="mt-10">
        <h2 className="mb-3 text-[16px] font-bold">{t('bc.history')}</h2>
        {items === null ? <Spinner /> : items.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Megaphone className="h-5 w-5" /></span>
            <div className="mt-3 text-[15px] font-bold">{t('bc2.empty_t')}</div>
            <p className="mt-1 max-w-sm text-[13px] text-ink-3">{t('bc2.empty_d')}</p>
          </div>
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {items.map(b => {
              const done = b.sent + b.failed
              const pct = b.total ? (done / b.total) * 100 : 0
              const st = b.status
              const tone = st === 'done' ? 'text-emerald-600' : st === 'running' ? 'text-sky-600' : 'text-amber-600'
              const Icon = st === 'done' ? CheckCircle2 : st === 'running' ? Send : AlertTriangle
              return (
                <div key={b.id} className="group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className={`inline-flex items-center gap-1 font-semibold ${tone}`}><Icon className={`h-3.5 w-3.5 ${st === 'running' ? 'animate-pulse' : ''}`} />{t(`bc.status.${st}` as TKey)}</span>
                      <span className="text-ink-4">· {ago(b.created_at)}</span>
                      {b.tag && <span className="chip font-mono text-[11px]">#{b.tag}</span>}
                      {b.stage && <span className="chip text-[11px]"><span className="mr-1 h-1.5 w-1.5 rounded-full" style={{ background: stageName[b.stage]?.color || '#999' }} />{stageName[b.stage]?.name || b.stage}</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13.5px] text-ink-2">{b.text}</p>
                    {st === 'running' && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-soft"><div className="h-1 rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${pct}%` }} /></div>
                    )}
                  </div>
                  <div className="flex items-center gap-5 text-center">
                    <div><div className="text-[16px] font-bold tabular-nums">{b.sent}<span className="text-[12px] font-medium text-ink-4">/{b.total}</span></div><div className="text-[11px] text-ink-4">{t('bc2.of')}</div></div>
                    <div><div className="text-[16px] font-bold tabular-nums text-emerald-600">{b.reply_rate}%</div><div className="text-[11px] text-ink-4">{b.replies} {t('bc2.replied')}</div></div>
                    {b.failed > 0 && <div><div className="inline-flex items-center gap-1 text-[16px] font-bold tabular-nums text-brand-600"><XCircle className="h-3.5 w-3.5" />{b.failed}</div><div className="text-[11px] text-ink-4">{t('bc2.failed')}</div></div>}
                    <button onClick={() => reuse(b)} title={t('bc2.reuse')}
                      className="rounded-xl p-2 text-ink-4 transition hover:bg-soft hover:text-ink sm:opacity-0 sm:group-hover:opacity-100"><RotateCcw className="h-4 w-4" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Modal open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} title={t('bc2.confirm_t')} icon={<Megaphone className="h-5 w-5" />}>
        <div className="space-y-4">
          <div className="rounded-2xl bg-soft p-3">
            <div className="whitespace-pre-wrap break-words text-[13.5px] leading-snug">{preview}</div>
            {form.buttons.filter(b => b.title).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">{form.buttons.filter(b => b.title).map((b, i) => <span key={i} className="chip bg-white text-[#0a66c2]">{b.title}</span>)}</div>
            )}
          </div>
          <p className="flex items-start gap-2 text-[13px] text-ink-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{t('bc2.confirm_d', { n: eligible })}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={busy}><X className="h-4 w-4" />{t('bc2.cancel')}</Button>
            <Button onClick={send} loading={busy}><Send className="h-4 w-4" />{t('bc.send')}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
