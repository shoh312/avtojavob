import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { Bell, Clock, ExternalLink, FlaskConical, GitBranch, KanbanSquare, MousePointerClick, RotateCcw, Save, Send, Square, Tag, Webhook, X, Zap } from 'lucide-react'
import { api } from '../api'
import { useI18n, type TKey } from '../i18n'
import { Toggle } from '../components/ui'

type Btn = { id: string; title: string; kind: 'flow' | 'url'; url?: string }
type Entry = { id: number; from: 'user' | 'bot' | 'sys'; text: string; buttons?: Btn[]; nodeId?: string; icon?: typeof Zap; tone?: 'ok' | 'warn' | 'end' }
type Waiting = { kind: 'question' | 'buttons'; nodeId: string } | null
type SimContact = { tags: string[]; fields: Record<string, string>; stage: string | null }

const APOS = /[‘’ʻʼ`´]/g
const norm = (s: string) => s.replace(APOS, "'").toLowerCase().split(/\s+/).filter(Boolean).join(' ')

function keywordMatch(d: any, text: string) {
  const match = d.match || 'contains'
  if (match === 'any') return true
  const t = norm(text)
  const kws = String(d.keywords || '').split(',').map((k: string) => norm(k)).filter(Boolean)
  return match === 'exact' ? kws.includes(t) : kws.some((k: string) => t.includes(k))
}

function validate(kind: string, v: string) {
  const value = v.trim()
  if (kind === 'phone') { const d = value.replace(/\D/g, ''); return d.length >= 7 && d.length <= 15 && /^[\d\s()+\-.]+$/.test(value) }
  if (kind === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
  if (kind === 'number') return /^-?\d+([.,]\d+)?$/.test(value)
  return value.length > 0
}

export default function Simulator({ nodes, edges, startId, accountId, onActive, onClose }: {
  nodes: Node[]; edges: Edge[]; startId: string | null; accountId: number
  onActive: (id: string | null) => void; onClose: () => void
}) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<Entry[]>([])
  const [waiting, setWaiting] = useState<Waiting>(null)
  const [contact, setContact] = useState<SimContact>({ tags: [], fields: {}, stage: null })
  const [follows, setFollows] = useState(true)
  const [text, setText] = useState('')
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const [started, setStarted] = useState(false)
  const seq = useRef(0)
  const bottom = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])
  const trigger = nodes.find(n => n.type === 'trigger')
  const td = (trigger?.data || {}) as any
  const next = (id: string, handle = 'out') => edges.find(e => e.source === id && (e.sourceHandle || 'out') === handle)?.target ?? null

  useEffect(() => { api.get<{ stages: { id: string; name: string }[] }>(`/api/crm/stages?account_id=${accountId}`).then(r => setStages(r.stages)).catch(() => {}) }, [accountId])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [entries])
  useEffect(() => () => onActive(null), [onActive])

  const reset = () => {
    setEntries([]); setWaiting(null); setStarted(false); setText('')
    setContact({ tags: [], fields: {}, stage: null }); onActive(null)
    if (startId && byId[startId]?.type !== 'trigger') setTimeout(() => runFrom(startId, { tags: [], fields: {}, stage: null }), 0)
  }
  useEffect(reset, [startId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fill = (s: string, c: SimContact) => String(s || '').replace(/\{([a-z_][a-z0-9_]*)\}/g, (_, k) =>
    k === 'username' ? '@mijoz' : k === 'name' ? (c.fields.name || 'Mijoz') : (c.fields[k] || '')).trim()

  /** Grafni shu blokdan boshlab yuradi (backend dvigateli bilan bir xil qoidalar). */
  function runFrom(id: string | null, c0: SimContact, pre: Entry[] = []) {
    const out: Entry[] = [...pre]
    const add = (e: Omit<Entry, 'id'>) => out.push({ ...e, id: ++seq.current })
    let c = { ...c0, tags: [...c0.tags], fields: { ...c0.fields } }
    let wait: Waiting = null
    let last: string | null = null
    for (let step = 0; step < 25 && id; step++) {
      const n = byId[id]
      if (!n) break
      last = id
      const d = (n.data || {}) as any
      if (n.type === 'trigger') { id = next(id); continue }
      if (n.type === 'message') {
        const buttons = (d.buttons || []) as Btn[]
        add({ from: 'bot', text: fill(d.text, c) || t('node.empty_text'), buttons, nodeId: id })
        if (buttons.some(b => b.kind !== 'url')) { wait = { kind: 'buttons', nodeId: id }; break }
        id = next(id); continue
      }
      if (n.type === 'question') {
        add({ from: 'bot', text: fill(d.text, c), nodeId: id })
        wait = { kind: 'question', nodeId: id }; break
      }
      if (n.type === 'condition') {
        const ok = d.check === 'has_tag' ? c.tags.includes(String(d.tag || '').trim())
          : d.check === 'has_field' ? !!c.fields[String(d.field || '').trim()] : follows
        add({ from: 'sys', icon: GitBranch, text: `${t('node.condition')}: ${ok ? t('node.yes') : t('node.no')}`, tone: ok ? 'ok' : 'warn' })
        id = next(id, ok ? 'yes' : 'no'); continue
      }
      if (n.type === 'action') {
        const op = d.op || 'add_tag'
        if (op === 'add_tag') { c.tags = [...new Set([...c.tags, String(d.tag || '').trim()])]; add({ from: 'sys', icon: Tag, text: `${t('insp.op.add_tag')}: ${d.tag}` }) }
        else if (op === 'remove_tag') { c.tags = c.tags.filter(x => x !== d.tag); add({ from: 'sys', icon: Tag, text: `${t('insp.op.remove_tag')}: ${d.tag}` }) }
        else if (op === 'set_field') { c.fields = { ...c.fields, [d.field]: fill(d.value, c) }; add({ from: 'sys', icon: Save, text: `${d.field} = ${fill(d.value, c)}` }) }
        else if (op === 'set_stage') { c.stage = d.stage; add({ from: 'sys', icon: KanbanSquare, text: `CRM → ${stages.find(s => s.id === d.stage)?.name || d.stage}` }) }
        else if (op === 'notify') add({ from: 'sys', icon: Bell, text: `Telegram: ${fill(d.text, c) || '🔔'}` })
        else if (op === 'webhook') add({ from: 'sys', icon: Webhook, text: `Webhook → ${String(d.url || '').replace(/^https?:\/\//, '')}` })
        id = next(id); continue
      }
      if (n.type === 'delay') {
        add({ from: 'sys', icon: Clock, text: t('sim.delay', { n: d.amount || 0, unit: t(d.unit === 'hours' ? 'insp.hours' : 'insp.minutes') }) })
        id = next(id); continue
      }
      break
    }
    if (!wait) add({ from: 'sys', icon: Square, text: t('sim.end'), tone: 'end' })
    setEntries(out); setWaiting(wait); setContact(c); setStarted(true); onActive(last)
  }

  const send = (e?: FormEvent) => {
    e?.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    const userEntry: Entry = { id: ++seq.current, from: 'user', text: td.kind === 'comment' && !started ? `💬 ${value}` : value }
    const pre = [...entries, userEntry]
    if (waiting?.kind === 'question') {
      const d = (byId[waiting.nodeId]?.data || {}) as any
      if (!validate(d.validate || 'any', value)) {
        const err = fill(d.error_text, contact)
        setEntries([...pre, err ? { id: ++seq.current, from: 'bot', text: err } : { id: ++seq.current, from: 'sys', icon: X, text: t('sim.invalid'), tone: 'warn' }])
        return
      }
      const key = d.field === 'custom' ? (d.custom_key || 'custom') : (d.field || 'phone')
      const c = { ...contact, fields: { ...contact.fields, [key]: value } }
      const saved: Entry = { id: ++seq.current, from: 'sys', icon: Save, text: `${key} = ${value}`, tone: 'ok' }
      runFrom(next(waiting.nodeId), c, [...pre, saved])
      return
    }
    if (!started || !waiting) {
      // Trigger tekshiruvi
      if (!trigger || td.kind === 'story_mention' || !keywordMatch(td, value)) {
        setEntries([...pre, { id: ++seq.current, from: 'sys', icon: X, text: t('sim.no_match'), tone: 'warn' }])
        return
      }
      const hit: Entry = { id: ++seq.current, from: 'sys', icon: Zap, text: t('sim.triggered'), tone: 'ok' }
      const replies = String(td.comment_replies || '').split('\n').map(s => s.trim()).filter(Boolean)
      const extra: Entry[] = td.kind === 'comment' && replies.length ? [{ id: ++seq.current, from: 'sys', icon: Send, text: `${t('sim.comment_reply')}: ${fill(replies[0], contact)}` }] : []
      runFrom(next(trigger.id), contact, [...pre, hit, ...extra])
      return
    }
    setEntries([...pre, { id: ++seq.current, from: 'sys', icon: MousePointerClick, text: t('sim.tap_button'), tone: 'warn' }])
  }

  const tap = (entry: Entry, b: Btn) => {
    if (b.kind === 'url') { setEntries([...entries, { id: ++seq.current, from: 'sys', icon: ExternalLink, text: b.url || '' }]); return }
    if (!waiting || waiting.kind !== 'buttons' || waiting.nodeId !== entry.nodeId) return
    runFrom(next(entry.nodeId!, `btn:${b.id}`), contact, [...entries, { id: ++seq.current, from: 'user', text: b.title }])
  }

  const placeholder = waiting?.kind === 'question' ? t('sim.answer_ph') : td.kind === 'comment' && !started ? t('sim.comment_ph') : t('sim.msg_ph')
  const keywords = String(td.keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean).slice(0, 4)

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white"><FlaskConical className="h-4 w-4" /></span>
        <div className="flex-1">
          <div className="text-[14.5px] font-bold">{t('sim.title')}</div>
          <div className="text-[11.5px] text-ink-3">{t('sim.sub')}</div>
        </div>
        <button onClick={reset} title={t('sim.reset')} className="rounded-lg p-1.5 text-ink-3 hover:bg-soft"><RotateCcw className="h-4 w-4" /></button>
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-soft"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-soft/60 px-4 py-2 text-[12.5px]">
        <span className="text-ink-3">{t('sim.follows')}</span>
        <Toggle size="sm" checked={follows} onChange={setFollows} />
      </div>

      {/* Instagram chat ko'rinishi */}
      <div className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto bg-white px-3 py-4">
        <div className="flex flex-col items-center pb-2 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] p-[2px]">
            <div className="grid h-full w-full place-items-center rounded-full bg-white text-[18px] font-bold text-ink">M</div>
          </div>
          <div className="mt-1.5 text-[13px] font-semibold">@mijoz</div>
          {!started && trigger && (
            <div className="mt-3 w-full rounded-2xl border border-dashed border-line px-3 py-2.5 text-left text-[12px] text-ink-3">
              <div className="font-semibold text-ink-2">{t(`trig.${td.kind || 'dm'}` as TKey)}</div>
              {td.kind === 'story_mention' ? (
                <button onClick={() => runFrom(next(trigger.id), contact, [{ id: ++seq.current, from: 'user', text: '@ story' }])}
                  className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-[12px] font-semibold text-white">{t('sim.mention')}</button>
              ) : td.match === 'any' ? <div>{t('flows.any_text')}</div> : (
                <div className="mt-1.5 flex flex-wrap gap-1">{keywords.map(k => (
                  <button key={k} onClick={() => setText(k)} className="chip bg-soft font-mono text-[11px] hover:bg-brand-50">{k}</button>
                ))}</div>
              )}
            </div>
          )}
        </div>
        {entries.map(e => e.from === 'sys' ? (
          <div key={e.id} className="flex justify-center animate-fade-up">
            <span className={`inline-flex max-w-[90%] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${e.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : e.tone === 'warn' ? 'bg-amber-50 text-amber-800' : e.tone === 'end' ? 'bg-soft text-ink-4' : 'bg-soft text-ink-2'}`}>
              {e.icon && <e.icon className="h-3 w-3 shrink-0" />}<span className="truncate">{e.text}</span>
            </span>
          </div>
        ) : (
          <div key={e.id} className={`flex animate-fade-up ${e.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[82%]">
              <div className={`whitespace-pre-wrap break-words px-3.5 py-2 text-[13.5px] leading-snug ${e.from === 'user'
                ? 'rounded-[20px] rounded-br-md bg-gradient-to-br from-[#6d5dfc] to-[#a855f7] text-white'
                : 'rounded-[20px] rounded-bl-md bg-[#efeff3] text-ink'} ${e.buttons?.length ? 'rounded-b-none' : ''}`}>{e.text}</div>
              {!!e.buttons?.length && (
                <div className="overflow-hidden rounded-b-[16px] border border-t-0 border-[#e6e6ea]">
                  {e.buttons.map(b => {
                    const live = b.kind === 'url' || (waiting?.kind === 'buttons' && waiting.nodeId === e.nodeId)
                    return (
                      <button key={b.id} onClick={() => tap(e, b)} disabled={!live}
                        className="flex w-full items-center justify-center gap-1.5 border-t border-[#e6e6ea] bg-white py-2 text-[13px] font-semibold text-sky-700 first:border-t-0 hover:bg-sky-50 disabled:text-ink-4 disabled:hover:bg-white">
                        {b.kind === 'url' && <ExternalLink className="h-3 w-3" />}{b.title || '…'}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {(contact.tags.length > 0 || Object.keys(contact.fields).length > 0 || contact.stage) && (
        <div className="flex flex-wrap gap-1 border-t border-line bg-soft/60 px-3 py-2">
          {contact.stage && <span className="chip bg-sky-50 text-sky-700">CRM: {stages.find(s => s.id === contact.stage)?.name || contact.stage}</span>}
          {contact.tags.map(tg => <span key={tg} className="chip bg-brand-50 text-brand-700">{tg}</span>)}
          {Object.entries(contact.fields).map(([k, v]) => <span key={k} className="chip font-mono text-[11px]">{k}: {v}</span>)}
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 border-t border-line p-3">
        <input className="input h-10 flex-1 rounded-full" value={text} placeholder={placeholder} onChange={e => setText(e.target.value)} />
        <button disabled={!text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  )
}
