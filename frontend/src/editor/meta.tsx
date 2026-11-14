import { AtSign, Bell, CircleDot, Clock, GitBranch, HelpCircle, KanbanSquare, MessageCircle, MessageSquareText, PenLine, Send, Tag, Webhook, Zap, type LucideIcon } from 'lucide-react'
import type { TKey } from '../i18n'
import type { TriggerKind } from '../api'

export type NodeType = 'trigger' | 'message' | 'question' | 'condition' | 'action' | 'delay' | 'webhook'

export const NODE_META: Record<NodeType, { icon: LucideIcon; tint: string; label: TKey; desc: TKey }> = {
  trigger:   { icon: Zap,               tint: 'bg-brand-600 text-white',  label: 'node.trigger',   desc: 'node.trigger_d' },
  message:   { icon: MessageSquareText, tint: 'bg-ink text-white',        label: 'node.message',   desc: 'node.message_d' },
  question:  { icon: HelpCircle,        tint: 'bg-[#6d5dfc] text-white',  label: 'node.question',  desc: 'node.question_d' },
  condition: { icon: GitBranch,         tint: 'bg-[#f59e0b] text-white',  label: 'node.condition', desc: 'node.condition_d' },
  action:    { icon: Tag,               tint: 'bg-[#10b981] text-white',  label: 'node.action',    desc: 'node.action_d' },
  delay:     { icon: Clock,             tint: 'bg-[#0ea5e9] text-white',  label: 'node.delay',     desc: 'node.delay_d' },
  webhook:   { icon: Webhook,           tint: 'bg-[#db2777] text-white',  label: 'node.webhook',   desc: 'node.webhook_d' },
}

/** Bloklar panelidagi element: blok turi + tayyor sozlama (masalan, Amal → Telegram). */
export type PaletteItem = { key: string; type: NodeType; preset?: Record<string, any>; icon: LucideIcon; tint: string; label: TKey; desc: TKey }

const base = (type: NodeType): PaletteItem => ({ key: type, type, ...NODE_META[type] })
const act = (op: string, icon: LucideIcon, desc: TKey): PaletteItem =>
  ({ key: `action:${op}`, type: 'action', preset: { op }, icon, tint: NODE_META.action.tint, label: `insp.op.${op}` as TKey, desc })

export const PALETTE_GROUPS: { label: TKey; items: PaletteItem[] }[] = [
  { label: 'pal.g.chat', items: [base('message'), base('question')] },
  { label: 'pal.g.logic', items: [base('condition'), base('delay')] },
  { label: 'pal.g.do', items: [
    act('add_tag', Tag, 'pal.tag_d'),
    act('set_field', PenLine, 'pal.field_d'),
    act('set_stage', KanbanSquare, 'pal.stage_d'),
    act('notify', Bell, 'pal.notify_d'),
    base('webhook'),
  ] },
]
export const PALETTE: PaletteItem[] = PALETTE_GROUPS.flatMap(g => g.items)

export const TRIGGER_META: Record<TriggerKind, { icon: LucideIcon; label: TKey; desc: TKey }> = {
  comment:       { icon: MessageCircle, label: 'trig.comment',       desc: 'trig.comment_d' },
  dm:            { icon: Send,          label: 'trig.dm',            desc: 'trig.dm_d' },
  story_reply:   { icon: CircleDot,     label: 'trig.story_reply',   desc: 'trig.story_reply_d' },
  story_mention: { icon: AtSign,        label: 'trig.story_mention', desc: 'trig.story_mention_d' },
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export function defaultData(type: NodeType): Record<string, any> {
  switch (type) {
    case 'message': return { text: '', buttons: [] }
    case 'question': return { text: '', field: 'phone', custom_key: '', validate: 'phone', error_text: '' }
    case 'condition': return { check: 'follows', tag: '', field: '' }
    case 'action': return { op: 'add_tag', tag: '', field: '', value: '' }
    case 'delay': return { amount: 10, unit: 'minutes' }
    case 'webhook': return { url: '', extra: [] }
    default: return { kind: 'comment', keywords: '', match: 'contains', media_id: null, media_caption: '', comment_replies: '' }
  }
}

/** Webhook'ga yuboriladigan JSON namunasi (inspektorda ko'rsatish uchun). */
export function webhookSample(flow: { id: number; name: string }, extra: { key: string; value: string }[]) {
  const data: Record<string, string> = {}
  for (const r of extra) if (r.key?.trim()) data[r.key.trim()] = r.value || ''
  return {
    event: 'flow_webhook', test: false, sent_at: '2026-01-05T10:00:00Z',
    flow: { id: flow.id, name: flow.name }, account: 'your_shop',
    contact: { id: 42, igsid: '1784…', username: 'client', name: 'Ali', phone: '+992 90 123 45 67', email: '', stage: 'new', tags: ['lead'], fields: { phone: '+992 90 123 45 67' } },
    data,
  }
}
