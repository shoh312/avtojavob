import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, ExternalLink, Info, Loader2, MousePointerClick, Plus, Send, Trash2, X, XCircle } from 'lucide-react'
import { api, type Media, type TriggerKind } from '../api'
import { useI18n, type TKey } from '../i18n'
import { NODE_META, TRIGGER_META, uid, webhookSample, type NodeType } from './meta'

type Props = {
  node: { id: string; type: NodeType; data: Record<string, any> }
  accountId: number
  flow?: { id: number; name: string }
  onChange: (patch: Record<string, any>) => void
  onDelete: () => void
  onClose: () => void
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <p className="hint">{hint}</p>}</label>
}

function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`flex gap-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-snug ${tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-soft text-ink-2'}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{children}
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-soft p-1">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition ${value === o.value ? 'bg-white text-ink shadow-card' : 'text-ink-3 hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function TextWithVars({ value, onChange, rows = 4, max, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; max: number; placeholder?: string }) {
  const { t } = useI18n()
  const ref = useRef<HTMLTextAreaElement>(null)
  const insert = (v: string) => {
    const el = ref.current
    if (!el) return onChange(value + v)
    const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length
    onChange(value.slice(0, s) + v + value.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + v.length, s + v.length) })
  }
  return (
    <div>
      <textarea ref={ref} rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="input resize-y leading-snug" />
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[11.5px] text-ink-4">{t('insp.vars')}</span>
        {['{username}', '{name}', '{phone}'].map(v => (
          <button key={v} type="button" onClick={() => insert(v)} className="rounded-md bg-soft px-1.5 py-0.5 font-mono text-[11px] text-ink-2 hover:bg-brand-50 hover:text-brand-700">{v}</button>
        ))}
        <span className={`ml-auto text-[11.5px] tabular-nums ${value.length > max ? 'font-semibold text-brand-600' : 'text-ink-4'}`}>{value.length}/{max}</span>
      </div>
    </div>
  )
}

function TriggerForm({ d, set, accountId }: { d: any; set: (p: any) => void; accountId: number }) {
  const { t } = useI18n()
  const [media, setMedia] = useState<Media[] | null>(null)
  useEffect(() => {
    if (d.kind !== 'comment' || media) return
    api.get<{ items: Media[] }>(`/api/accounts/${accountId}/media`).then(r => setMedia(r.items)).catch(() => setMedia([]))
  }, [d.kind, accountId, media])
  return (
    <div className="space-y-5">
      <div>
        <span className="label">{t('insp.when')}</span>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(TRIGGER_META) as TriggerKind[]).map(k => {
            const m = TRIGGER_META[k], Icon = m.icon
            return (
              <button key={k} type="button" onClick={() => set({ kind: k, ...(k === 'story_mention' ? { match: 'any' } : {}) })}
                className={`flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition ${d.kind === k ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-100' : 'border-line hover:bg-soft'}`}>
                <Icon className={`h-4 w-4 ${d.kind === k ? 'text-brand-600' : 'text-ink-3'}`} />
                <span className="text-[12.5px] font-semibold leading-tight">{t(m.label)}</span>
              </button>
            )
          })}
        </div>
      </div>
      {d.kind !== 'story_mention' && (
        <>
          <Field label={t('insp.match')}>
            <select className="input" value={d.match || 'contains'} onChange={e => set({ match: e.target.value })}>
              {(['contains', 'exact', 'any'] as const).map(m => <option key={m} value={m}>{t(`insp.match.${m}` as TKey)}</option>)}
            </select>
          </Field>
          {d.match !== 'any' && (
            <Field label={t('insp.keywords')} hint={t('insp.keywords_hint')}>
              <input className="input font-mono" value={d.keywords || ''} placeholder="narx, price, цена" onChange={e => set({ keywords: e.target.value })} />
            </Field>
          )}
        </>
      )}
      {d.kind === 'comment' && (
        <>
          <Field label={t('insp.post')}>
            {media === null ? <div className="input text-ink-4">{t('insp.post_loading')}</div> : (
              <div className="scrollbar-thin grid max-h-56 grid-cols-3 gap-1.5 overflow-auto rounded-xl border border-line p-1.5">
                <button type="button" onClick={() => set({ media_id: null, media_caption: '' })}
                  className={`col-span-3 rounded-lg px-2 py-2 text-[12.5px] font-semibold ${!d.media_id ? 'bg-brand-600 text-white' : 'bg-soft text-ink-2 hover:bg-[#efeff3]'}`}>
                  {t('insp.post_any')}
                </button>
                {media.map(m => (
                  <button key={m.id} type="button" title={m.caption} onClick={() => set({ media_id: m.id, media_caption: m.caption.slice(0, 80) })}
                    className={`relative aspect-square overflow-hidden rounded-lg bg-soft ${d.media_id === m.id ? 'ring-[3px] ring-brand-600' : 'hover:opacity-80'}`}>
                    {m.thumbnail ? <img src={m.thumbnail} alt="" className="h-full w-full object-cover" /> : <span className="p-1 text-[10px] text-ink-3">{m.caption.slice(0, 40)}</span>}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label={t('insp.comment_replies')} hint={t('insp.comment_replies_hint')}>
            <textarea rows={3} className="input resize-y" value={d.comment_replies || ''} onChange={e => set({ comment_replies: e.target.value })} />
          </Field>
          <Note tone="warn">{t('insp.comment_note')}</Note>
        </>
      )}
    </div>
  )
}

function MessageForm({ d, set }: { d: any; set: (p: any) => void }) {
  const { t } = useI18n()
  const buttons: any[] = d.buttons || []
  const setBtn = (id: string, patch: any) => set({ buttons: buttons.map(b => (b.id === id ? { ...b, ...patch } : b)) })
  return (
    <div className="space-y-5">
      <Field label={t('insp.text')}>
        <TextWithVars value={d.text || ''} onChange={v => set({ text: v })} max={buttons.length ? 640 : 1000} rows={5} />
      </Field>
      <div>
        <span className="label">{t('insp.buttons')}</span>
        <div className="space-y-2.5">
          {buttons.map(b => (
            <div key={b.id} className="rounded-xl border border-line p-2.5">
              <div className="flex items-center gap-2">
                <input className="input h-9 py-1.5" maxLength={20} value={b.title} placeholder={t('insp.btn_title')} onChange={e => setBtn(b.id, { title: e.target.value })} />
                <button type="button" onClick={() => set({ buttons: buttons.filter(x => x.id !== b.id) })} className="rounded-lg p-2 text-ink-4 hover:bg-brand-50 hover:text-brand-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2">
                <Segmented value={b.kind === 'url' ? 'url' : 'flow'} onChange={v => setBtn(b.id, { kind: v })} options={[
                  { value: 'flow', label: t('insp.btn_kind.flow') }, { value: 'url', label: t('insp.btn_kind.url') }]} />
              </div>
              {b.kind === 'url'
                ? <div className="relative mt-2"><ExternalLink className="absolute left-3 top-3 h-3.5 w-3.5 text-ink-4" /><input className="input pl-8 font-mono text-[13px]" placeholder="https://" value={b.url || ''} onChange={e => setBtn(b.id, { url: e.target.value })} /></div>
                : <p className="hint flex items-center gap-1"><MousePointerClick className="h-3 w-3" />{t('insp.flow_btn_hint')}</p>}
            </div>
          ))}
          {buttons.length < 3 && (
            <button type="button" onClick={() => set({ buttons: [...buttons, { id: uid(), title: '', kind: 'flow', url: '' }] })}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#d6d6dd] py-2.5 text-[13px] font-semibold text-ink-3 hover:border-brand-300 hover:text-brand-600">
              <Plus className="h-4 w-4" />{t('insp.add_button')}
            </button>
          )}
        </div>
        <p className="hint">{t('insp.buttons_hint')}</p>
      </div>
    </div>
  )
}

function QuestionForm({ d, set }: { d: any; set: (p: any) => void }) {
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      <Field label={t('insp.text')}><TextWithVars value={d.text || ''} onChange={v => set({ text: v })} max={1000} /></Field>
      <Field label={t('insp.q_field')}>
        <select className="input" value={d.field || 'phone'} onChange={e => {
          const f = e.target.value
          set({ field: f, validate: f === 'phone' ? 'phone' : f === 'email' ? 'email' : 'any' })
        }}>
          {['phone', 'email', 'name', 'custom'].map(f => <option key={f} value={f}>{t(`insp.field.${f}` as TKey)}</option>)}
        </select>
      </Field>
      {d.field === 'custom' && (
        <Field label={t('insp.custom_key')}>
          <input className="input font-mono" value={d.custom_key || ''} placeholder="city"
            onChange={e => set({ custom_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
        </Field>
      )}
      <Field label={t('insp.validate')}>
        <select className="input" value={d.validate || 'any'} onChange={e => set({ validate: e.target.value })}>
          {['any', 'phone', 'email', 'number'].map(v => <option key={v} value={v}>{t(`insp.validate.${v}` as TKey)}</option>)}
        </select>
      </Field>
      {d.validate !== 'any' && (
        <Field label={t('insp.error_text')}>
          <input className="input" value={d.error_text || ''} placeholder={t('insp.error_text_ph')} onChange={e => set({ error_text: e.target.value })} />
        </Field>
      )}
    </div>
  )
}

function ConditionForm({ d, set }: { d: any; set: (p: any) => void }) {
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      <Field label={t('insp.check')}>
        <select className="input" value={d.check || 'follows'} onChange={e => set({ check: e.target.value })}>
          {['follows', 'has_tag', 'has_field'].map(c => <option key={c} value={c}>{t(`insp.check.${c}` as TKey)}</option>)}
        </select>
      </Field>
      {d.check === 'has_tag' && <Field label={t('insp.tag')}><input className="input" value={d.tag || ''} onChange={e => set({ tag: e.target.value })} /></Field>}
      {d.check === 'has_field' && <Field label={t('insp.field')}><input className="input font-mono" value={d.field || ''} placeholder="phone" onChange={e => set({ field: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></Field>}
      {(d.check || 'follows') === 'follows' && <Note>{t('insp.follow_note')}</Note>}
    </div>
  )
}

function StageSelect({ accountId, value, onChange }: { accountId: number; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  useEffect(() => { api.get<{ stages: { id: string; name: string }[] }>(`/api/crm/stages?account_id=${accountId}`).then(r => setStages(r.stages)).catch(() => {}) }, [accountId])
  return (
    <Field label={t('crm.stage')}>
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">—</option>
        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </Field>
  )
}

function ActionForm({ d, set, accountId }: { d: any; set: (p: any) => void; accountId: number }) {
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      <Field label={t('insp.op')}>
        <select className="input" value={d.op || 'add_tag'} onChange={e => set({ op: e.target.value })}>
          {['add_tag', 'remove_tag', 'set_field', 'set_stage', 'notify', 'webhook'].map(o => <option key={o} value={o}>{t(`insp.op.${o}` as TKey)}</option>)}
        </select>
      </Field>
      {d.op === 'set_stage' ? (
        <StageSelect accountId={accountId} value={d.stage || ''} onChange={v => set({ stage: v })} />
      ) : d.op === 'notify' ? (
        <>
          <Field label={t('insp.notify_text')}><input className="input" value={d.text || ''} placeholder="🔥 Yangi buyurtma" onChange={e => set({ text: e.target.value })} /></Field>
          <Note>{t('insp.notify_hint')}</Note>
        </>
      ) : d.op === 'webhook' ? (
        <>
          <Field label={t('insp.webhook_url')}><input className="input font-mono text-[13px]" value={d.url || ''} placeholder="https://hook.make.com/…" onChange={e => set({ url: e.target.value })} /></Field>
          <Note>{t('insp.webhook_hint')}</Note>
        </>
      ) : d.op === 'set_field' ? (
        <>
          <Field label={t('insp.field')}><input className="input font-mono" value={d.field || ''} placeholder="status" onChange={e => set({ field: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></Field>
          <Field label={t('insp.value')}><input className="input" value={d.value || ''} onChange={e => set({ value: e.target.value })} /></Field>
        </>
      ) : (
        <Field label={t('insp.tag')}><input className="input" value={d.tag || ''} placeholder="lead" onChange={e => set({ tag: e.target.value })} /></Field>
      )}
    </div>
  )
}

type WhResult = { ok: boolean; status: number; error: string; ms: number; body: string; payload: unknown }

function WebhookForm({ d, set, flow }: { d: any; set: (p: any) => void; flow?: { id: number; name: string } }) {
  const { t } = useI18n()
  const extra: { key: string; value: string }[] = d.extra || []
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<WhResult | null>(null)
  const [showJson, setShowJson] = useState(false)
  const setRow = (i: number, patch: Partial<{ key: string; value: string }>) =>
    set({ extra: extra.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const valid = /^https?:\/\/\S+\.\S+/.test(d.url || '')
  const test = async () => {
    if (!flow) return
    setBusy(true); setRes(null)
    try { setRes(await api.post<WhResult>(`/api/flows/${flow.id}/webhook-test`, { url: d.url, extra })) }
    catch { setRes({ ok: false, status: 0, error: 'request_failed', ms: 0, body: '', payload: null }) }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-5">
      <Field label={t('insp.webhook_url')} hint={t('wh.url_hint')}>
        <input className="input font-mono text-[13px]" value={d.url || ''} placeholder="https://hook.eu1.make.com/…"
          onChange={e => { set({ url: e.target.value.trim() }); setRes(null) }} />
      </Field>

      <div>
        <span className="label">{t('wh.extra')}</span>
        <div className="space-y-1.5">
          {extra.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input className="input w-[38%] font-mono text-[12.5px]" value={r.key} placeholder={t('wh.key')}
                onChange={e => setRow(i, { key: e.target.value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) })} />
              <input className="input flex-1 text-[12.5px]" value={r.value} placeholder={t('wh.value')} onChange={e => setRow(i, { value: e.target.value })} />
              <button type="button" onClick={() => set({ extra: extra.filter((_, j) => j !== i) })} className="rounded-lg p-1.5 text-ink-4 hover:bg-soft hover:text-brand-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        {extra.length < 20 && (
          <button type="button" onClick={() => set({ extra: [...extra, { key: '', value: '' }] })}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-brand-700 hover:bg-brand-50">
            <Plus className="h-3.5 w-3.5" />{t('wh.add')}
          </button>
        )}
        <p className="hint">{t('wh.extra_hint')}</p>
      </div>

      <div className="rounded-2xl border border-line p-3">
        <button type="button" disabled={!valid || busy || !flow} onClick={test}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t('wh.test')}
        </button>
        {res && (
          <div className={`mt-2.5 rounded-xl px-3 py-2 text-[12.5px] ${res.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-brand-50 text-brand-800'}`}>
            <div className="flex items-center gap-1.5 font-semibold">
              {res.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {res.ok ? t('wh.test_ok', { s: res.status, ms: res.ms }) : `${t('wh.test_fail')} · ${res.error === 'blocked_url' ? t('wh.blocked') : res.error}`}
            </div>
            {res.body && <pre className="mt-1.5 max-h-20 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] opacity-80">{res.body}</pre>}
          </div>
        )}
        <button type="button" onClick={() => setShowJson(v => !v)} className="mt-2 flex w-full items-center gap-1.5 px-1 text-[12px] font-semibold text-ink-3 hover:text-ink">
          <ChevronDown className={`h-3.5 w-3.5 transition ${showJson ? '' : '-rotate-90'}`} />{t('wh.payload')}
        </button>
        {showJson && (
          <pre className="scrollbar-thin mt-1.5 max-h-64 overflow-auto rounded-xl bg-[#0f0f12] p-3 font-mono text-[11px] leading-relaxed text-[#e6e6ea]">
            {JSON.stringify(res?.payload || webhookSample(flow || { id: 0, name: '' }, extra), null, 2)}
          </pre>
        )}
      </div>

      <Note>{t('wh.branches')}</Note>
    </div>
  )
}

function DelayForm({ d, set }: { d: any; set: (p: any) => void }) {
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      <div>
        <span className="label">{t('insp.wait')}</span>
        <div className="flex gap-2">
          <input type="number" min={1} max={d.unit === 'hours' ? 23 : 1380} className="input w-28" value={d.amount ?? 10}
            onChange={e => set({ amount: Math.max(0, Number(e.target.value)) })} />
          <div className="flex-1"><Segmented value={d.unit === 'hours' ? 'hours' : 'minutes'} onChange={v => set({ unit: v })}
            options={[{ value: 'minutes', label: t('insp.minutes') }, { value: 'hours', label: t('insp.hours') }]} /></div>
        </div>
      </div>
      <Note>{t('insp.delay_note')}</Note>
    </div>
  )
}

export default function Inspector({ node, accountId, flow, onChange, onDelete, onClose }: Props) {
  const { t } = useI18n()
  const meta = NODE_META[node.type]
  const Icon = meta.icon
  const d = node.data
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${meta.tint}`}><Icon className="h-4 w-4" /></span>
        <div className="flex-1">
          <div className="text-[15px] font-bold">{t(meta.label)}</div>
          <div className="text-[12px] text-ink-3">{t(meta.desc)}</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-soft"><X className="h-4 w-4" /></button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
        {node.type === 'trigger' && <TriggerForm d={d} set={onChange} accountId={accountId} />}
        {node.type === 'message' && <MessageForm d={d} set={onChange} />}
        {node.type === 'question' && <QuestionForm d={d} set={onChange} />}
        {node.type === 'condition' && <ConditionForm d={d} set={onChange} />}
        {node.type === 'action' && <ActionForm d={d} set={onChange} accountId={accountId} />}
        {node.type === 'delay' && <DelayForm d={d} set={onChange} />}
        {node.type === 'webhook' && <WebhookForm d={d} set={onChange} flow={flow} />}
      </div>
      {node.type !== 'trigger' && (
        <div className="border-t border-line p-4">
          <button onClick={onDelete} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
            <Trash2 className="h-4 w-4" />{t('ed.delete_block')}
          </button>
        </div>
      )}
    </div>
  )
}
