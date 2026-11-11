import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Info, Megaphone, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Button, PageHeader, Spinner, useToast } from '../components/ui'
import { Onboarding } from './Home'

type Bc = { id: number; text: string; tag: string; status: string; total: number; sent: number; failed: number; created_at: string }

export default function Broadcasts() {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const { account } = useAuth()
  const [items, setItems] = useState<Bc[] | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [form, setForm] = useState({ text: '', tag: '', buttons: [] as { title: string; url: string }[] })
  const [eligible, setEligible] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: Bc[] }>(`/api/broadcasts?account_id=${account.id}`).then(r => setItems(r.items)).catch(() => setItems([]))
  }, [account])
  useEffect(() => {
    load()
    if (account) api.get<{ tags: string[] }>(`/api/contacts?account_id=${account.id}`).then(r => setTags(r.tags)).catch(() => {})
  }, [load, account])
  useEffect(() => {
    if (!account) return
    api.get<{ eligible: number }>(`/api/broadcasts/audience?account_id=${account.id}&tag=${encodeURIComponent(form.tag)}`).then(r => setEligible(r.eligible)).catch(() => {})
  }, [account, form.tag])
  useEffect(() => {
    if (!items?.some(b => b.status === 'running')) return
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
  }, [items, load])

  if (!account) return <Onboarding />
  const max = form.buttons.length ? 640 : 1000

  const send = async () => {
    if (!eligible || !confirm(t('bc.confirm', { n: eligible }))) return
    setBusy(true)
    try {
      await api.post('/api/broadcasts', { account_id: account.id, ...form })
      toast(t('bc.started'))
      setForm({ text: '', tag: form.tag, buttons: [] })
      load()
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      const known = ['no_audience', 'broadcast_running', 'plan_inactive', 'message_text', 'button_title', 'button_url']
      toast(known.includes(code) ? t((code.startsWith('button') ? `ve.${code}` : `err.${code}`) as TKey) : t('common.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('bc.title')} sub={t('bc.sub')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card space-y-5 p-6">
          <h2 className="flex items-center gap-2 text-[16px] font-bold"><Megaphone className="h-4 w-4 text-brand-600" />{t('bc.new')}</h2>
          <div>
            <span className="label">{t('bc.audience')}</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select className="input sm:w-64" value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })}>
                <option value="">{t('bc.all')}</option>
                {tags.map(tg => <option key={tg} value={tg}>{t('ct.tags')}: {tg}</option>)}
              </select>
              <span className={`chip ${eligible ? 'bg-emerald-50 text-emerald-700' : ''}`}>{t('bc.eligible', { n: eligible ?? '…' })}</span>
            </div>
          </div>
          <label className="block">
            <span className="label">{t('insp.text')}</span>
            <textarea rows={5} className="input resize-y" maxLength={max} value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} />
            <span className="hint flex justify-between"><span>{'{username}'}, {'{name}'}</span><span>{form.text.length}/{max}</span></span>
          </label>
          <div>
            <span className="label">{t('insp.buttons')}</span>
            <div className="space-y-2">
              {form.buttons.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input w-40" maxLength={20} placeholder={t('insp.btn_title')} value={b.title}
                    onChange={e => setForm({ ...form, buttons: form.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <div className="relative flex-1"><ExternalLink className="absolute left-3 top-3 h-3.5 w-3.5 text-ink-4" />
                    <input className="input pl-8 font-mono text-[13px]" placeholder="https://" value={b.url}
                      onChange={e => setForm({ ...form, buttons: form.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} /></div>
                  <button onClick={() => setForm({ ...form, buttons: form.buttons.filter((_, j) => j !== i) })} className="rounded-lg p-2 text-ink-4 hover:bg-brand-50 hover:text-brand-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {form.buttons.length < 3 && (
                <button onClick={() => setForm({ ...form, buttons: [...form.buttons, { title: '', url: '' }] })}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="h-4 w-4" />{t('insp.add_button')}</button>
              )}
            </div>
          </div>
          <div className="flex gap-2 rounded-xl bg-soft px-3 py-2.5 text-[12.5px] leading-snug text-ink-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('bc.rule')}</div>
          <Button onClick={send} loading={busy} disabled={!form.text.trim() || !eligible}><Megaphone className="h-4 w-4" />{t('bc.send')}</Button>
        </section>

        <aside>
          <h2 className="mb-3 text-[15px] font-bold">{t('bc.history')}</h2>
          {items === null ? <Spinner /> : items.length === 0 ? <p className="text-[13px] text-ink-4">{t('common.empty')}</p> : (
            <div className="space-y-3">
              {items.map(b => (
                <div key={b.id} className="card p-4">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className={`chip ${b.status === 'done' ? 'bg-emerald-50 text-emerald-700' : b.status === 'running' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>{t(`bc.status.${b.status}` as TKey)}</span>
                    <span className="text-ink-4">{ago(b.created_at)}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[13.5px]">{b.text}</p>
                  <div className="mt-3 h-1.5 rounded-full bg-soft"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${b.total ? ((b.sent + b.failed) / b.total) * 100 : 0}%` }} /></div>
                  <div className="mt-1.5 text-[12px] text-ink-3">{t('bc.progress', { sent: b.sent, total: b.total })}{b.tag && ` · ${b.tag}`}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  )
}
