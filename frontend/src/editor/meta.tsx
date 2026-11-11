import { AtSign, CircleDot, Clock, GitBranch, HelpCircle, MessageCircle, MessageSquareText, Send, Tag, Zap, type LucideIcon } from 'lucide-react'
import type { TKey } from '../i18n'
import type { TriggerKind } from '../api'

export type NodeType = 'trigger' | 'message' | 'question' | 'condition' | 'action' | 'delay'

export const NODE_META: Record<NodeType, { icon: LucideIcon; tint: string; label: TKey; desc: TKey }> = {
  trigger:   { icon: Zap,               tint: 'bg-brand-600 text-white',  label: 'node.trigger',   desc: 'node.trigger_d' },
  message:   { icon: MessageSquareText, tint: 'bg-ink text-white',        label: 'node.message',   desc: 'node.message_d' },
  question:  { icon: HelpCircle,        tint: 'bg-[#6d5dfc] text-white',  label: 'node.question',  desc: 'node.question_d' },
  condition: { icon: GitBranch,         tint: 'bg-[#f59e0b] text-white',  label: 'node.condition', desc: 'node.condition_d' },
  action:    { icon: Tag,               tint: 'bg-[#10b981] text-white',  label: 'node.action',    desc: 'node.action_d' },
  delay:     { icon: Clock,             tint: 'bg-[#0ea5e9] text-white',  label: 'node.delay',     desc: 'node.delay_d' },
}

export const PALETTE: NodeType[] = ['message', 'question', 'condition', 'action', 'delay']

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
    default: return { kind: 'comment', keywords: '', match: 'contains', media_id: null, media_caption: '', comment_replies: '' }
  }
}
