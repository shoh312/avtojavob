import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clapperboard, Image as ImageIcon, Upload, Copy, Download, Film, GalleryHorizontalEnd, Lightbulb, Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { LANGS, useI18n, useTimeAgo, type Lang, type TKey } from '../i18n'
import { Button, Empty, PageHeader, useToast } from '../components/ui'
import { Onboarding } from './Home'
import { uploadImage } from './Products'
import { BGS, DECORS, DEFAULT_STYLE, FONTS, LAYOUTS, PALETTES, H, W, drawSlide, layoutOf, loadFonts, loadImage, type Slide, type Style } from './carousel'

type Kind = 'hooks' | 'reels' | 'carousel'
type Goal = 'sell' | 'engage' | 'expert' | 'story'
type Hook = { text: string; type: string; why: string }
type Scene = { time: string; visual: string; voice: string; text: string }
type Data = {
  title: string
  hooks?: (Hook | string)[]
  duration?: string; scenes?: Scene[]; cta?: string; tips?: string[]
  slides?: Slide[]; style?: Style
  caption?: string; hashtags?: string[]
}
type Draft = { id: number; kind: Kind; topic: string; title: string; created_at: string; data: Data; params: { goal?: Goal; lang?: Lang; slides?: number; seconds?: number; product_id?: number | null } }
type ListResp = { items: Draft[]; used_today: number; daily_limit: number; ai_available: boolean }

const KINDS: { k: Kind; icon: typeof Film; label: TKey; desc: TKey }[] = [
  { k: 'hooks', icon: Lightbulb, label: 'cnt.k.hooks', desc: 'cnt.k.hooks_d' },
  { k: 'reels', icon: Clapperboard, label: 'cnt.k.reels', desc: 'cnt.k.reels_d' },
  { k: 'carousel', icon: GalleryHorizontalEnd, label: 'cnt.k.carousel', desc: 'cnt.k.carousel_d' },
]
const GOALS: Goal[] = ['sell', 'engage', 'expert', 'story']

// ---------------------------------------------------------------- nusxalash

function useCopy() {
  const toast = useToast()
  const { t } = useI18n()
  return (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast(t('cnt.copied'))).catch(() => {})
  }
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const copy = useCopy()
  const [done, setDone] = useState(false)
  return (
    <button type="button" onClick={() => { copy(text); setDone(true); setTimeout(() => setDone(false), 1200) }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-ink-3 hover:bg-soft hover:text-ink">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{label}
    </button>
  )
}

const hookText = (h: Hook | string) => (typeof h === 'string' ? h : h.text)

function captionBlock(d: Data) {
  return [d.caption || '', (d.hashtags || []).join(' ')].filter(Boolean).join('\n\n')
}

function Caption({ d }: { d: Data }) {
  const { t } = useI18n()
  if (!d.caption && !d.hashtags?.length) return null
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-bold">{t('cnt.caption')}</div>
        <CopyBtn text={captionBlock(d)} label={t('cnt.copy')} />
      </div>
      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{d.caption}</p>
      {!!d.hashtags?.length && <p className="mt-2 text-[12.5px] leading-relaxed text-sky-700">{d.hashtags.join(' ')}</p>}
    </section>
  )
}

// ---------------------------------------------------------------- hook'lar

function HooksView({ d, onScript }: { d: Data; onScript: (hook: string) => void }) {
  const { t } = useI18n()
  const hooks = (d.hooks || []).map(h => (typeof h === 'string' ? { text: h, type: '', why: '' } : h))
  return (
    <div className="space-y-2.5">
      <div className="flex justify-end"><CopyBtn text={hooks.map((h, i) => `${i + 1}. ${h.text}`).join('\n')} label={t('cnt.copy_all')} /></div>
      {hooks.map((h, i) => (
        <div key={i} className="card flex items-start gap-3 p-4">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-700">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-snug">{h.text}</div>
            {(h.type || h.why) && <div className="mt-1 text-[12.5px] text-ink-3">{h.type && <span className="chip mr-1.5 bg-violet-50 py-0.5 text-[11px] text-violet-700">{h.type}</span>}{h.why}</div>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <CopyBtn text={h.text} />
            <button onClick={() => onScript(h.text)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-brand-600 hover:bg-brand-50">
              <Clapperboard className="h-3.5 w-3.5" />{t('cnt.to_script')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- reels ssenariysi

function reelsText(d: Data, hook: string, t: (k: TKey) => string) {
  const lines = [`${d.title}${d.duration ? ` (${d.duration})` : ''}`, '', `HOOK: ${hook}`, '']
  for (const s of d.scenes || []) {
    lines.push(`[${s.time}]`, `${t('cnt.visual')}: ${s.visual}`, `${t('cnt.voice')}: ${s.voice}`)
    if (s.text) lines.push(`${t('cnt.onscreen')}: ${s.text}`)
    lines.push('')
  }
  if (d.cta) lines.push(`CTA: ${d.cta}`, '')
  lines.push(captionBlock(d))
  return lines.join('\n')
}

function ReelsView({ d }: { d: Data }) {
  const { t } = useI18n()
  const hooks = (d.hooks || []).map(hookText)
  const [pick, setPick] = useState(0)
  useEffect(() => setPick(0), [d])
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-bold">{t('cnt.pick_hook')}</div>
          <CopyBtn text={reelsText(d, hooks[pick] || '', t)} label={t('cnt.copy_all')} />
        </div>
        <div className="space-y-1.5">
          {hooks.map((h, i) => (
            <button key={i} onClick={() => setPick(i)}
              className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[14px] font-semibold leading-snug transition ${pick === i ? 'border-brand-300 bg-brand-50 text-ink' : 'border-line text-ink-2 hover:bg-soft'}`}>
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${pick === i ? 'border-brand-600 bg-brand-600' : 'border-ink-4'}`}>{pick === i && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
              {h}
            </button>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="text-[13px] font-bold">{t('cnt.scenes')}</div>
          {d.duration && <span className="chip">{d.duration}</span>}
        </div>
        <ol className="divide-y divide-line">
          {(d.scenes || []).map((s, i) => (
            <li key={i} className="grid gap-2 px-4 py-3 sm:grid-cols-[72px_1fr]">
              <div className="text-[12px] font-bold tabular-nums text-brand-600">{s.time || `#${i + 1}`}</div>
              <div className="space-y-1.5 text-[13.5px] leading-snug">
                {i === 0 && hooks[pick] && <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-900">🎣 {hooks[pick]}</div>}
                <div><span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-4">{t('cnt.visual')}</span>{s.visual}</div>
                <div><span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-4">{t('cnt.voice')}</span>«{s.voice}»</div>
                {s.text && <div><span className="mr-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-4">{t('cnt.onscreen')}</span><span className="rounded bg-ink px-1.5 py-0.5 text-[12.5px] font-semibold text-white">{s.text}</span></div>}
              </div>
            </li>
          ))}
        </ol>
        {d.cta && <div className="border-t border-line bg-brand-50/60 px-4 py-3 text-[13.5px]"><b className="mr-1.5 text-brand-700">CTA</b>{d.cta}</div>}
      </section>

      {!!d.tips?.length && (
        <section className="card p-4">
          <div className="mb-1.5 text-[13px] font-bold">{t('cnt.tips')}</div>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">{d.tips.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      <Caption d={d} />
    </div>
  )
}

// ---------------------------------------------------------------- karusel (canvas → PNG, dizaynni AI tanlaydi)

function SlideCanvas({ s, i, total, style, handle, photo, register }: { s: Slide; i: number; total: number; style: Style; handle: string; photo: string; register: (i: number, el: HTMLCanvasElement | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let live = true
    const sample = [s.title, s.body, ...(s.items || []), s.big || ''].join(' ')
    const img = layoutOf(s, i, total) === 'photo' && photo ? loadImage(photo) : Promise.resolve(null)
    const bgImg = style.bg === 'photo' && style.bg_image ? loadImage(style.bg_image) : Promise.resolve(null)
    drawSlide(el, s, i, total, style, handle, null)
    Promise.all([loadFonts(style, sample), img, bgImg]).then(([, im, bi]) => { if (live) drawSlide(el, s, i, total, style, handle, im, bi) })
    return () => { live = false }
  }, [s, i, total, style, handle, photo])
  useEffect(() => { register(i, ref.current); return () => register(i, null) }, [i, register])
  return <canvas ref={ref} width={W} height={H} className="aspect-[4/5] w-full rounded-xl shadow-card" />
}

function download(cv: HTMLCanvasElement, name: string) {
  cv.toBlob(b => {
    if (!b) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }, 'image/png')
}

function CarouselView({ draft, photo, onSaved }: { draft: Draft; photo: string; onSaved: (d: Draft) => void }) {
  const { t } = useI18n()
  const { account } = useAuth()
  const toast = useToast()
  const initStyle = (): Style => ({ ...DEFAULT_STYLE, ...(draft.data.style || {}) })
  const [slides, setSlides] = useState<Slide[]>(draft.data.slides || [])
  const [style, setStyle] = useState<Style>(initStyle)
  const [saving, setSaving] = useState(false)
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])
  const register = useCallback((i: number, el: HTMLCanvasElement | null) => { canvases.current[i] = el }, [])
  useEffect(() => { setSlides(draft.data.slides || []); setStyle(initStyle()) }, [draft])  // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify({ slides, style }) !== JSON.stringify({ slides: draft.data.slides || [], style: initStyle() })
  const edit = (i: number, patch: Partial<Slide>) => setSlides(xs => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const save = async () => {
    setSaving(true)
    try { onSaved(await api.put<Draft>(`/api/content/${draft.id}`, { data: { ...draft.data, slides, style } })); toast(t('common.saved')) }
    catch { toast(t('common.error')) } finally { setSaving(false) }
  }
  const all = async () => {
    for (let i = 0; i < slides.length; i++) {
      const cv = canvases.current[i]
      if (cv) download(cv, `carousel-${draft.id}-${i + 1}.png`)
      await new Promise(r => setTimeout(r, 350))
    }
  }
  const [uploading, setUploading] = useState(false)
  const upload = async (file: File) => {
    setUploading(true)
    try { const r = await uploadImage(file); setStyle(s => ({ ...s, bg: 'photo', bg_image: r.image_url })) }
    catch (e) { toast(e instanceof ApiError && e.code === 'image_too_large' ? t('err.image_too_large') : t('common.error'), 'error') }
    finally { setUploading(false) }
  }
  const chip = (on: boolean) => `rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-line hover:bg-soft'}`
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(PALETTES).map(([k, p]) => (
            <button key={k} onClick={() => setStyle(s => ({ ...s, palette: k }))} title={k}
              className={`h-8 w-8 rounded-full border-2 ${style.palette === k ? 'border-ink' : 'border-line'}`}
              style={{ background: `linear-gradient(135deg, ${p.bg[0]} 55%, ${p.accent} 55%)` }} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(FONTS).map(([k, f]) => <button key={k} onClick={() => setStyle(s => ({ ...s, font: k }))} className={chip(style.font === k)} style={{ fontFamily: f.head }}>{f.label}</button>)}
          <span className="mx-1 h-5 w-px bg-line" />
          {DECORS.map(k => <button key={k} onClick={() => setStyle(s => ({ ...s, decor: k }))} className={chip(style.decor === k)}>{k}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-semibold text-ink-3">{t('cnt.bg')}</span>
          {BGS.map(k => <button key={k} onClick={() => setStyle(s => ({ ...s, bg: k }))} className={chip((style.bg || 'gradient') === k)}>{t(`cnt.bg_${k}` as TKey)}</button>)}
          {photo && <button onClick={() => setStyle(s => ({ ...s, bg: 'photo', bg_image: photo }))} className={chip(style.bg === 'photo' && style.bg_image === photo)}><ImageIcon className="mr-1 inline h-3.5 w-3.5" />{t('cnt.bg_product')}</button>}
          {style.bg === 'photo' && style.bg_image && style.bg_image !== photo && <span className={chip(true)}><ImageIcon className="mr-1 inline h-3.5 w-3.5" />{t('cnt.bg_photo')}</span>}
          <label className={`${chip(false)} cursor-pointer`}>
            {uploading ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 inline h-3.5 w-3.5" />}{t('cnt.bg_upload')}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
          </label>
          <div className="ml-auto flex gap-2">
            {dirty && <Button size="sm" variant="secondary" loading={saving} onClick={save}>{t('common.save')}</Button>}
            <Button size="sm" onClick={all}><Download className="h-4 w-4" />{t('cnt.download_all')}</Button>
          </div>
        </div>
      </div>
      <p className="text-[12px] text-ink-4">{t('cnt.edit_hint')}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {slides.map((s, i) => {
          const lay = layoutOf(s, i, slides.length)
          return (
            <div key={i} className="space-y-2">
              <SlideCanvas s={s} i={i} total={slides.length} style={style} handle={account?.username || ''} photo={photo} register={register} />
              <select className="input py-1.5 text-[12.5px]" value={lay} onChange={e => edit(i, { layout: e.target.value })}>
                {LAYOUTS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <input className="input text-[13px] font-semibold" value={s.title} maxLength={120} onChange={e => edit(i, { title: e.target.value })} />
              {(lay === 'number' || lay === 'cta') && <input className="input text-[13px]" value={s.big || ''} maxLength={16} placeholder="87% / СТАРТ" onChange={e => edit(i, { big: e.target.value })} />}
              {['list', 'steps', 'compare'].includes(lay)
                ? <textarea className="input resize-y text-[12.5px]" rows={4} value={(s.items || []).join('\n')} onChange={e => edit(i, { items: e.target.value.split('\n').slice(0, 6) })} />
                : <textarea className="input resize-y text-[12.5px]" rows={2} value={s.body} maxLength={400} onChange={e => edit(i, { body: e.target.value })} />}
              <button onClick={() => { const cv = canvases.current[i]; if (cv) download(cv, `carousel-${draft.id}-${i + 1}.png`) }}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-3 hover:text-ink"><Download className="h-3.5 w-3.5" />PNG</button>
            </div>
          )
        })}
      </div>
      <Caption d={draft.data} />
    </div>
  )
}

// ---------------------------------------------------------------- sahifa

export default function Content() {
  const { t, lang } = useI18n()
  const { account } = useAuth()
  const toast = useToast()
  const timeAgo = useTimeAgo()
  const [kind, setKind] = useState<Kind>('reels')
  const [topic, setTopic] = useState('')
  const [goal, setGoal] = useState<Goal>('sell')
  const [clang, setClang] = useState<Lang>(lang)
  const [slides, setSlides] = useState(7)
  const [seconds, setSeconds] = useState(30)
  const [productId, setProductId] = useState(0)
  const [products, setProducts] = useState<{ id: number; name: string; image_url?: string | null }[]>([])
  const [list, setList] = useState<ListResp | null>(null)
  const [cur, setCur] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (!account) return
    api.get<ListResp>(`/api/content?account_id=${account.id}`).then(setList).catch(() => setList({ items: [], used_today: 0, daily_limit: 0, ai_available: false }))
  }, [account])
  useEffect(load, [load])
  useEffect(() => {
    if (!account) return
    api.get<{ items: { id: number; name: string; active: boolean; image_url?: string | null }[] }>(`/api/products?account_id=${account.id}`)
      .then(r => setProducts(r.items.filter(p => p.active))).catch(() => setProducts([]))
  }, [account])
  if (!account) return <Onboarding />

  const generate = async (over?: { kind?: Kind; topic?: string }) => {
    const k = over?.kind ?? kind, tp = (over?.topic ?? topic).trim()
    if (!tp && !productId) { toast(t('cnt.need_topic')); return }
    setBusy(true)
    try {
      const d = await api.post<Draft>('/api/content/generate', { account_id: account.id, kind: k, topic: tp, goal, lang: clang, slides, seconds, product_id: productId || null })
      setCur(d)
      load()
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      const detail = e instanceof ApiError && e.detail ? `: ${e.detail}` : ''
      toast(code === 'daily_limit' ? t('cnt.limit') : code === 'ai_unavailable' ? t('int.ai.unavailable')
        : code === 'ai_failed' ? `${t('cnt.failed')}${detail}` : `${t('common.error')} (${code || 'network'})`)
    } finally { setBusy(false) }
  }
  const remove = async (d: Draft) => {
    if (!confirm(`${d.title}\n${t('common.confirm_delete')}`)) return
    await api.del(`/api/content/${d.id}`).catch(() => {})
    if (cur?.id === d.id) setCur(null)
    load()
  }
  const toScript = (hook: string) => {
    setKind('reels'); setTopic(hook)
    generate({ kind: 'reels', topic: hook })
  }
  const examples: TKey[] = ['cnt.ex1', 'cnt.ex2', 'cnt.ex3']
  const KIcon = (k: Kind) => KINDS.find(x => x.k === k)!.icon

  return (
    <>
      <PageHeader title={t('cnt.title')} sub={t('cnt.sub')} />
      {list && !list.ai_available && <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">{t('int.ai.unavailable')}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {/* nima yaratamiz */}
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map(({ k, icon: Icon, label, desc }) => (
              <button key={k} onClick={() => setKind(k)}
                className={`rounded-2xl border p-3 text-left transition sm:p-4 ${kind === k ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200' : 'border-line bg-white hover:bg-soft'}`}>
                <Icon className={`mb-1.5 h-5 w-5 ${kind === k ? 'text-brand-600' : 'text-ink-3'}`} />
                <div className="text-[13.5px] font-bold">{t(label)}</div>
                <div className="hidden text-[12px] leading-snug text-ink-3 sm:block">{t(desc)}</div>
              </button>
            ))}
          </div>

          <div className="card space-y-4 p-4 sm:p-5">
            <div>
              <label className="mb-1.5 block text-[13px] font-bold">{t('cnt.topic')}</label>
              <textarea className="input resize-y text-[14px]" rows={3} maxLength={1500} value={topic} onChange={e => setTopic(e.target.value)} placeholder={t('cnt.topic_ph')} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {examples.map(k => <button key={k} onClick={() => setTopic(t(k))} className="rounded-full bg-soft px-2.5 py-1 text-[12px] text-ink-2 hover:bg-[#e9e9ee]">{t(k)}</button>)}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-bold">{t('cnt.goal')}</div>
              <div className="flex flex-wrap gap-1.5">
                {GOALS.map(g => (
                  <button key={g} onClick={() => setGoal(g)}
                    className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold ${goal === g ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-line hover:bg-soft'}`}>{t(`cnt.g.${g}` as TKey)}</button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="mb-1.5 text-[13px] font-bold">{t('cnt.product')}</div>
                <select className="input text-[13px]" value={productId} onChange={e => setProductId(Number(e.target.value))}>
                  <option value={0}>{t('cnt.product_none')}</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1.5 text-[13px] font-bold">{t('cnt.lang')}</div>
                <select className="input text-[13px]" value={clang} onChange={e => setClang(e.target.value as Lang)}>
                  {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              {kind === 'carousel' && (
                <div>
                  <div className="mb-1.5 text-[13px] font-bold">{t('cnt.slides')}</div>
                  <div className="flex gap-1.5">{[5, 7, 10].map(n => <button key={n} onClick={() => setSlides(n)} className={`flex-1 rounded-lg border py-2 text-[13px] font-semibold ${slides === n ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-line hover:bg-soft'}`}>{n}</button>)}</div>
                </div>
              )}
              {kind === 'reels' && (
                <div>
                  <div className="mb-1.5 text-[13px] font-bold">{t('cnt.duration')}</div>
                  <div className="flex gap-1.5">{[15, 30, 60].map(n => <button key={n} onClick={() => setSeconds(n)} className={`flex-1 rounded-lg border py-2 text-[13px] font-semibold ${seconds === n ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-line hover:bg-soft'}`}>{n} s</button>)}</div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-[12px] text-ink-4">{list ? t('cnt.used', { n: list.used_today, max: list.daily_limit }) : ''}</span>
              <Button size="lg" loading={busy} disabled={list ? !list.ai_available : false} onClick={() => generate()}>
                {!busy && <Wand2 className="h-4 w-4" />}{busy ? t('cnt.writing') : t('cnt.generate')}
              </Button>
            </div>
          </div>

          {/* natija */}
          <div ref={resultRef} className="scroll-mt-4">
            {busy && !cur && <div className="card flex items-center justify-center gap-2 p-10 text-[13px] text-ink-3"><Loader2 className="h-4 w-4 animate-spin" />{t('cnt.writing')}</div>}
            {cur && (
              <div className={busy ? 'pointer-events-none opacity-50' : ''}>
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-600" />
                  <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold">{cur.title}</h2>
                </div>
                {cur.kind === 'hooks' && <HooksView d={cur.data} onScript={toScript} />}
                {cur.kind === 'reels' && <ReelsView d={cur.data} />}
                {cur.kind === 'carousel' && <CarouselView draft={cur} photo={products.find(p => p.id === cur.params.product_id)?.image_url || ''} onSaved={d => { setCur(d); load() }} />}
              </div>
            )}
          </div>
        </div>

        {/* tarix */}
        <aside className="min-w-0">
          <div className="card p-3 lg:sticky lg:top-4">
            <div className="mb-2 px-1 text-[13px] font-bold">{t('cnt.history')}</div>
            {!list ? <div className="p-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-ink-4" /></div>
              : !list.items.length ? <Empty icon={<Sparkles className="h-6 w-6" />} title={t('cnt.history_empty')} />
              : (
                <ul className="scrollbar-thin max-h-[70vh] space-y-1 overflow-y-auto">
                  {list.items.map(d => {
                    const Icon = KIcon(d.kind)
                    return (
                      <li key={d.id} className={`group flex items-center gap-2 rounded-xl px-2 py-2 ${cur?.id === d.id ? 'bg-brand-50' : 'hover:bg-soft'}`}>
                        <button onClick={() => { setCur(d); setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 50) }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <Icon className="h-4 w-4 shrink-0 text-ink-3" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold">{d.title}</span>
                            <span className="block text-[11px] text-ink-4">{t(`cnt.k.${d.kind}` as TKey)} · {timeAgo(d.created_at)}</span>
                          </span>
                        </button>
                        <button onClick={() => remove(d)} title={t('common.delete')} className="rounded-lg p-1 text-ink-4 hover:text-brand-600 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                      </li>
                    )
                  })}
                </ul>
              )}
          </div>
        </aside>
      </div>
    </>
  )
}
