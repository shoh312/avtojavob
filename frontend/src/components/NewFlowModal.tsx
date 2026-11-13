import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleDot, Gift, Phone, Plus, Sparkles, Tag, type LucideIcon } from 'lucide-react'
import { api, ApiError, type FlowSummary, type Template } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Button, Modal, useToast } from './ui'

const ICONS: Record<string, LucideIcon> = { tag: Tag, gift: Gift, phone: Phone, 'circle-dot': CircleDot }

export function useTemplates() {
  const { lang } = useI18n()
  const [items, setItems] = useState<Template[]>([])
  useEffect(() => { api.get<{ items: Template[] }>('/api/templates').then(r => setItems(r.items)).catch(() => {}) }, [lang])
  return items
}

export function useCreateFlow(accountId?: number) {
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useI18n()
  return async (template?: string) => {
    if (!accountId) return
    try {
      const f = await api.post<FlowSummary>('/api/flows', { account_id: accountId, template: template || null })
      navigate(`/app/flows/${f.id}`)
    } catch {
      toast(t('common.error'), 'error')
    }
  }
}

export function TemplateCard({ tpl, onClick }: { tpl: Template; onClick: () => void }) {
  const Icon = ICONS[tpl.icon] ?? Tag
  return (
    <button onClick={onClick} className="group flex flex-col items-start rounded-2xl border border-line bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-pop">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white"><Icon className="h-5 w-5" /></span>
      <span className="mt-3 text-[14.5px] font-bold leading-tight">{tpl.name}</span>
      <span className="mt-1 text-[12.5px] leading-snug text-ink-3">{tpl.description}</span>
    </button>
  )
}

export default function NewFlowModal({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId?: number }) {
  const { t } = useI18n()
  const templates = useTemplates()
  const create = useCreateFlow(accountId)
  const navigate = useNavigate()
  const toast = useToast()
  const { me } = useAuth()
  const [idea, setIdea] = useState('')
  const [busy, setBusy] = useState(false)
  const generate = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      const f = await api.post<FlowSummary>('/api/flows/generate', { account_id: accountId, prompt: idea })
      toast(t('aiflow.done'))
      navigate(`/app/flows/${f.id}`)
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'ai_unavailable' ? t('err.ai_unavailable') : t('aiflow.failed'), 'error')
    } finally { setBusy(false) }
  }
  const examples: TKey[] = ['aiflow.ex1', 'aiflow.ex2', 'aiflow.ex3']
  return (
    <Modal open={open} onClose={onClose} title={t('flows.modal.title')} wide>
      <div className="mb-5 rounded-2xl bg-gradient-to-br from-[#fff1f1] to-[#fbeee8] p-4">
        <div className="flex items-center gap-2 text-[15px] font-bold"><Sparkles className="h-4 w-4 text-brand-600" />{t('aiflow.title')}</div>
        <p className="mt-1 text-[13px] text-ink-3">{t('aiflow.sub')}</p>
        <textarea rows={3} className="input mt-3 resize-y bg-white" value={idea} maxLength={2000} placeholder={t('aiflow.ph')} onChange={e => setIdea(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {examples.map(k => <button key={k} onClick={() => setIdea(t(k))} className="chip bg-white hover:bg-brand-50 hover:text-brand-700">{t(k).slice(0, 48)}…</button>)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          {!me?.features?.ai ? <span className="text-[12px] text-amber-800">{t('int.ai.unavailable')}</span> : <span />}
          <Button onClick={generate} loading={busy} disabled={idea.trim().length < 5 || !me?.features?.ai}><Sparkles className="h-4 w-4" />{busy ? t('aiflow.busy') : t('aiflow.btn')}</Button>
        </div>
      </div>
      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-4">{t('aiflow.or_template')}</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <button onClick={() => create()} className="flex flex-col items-start rounded-2xl border-2 border-dashed border-line p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/40">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white"><Plus className="h-5 w-5" /></span>
          <span className="mt-3 text-[14.5px] font-bold">{t('flows.modal.blank')}</span>
          <span className="mt-1 text-[12.5px] text-ink-3">{t('flows.modal.blank_d')}</span>
        </button>
        {templates.map(tpl => <TemplateCard key={tpl.key} tpl={tpl} onClick={() => create(tpl.key)} />)}
      </div>
    </Modal>
  )
}
