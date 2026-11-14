import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Copy, EyeOff, GripVertical, ImagePlus, LayoutGrid, List, Loader2, Package, Pencil, Plus, Search, Send, ShoppingBag, ShoppingCart, Sparkles, Trash2 } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Button, Modal, PageHeader, Spinner, Toggle, useToast } from '../components/ui'
import { Onboarding } from './Home'

export type Product = { id: number; name: string; price: string; description: string; image: string; image_url: string | null; url: string; active: boolean; sort: number; shown_30d?: number; orders_30d?: number }

export async function uploadImage(file: File): Promise<{ image: string; image_url: string }> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/uploads', { method: 'POST', body: fd, headers: { 'X-ChatFlow': '1' }, credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data?.error || 'error', res.status)
  return data
}

/** Instagram'dagi mahsulot kartochkasining ko'rinishi */
export function ProductCard({ p, compact }: { p: Pick<Product, 'name' | 'price' | 'description' | 'image_url' | 'url'>; compact?: boolean }) {
  const { t } = useI18n()
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-white ${compact ? 'w-[210px] shrink-0' : ''}`}>
      <div className="aspect-[1.91/1] bg-soft">
        {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" />
          : <div className="grid h-full place-items-center text-ink-4"><Package className="h-8 w-8" /></div>}
      </div>
      <div className="px-3 py-2.5">
        <div className="truncate text-[13.5px] font-semibold">{p.name || '…'}</div>
        <div className="truncate text-[12px] text-ink-3">{[p.price, p.description].filter(Boolean).join(' · ') || ' '}</div>
      </div>
      <div className="border-t border-line py-2 text-center text-[12.5px] font-semibold text-sky-700">{t('prod.order_btn')}</div>
      {p.url && <div className="border-t border-line py-2 text-center text-[12.5px] font-semibold text-sky-700">{t('prod.more_btn')}</div>}
    </div>
  )
}

function ProductModal({ product, accountId, onClose, onSaved }: { product: Product | null; accountId: number; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [f, setF] = useState({
    name: product?.name ?? '', price: product?.price ?? '', description: product?.description ?? '',
    image: product?.image ?? '', image_url: product?.image_url ?? null as string | null, url: product?.url ?? '', active: product?.active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const upload = async (file?: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadImage(file)
      setF(x => ({ ...x, image: r.image, image_url: r.image_url }))
    } catch (e) {
      toast(e instanceof ApiError && ['bad_image', 'image_too_large'].includes(e.code) ? t(`err.${e.code}` as TKey) : t('common.error'), 'error')
    } finally { setUploading(false) }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]) }
  const save = async () => {
    setBusy(true)
    const body = { name: f.name, price: f.price, description: f.description, image: f.image, url: f.url, active: f.active }
    try {
      if (product) await api.put(`/api/products/${product.id}`, body)
      else await api.post('/api/products', { account_id: accountId, ...body })
      onSaved()
      onClose()
    } catch (e) {
      toast(e instanceof ApiError && ['product_name', 'button_url'].includes(e.code) ? t((e.code === 'button_url' ? 've.button_url' : 'err.product_name') as TKey) : t('common.error'), 'error')
    } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} wide title={product ? product.name : t('prod.new')} sub={t('prod2.modal_sub')} icon={<ShoppingBag className="h-5 w-5" />}>
      <div className="grid gap-6 md:grid-cols-[1fr_230px]">
        <div className="space-y-4">
          <div onDragOver={e => e.preventDefault()} onDrop={onDrop} onClick={() => input.current?.click()}
            className="relative grid aspect-[1.91/1] cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-soft hover:border-brand-300">
            {f.image_url ? <img src={f.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              : <div className="text-center text-[13px] text-ink-3"><ImagePlus className="mx-auto mb-2 h-7 w-7" />{t('prod.photo_hint')}</div>}
            {uploading && <div className="absolute inset-0 grid place-items-center bg-white/70"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => upload(e.target.files?.[0])} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <label className="block"><span className="label">{t('prod.name')}</span>
              <input className="input" maxLength={80} value={f.name} placeholder="Cyberlab" onChange={e => setF({ ...f, name: e.target.value })} /></label>
            <label className="block"><span className="label">{t('prod.price')}</span>
              <input className="input" maxLength={60} value={f.price} placeholder="100$" onChange={e => setF({ ...f, price: e.target.value })} /></label>
          </div>
          <label className="block"><span className="label">{t('prod.description')}</span>
            <textarea rows={4} className="input resize-y" maxLength={1000} value={f.description} placeholder={t('prod.description_ph')} onChange={e => setF({ ...f, description: e.target.value })} />
            <p className="hint">{t('prod.description_hint')}</p></label>
          <label className="block"><span className="label">{t('prod.url')}</span>
            <input className="input font-mono text-[13px]" value={f.url} placeholder="https://" onChange={e => setF({ ...f, url: e.target.value })} /></label>
          <label className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-[14px] font-medium">
            {t('prod.active')}<Toggle checked={f.active} onChange={v => setF({ ...f, active: v })} /></label>
        </div>
        <div>
          <div className="label">{t('prod.preview')}</div>
          <div className="rounded-2xl bg-gradient-to-b from-[#f4f4f6] to-[#ececf0] p-3">
            <div className="mb-2 w-fit max-w-[90%] rounded-[16px] rounded-bl-md bg-white px-3 py-1.5 text-[12px] text-ink-2 shadow-card">{t('prod2.preview_msg')}</div>
            <ProductCard p={f} />
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={save} loading={busy} disabled={!f.name.trim()}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ icon, value, label, accent }: { icon: ReactNode; value: ReactNode; label: string; accent?: string }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-4">
      <span className={`grid h-8 w-8 place-items-center rounded-xl ${accent || 'bg-soft text-ink-3'}`}>{icon}</span>
      <div className="mt-3 text-[24px] font-extrabold tabular-nums tracking-tight">{value}</div>
      <div className="text-[12.5px] text-ink-3">{label}</div>
    </div>
  )
}

type Filter = 'all' | 'active' | 'hidden'

export default function Products() {
  const { t } = useI18n()
  const toast = useToast()
  const { account } = useAuth()
  const [items, setItems] = useState<Product[] | null>(null)
  const [edit, setEdit] = useState<Product | null | 'new'>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<'grid' | 'list'>(() => { try { return localStorage.getItem('cf.pview') === 'list' ? 'list' : 'grid' } catch { return 'grid' } })
  const [ai, setAi] = useState<boolean | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: Product[] }>(`/api/products?account_id=${account.id}`).then(r => setItems(r.items)).catch(() => setItems([]))
    api.get<{ ai_enabled: boolean }>(`/api/accounts/${account.id}/integrations`).then(r => setAi(r.ai_enabled)).catch(() => {})
  }, [account])
  useEffect(load, [load])
  if (!account) return <Onboarding />

  const setViewSaved = (v: 'grid' | 'list') => { setView(v); try { localStorage.setItem('cf.pview', v) } catch { /* */ } }
  const remove = async (p: Product) => {
    if (!confirm(`${p.name}\n${t('common.confirm_delete')}`)) return
    await api.del(`/api/products/${p.id}`)
    load()
  }
  const toggle = async (p: Product) => {
    setItems(xs => xs && xs.map(x => (x.id === p.id ? { ...x, active: !x.active } : x)))
    await api.put(`/api/products/${p.id}`, { active: !p.active }).catch(() => load())
  }
  const duplicate = async (p: Product) => {
    await api.post('/api/products', { account_id: account.id, name: `${p.name} (2)`.slice(0, 80), price: p.price, description: p.description, image: p.image, url: p.url, active: false })
    toast(t('prod2.duplicated'))
    load()
  }
  const canDrag = !q && filter === 'all'
  const onDragOver = (id: number) => {
    if (drag === null || drag === id || !items) return
    const from = items.findIndex(x => x.id === drag), to = items.findIndex(x => x.id === id)
    const next = [...items]
    next.splice(to, 0, next.splice(from, 1)[0])
    setItems(next)
  }
  const onDragEnd = async () => {
    setDrag(null)
    if (items) await api.post('/api/products/reorder', { account_id: account.id, ids: items.map(x => x.id) }).catch(() => {})
  }

  const all = items || []
  const shown = all.filter(p => (filter === 'all' || (filter === 'active' ? p.active : !p.active))
    && (!q || `${p.name} ${p.description} ${p.price}`.toLowerCase().includes(q.toLowerCase())))
  const sumShown = all.reduce((a, p) => a + (p.shown_30d || 0), 0)
  const sumOrders = all.reduce((a, p) => a + (p.orders_30d || 0), 0)

  const actions = (p: Product) => (
    <>
      <button title={t('common.edit')} onClick={() => setEdit(p)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-soft hover:text-ink"><Pencil className="h-4 w-4" /></button>
      <button title={t('common.duplicate')} onClick={() => duplicate(p)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-soft hover:text-ink"><Copy className="h-4 w-4" /></button>
      <button title={t('common.delete')} onClick={() => remove(p)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-brand-50 hover:text-brand-600"><Trash2 className="h-4 w-4" /></button>
    </>
  )
  const statsLine = (p: Product) => (
    <div className="flex items-center gap-3 text-[11.5px] text-ink-3">
      <span className="inline-flex items-center gap-1" title={t('prod2.shown')}><Send className="h-3 w-3" />{p.shown_30d || 0}</span>
      <span className="inline-flex items-center gap-1" title={t('prod2.orders')}><ShoppingCart className="h-3 w-3" />{p.orders_30d || 0}</span>
      {!!p.shown_30d && <span className="font-semibold text-emerald-600">{Math.round(((p.orders_30d || 0) / p.shown_30d) * 100)}%</span>}
    </div>
  )

  return (
    <>
      <PageHeader title={t('prod.title')} sub={t('prod.sub')} action={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('prod.new')}</Button>} />

      {/* ko'rsatkichlar + AI holati */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1fr_1.5fr]">
        <Stat icon={<Package className="h-4 w-4" />} value={<>{all.filter(p => p.active).length}<span className="ml-1 text-[14px] font-medium text-ink-4">/ {all.length}</span></>} label={t('prod2.active')} />
        <Stat icon={<Send className="h-4 w-4" />} value={sumShown} label={t('prod2.shown')} accent="bg-violet-50 text-violet-600" />
        <Stat icon={<ShoppingCart className="h-4 w-4" />} value={sumOrders} label={t('prod2.orders')} accent="bg-emerald-50 text-emerald-600" />
        <Link to="/app/integrations?open=ai" className={`col-span-2 flex items-center gap-3 rounded-3xl p-4 transition hover:brightness-[.98] lg:col-span-1 ${ai ? 'bg-gradient-to-br from-[#1b1b22] to-[#2a1530] text-white' : 'border border-dashed border-line bg-white'}`}>
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${ai ? 'bg-gradient-to-br from-[#6d5dfc] to-[#e5161f]' : 'bg-soft text-ink-3'}`}><Sparkles className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold">{ai ? t('prod2.ai_on') : t('prod2.ai_off')}</span>
            <span className={`block text-[12.5px] leading-snug ${ai ? 'text-white/70' : 'text-ink-3'}`}>{ai ? t('prod2.ai_on_d') : t('prod2.ai_off_d')}</span>
          </span>
          <ArrowRight className={`h-4 w-4 shrink-0 ${ai ? 'text-white/60' : 'text-ink-4'}`} />
        </Link>
      </div>

      {items === null ? <Spinner /> : all.length === 0 ? (
        <button onClick={() => setEdit('new')} className="flex w-full flex-col items-center rounded-3xl border-2 border-dashed border-line px-6 py-16 text-center transition hover:border-brand-300 hover:bg-brand-50/30">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-[0_10px_24px_-10px_rgba(229,22,31,.7)]"><ShoppingBag className="h-6 w-6" /></span>
          <span className="mt-4 text-[17px] font-bold">{t('prod.empty_t')}</span>
          <span className="mt-1 max-w-md text-[13.5px] text-ink-3">{t('prod.empty_d')}</span>
        </button>
      ) : (
        <>
          {/* asboblar paneli */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
              <input className="input h-10 pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder={t('prod2.search')} />
            </div>
            <div className="flex rounded-xl bg-soft p-1">
              {(['all', 'active', 'hidden'] as Filter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${filter === f ? 'bg-white text-ink shadow-card' : 'text-ink-3 hover:text-ink'}`}>
                  {t(`prod2.f_${f}` as TKey)}
                </button>
              ))}
            </div>
            <div className="flex rounded-xl bg-soft p-1 sm:ml-auto">
              {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
                <button key={v} onClick={() => setViewSaved(v)} className={`grid h-8 w-9 place-items-center rounded-lg transition ${view === v ? 'bg-white text-ink shadow-card' : 'text-ink-3 hover:text-ink'}`}><Icon className="h-4 w-4" /></button>
              ))}
            </div>
          </div>
          {canDrag && all.length > 1 && <p className="mb-3 flex items-center gap-1.5 text-[12px] text-ink-4"><GripVertical className="h-3.5 w-3.5" />{t('prod2.drag')}</p>}

          {shown.length === 0 ? <p className="py-12 text-center text-[13.5px] text-ink-4">{t('common.empty')}</p> : view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map(p => (
                <div key={p.id} draggable={canDrag} onDragStart={() => setDrag(p.id)} onDragOver={e => { e.preventDefault(); onDragOver(p.id) }} onDragEnd={onDragEnd}
                  className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-white transition hover:-translate-y-0.5 hover:shadow-card ${drag === p.id ? 'opacity-40' : ''} ${p.active ? 'border-line' : 'border-dashed border-line'} ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                  <button onClick={() => setEdit(p)} className="relative block aspect-[1.91/1] w-full overflow-hidden bg-soft">
                    {p.image_url ? <img src={p.image_url} alt="" className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${p.active ? '' : 'grayscale'}`} />
                      : <div className="grid h-full place-items-center text-ink-4"><Package className="h-8 w-8" /></div>}
                    {p.price && <span className="absolute bottom-2 left-2 rounded-lg bg-white/95 px-2 py-1 text-[13px] font-extrabold text-ink shadow-card backdrop-blur">{p.price}</span>}
                    {!p.active && <span className="absolute left-2 top-2 rounded-lg bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white"><EyeOff className="mr-1 inline h-3 w-3" />{t('prod2.hidden')}</span>}
                  </button>
                  <div className="absolute right-2 top-2 rounded-full bg-white/95 p-1 shadow-card" onClick={e => e.stopPropagation()}><Toggle size="sm" checked={p.active} onChange={() => toggle(p)} /></div>
                  <div className="flex flex-1 flex-col p-4">
                    <button onClick={() => setEdit(p)} className="text-left">
                      <div className="line-clamp-1 text-[15px] font-bold">{p.name}</div>
                      <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[12.5px] leading-snug text-ink-3">{p.description || '—'}</p>
                    </button>
                    <div className="mt-auto flex items-center justify-between border-t border-line pt-3">
                      {statsLine(p)}
                      <div className="flex opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">{actions(p)}</div>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => setEdit('new')} className="group flex min-h-[260px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line text-center transition hover:border-brand-300 hover:bg-brand-50/30">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-soft text-ink-3 transition group-hover:bg-brand-600 group-hover:text-white"><Plus className="h-5 w-5" /></span>
                <span className="mt-3 text-[14px] font-bold">{t('prod.new')}</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
              {shown.map(p => (
                <div key={p.id} draggable={canDrag} onDragStart={() => setDrag(p.id)} onDragOver={e => { e.preventDefault(); onDragOver(p.id) }} onDragEnd={onDragEnd}
                  className={`group flex items-center gap-3 px-4 py-3 transition hover:bg-soft/60 ${drag === p.id ? 'opacity-40' : ''}`}>
                  {canDrag && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-4" />}
                  <button onClick={() => setEdit(p)} className="h-12 w-[92px] shrink-0 overflow-hidden rounded-xl bg-soft">
                    {p.image_url ? <img src={p.image_url} alt="" className={`h-full w-full object-cover ${p.active ? '' : 'grayscale'}`} /> : <div className="grid h-full place-items-center text-ink-4"><Package className="h-5 w-5" /></div>}
                  </button>
                  <button onClick={() => setEdit(p)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[14px] font-bold">{p.name}</div>
                    <div className="truncate text-[12.5px] text-ink-3">{p.description || '—'}</div>
                  </button>
                  <span className="hidden shrink-0 text-[14px] font-extrabold sm:block">{p.price}</span>
                  <div className="hidden w-32 shrink-0 md:block">{statsLine(p)}</div>
                  <Toggle size="sm" checked={p.active} onChange={() => toggle(p)} />
                  <div className="flex shrink-0">{actions(p)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {edit !== null && <ProductModal product={edit === 'new' ? null : edit} accountId={account.id} onClose={() => setEdit(null)} onSaved={load} />}
    </>
  )
}
