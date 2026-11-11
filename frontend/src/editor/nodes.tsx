import { createContext, memo, useContext, type ReactNode } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, Handle, Position, useReactFlow, type EdgeProps, type NodeProps } from '@xyflow/react'
import { AlertCircle, ExternalLink, MousePointerClick, X } from 'lucide-react'
import { useI18n, type TKey } from '../i18n'
import { NODE_META, TRIGGER_META, type NodeType } from './meta'

export type EditorCtxValue = {
  stats: Record<string, Record<string, number>>
  errors: Record<string, string[]>
}
export const EditorCtx = createContext<EditorCtxValue>({ stats: {}, errors: {} })

function Stat({ value, label }: { value?: number; label: string }) {
  if (!value) return null
  return <span title={label} className="rounded-md bg-soft px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-3">{value}</span>
}

/** Chiqish qatori: o'ng chetida ulanish nuqtasi bo'lgan to'liq kenglikdagi qator. */
function OutRow({ id, children, tone = 'default' }: { id: string; children: ReactNode; tone?: 'default' | 'yes' | 'no' }) {
  const color = tone === 'yes' ? '!bg-emerald-500' : tone === 'no' ? '!bg-brand-500' : ''
  return (
    <div className="relative flex items-center justify-end gap-2 px-3.5 py-1.5 text-[12px] font-medium text-ink-3">
      {children}
      <Handle type="source" position={Position.Right} id={id} className={color} />
    </div>
  )
}

function Shell({ id, type, selected, subtitle, stat, children, footer }: {
  id: string; type: NodeType; selected: boolean; subtitle?: string; stat?: ReactNode; children?: ReactNode; footer?: ReactNode
}) {
  const { t } = useI18n()
  const { errors } = useContext(EditorCtx)
  const meta = NODE_META[type]
  const Icon = meta.icon
  const errs = errors[id] || []
  return (
    <div className={`w-[272px] rounded-[18px] border bg-white shadow-node transition
      ${selected ? 'border-brand-500 ring-4 ring-brand-100' : errs.length ? 'border-brand-300' : 'border-line hover:border-[#dcdce2]'}`}>
      {type !== 'trigger' && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${meta.tint}`}><Icon className="h-[15px] w-[15px]" strokeWidth={2.2} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight">{t(meta.label)}</div>
          {subtitle && <div className="truncate text-[11.5px] leading-tight text-ink-3">{subtitle}</div>}
        </div>
        {stat}
      </div>
      {children && <div className="px-3.5 pb-2.5">{children}</div>}
      {errs.length > 0 && (
        <div className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg bg-brand-50 px-2 py-1.5 text-[11.5px] font-medium leading-snug text-brand-700">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />{t(`ve.${errs[0]}` as TKey)}
        </div>
      )}
      {footer && <div className="border-t border-line/70 pb-1 pt-1">{footer}</div>}
    </div>
  )
}

function Preview({ text, empty }: { text?: string; empty: string }) {
  return (
    <div className={`line-clamp-4 whitespace-pre-wrap break-words rounded-xl rounded-tl-md bg-soft px-3 py-2 text-[12.5px] leading-snug ${text ? 'text-ink-2' : 'italic text-ink-4'}`}>
      {text || empty}
    </div>
  )
}

export const TriggerNode = memo(({ id, data, selected }: NodeProps) => {
  const { t } = useI18n()
  const { stats } = useContext(EditorCtx)
  const d = data as any
  const tm = TRIGGER_META[d.kind as keyof typeof TRIGGER_META] ?? TRIGGER_META.comment
  const TIcon = tm.icon
  const kws: string[] = (d.keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean)
  return (
    <Shell id={id} type="trigger" selected={!!selected} subtitle={t(tm.label)}
      stat={<Stat value={stats[id]?.runs} label={t('ed.stats.runs')} />}
      footer={<OutRow id="out">{t('node.next')}</OutRow>}>
      <div className="flex items-center gap-2 text-[12px] text-ink-3"><TIcon className="h-3.5 w-3.5" />{t(tm.desc)}</div>
      {d.kind !== 'story_mention' && (
        <div className="mt-2 flex flex-wrap gap-1">
          {d.match === 'any'
            ? <span className="chip bg-amber-50 text-amber-700">{t('flows.any_text')}</span>
            : kws.slice(0, 6).map(k => <span key={k} className="chip font-mono text-[11.5px]">{k}</span>)}
          {d.match !== 'any' && kws.length > 6 && <span className="chip">+{kws.length - 6}</span>}
        </div>
      )}
      {d.kind === 'comment' && d.media_id && (
        <div className="mt-2 truncate text-[11.5px] text-ink-3">📌 {d.media_caption || d.media_id}</div>
      )}
    </Shell>
  )
})

export const MessageNode = memo(({ id, data, selected }: NodeProps) => {
  const { t } = useI18n()
  const { stats } = useContext(EditorCtx)
  const d = data as any
  const buttons: any[] = d.buttons || []
  const s = stats[id] || {}
  const waits = buttons.some(b => b.kind !== 'url')
  return (
    <Shell id={id} type="message" selected={!!selected} stat={<Stat value={s.sent} label={t('ed.stats.sent')} />}
      footer={waits ? undefined : <OutRow id="out">{t('node.next')}</OutRow>}>
      <Preview text={d.text} empty={t('node.empty_text')} />
      {buttons.length > 0 && (
        <div className="-mx-3.5 mt-2 flex flex-col gap-1">
          {buttons.map(b => (
            <div key={b.id} className="relative px-3.5">
              <div className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white py-1.5 text-[12.5px] font-semibold text-sky-700">
                {b.kind === 'url' ? <ExternalLink className="h-3 w-3" /> : <MousePointerClick className="h-3 w-3" />}
                <span className="max-w-[160px] truncate">{b.title || '…'}</span>
                {s[`clicked:${b.id}`] ? <span className="ml-1 text-[11px] font-semibold text-ink-4">{s[`clicked:${b.id}`]}</span> : null}
              </div>
              {b.kind !== 'url' && <Handle type="source" position={Position.Right} id={`btn:${b.id}`} />}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
})

export const QuestionNode = memo(({ id, data, selected }: NodeProps) => {
  const { t } = useI18n()
  const { stats } = useContext(EditorCtx)
  const d = data as any
  const field = d.field === 'custom' ? d.custom_key || '…' : t(`insp.field.${d.field || 'phone'}` as TKey)
  return (
    <Shell id={id} type="question" selected={!!selected}
      stat={<Stat value={stats[id]?.answered} label={t('ed.stats.answered')} />}
      footer={<OutRow id="out">{t('node.next')}</OutRow>}>
      <Preview text={d.text} empty={t('node.empty_text')} />
      <div className="mt-2 text-[12px] text-ink-3">↳ <span className="chip bg-violet-50 text-violet-700">{field}</span></div>
    </Shell>
  )
})

export const ConditionNode = memo(({ id, data, selected }: NodeProps) => {
  const { t } = useI18n()
  const { stats } = useContext(EditorCtx)
  const d = data as any
  const s = stats[id] || {}
  const what = d.check === 'has_tag' ? `${t('insp.check.has_tag')}: ${d.tag || '…'}`
    : d.check === 'has_field' ? `${t('insp.check.has_field')}: ${d.field || '…'}` : t('insp.check.follows')
  return (
    <Shell id={id} type="condition" selected={!!selected} footer={<>
      <OutRow id="yes" tone="yes"><span className="text-emerald-600">{t('node.yes')}</span>{s.yes ? <span className="text-ink-4">{s.yes}</span> : null}</OutRow>
      <OutRow id="no" tone="no"><span className="text-brand-600">{t('node.no')}</span>{s.no ? <span className="text-ink-4">{s.no}</span> : null}</OutRow>
    </>}>
      <div className="text-[13px] font-medium text-ink-2">{what}</div>
    </Shell>
  )
})

export const ActionNode = memo(({ id, data, selected }: NodeProps) => {
  const { t } = useI18n()
  const d = data as any
  const label = t(`insp.op.${d.op || 'add_tag'}` as TKey)
  const value = d.op === 'set_field' ? `${d.field || '…'} = ${d.value || '…'}`
    : d.op === 'notify' ? (d.text || 'Telegram') : d.op === 'webhook' ? (d.url || '…').replace(/^https?:\/\//, '').slice(0, 30) : d.tag || '…'
  return (
    <Shell id={id} type="action" selected={!!selected} footer={<OutRow id="out">{t('node.next')}</OutRow>}>
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="mt-1"><span className="chip bg-emerald-50 font-mono text-emerald-700">{value}</span></div>
    </Shell>
  )
})

export const DelayNode = memo(({ id, data, selected }: NodeProps) => {
  const { t } = useI18n()
  const d = data as any
  return (
    <Shell id={id} type="delay" selected={!!selected} footer={<OutRow id="out">{t('node.next')}</OutRow>}>
      <div className="text-[20px] font-bold tracking-tight">{d.amount || 0} <span className="text-[13px] font-medium text-ink-3">{t(d.unit === 'hours' ? 'insp.hours' : 'insp.minutes')}</span></div>
    </Shell>
  )
})

export const nodeTypes = {
  trigger: TriggerNode, message: MessageNode, question: QuestionNode,
  condition: ConditionNode, action: ActionNode, delay: DelayNode,
}

export function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, style }: EdgeProps) {
  const { setEdges } = useReactFlow()
  let [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  if (targetX < sourceX - 20) {
    // Orqaga qaytuvchi chiziq (sikl): bloklar ostidan aylanib o'tadi
    const below = Math.max(sourceY, targetY) + 110
    const k = 70
    path = `M${sourceX},${sourceY} C${sourceX + k},${sourceY} ${sourceX + k},${below} ${sourceX},${below}`
      + ` L${targetX},${below} C${targetX - k},${below} ${targetX - k},${targetY} ${targetX},${targetY}`
    lx = (sourceX + targetX) / 2
    ly = below
  }
  return (
    <>
      <BaseEdge id={id} path={path} style={style} interactionWidth={24} />
      {selected && (
        <EdgeLabelRenderer>
          <button onClick={() => setEdges(es => es.filter(e => e.id !== id))}
            style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, pointerEvents: 'all' }}
            className="nodrag nopan absolute grid h-6 w-6 place-items-center rounded-full border border-brand-200 bg-white text-brand-600 shadow-pop hover:bg-brand-50">
            <X className="h-3.5 w-3.5" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { deletable: DeletableEdge }
