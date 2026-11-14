import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BellRing, Bot, FlaskConical, Handshake, KanbanSquare, Loader2, RotateCcw, Send, Settings2, ShoppingBag, StickyNote, UserPlus } from 'lucide-react'
import { api, ApiError } from '../api'
import { useI18n, type TKey } from '../i18n'
import { Button, Toggle } from '../components/ui'

export type AiSettings = {
  ai_enabled: boolean; ai_prompt: string; ai_available: boolean; ai_collect_leads: boolean
  ai_name: string; ai_crm: boolean; ai_handoff: boolean; ai_followup_hours: number
}
type Product = { id: number; name: string; price: string }
type Msg = { role: 'user' | 'assistant'; content: string; stage_name?: string; note?: string; handoff?: boolean; fields?: Record<string, string>; products?: Product[] }

const SNIPPETS = ['hours', 'delivery', 'payment', 'address', 'returns'] as const

function Feature({ icon, title, desc, checked, onChange, children }: { icon: ReactNode; title: string; desc: string; checked?: boolean; onChange?: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${checked === false ? 'bg-soft text-ink-4' : 'bg-violet-50 text-violet-600'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{title}</div>
        <div className="text-[12.5px] leading-snug text-ink-3">{desc}</div>
        {children}
      </div>
      {onChange && <Toggle checked={!!checked} onChange={onChange} />}
    </div>
  )
}

function TestChat({ accountId, s, name, prompt }: { accountId: number; s: AiSettings; name: string; prompt: string }) {
  const { t } = useI18n()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [stage, setStage] = useState('')
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    api.get<{ stages: { id: string; name: string }[] }>(`/api/crm/stages?account_id=${accountId}`).then(r => { setStages(r.stages); setStage(r.stages[0]?.id || '') }).catch(() => {})
  }, [accountId])
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])
  const send = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault()
    const v = (preset ?? text).trim()
    if (!v || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content: v }]
    setMsgs(next); setText(''); setBusy(true)
    try {
      const r = await api.post<{ reply: string; stage: string | null; stage_name: string; note: string; handoff: boolean; fields: Record<string, string>; products: Product[] }>(
        `/api/accounts/${accountId}/ai/test`, {
          stage, name, prompt, collect_leads: s.ai_collect_leads, crm: s.ai_crm, handoff: s.ai_handoff,
          messages: next.map(m => ({ role: m.role, content: m.content })),
        })
      if (r.stage) setStage(r.stage)
      setMsgs([...next, { role: 'assistant', content: r.reply || '…', stage_name: r.stage_name, note: r.note, handoff: r.handoff, fields: r.fields, products: r.products }])
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      setMsgs([...next, { role: 'assistant', content: code === 'ai_unavailable' ? t('int.ai.unavailable') : t('common.error') }])
    } finally { setBusy(false) }
  }
  const current = stages.find(x => x.id === stage)
  return (
    <div className="flex h-[min(560px,calc(100vh-260px))] flex-col overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-soft/60 px-3 py-2 text-[12px] text-ink-3">
        {s.ai_crm && <><KanbanSquare className="h-3.5 w-3.5" />{t('team.ai.t_stage')}<span className="chip bg-white font-semibold text-ink-2">{current?.name || '—'}</span></>}
        <span className="ml-auto truncate">{t('team.ai.t_safe')}</span>
        {msgs.length > 0 && <button onClick={() => { setMsgs([]); setStage(stages[0]?.id || '') }} title={t('team.ai.t_reset')} className="rounded-lg p-1 hover:bg-white hover:text-ink"><RotateCcw className="h-3.5 w-3.5" /></button>}
      </div>
      <div ref={box} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-white to-[#fafafb] p-4">
        {msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-[13px] text-ink-4">
            <FlaskConical className="mb-2 h-6 w-6" />{t('team.ai.t_empty', { name: name || 'AI' })}
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {[t('team.ai.t_q1'), t('team.ai.t_q2'), t('team.ai.t_q3')].map(q => (
                <button key={q} onClick={() => send(undefined, q)} className="rounded-full border border-line bg-white px-3 py-1 text-[12px] text-ink-2 hover:bg-soft">{q}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => m.role === 'user' ? (
          <div key={i} className="flex justify-end"><div className="max-w-[80%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-brand-600 px-3.5 py-2 text-[13.5px] text-white">{m.content}</div></div>
        ) : (
          <div key={i} className="flex items-start gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6d5dfc] to-[#e5161f] text-white"><Bot className="h-3.5 w-3.5" /></span>
            <div className="max-w-[84%] space-y-1.5">
              <div className="whitespace-pre-wrap rounded-[18px] rounded-tl-md bg-[#f0f0f3] px-3.5 py-2 text-[13.5px] leading-snug text-ink">{m.content}</div>
              {m.products?.map(p => <div key={p.id} className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-2.5 py-1.5 text-[12px]"><ShoppingBag className="h-3.5 w-3.5 text-brand-600" /><b>{p.name}</b><span className="text-ink-3">{p.price}</span></div>)}
              <div className="flex flex-wrap gap-1">
                {m.stage_name && <span className="chip bg-violet-50 text-[11px] text-violet-700"><KanbanSquare className="mr-1 h-3 w-3" />→ {m.stage_name}</span>}
                {m.fields && Object.keys(m.fields).length > 0 && <span className="chip bg-sky-50 text-[11px] text-sky-700"><UserPlus className="mr-1 h-3 w-3" />{Object.values(m.fields).join(' · ')}</span>}
                {m.note && <span className="chip bg-amber-50 text-[11px] text-amber-800"><StickyNote className="mr-1 h-3 w-3" />{m.note}</span>}
                {m.handoff && <span className="chip bg-emerald-50 text-[11px] text-emerald-700"><Handshake className="mr-1 h-3 w-3" />{t('team.ai.t_handoff')}</span>}
              </div>
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-[12px] text-ink-4"><Loader2 className="h-3.5 w-3.5 animate-spin" />{name || 'AI'}…</div>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line bg-white p-2">
        <input className="input flex-1" value={text} onChange={e => setText(e.target.value)} placeholder={t('team.ai.t_ph')} />
        <Button type="submit" disabled={!text.trim() || busy || !s.ai_available}><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  )
}

/** Integratsiyalar → AI sotuvchi paneli: sozlash va sinash. */
export function AiSalesPanel({ accountId, s, save, onDirty }: {
  accountId: number; s: AiSettings; save: (patch: Partial<AiSettings>) => Promise<void>; onDirty: (dirty: { name: string; prompt: string } | null) => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'setup' | 'test'>('setup')
  const [name, setName] = useState(s.ai_name)
  const [prompt, setPrompt] = useState(s.ai_prompt)
  useEffect(() => { setName(s.ai_name); setPrompt(s.ai_prompt) }, [s.ai_name, s.ai_prompt])
  const dirty = name !== s.ai_name || prompt !== s.ai_prompt
  useEffect(() => { onDirty(dirty ? { name, prompt } : null) }, [dirty, name, prompt, onDirty])

  const flow: TKey[] = ['ai3.f1', 'ai3.f2', 'ai3.f3', ...(s.ai_collect_leads ? ['ai3.f4' as TKey] : []), ...(s.ai_handoff ? ['ai3.f5' as TKey] : [])]

  return (
    <div>
      {!s.ai_available && <div className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">{t('int.ai.unavailable')}</div>}

      {/* kim va holat */}
      <div className={`relative mb-5 overflow-hidden rounded-3xl p-5 ${s.ai_enabled ? 'bg-gradient-to-br from-[#1b1b22] to-[#2a1530] text-white' : 'bg-soft'}`}>
        {s.ai_enabled && <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-600/30 blur-3xl" />}
        <div className="relative flex items-center gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${s.ai_enabled ? 'bg-gradient-to-br from-[#6d5dfc] to-[#e5161f] text-white' : 'bg-white text-ink-4'}`}><Bot className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder={t('ai3.name_ph')}
              className={`w-full rounded-lg bg-transparent px-1 py-0.5 text-[17px] font-bold outline-none placeholder:font-semibold ${s.ai_enabled ? 'placeholder:text-white/40 hover:bg-white/5 focus:bg-white/10' : 'placeholder:text-ink-4 hover:bg-white focus:bg-white'}`} />
            <div className={`px-1 text-[12.5px] ${s.ai_enabled ? 'text-white/70' : 'text-ink-3'}`}>{s.ai_enabled ? t('ai3.on') : t('ai3.off')}</div>
          </div>
          <Toggle checked={s.ai_enabled} onChange={v => save({ ai_enabled: v })} />
        </div>
        {/* qanday ishlaydi */}
        <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
          {flow.map((k, i) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${s.ai_enabled ? 'bg-white/10 text-white/90' : 'bg-white text-ink-2'}`}>{t(k)}</span>
              {i < flow.length - 1 && <span className={s.ai_enabled ? 'text-white/30' : 'text-ink-4'}>→</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-5 flex rounded-xl bg-soft p-1">
        {([['setup', Settings2, 'ai3.tab_setup'], ['test', FlaskConical, 'ai3.tab_test']] as const).map(([k, Icon, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition ${tab === k ? 'bg-white text-ink shadow-card' : 'text-ink-3 hover:text-ink'}`}>
            <Icon className="h-4 w-4" />{t(label)}
          </button>
        ))}
      </div>

      {tab === 'setup' ? (
        <div className="space-y-6">
          <section>
            <div className="mb-1 text-[14px] font-bold">{t('ai3.know')}</div>
            <p className="mb-2.5 text-[12.5px] text-ink-3">{t('ai3.know_d')}</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SNIPPETS.map(sn => (
                <button key={sn} type="button" onClick={() => setPrompt(p => `${p.trim()}${p.trim() ? '\n' : ''}${t(`int2.sn.${sn}` as TKey)}`)}
                  className="rounded-full bg-soft px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-[#e9e9ee]">+ {t(`int2.snl.${sn}` as TKey)}</button>
              ))}
            </div>
            <textarea rows={9} className="input resize-y text-[13.5px] leading-relaxed" maxLength={8000} value={prompt} placeholder={t('ai3.prompt_ph')} onChange={e => setPrompt(e.target.value)} />
            <div className="mt-1 flex justify-between text-[11.5px] text-ink-4"><span>{t('ai3.catalog_hint')}</span><span className="tabular-nums">{prompt.length}/8000</span></div>
          </section>

          <section>
            <div className="mb-2 text-[14px] font-bold">{t('ai3.can')}</div>
            <div className="divide-y divide-line rounded-2xl border border-line">
              <Feature icon={<UserPlus className="h-4 w-4" />} title={t('ai3.leads')} desc={t('ai3.leads_d')} checked={s.ai_collect_leads} onChange={v => save({ ai_collect_leads: v })} />
              <Feature icon={<KanbanSquare className="h-4 w-4" />} title={t('ai3.crm')} desc={t('ai3.crm_d')} checked={s.ai_crm} onChange={v => save({ ai_crm: v })} />
              <Feature icon={<Handshake className="h-4 w-4" />} title={t('ai3.handoff')} desc={t('ai3.handoff_d')} checked={s.ai_handoff} onChange={v => save({ ai_handoff: v })} />
              <Feature icon={<BellRing className="h-4 w-4" />} title={t('ai3.followup')} desc={t('ai3.followup_d')} checked={s.ai_followup_hours > 0}>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[0, 2, 4, 8, 12].map(h => (
                    <button key={h} type="button" onClick={() => save({ ai_followup_hours: h })}
                      className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${s.ai_followup_hours === h ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-line hover:bg-soft'}`}>
                      {h ? t('team.ai.hours', { n: h }) : t('team.ai.off')}
                    </button>
                  ))}
                </div>
              </Feature>
            </div>
          </section>
        </div>
      ) : (
        <TestChat accountId={accountId} s={s} name={name} prompt={prompt} />
      )}
    </div>
  )
}
