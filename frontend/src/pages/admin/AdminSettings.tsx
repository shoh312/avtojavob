import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { Button, PageHeader, useToast } from '../../components/ui'

export default function AdminSettings() {
  const { t } = useI18n()
  const toast = useToast()
  const { refresh } = useAuth()
  const [tg, setTg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get<{ telegram_username: string }>('/api/admin/settings').then(r => setTg(r.telegram_username)).catch(() => {}) }, [])
  const save = async () => {
    setBusy(true)
    try {
      const r = await api.put<{ telegram_username: string }>('/api/admin/settings', { telegram_username: tg })
      setTg(r.telegram_username)
      toast(t('common.saved'))
      refresh()
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeader title={t('nav.admin_settings')} />
      <section className="card max-w-xl space-y-4 p-6">
        <label className="block">
          <span className="label">{t('adm.tg')}</span>
          <div className="relative">
            <span className="absolute left-3.5 top-2.5 text-[14px] text-ink-4">@</span>
            <input className="input pl-8" value={tg} placeholder="username" onChange={e => setTg(e.target.value)} />
          </div>
          <p className="hint">{t('adm.tg_hint')}</p>
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={save} loading={busy}>{t('common.save')}</Button>
          {tg && <a href={`https://t.me/${tg.replace(/^@/, '')}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600"><Send className="h-3.5 w-3.5" />t.me/{tg.replace(/^@/, '')}</a>}
        </div>
      </section>
    </>
  )
}
