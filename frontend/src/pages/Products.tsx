import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { ExternalLink, ImagePlus, Loader2, Package, Plus, ShoppingBag, Sparkles, Trash2 } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n, type TKey } from '../i18n'
import { Button, Empty, Modal, PageHeader, Spinner, Toggle, useToast } from '../components/ui'
import { Onboarding } from './Home'

export type Product = { id: number; name: string; price: string; description: string; image: string; image_url: string | null; url: string; active: boolean; sort: number }

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
    <Modal open onClose={onClose} wide title={product ? product.name : t('prod.new')}>
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
          <ProductCard p={f} />
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={save} loading={busy} disabled={!f.name.trim()}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function Products() {
  const { t } = useI18n()
  const { account } = useAuth()
  const [items, setItems] = useState<Product[] | null>(null)
  const [edit, setEdit] = useState<Product | null | 'new'>(null)

  const load = useCallback(() => {
    if (!account) return
    api.get<{ items: Product[] }>(`/api/products?account_id=${account.id}`).then(r => setItems(r.items)).catch(() => setItems([]))
  }, [account])
  useEffect(load, [load])
  if (!account) return <Onboarding />

  const remove = async (p: Product) => {
    if (!confirm(`${p.name}\n${t('common.confirm_delete')}`)) return
    await api.del(`/api/products/${p.id}`)
    load()
  }

  return (
    <>
      <PageHeader title={t('prod.title')} sub={t('prod.sub')} action={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('prod.new')}</Button>} />
      <div className="mb-6 flex gap-3 rounded-2xl bg-[#fbeee8] px-4 py-3 text-[13.5px] leading-snug text-[#7a3a22]">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />{t('prod.ai_hint')}
      </div>
      {items === null ? <Spinner /> : items.length === 0 ? (
        <Empty icon={<ShoppingBag className="h-6 w-6" />} title={t('prod.empty_t')} text={t('prod.empty_d')}
          action={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('prod.new')}</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(p => (
            <div key={p.id} className={`group card overflow-hidden transition hover:shadow-pop ${p.active ? '' : 'opacity-60'}`}>
              <button onClick={() => setEdit(p)} className="block w-full text-left">
                <div className="aspect-[1.91/1] bg-soft">
                  {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-ink-4"><Package className="h-8 w-8" /></div>}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-bold">{p.name}</span>
                    {p.price && <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[13px] font-bold text-emerald-700">{p.price}</span>}
                  </div>
                  {p.description && <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-3">{p.description}</p>}
                </div>
              </button>
              <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-[12.5px]">
                {p.url && <a href={p.url} target="_blank" rel="noopener" className="flex items-center gap-1 truncate text-ink-3 hover:text-ink"><ExternalLink className="h-3.5 w-3.5" />{p.url.replace(/^https?:\/\//, '')}</a>}
                <button onClick={() => remove(p)} className="ml-auto rounded-lg p-1.5 text-ink-4 hover:bg-brand-50 hover:text-brand-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit !== null && <ProductModal product={edit === 'new' ? null : edit} accountId={account.id} onClose={() => setEdit(null)} onSaved={load} />}
    </>
  )
}
