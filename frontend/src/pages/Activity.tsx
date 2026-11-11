import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity as ActivityIcon, AlertCircle, CheckCircle2, Megaphone, MessageCircle, MousePointerClick, PauseCircle, Send, Sparkles, Webhook } from 'lucide-react'
import { api, type Activity } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Empty, PageHeader, Spinner } from '../components/ui'
import { Onboarding } from './Home'

const KIND: Record<string, { icon: typeof Send; cls: string }> = {
  comment_reply: { icon: MessageCircle, cls: 'bg-brand-50 text-brand-700' },
  private_reply: { icon: Send, cls: 'bg-ink text-white' },
  dm_reply: { icon: Send, cls: 'bg-ink text-white' },
  click: { icon: MousePointerClick, cls: 'bg-sky-50 text-sky-700' },
  answer: { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700' },
  skipped: { icon: PauseCircle, cls: 'bg-amber-50 text-amber-700' },
  ai_reply: { icon: Sparkles, cls: 'bg-[#fbeee8] text-[#b5502f]' },
  agent_reply: { icon: Send, cls: 'bg-ink text-white' },
  broadcast: { icon: Megaphone, cls: 'bg-sky-50 text-sky-700' },
  webhook: { icon: Webhook, cls: 'bg-soft text-ink-2' },
  error: { icon: AlertCircle, cls: 'bg-brand-600 text-white' },
}

export default function ActivityPage() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const { account } = useAuth()
  const [items, setItems] = useState<Activity[] | null>(null)

  useEffect(() => {
    if (!account) return
    const load = () => api.get<{ items: Activity[] }>(`/api/activity?account_id=${account.id}`).then(r => setItems(r.items)).catch(() => setItems([]))
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [account])

  if (!account) return <Onboarding />
  const detail = (a: Activity) => {
    if (a.kind === 'skipped' && ['wait_user', 'limit', 'answer_attempts', 'ai_no_answer'].includes(a.detail)) return t(`act.skip.${a.detail}` as TKey)
    return a.detail
  }

  return (
    <>
      <PageHeader title={t('act.title')} sub={t('act.sub')} />
      {items === null ? <Spinner /> : items.length === 0 ? (
        <Empty icon={<ActivityIcon className="h-6 w-6" />} title={t('common.empty')} />
      ) : (
        <div className="card divide-y divide-line">
          {items.map(a => {
            const k = KIND[a.kind] ?? KIND.skipped
            const Icon = k.icon
            return (
              <div key={a.id} className="flex gap-4 px-5 py-3.5">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${k.cls}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px]">
                    <span className="font-semibold">{t(`act.kind.${a.kind}` as TKey)}</span>
                    {a.username && <span className="text-ink-3">@{a.username}</span>}
                    {a.flow_name && <Link to={`/app/flows/${a.flow_id}`} className="chip hover:bg-brand-50 hover:text-brand-700">{a.flow_name}</Link>}
                  </div>
                  {a.incoming && <div className="mt-1 truncate text-[13px] text-ink-3">“{a.incoming}”</div>}
                  {a.detail && <div className={`mt-1 break-words text-[13px] ${a.kind === 'error' ? 'text-brand-700' : 'text-ink-2'}`}>{detail(a)}</div>}
                </div>
                <span className="shrink-0 whitespace-nowrap text-[12px] text-ink-4">{ago(a.created_at)}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
