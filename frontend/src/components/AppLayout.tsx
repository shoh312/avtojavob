import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, BarChart3, Blocks, KanbanSquare, ShoppingBag, Check, ChevronDown, ChevronsUpDown, UsersRound, CreditCard, Home, Inbox, Instagram, LogOut, MailWarning, Megaphone, Menu, Plus, Settings, SlidersHorizontal, UserCog, Users, Workflow, X } from 'lucide-react'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { api } from '../api'
import { Logo } from './Logo'
import { Avatar, useToast } from './ui'
import { PlanBadge, PlanBanner, planStatus } from './Plan'

type NavItem = { to: string; key: TKey; icon: typeof Home; end?: boolean; owner?: boolean }
const NAV_GROUPS: { key: TKey | null; items: NavItem[] }[] = [
  { key: null, items: [
    { to: '/app', key: 'nav.home', icon: Home, end: true },
    { to: '/app/inbox', key: 'nav.inbox', icon: Inbox },
  ] },
  { key: 'nav.g.sales', items: [
    { to: '/app/crm', key: 'nav.crm', icon: KanbanSquare },
    { to: '/app/contacts', key: 'nav.contacts', icon: Users },
    { to: '/app/products', key: 'nav.products', icon: ShoppingBag },
  ] },
  { key: 'nav.g.auto', items: [
    { to: '/app/flows', key: 'nav.flows', icon: Workflow },
    { to: '/app/broadcasts', key: 'nav.broadcasts', icon: Megaphone },
    { to: '/app/integrations', key: 'nav.integrations', icon: Blocks, owner: true },
    { to: '/app/activity', key: 'nav.activity', icon: Activity },
  ] },
  { key: 'nav.g.account', items: [
    { to: '/app/team', key: 'nav.team', icon: UsersRound, owner: true },
    { to: '/app/accounts', key: 'nav.accounts', icon: Instagram, owner: true },
    { to: '/app/billing', key: 'nav.billing', icon: CreditCard, owner: true },
    { to: '/app/settings', key: 'nav.settings', icon: Settings },
  ] },
]

function useUnread() {
  const { account } = useAuth()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!account) return
    const load = () => api.get<{ unread: number }>(`/api/inbox?account_id=${account.id}`).then(r => setN(r.unread || 0)).catch(() => {})
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [account])
  return n
}

function NavGroup({ title, items, onNavigate, unread }: { title: TKey | null; items: NavItem[]; onNavigate?: () => void; unread: number }) {
  const { t } = useI18n()
  const { me } = useAuth()
  const loc = useLocation()
  const storageKey = `cf_nav_${title}`
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(storageKey) !== '0' } catch { return true } })
  const visible = items.filter(i => !(i.owner && me?.user.role === 'manager'))
  if (!visible.length) return null
  const hasActive = visible.some(i => (i.end ? loc.pathname === i.to : loc.pathname.startsWith(i.to)))
  const shown = open || hasActive
  const toggle = () => { setOpen(!open); try { localStorage.setItem(storageKey, open ? '0' : '1') } catch { /* ignore */ } }
  return (
    <div>
      {title && (
        <button onClick={toggle} className="flex w-full items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-4 hover:text-ink-2">
          {t(title)}<ChevronDown className={`h-3.5 w-3.5 transition ${shown ? '' : '-rotate-90'}`} />
        </button>
      )}
      {shown && (
        <div className="flex flex-col gap-0.5">
          {visible.map(({ to, key, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onNavigate}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-2 hover:bg-soft'}`}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />{t(key)}
              {to === '/app/inbox' && unread > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
              {to === '/app/billing' && me && !me.user.plan.unlimited && <span className="ml-auto"><PlanBadge status={planStatus(me.user.plan)} /></span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

const ADMIN_NAV: { to: string; key: TKey; icon: typeof Home; end?: boolean }[] = [
  { to: '/app/admin', key: 'nav.admin', icon: BarChart3, end: true },
  { to: '/app/admin/users', key: 'nav.admin_users', icon: UserCog },
  { to: '/app/admin/settings', key: 'nav.admin_settings', icon: SlidersHorizontal },
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
          {me?.user.role !== 'manager' && (
            <a href="/instagram/connect" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50">
              <Plus className="h-4 w-4" />{t('acc.connect')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n()
  const { me, setMe } = useAuth()
  const navigate = useNavigate()
  const unread = useUnread()
  const logout = async () => {
    await api.post('/api/auth/logout')
    setMe(null)
    navigate('/')
  }
  return (
    <div className="scrollbar-thin flex h-full flex-col gap-6 overflow-y-auto p-4">
      <div className="px-2 pt-1"><Logo size={28} /></div>
      <AccountSwitcher />
      <nav className="flex flex-col gap-1">
        {NAV_GROUPS.map(g => <NavGroup key={g.key || 'main'} title={g.key} items={g.items} onNavigate={onNavigate} unread={unread} />)}
      </nav>
      {me?.user.is_admin && (
        <nav className="flex flex-col gap-0.5">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t('nav.admin_section')}</div>
          {ADMIN_NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onNavigate}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${isActive ? 'bg-ink text-white' : 'text-ink-2 hover:bg-soft'}`}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />{t(key)}
            </NavLink>
          ))}
        </nav>
      )}
      <div className="mt-auto border-t border-line pt-4">
        <div className="flex items-center gap-3 px-2">
          <Avatar name={me?.user.name || me?.user.email || '?'} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{me?.user.name || me?.user.email}</div>
            <div className="truncate text-[12px] text-ink-3">{me?.user.role === 'manager' ? t('team.role_manager') : me?.user.email}</div>
          </div>
          <button onClick={logout} title={t('nav.logout')} className="rounded-lg p-2 text-ink-3 hover:bg-soft hover:text-ink"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}

function VerifyBanner() {
  const { t } = useI18n()
  const toast = useToast()
  const { me, refresh } = useAuth()
  const [params, setParams] = useSearchParams()
  const [sent, setSent] = useState(false)
  useEffect(() => {
    const v = params.get('verified')
    if (v === null) return
    if (v === '1') { toast(t('verify.ok')); refresh() } else toast(t('err.token_invalid'), 'error')
    params.delete('verified')
    setParams(params, { replace: true })
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!me || me.user.email_verified || !me.features?.email) return null
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-white px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-2.5 text-[14px] text-ink-2"><MailWarning className="h-4 w-4 shrink-0 text-brand-600" />{t('verify.banner', { email: me.user.email })}</div>
      <button disabled={sent} onClick={async () => { await api.post('/api/auth/verify/send'); setSent(true); toast(t('verify.sent')) }}
        className="h-9 rounded-xl border border-line px-4 text-[13px] font-semibold hover:bg-soft disabled:opacity-50">{sent ? t('verify.sent') : t('verify.resend')}</button>
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
        {loc.pathname.startsWith('/app/inbox')
          ? <Outlet />
          : <div className={`${loc.pathname.startsWith('/app/crm') ? '' : 'mx-auto max-w-6xl '}px-4 py-8 sm:px-8 sm:py-10`}><PlanBanner /><VerifyBanner /><Outlet /></div>}
      </main>
    </div>
  )
}
