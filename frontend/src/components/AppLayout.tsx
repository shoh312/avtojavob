import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Activity, Check, ChevronsUpDown, Home, Instagram, LogOut, Menu, Plus, Settings, Users, Workflow, X } from 'lucide-react'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { api } from '../api'
import { Logo } from './Logo'
import { Avatar } from './ui'

const NAV: { to: string; key: TKey; icon: typeof Home; end?: boolean }[] = [
  { to: '/app', key: 'nav.home', icon: Home, end: true },
  { to: '/app/flows', key: 'nav.flows', icon: Workflow },
  { to: '/app/contacts', key: 'nav.contacts', icon: Users },
  { to: '/app/activity', key: 'nav.activity', icon: Activity },
  { to: '/app/accounts', key: 'nav.accounts', icon: Instagram },
  { to: '/app/settings', key: 'nav.settings', icon: Settings },
]

function AccountSwitcher() {
  const { me, account, setAccountId } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-white p-2.5 text-left hover:bg-soft">
        <Avatar name={account?.username || '?'} src={account?.picture_url} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{account ? `@${account.username}` : t('nav.no_account')}</div>
          <div className="truncate text-[12px] text-ink-3">Instagram</div>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-ink-4" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 rounded-xl border border-line bg-white p-1 shadow-pop">
          {me?.accounts.map(a => (
            <button key={a.id} onClick={() => { setAccountId(a.id); setOpen(false) }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-soft">
              <Avatar name={a.username} src={a.picture_url} size={24} />
              <span className="flex-1 truncate">@{a.username}</span>
              {a.id === account?.id && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
          <a href="/instagram/connect" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50">
            <Plus className="h-4 w-4" />{t('acc.connect')}
          </a>
        </div>
      )}
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n()
  const { me, setMe } = useAuth()
  const navigate = useNavigate()
  const logout = async () => {
    await api.post('/api/auth/logout')
    setMe(null)
    navigate('/')
  }
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1"><Logo size={28} /></div>
      <AccountSwitcher />
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ to, key, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-2 hover:bg-soft'}`}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />{t(key)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-line pt-4">
        <div className="flex items-center gap-3 px-2">
          <Avatar name={me?.user.name || me?.user.email || '?'} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{me?.user.name || me?.user.email}</div>
            <div className="truncate text-[12px] text-ink-3">{me?.user.email}</div>
          </div>
          <button onClick={logout} title={t('nav.logout')} className="rounded-lg p-2 text-ink-3 hover:bg-soft hover:text-ink"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const [mobile, setMobile] = useState(false)
  const loc = useLocation()
  useEffect(() => setMobile(false), [loc.pathname])
  return (
    <div className="min-h-screen bg-soft">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-line bg-white lg:block"><Sidebar /></aside>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Logo size={24} />
        <button onClick={() => setMobile(true)} className="rounded-lg p-2 hover:bg-soft"><Menu className="h-5 w-5" /></button>
      </header>
      {mobile && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setMobile(false)}>
          <aside className="h-full w-[280px] bg-white" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMobile(false)} className="absolute right-3 top-3 rounded-lg p-2 text-white"><X className="h-5 w-5" /></button>
            <Sidebar onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}
      <main className="lg:pl-[260px]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10"><Outlet /></div>
      </main>
    </div>
  )
}
