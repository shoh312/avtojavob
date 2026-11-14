import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, Copy, Crown, KeyRound, MoreHorizontal, Plus, Send, Trash2, Trophy, UserPlus, Users, UsersRound } from 'lucide-react'
import { api, ApiError } from '../api'
import { useI18n, useTimeAgo, type TKey } from '../i18n'
import { Avatar, Button, Modal, PageHeader, Spinner, Toggle, useToast } from '../components/ui'

type Member = {
  id: number; name: string; email: string; avatar_url?: string; last_login_at: string | null
  assigned: number; open: number; won: number; overdue: number; tasks: number
  telegram: { account_id: number; username: string; linked: boolean; link: string }[]
}
type TeamData = { members: Member[]; owner: Member; unassigned: number; auto_assign: boolean }

function AiLink() {
  const { t } = useI18n()
  return (
    <Link to="/app/integrations?open=ai" className="group flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition hover:border-[#d6d6dc] hover:shadow-card">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6d5dfc] to-[#e5161f] text-white"><Bot className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{t('ai3.team_t')}</span>
        <span className="block truncate text-[12.5px] text-ink-3">{t('ai3.team_d')}</span></span>
      <ArrowRight className="h-4 w-4 text-ink-4 transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  )
}

function CredentialsModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const text = `ChatFlow\n${window.location.origin}/login\nEmail: ${email}\n${t('auth.password')}: ${password}`
  return (
    <Modal open onClose={onClose} title={t('team.cred_title')} sub={t('team.cred_hint')} icon={<KeyRound className="h-5 w-5" />}>
      <pre className="whitespace-pre-wrap rounded-2xl bg-[#16161b] p-4 font-mono text-[13px] leading-relaxed text-[#e6e6ea]">{text}</pre>
      <Button className="mt-4 w-full" onClick={() => { navigator.clipboard?.writeText(text); toast(t('bill.copied')) }}><Copy className="h-4 w-4" />{t('bill.copy')}</Button>
    </Modal>
  )
}

function Menu({ items }: { items: { icon: typeof Trash2; label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-4 hover:bg-soft hover:text-ink"><MoreHorizontal className="h-4 w-4" /></button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-line bg-white p-1 shadow-pop animate-fade-up">
          {items.map(it => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick() }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium ${it.danger ? 'text-brand-700 hover:bg-brand-50' : 'hover:bg-soft'}`}>
              <it.icon className="h-4 w-4" />{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function presence(iso: string | null) {
  if (!iso) return 'never'
  const h = (Date.now() - new Date(iso).getTime()) / 36e5
  return h < 24 ? 'today' : h < 24 * 7 ? 'week' : 'old'
}

function MemberCard({ m, owner, maxOpen, onPw, onRemove }: { m: Member; owner?: boolean; maxOpen: number; onPw?: () => void; onRemove?: () => void }) {
  const { t } = useI18n()
  const ago = useTimeAgo()
  const toast = useToast()
  const p = presence(m.last_login_at)
  return (
    <div className={`group relative flex flex-col rounded-3xl border bg-white p-5 transition hover:shadow-card ${owner ? 'border-ink/15' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar name={m.name || m.email} src={m.avatar_url || null} size={52} />
          <span className={`absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${p === 'today' ? 'bg-emerald-500' : p === 'week' ? 'bg-amber-400' : 'bg-[#cfcfd6]'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-bold">{m.name || m.email.split('@')[0]}</span>
            {owner && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          </div>
          <div className="truncate text-[12.5px] text-ink-3">{owner ? t('team2.you') : m.email}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-4">
            {p === 'never' ? t('team2.never') : p === 'today' ? t('team2.seen_today') : t('team2.seen', { ago: ago(m.last_login_at) })}
          </div>
        </div>
        {!owner && <Menu items={[
          { icon: KeyRound, label: t('team.new_pw'), onClick: () => onPw?.() },
          { icon: Trash2, label: t('common.delete'), onClick: () => onRemove?.(), danger: true },
        ]} />}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-soft p-2 text-center">
        {[
          { v: m.assigned, l: t('team2.clients_s') },
          { v: m.open, l: t('team2.open') },
          { v: m.won, l: t('team2.won'), win: true },
        ].map(x => (
          <div key={x.l} className="rounded-xl py-1.5">
            <div className={`text-[18px] font-extrabold tabular-nums ${x.win && x.v ? 'text-emerald-600' : ''}`}>{x.v}</div>
            <div className="text-[11px] text-ink-3">{x.l}</div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-ink-4"><span>{t('team2.load')}</span><span className="tabular-nums">{m.open}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-soft">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700" style={{ width: `${maxOpen ? Math.max(m.open ? 6 : 0, (m.open / maxOpen) * 100) : 0}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {m.overdue > 0
          ? <span className="chip bg-brand-50 text-brand-700"><AlertTriangle className="mr-1 h-3 w-3" />{t('team2.overdue', { n: m.overdue })}</span>
          : <span className="chip">{m.tasks ? t('team2.tasks', { n: m.tasks }) : t('team2.no_tasks')}</span>}
        {m.telegram.map(tg => tg.linked ? (
          <span key={tg.account_id} className="chip bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />Telegram</span>
        ) : tg.link ? (
          <button key={tg.account_id} onClick={() => { navigator.clipboard?.writeText(tg.link); toast(t('team.link_copied')) }}
            className="chip bg-[#e8f4fb] text-[#11577a] hover:bg-[#d5ebf7]"><Send className="mr-1 h-3 w-3" />{t('team.tg_link')}<Copy className="ml-1 h-3 w-3" /></button>
        ) : null)}
      </div>
    </div>
  )
}

export default function Team() {
  const { t } = useI18n()
  const toast = useToast()
  const [data, setData] = useState<TeamData | null>(null)
  const [form, setForm] = useState({ name: '', email: '' })
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null)

  const load = useCallback(() => api.get<TeamData>('/api/team').then(setData).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  if (!data) return <Spinner />

  const add = async () => {
    setBusy(true)
    try {
      const r = await api.post<Member & { password: string }>('/api/team', form)
      setCred({ email: r.email, password: r.password })
      setForm({ name: '', email: '' })
      setAdding(false)
      load()
    } catch (e) {
      toast(e instanceof ApiError && ['email_invalid', 'email_taken'].includes(e.code) ? t(`err.${e.code}` as TKey) : t('common.error'), 'error')
    } finally { setBusy(false) }
  }
  const resetPw = async (m: Member) => setCred({ email: m.email, password: (await api.post<{ password: string }>(`/api/team/${m.id}/password`)).password })
  const remove = async (m: Member) => {
    if (!confirm(t('team.remove_q', { name: m.name || m.email }))) return
    await api.del(`/api/team/${m.id}`)
    load()
  }

  const everyone = [data.owner, ...data.members]
  const maxOpen = Math.max(1, ...everyone.map(m => m.open))
  const tiles = [
    { icon: Users, label: t('team2.size'), value: everyone.length },
    { icon: UsersRound, label: t('team2.clients'), value: everyone.reduce((a, m) => a + m.assigned, 0) },
    { icon: Trophy, label: t('team2.won'), value: everyone.reduce((a, m) => a + m.won, 0) },
    { icon: AlertTriangle, label: t('team2.unassigned'), value: data.unassigned, warn: data.unassigned > 0, to: '/app/crm?view=list' },
  ]
  const noBot = data.members.length > 0 && data.members.every(m => m.telegram.length === 0)

  return (
    <>
      <PageHeader title={t('team.title')} sub={t('team.sub')} action={<Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />{t('team.add')}</Button>} />

      {/* umumiy ko'rsatkichlar */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(x => {
          const body = (
            <>
              <x.icon className={`h-4 w-4 ${x.warn ? 'text-amber-600' : 'text-ink-4'}`} />
              <div className="mt-3 text-[24px] font-extrabold tabular-nums tracking-tight">{x.value}</div>
              <div className={`text-[12.5px] ${x.warn ? 'font-semibold text-amber-700' : 'text-ink-3'}`}>{x.label}</div>
            </>
          )
          return x.to
            ? <Link key={x.label} to={x.to} className={`rounded-3xl border p-4 transition hover:shadow-card ${x.warn ? 'border-amber-200 bg-amber-50/60' : 'border-line bg-white'}`}>{body}</Link>
            : <div key={x.label} className="rounded-3xl border border-line bg-white p-4">{body}</div>
        })}
      </div>

      {/* avtomatik taqsimlash */}
      <div className={`mb-6 flex flex-col gap-4 rounded-3xl border p-5 sm:flex-row sm:items-center ${data.auto_assign ? 'border-emerald-200 bg-gradient-to-r from-emerald-50/70 to-white' : 'border-line bg-white'}`}>
        <div className="flex shrink-0 items-center gap-2" aria-hidden>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white shadow-[0_6px_14px_-6px_rgba(229,22,31,.6)]">lid</span>
          <svg width="44" height="36" viewBox="0 0 44 36" className={data.auto_assign ? 'text-emerald-500' : 'text-[#d4d4da]'}>
            {[6, 18, 30].map(y => <path key={y} d={`M2 18 C 20 18, 22 ${y}, 42 ${y}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3"
              className={data.auto_assign ? 'animate-[dash_1.2s_linear_infinite]' : ''} />)}
          </svg>
          <div className="flex -space-x-2">
            {everyone.slice(0, 3).map(m => <span key={m.id} className="rounded-full ring-2 ring-white"><Avatar name={m.name || m.email} src={m.avatar_url || null} size={28} /></span>)}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-bold">{t('team.auto')}</div>
          <div className="mt-0.5 text-[13px] text-ink-3">{t('team.auto_d')}</div>
        </div>
        <Toggle checked={data.auto_assign} onChange={async v => { await api.put('/api/team/settings', { auto_assign: v }); load() }} />
      </div>

      {/* a'zolar */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MemberCard m={data.owner} owner maxOpen={maxOpen} />
        {data.members.map(m => <MemberCard key={m.id} m={m} maxOpen={maxOpen} onPw={() => resetPw(m)} onRemove={() => remove(m)} />)}
        <button onClick={() => setAdding(true)}
          className="group flex min-h-[220px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line p-5 text-center transition hover:border-brand-300 hover:bg-brand-50/40">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3 transition group-hover:bg-brand-600 group-hover:text-white"><Plus className="h-5 w-5" /></span>
          <span className="mt-3 text-[14.5px] font-bold">{t('team2.invite')}</span>
          <span className="mt-1 max-w-[220px] text-[12.5px] text-ink-3">{t('team2.invite_d')}</span>
        </button>
      </div>

      {data.members.length > 0 && (
        <p className="mt-4 text-[12.5px] text-ink-3">
          {noBot ? <Link to="/app/integrations?open=telegram" className="font-semibold text-brand-700 hover:underline">{t('team2.tg_none')}</Link> : t('team.tg_hint')}
        </p>
      )}

      <div className="mt-8"><AiLink /></div>

      <Modal open={adding} onClose={() => setAdding(false)} title={t('team.add')} sub={t('team.add_hint')} icon={<UserPlus className="h-5 w-5" />}>
        <div className="space-y-4">
          <label className="block"><span className="label">{t('auth.name')}</span><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="label">{t('auth.email')}</span><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <Button className="w-full" onClick={add} loading={busy} disabled={!form.email.includes('@')}><UserPlus className="h-4 w-4" />{t('team.add')}</Button>
        </div>
      </Modal>
      {cred && <CredentialsModal {...cred} onClose={() => setCred(null)} />}
    </>
  )
}
