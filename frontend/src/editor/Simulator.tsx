import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Bell, Clock, CornerDownRight, ExternalLink, GitBranch, Heart, KanbanSquare, MessageCircle, MousePointerClick, Save, Send, Square, Sticker, Tag, Webhook, X, Zap } from 'lucide-react'
import { api } from '../api'
import { useI18n, type TKey } from '../i18n'
import { Avatar, Toggle } from '../components/ui'
import { PhoneFrame, ProfileIntro } from '../components/Phone'
import { useAuth } from '../auth'

type SimNode = { id: string; type?: string; data?: Record<string, any> }
type SimEdge = { source: string; target: string; sourceHandle?: string | null }
type Btn = { id: string; title: string; kind: 'flow' | 'url'; url?: string }
type Entry = {
  id: number; from: 'user' | 'bot' | 'sys' | 'comment'; text: string; buttons?: Btn[]; nodeId?: string
  icon?: typeof Zap; tone?: 'ok' | 'warn' | 'end'; reply?: string
}
type Waiting = { kind: 'question' | 'buttons'; nodeId: string } | null
type SimContact = { tags: string[]; fields: Record<string, string>; stage: string | null }
type State = { entries: Entry[]; waiting: Waiting; contact: SimContact; started: boolean; active: string | null }
type Mode = 'dm' | 'comment'

const EMPTY: SimContact = { tags: [], fields: {}, stage: null }
const INITIAL: State = { entries: [], waiting: null, contact: EMPTY, started: false, active: null }
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

/**
 * Ssenariy sinovi — telefon ichida. Instagram'ga hech narsa yuborilmaydi.
 * `embedded` — analitika sahifasidagi ixcham ko'rinish (sarlavhasiz).
 * `startKey` o'zgarsa — sinov `startId` blokidan qaytadan boshlanadi.
 */
export default function Simulator({ nodes, edges, startId, startKey = 0, accountId, onActive, onClose, embedded }: {
  nodes: SimNode[]; edges: SimEdge[]; startId: string | null; startKey?: number; accountId: number
  onActive?: (id: string | null) => void; onClose?: () => void; embedded?: boolean
}) {
  const { t } = useI18n()
  const { me } = useAuth()
  const account = me?.accounts.find(a => a.id === accountId) ?? null
  const [st, setSt] = useState<State>(INITIAL)
  const [history, setHistory] = useState<State[]>([])
  const [follows, setFollows] = useState(true)
  const [text, setText] = useState('')
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const seq = useRef(0)
  const scroller = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])
  const trigger = nodes.find(n => n.type === 'trigger')
  const td = (trigger?.data || {}) as any
  const isComment = td.kind === 'comment'
  const [mode, setMode] = useState<Mode>(isComment ? 'comment' : 'dm')
  const next = (id: string, handle = 'out') => edges.find(e => e.source === id && (e.sourceHandle || 'out') === handle)?.target ?? null

  useEffect(() => { api.get<{ stages: { id: string; name: string }[] }>(`/api/crm/stages?account_id=${accountId}`).then(r => setStages(r.stages)).catch(() => {}) }, [accountId])
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }, [st.entries])
  useEffect(() => { onActive?.(st.active) }, [st.active, onActive])
  useEffect(() => () => onActive?.(null), [onActive])

  /** Yangi holatga o'tish (Orqaga uchun tarix saqlanadi). */
  const commit = (s: State) => { setHistory(h => [...h, st].slice(-50)); setSt(s) }

  const restart = () => {
    setHistory([]); setText(''); setMode(isComment ? 'comment' : 'dm')
    if (startId && byId[startId] && byId[startId].type !== 'trigger') {
      setSt(walk(startId, EMPTY, []))
      setMode('dm')
    } else setSt(INITIAL)
  }
  useEffect(restart, [startId, startKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => setHistory(h => { if (!h.length) return h; setSt(h[h.length - 1]); return h.slice(0, -1) })

  const fill = (s: string, c: SimContact) => String(s || '').replace(/\{([a-z_][a-z0-9_]*)\}/g, (_, k) =>
    k === 'username' ? '@mijoz' : k === 'name' ? (c.fields.name || 'Mijoz') : (c.fields[k] || '')).trim()
  const sys = (text: string, icon?: typeof Zap, tone?: Entry['tone']): Entry => ({ id: ++seq.current, from: 'sys', text, icon, tone })

  /** Grafni shu blokdan boshlab yuradi (backend dvigateli bilan bir xil qoidalar). */
  function walk(id: string | null, c0: SimContact, pre: Entry[]): State {
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
      if (n.type === 'webhook') {
        add({ from: 'sys', icon: Webhook, text: `Webhook → ${String(d.url || '').replace(/^https?:\/\//, '').split('/')[0] || '…'}`, tone: 'ok' })
        id = next(id); continue
      }
      if (n.type === 'delay') {
        add({ from: 'sys', icon: Clock, text: t('sim.delay', { n: d.amount || 0, unit: t(d.unit === 'hours' ? 'insp.hours' : 'insp.minutes') }) })
        id = next(id); continue
      }
      break
    }
    if (!wait) add({ from: 'sys', icon: Square, text: t('sim.end'), tone: 'end' })
    return { entries: out, waiting: wait, contact: c, started: true, active: last }
  }

  /** Trigger orqali boshlash. */
  const fire = (pre: Entry[], reply?: string) => {
    const hit = sys(t('sim.triggered'), Zap, 'ok')
    if (reply !== undefined && pre.length) pre[pre.length - 1] = { ...pre[pre.length - 1], reply }
    commit(walk(next(trigger!.id), st.contact, [...pre, hit]))
  }

  const send = (e?: FormEvent) => {
    e?.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')

    // Izoh yozildi — har doim triggerni tekshiradi (yangi izoh = ssenariy qaytadan)
    if (mode === 'comment') {
      const entry: Entry = { id: ++seq.current, from: 'comment', text: value }
      const pre = [...st.entries, entry]
      if (!trigger || !isComment || !keywordMatch(td, value)) {
        commit({ ...st, entries: [...pre, sys(isComment ? t('sim.no_match') : t('sim.not_comment'), X, 'warn')] })
        return
      }
      const replies = String(td.comment_replies || '').split('\n').map(s => s.trim()).filter(Boolean)
      fire(pre, replies.length ? fill(replies[0], st.contact) : undefined)
      setMode('dm')
      return
    }

    const pre = [...st.entries, { id: ++seq.current, from: 'user' as const, text: value }]
    if (st.waiting?.kind === 'question') {
      const d = (byId[st.waiting.nodeId]?.data || {}) as any
      if (!validate(d.validate || 'any', value)) {
        const err = fill(d.error_text, st.contact)
        commit({ ...st, entries: [...pre, err ? { id: ++seq.current, from: 'bot', text: err } : sys(t('sim.invalid'), X, 'warn')] })
        return
      }
      const key = d.field === 'custom' ? (d.custom_key || 'custom') : (d.field || 'phone')
      const c = { ...st.contact, fields: { ...st.contact.fields, [key]: value } }
      commit(walk(next(st.waiting.nodeId), c, [...pre, sys(`${key} = ${value}`, Save, 'ok')]))
      return
    }
    if (st.waiting?.kind === 'buttons') {
      commit({ ...st, entries: [...pre, sys(t('sim.tap_button'), MousePointerClick, 'warn')] })
      return
    }
    if (!trigger || td.kind !== 'dm' || !keywordMatch(td, value)) {
      const why = isComment ? t('sim.use_comment') : td.kind === 'story_mention' ? t('sim.use_story') : t('sim.no_match')
      commit({ ...st, entries: [...pre, sys(why, X, 'warn')] })
      return
    }
    fire(pre)
  }

  const tap = (entry: Entry, b: Btn) => {
    if (b.kind === 'url') { commit({ ...st, entries: [...st.entries, sys(b.url || '', ExternalLink)] }); return }
    if (st.waiting?.kind !== 'buttons' || st.waiting.nodeId !== entry.nodeId) return
    commit(walk(next(entry.nodeId!, `btn:${b.id}`), st.contact, [...st.entries, { id: ++seq.current, from: 'user', text: b.title }]))
  }

  const mention = () => {
    const pre: Entry[] = [{ id: ++seq.current, from: 'user', text: t('sim.mention_msg') }]
    commit(walk(next(trigger!.id), st.contact, [...st.entries, ...pre, sys(t('sim.triggered'), Zap, 'ok')]))
  }

  const placeholder = mode === 'comment' ? t('sim.comment_ph') : st.waiting?.kind === 'question' ? t('sim.answer_ph') : t('sim.msg_ph')
  const keywords = String(td.keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean).slice(0, 4)
  const botAvatar = <Avatar name={account?.username || 'IG'} src={account?.picture_url} size={24} />
  const { entries, waiting, contact, started } = st

  const footer = (
    <div className="px-3 pt-2">
      {isComment && (
        <div className="mb-2 grid grid-cols-2 rounded-full bg-[#f0f0f3] p-[3px] text-[12.5px] font-semibold">
          {(['dm', 'comment'] as Mode[]).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 transition ${mode === m ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}>
              {m === 'dm' ? <Send className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}{m === 'dm' ? 'Messenger' : t('sim.tab_comment')}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={send} className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#c7c7cf] to-[#9d9da8] text-[12px] font-bold text-white">M</span>
        <div className="flex h-9 flex-1 items-center rounded-full bg-[#f0f0f3] pl-3.5 pr-1.5">
          <input className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-4" value={text} placeholder={placeholder} onChange={e => setText(e.target.value)} />
          {text.trim()
            ? <button className="px-2 text-[13.5px] font-semibold text-[#3797f0]">{mode === 'comment' ? t('sim.post') : t('sim.send')}</button>
            : <Sticker className="mx-1 h-5 w-5 text-ink-2" strokeWidth={1.8} />}
        </div>
      </form>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={restart} className="rounded-xl bg-[#f0f0f3] py-2 text-[12.5px] font-semibold text-ink-2 hover:bg-[#e6e6ea]">{t('sim.reset')}</button>
        <button type="button" onClick={back} disabled={!history.length} className="rounded-xl bg-[#f0f0f3] py-2 text-[12.5px] font-semibold text-ink-2 hover:bg-[#e6e6ea] disabled:text-ink-4 disabled:hover:bg-[#f0f0f3]">{t('sim.back')}</button>
      </div>
    </div>
  )

  const phone = (
    <PhoneFrame account={account} className={embedded ? 'h-[720px] w-[360px]' : 'h-full max-h-[780px] w-full max-w-[360px]'} footer={footer}>
      <div ref={scroller} className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        <ProfileIntro account={account} />
        {!started && trigger && (
          <div className="mx-auto mb-3 w-[92%] rounded-2xl bg-[#f4f4f6] px-3.5 py-3 text-center text-[12px] text-ink-3">
            <div className="font-semibold text-ink-2">{t(`trig.${td.kind || 'dm'}` as TKey)}</div>
            {td.kind === 'story_mention' ? (
              <button onClick={mention} className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-[12px] font-semibold text-white">{t('sim.mention')}</button>
            ) : td.match === 'any' ? <div className="mt-0.5">{t('flows.any_text')}</div> : (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">{keywords.map(k => (
                <button key={k} onClick={() => setText(k)} className="rounded-full border border-[#e3e3e8] bg-white px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:border-ink-4">{k}</button>
              ))}</div>
            )}
          </div>
        )}
        {entries.map((e, i) => {
          if (e.from === 'sys') return (
            <div key={e.id} className="flex justify-center py-0.5 animate-fade-up">
              <span className={`inline-flex max-w-[92%] items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-medium ${e.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : e.tone === 'warn' ? 'bg-amber-50 text-amber-800' : e.tone === 'end' ? 'text-ink-4' : 'bg-[#f2f2f5] text-ink-3'}`}>
                {e.icon && <e.icon className="h-3 w-3 shrink-0" />}<span className="truncate">{e.text}</span>
              </span>
            </div>
          )
          if (e.from === 'comment') return (
            <div key={e.id} className="my-2 rounded-2xl border border-[#ececf0] bg-white p-3 animate-fade-up">
              <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4"><MessageCircle className="h-3 w-3" />{t('sim.under_post')}</div>
              <div className="flex gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#c7c7cf] to-[#9d9da8] text-[11px] font-bold text-white">M</span>
                <div className="min-w-0 flex-1 text-[13px] leading-snug"><span className="font-semibold">mijoz</span> {e.text}
                  <div className="mt-0.5 text-[11px] text-ink-4">{t('sim.now')} · {t('sim.reply_btn')}</div></div>
                <Heart className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-4" />
              </div>
              {e.reply && (
                <div className="ml-9 mt-2.5 flex gap-2">
                  <CornerDownRight className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-4" />
                  <Avatar name={account?.username || 'IG'} src={account?.picture_url} size={22} />
                  <div className="min-w-0 text-[12.5px] leading-snug"><span className="font-semibold">{account?.username}</span> {e.reply}</div>
                </div>
              )}
            </div>
          )
          const nextBot = entries[i + 1]?.from === 'bot'
          return (
            <div key={e.id} className={`flex items-end gap-2 animate-fade-up ${e.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              {e.from === 'bot' && <span className="w-6 shrink-0">{!nextBot && botAvatar}</span>}
              <div className="max-w-[76%]">
                <div className={`whitespace-pre-wrap break-words px-3.5 py-2 text-[13.5px] leading-snug ${e.from === 'user'
                  ? 'rounded-[20px] bg-gradient-to-br from-[#7b4dff] to-[#3c6cff] text-white'
                  : 'rounded-[20px] bg-[#efeff2] text-ink'} ${e.buttons?.length ? '!rounded-b-[6px]' : ''}`}>{e.text}</div>
                {!!e.buttons?.length && (
                  <div className="mt-[3px] space-y-[3px]">
                    {e.buttons.map((b, bi) => {
                      const live = b.kind === 'url' || (waiting?.kind === 'buttons' && waiting.nodeId === e.nodeId)
                      return (
                        <button key={b.id} onClick={() => tap(e, b)} disabled={!live}
                          className={`flex w-full items-center justify-center gap-1.5 bg-[#efeff2] px-3 py-2 text-[13px] font-semibold text-ink hover:bg-[#e4e4ea] disabled:text-ink-4 disabled:hover:bg-[#efeff2] ${bi === e.buttons!.length - 1 ? 'rounded-b-[20px] rounded-t-[6px]' : 'rounded-[6px]'}`}>
                          {b.kind === 'url' && <ExternalLink className="h-3 w-3" />}{b.title || '…'}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </PhoneFrame>
  )

  const chips = (contact.tags.length > 0 || Object.keys(contact.fields).length > 0 || contact.stage) && (
    <div className={`flex flex-wrap gap-1 ${embedded ? 'mt-3 max-w-[360px] justify-center' : 'px-4 pb-3'}`}>
      {contact.stage && <span className="chip bg-sky-50 text-sky-700">CRM: {stages.find(s => s.id === contact.stage)?.name || contact.stage}</span>}
      {contact.tags.map(tg => <span key={tg} className="chip bg-brand-50 text-brand-700">{tg}</span>)}
      {Object.entries(contact.fields).map(([k, v]) => <span key={k} className="chip bg-white font-mono text-[11px]">{k}: {v}</span>)}
    </div>
  )

  if (embedded) return (
    <div className="flex flex-col items-center">
      {phone}
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-3">
        <Toggle size="sm" checked={follows} onChange={setFollows} />{t('sim.follows')}
      </label>
      {chips}
    </div>
  )

  return (
    <div className="flex h-full flex-col bg-[#f4f4f6]">
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <div className="flex-1">
          <div className="text-[14px] font-bold">{t('sim.title')}</div>
          <div className="text-[11.5px] text-ink-3">{t('sim.sub')}</div>
        </div>
        {onClose && <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-white hover:text-ink"><X className="h-4 w-4" /></button>}
      </div>
      <label className="mx-4 mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-[12.5px] shadow-sm">
        <span className="text-ink-2">{t('sim.follows')}</span>
        <Toggle size="sm" checked={follows} onChange={setFollows} />
      </label>
      <p className="mx-4 mt-2 text-[11.5px] text-ink-4">{t('sim.click_hint')}</p>
      <div className="flex min-h-0 flex-1 justify-center px-4 py-3">{phone}</div>
      {chips}
    </div>
  )
}
