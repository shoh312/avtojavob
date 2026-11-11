import { useState } from 'react'
import { Check } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { LANGS, useI18n, type Lang, type TKey } from '../i18n'
import { Button, PageHeader, useToast } from '../components/ui'

export default function Settings() {
  const { t, lang, setLang } = useI18n()
  const toast = useToast()
  const { me, refresh } = useAuth()
  const [name, setName] = useState(me?.user.name || '')
  const [pw, setPw] = useState({ password: '', new_password: '' })
  const [busy, setBusy] = useState(false)

  const changeLang = async (l: Lang) => {
    setLang(l)
    await api.patch('/api/me', { lang: l })
    refresh()
  }
  const saveProfile = async () => {
    setBusy(true)
    try {
      await api.patch('/api/me', { name, ...(pw.new_password ? pw : {}) })
      setPw({ password: '', new_password: '' })
      toast(t('set.saved'))
      refresh()
    } catch (e) {
      toast(e instanceof ApiError ? t(`err.${e.code}` as TKey) : t('common.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('set.title')} />
      <div className="grid max-w-3xl gap-6">
        <section className="card p-6">
          <h2 className="text-[16px] font-bold">{t('set.language')}</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LANGS.map(l => (
              <button key={l.code} onClick={() => changeLang(l.code)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-[14px] font-semibold transition ${lang === l.code ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line hover:bg-soft'}`}>
                {l.label}{lang === l.code && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </section>
        <section className="card space-y-4 p-6">
          <h2 className="text-[16px] font-bold">{t('set.profile')}</h2>
          <label className="block"><span className="label">{t('auth.name')}</span><input className="input" value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="block"><span className="label">{t('auth.email')}</span><input className="input bg-soft" value={me?.user.email || ''} disabled /></label>
          <h3 className="pt-2 text-[14px] font-bold">{t('set.password')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" type="password" placeholder={t('set.current_pw')} value={pw.password} onChange={e => setPw({ ...pw, password: e.target.value })} autoComplete="current-password" />
            <input className="input" type="password" placeholder={t('set.new_pw')} value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" />
          </div>
          <div className="pt-2"><Button onClick={saveProfile} loading={busy}>{t('common.save')}</Button></div>
        </section>
      </div>
    </>
  )
}
