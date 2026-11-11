import { useEffect, useState } from 'react'
import { Bot, CheckCircle2, Send, Sparkles, Webhook } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Button, PageHeader, Spinner, Toggle, useToast } from '../components/ui'
import { Onboarding } from './Home'

type Integ = {
  ai_enabled: boolean; ai_prompt: string; ai_available: boolean; ai_collect_leads: boolean
  telegram: { connected: boolean; chat: string; two_way: boolean }; tg_notify_leads: boolean; tg_notify_inbox: boolean; tg_notify_all: boolean
}

export default function Integrations() {
  const { t } = useI18n()
  const toast = useToast()
  const { account } = useAuth()
  const [d, setD] = useState<Integ | null>(null)
  const [prompt, setPrompt] = useState('')
  const [token, setToken] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (!account) return
    api.get<Integ>(`/api/accounts/${account.id}/integrations`).then(r => { setD(r); setPrompt(r.ai_prompt) }).catch(() => {})
  }, [account])
  if (!account) return <Onboarding />
  if (!d) return <Spinner />
  const base = `/api/accounts/${account.id}`
  const fail = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : ''
    toast(['tg_invalid', 'tg_no_chat', 'ai_unavailable', 'ai_failed'].includes(code) ? t(`err.${code}` as TKey) : t('common.error'), 'error')
  }
  const save = async (patch: Partial<Integ>) => {
    try { setD(await api.put<Integ>(`${base}/integrations`, patch)) } catch (e) { fail(e) }
  }
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn() } catch (e) { fail(e) } finally { setBusy('') } }

  return (
    <>
      <PageHeader title={t('int.title')} sub={t('int.sub')} />
      <div className="grid max-w-4xl gap-6">
        {/* AI yordamchi */}
        <section className="card p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#d97757] to-[#b5502f] text-white"><Sparkles className="h-5 w-5" /></span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16px] font-bold">{t('int.ai.title')}</h2>
                <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">{t('int.ai.enable')}
                  <Toggle checked={d.ai_enabled} onChange={v => save({ ai_enabled: v })} /></label>
              </div>
              <p className="mt-1 text-[13.5px] text-ink-3">{t('int.ai.desc')}</p>
            </div>
          </div>
          {!d.ai_available && <div className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">{t('int.ai.unavailable')}</div>}
          <label className="mt-5 block">
            <span className="label">{t('int.ai.prompt')}</span>
            <textarea rows={8} className="input resize-y" maxLength={8000} value={prompt} placeholder={t('int.ai.prompt_ph')} onChange={e => setPrompt(e.target.value)} />
            <p className="hint">{t('int.ai.hint')}</p>
          </label>
          <label className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span><span className="block text-[14px] font-semibold">{t('int.ai.leads')}</span>
              <span className="block text-[12.5px] text-ink-3">{t('int.ai.leads_d')}</span></span>
            <Toggle checked={d.ai_collect_leads} onChange={v => save({ ai_collect_leads: v })} />
          </label>
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="secondary" disabled={prompt === d.ai_prompt} onClick={() => save({ ai_prompt: prompt }).then(() => toast(t('common.saved')))}>{t('common.save')}</Button>
          </div>
          <div className="mt-5 rounded-2xl bg-soft p-4">
            <div className="flex gap-2">
              <input className="input flex-1" value={question} placeholder={t('int.ai.test_ph')} onChange={e => setQuestion(e.target.value)} />
              <Button size="md" variant="dark" loading={busy === 'ai'} disabled={!question.trim() || !d.ai_available}
                onClick={() => run('ai', async () => setAnswer((await api.post<{ answer: string }>(`${base}/ai/test`, { message: question, prompt, collect_leads: d.ai_collect_leads })).answer))}>
                <Bot className="h-4 w-4" />{t('int.ai.test')}
              </Button>
            </div>
            {answer && <div className="mt-3 max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[14px] shadow-card">{answer}</div>}
          </div>
        </section>

        {/* Telegram */}
        <section className="card p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#229ED9] text-white"><Send className="h-5 w-5" /></span>
            <div className="flex-1">
              <h2 className="text-[16px] font-bold">{t('int.tg.title')}</h2>
              <p className="mt-1 text-[13.5px] text-ink-3">{t('int.tg.desc')}</p>
            </div>
          </div>
          {d.telegram.connected ? (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-[14px] font-medium text-emerald-800">
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{t('int.tg.connected', { chat: d.telegram.chat })}</span>
                <button onClick={() => run('tgdel', async () => setD(await api.del<Integ>(`${base}/telegram`)))} className="text-[13px] font-semibold text-emerald-900 underline">{t('int.tg.disconnect')}</button>
              </div>
              <div className="flex gap-2.5 rounded-xl bg-[#e8f4fb] px-3.5 py-3 text-[13px] leading-snug text-[#11577a]">
                <Send className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{d.telegram.two_way ? t('int.tg.reply_info') : t('int.tg.reply_https')}</span>
              </div>
              {([['tg_notify_all', 'int.tg.all'], ['tg_notify_leads', 'int.tg.leads'], ['tg_notify_inbox', 'int.tg.inbox']] as const)
                .filter(([key]) => !(key === 'tg_notify_inbox' && d.tg_notify_all)).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 text-[14px]">
                  {t(label)}<Toggle checked={d[key]} onChange={v => save({ [key]: v })} />
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <ol className="space-y-2.5">
                {(['int.tg.step1', 'int.tg.step2', 'int.tg.step3'] as TKey[]).map((k, i) => (
                  <li key={k} className="flex gap-3 text-[13.5px] text-ink-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#229ED9] text-[12px] font-bold text-white">{i + 1}</span>{t(k)}</li>
                ))}
              </ol>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-[13px]" placeholder="123456789:AA..." value={token} onChange={e => setToken(e.target.value)} aria-label={t('int.tg.token')} />
                <Button loading={busy === 'tg'} disabled={!token.trim()} onClick={() => run('tg', async () => { setD(await api.post<Integ>(`${base}/telegram`, { bot_token: token })); setToken('') })}>{t('int.tg.connect')}</Button>
              </div>
            </div>
          )}
        </section>

        {/* Webhook */}
        <section className="card flex items-start gap-4 p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-white"><Webhook className="h-5 w-5" /></span>
          <div>
            <h2 className="text-[16px] font-bold">{t('int.wh.title')}</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">{t('int.wh.desc')}</p>
          </div>
        </section>
      </div>
    </>
  )
}
