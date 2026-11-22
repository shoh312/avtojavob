/** Karusel slaydlarini canvas'da chizish. AI dizaynni tanlaydi (layout, palitra, shrift, bezak) — chizish shu yerda. */

export type Slide = { layout?: string; title: string; body: string; items?: string[]; big?: string; highlight?: string; emoji?: string }
export type Style = { palette: string; font: string; decor: string }

type Pal = { bg: [string, string]; text: string; body: string; accent: string; onAccent: string; muted: string; card: string; mark?: string }
export const PALETTES: Record<string, Pal> = {
  brand: { bg: ['#f8333b', '#b3121a'], text: '#ffffff', body: 'rgba(255,255,255,.9)', accent: '#ffe14d', onAccent: '#1b1b22', muted: 'rgba(255,255,255,.65)', card: 'rgba(255,255,255,.14)' },
  midnight: { bg: ['#14142b', '#2a1540'], text: '#ffffff', body: 'rgba(255,255,255,.82)', accent: '#ff5c93', onAccent: '#ffffff', muted: 'rgba(255,255,255,.5)', card: 'rgba(255,255,255,.08)' },
  cream: { bg: ['#fff8ef', '#ffeede'], text: '#1f1a17', body: '#4a423c', accent: '#e5161f', onAccent: '#ffffff', muted: '#9a8f86', card: 'rgba(31,26,23,.06)' },
  mint: { bg: ['#ecfcf5', '#cdf3e3'], text: '#0f3d2e', body: '#2d5a4a', accent: '#0f9d6c', onAccent: '#ffffff', muted: '#6b9486', card: 'rgba(15,61,46,.07)' },
  ocean: { bg: ['#0b3a75', '#0a2350'], text: '#ffffff', body: 'rgba(255,255,255,.86)', accent: '#ffd23f', onAccent: '#0a2350', muted: 'rgba(255,255,255,.55)', card: 'rgba(255,255,255,.1)' },
  sunset: { bg: ['#ff8a3d', '#ff3d7f'], text: '#ffffff', body: 'rgba(255,255,255,.93)', accent: '#2b0f3a', onAccent: '#ffffff', muted: 'rgba(255,255,255,.72)', card: 'rgba(255,255,255,.2)' },
  mono: { bg: ['#ffffff', '#f0f0f0'], text: '#0b0b0b', body: '#3a3a3a', accent: '#0b0b0b', onAccent: '#ffffff', muted: '#8a8a8a', card: 'rgba(0,0,0,.05)', mark: '#ffe14d' },
  lavender: { bg: ['#f5f0ff', '#e2d6ff'], text: '#2a1a5e', body: '#4b3d7a', accent: '#7c4dff', onAccent: '#ffffff', muted: '#8d82b0', card: 'rgba(124,77,255,.1)' },
}
export const FONTS: Record<string, { label: string; head: string; headW: number; body: string; bodyW: number }> = {
  modern: { label: 'Montserrat', head: 'Montserrat', headW: 800, body: 'Montserrat', bodyW: 500 },
  bold: { label: 'Unbounded', head: 'Unbounded', headW: 700, body: 'Manrope', bodyW: 500 },
  elegant: { label: 'Playfair', head: 'Playfair Display', headW: 700, body: 'Inter', bodyW: 400 },
  playful: { label: 'Rubik', head: 'Rubik', headW: 800, body: 'Rubik', bodyW: 500 },
}
export const DECORS = ['blobs', 'grid', 'lines', 'none'] as const
export const LAYOUTS = ['cover', 'text', 'list', 'steps', 'number', 'quote', 'compare', 'photo', 'cta'] as const
export const DEFAULT_STYLE: Style = { palette: 'brand', font: 'modern', decor: 'blobs' }

export const W = 1080, H = 1350
const PAD = 96, CW = W - PAD * 2, TOP = 190, BOTTOM = H - 190
const FALLBACK = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"

// ---------------------------------------------------------------- shriftlar

let fontsLink = false
export function ensureFontsCss() {
  if (fontsLink || typeof document === 'undefined') return
  fontsLink = true
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;800&family=Unbounded:wght@700&family=Manrope:wght@500;600&family=Playfair+Display:wght@700&family=Rubik:wght@500;600;800&display=swap'
  document.head.appendChild(l)
}

/** Kerakli shrift va harf to'plamini (kirill, lotin) yuklaydi; yuklanmasa ham chizish davom etadi. */
export async function loadFonts(style: Style, sample: string) {
  ensureFontsCss()
  const f = FONTS[style.font] || FONTS.modern
  const text = sample.slice(0, 400) || 'Aa'
  await Promise.all([
    document.fonts.load(`${f.headW} 60px "${f.head}"`, text),
    document.fonts.load(`${f.bodyW} 40px "${f.body}"`, text),
    document.fonts.load(`600 30px "${f.body}"`, text),
  ]).catch(() => {})
}

// ---------------------------------------------------------------- rasm

const images = new Map<string, Promise<HTMLImageElement | null>>()
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!images.has(url)) {
    images.set(url, new Promise(res => {
      const img = new Image()
      img.crossOrigin = 'anonymous'  // boshqa domendagi rasm canvas'ni "bulg'amasin" (PNG yuklab olish ishlashi uchun)
      img.onload = () => res(img)
      img.onerror = () => res(null)
      img.src = url
    }))
  }
  return images.get(url)!
}

// ---------------------------------------------------------------- matn

type Ctx = CanvasRenderingContext2D
type Font = { family: string; weight: number; size: number; lh: number }
const fontStr = (f: Font) => `${f.weight} ${f.size}px "${f.family}", ${FALLBACK}`
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '')

function lines(ctx: Ctx, text: string, f: Font, width: number): string[][] {
  ctx.font = fontStr(f)
  const out: string[][] = []
  for (const para of (text || '').split('\n')) {
    let cur: string[] = []
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = [...cur, word].join(' ')
      if (cur.length && ctx.measureText(test).width > width) { out.push(cur); cur = [word] } else cur.push(word)
    }
    if (cur.length) out.push(cur)
  }
  return out
}

/** Matn maxLines qatorga sig'guncha shriftni kichraytiradi. */
function fit(ctx: Ctx, text: string, family: string, weight: number, size: number, min: number, maxLines: number, width = CW, lh = 1.15) {
  let f: Font = { family, weight, size, lh }
  let ls = lines(ctx, text, f, width)
  while (ls.length > maxLines && f.size > min) {
    f = { ...f, size: f.size - 4 }
    ls = lines(ctx, text, f, width)
  }
  return { f, ls, h: ls.length * f.size * f.lh }
}

type Paint = { color: string; accent?: string; mark?: string; hl?: Set<string>; align?: 'left' | 'center' }
function drawLines(ctx: Ctx, ls: string[][], f: Font, x: number, y: number, p: Paint, width = CW) {
  ctx.font = fontStr(f)
  ctx.textBaseline = 'alphabetic'
  const space = ctx.measureText(' ').width
  ls.forEach((words, i) => {
    const base = y + f.size * (i + 0.82) + (f.size * (f.lh - 1)) * i
    const total = ctx.measureText(words.join(' ')).width
    let cx = p.align === 'center' ? x + (width - total) / 2 : x
    for (const w of words) {
      const ww = ctx.measureText(w).width
      const on = p.hl?.has(norm(w))
      if (on && p.mark) {
        ctx.fillStyle = p.mark
        ctx.fillRect(cx - 6, base - f.size * 0.62, ww + 12, f.size * 0.72)
      }
      ctx.fillStyle = on && !p.mark && p.accent ? p.accent : p.color
      ctx.fillText(w, cx, base)
      cx += ww + space
    }
  })
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------------------------------------------------------------- fon va bezak

function background(ctx: Ctx, pal: Pal, decor: string, i: number) {
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H)
  g.addColorStop(0, pal.bg[0]); g.addColorStop(1, pal.bg[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  if (decor === 'blobs') {
    ctx.fillStyle = pal.accent
    ctx.globalAlpha = 0.13
    const flip = i % 2 === 1
    ctx.beginPath(); ctx.arc(flip ? 90 : W - 90, 150 + (i % 3) * 40, 250, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.09
    ctx.beginPath(); ctx.arc(flip ? W - 60 : 60, H - 170, 190, 0, Math.PI * 2); ctx.fill()
  } else if (decor === 'grid') {
    ctx.fillStyle = pal.muted
    ctx.globalAlpha = 0.28
    for (let x = 36; x < W; x += 54) for (let y = 36; y < H; y += 54) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill() }
  } else if (decor === 'lines') {
    ctx.strokeStyle = pal.accent
    ctx.globalAlpha = 0.14
    ctx.lineWidth = 16
    ctx.beginPath(); ctx.rect(W - 380, 0, 380, 300); ctx.clip()
    for (let k = -300; k < 700; k += 46) { ctx.beginPath(); ctx.moveTo(W - 380 + k, 0); ctx.lineTo(W - 380 + k + 300, 300); ctx.stroke() }
  }
  ctx.restore()
}

function chrome(ctx: Ctx, pal: Pal, body: string, i: number, total: number, handle: string, last: boolean) {
  ctx.fillStyle = pal.muted
  ctx.font = `600 30px "${body}", ${FALLBACK}`
  ctx.textBaseline = 'alphabetic'
  if (handle) ctx.fillText(`@${handle}`, PAD, 112)
  ctx.textAlign = 'right'
  ctx.fillText(`${i + 1}/${total}`, W - PAD, 112)
  ctx.textAlign = 'left'
  // pastda: nuqtalar va "suring" o'qi
  const dot = 12, gap = 12
  for (let k = 0; k < total; k++) {
    ctx.fillStyle = k === i ? pal.text : pal.muted
    ctx.globalAlpha = k === i ? 1 : 0.5
    rrect(ctx, PAD + k * (dot + gap) + (k > i ? 22 : 0), H - 116, k === i ? 34 : dot, dot, dot / 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  if (!last) {
    ctx.fillStyle = pal.text
    ctx.beginPath(); ctx.arc(W - PAD - 36, H - 110, 36, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = pal.bg[1]
    ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const cx = W - PAD - 36, cy = H - 110
    ctx.beginPath(); ctx.moveTo(cx - 13, cy); ctx.lineTo(cx + 13, cy); ctx.moveTo(cx + 3, cy - 11); ctx.lineTo(cx + 14, cy); ctx.lineTo(cx + 3, cy + 11); ctx.stroke()
  }
}

// ---------------------------------------------------------------- slayd turlari
// Har bir tur avval o'lchanadi (draw=false), so'ng vertikal markazga chiziladi.

type Env = { ctx: Ctx; pal: Pal; head: { f: string; w: number }; body: { f: string; w: number }; hl: Set<string>; img: HTMLImageElement | null }
type Block = (e: Env, s: Slide, y: number, draw: boolean) => number

function emojiLine(e: Env, s: Slide, y: number, draw: boolean, size: number, center = false) {
  if (!s.emoji) return 0
  if (draw) {
    e.ctx.font = `${size}px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', ${FALLBACK}`
    e.ctx.textBaseline = 'top'
    e.ctx.textAlign = center ? 'center' : 'left'
    e.ctx.fillText(s.emoji, center ? W / 2 : PAD, y)
    e.ctx.textAlign = 'left'
  }
  return size * 1.25 + 10
}

function title(e: Env, text: string, y: number, draw: boolean, size: number, min: number, maxLines: number, align: 'left' | 'center' = 'left') {
  if (!text) return 0
  const t = fit(e.ctx, text, e.head.f, e.head.w, size, min, maxLines, CW, 1.1)
  if (draw) drawLines(e.ctx, t.ls, t.f, PAD, y, { color: e.pal.text, accent: e.pal.accent, mark: e.pal.mark, hl: e.hl, align })
  return t.h
}

function para(e: Env, text: string, y: number, draw: boolean, size: number, min: number, maxLines: number, align: 'left' | 'center' = 'left', color?: string) {
  if (!text) return 0
  const t = fit(e.ctx, text, e.body.f, e.body.w, size, min, maxLines, CW, 1.38)
  if (draw) drawLines(e.ctx, t.ls, t.f, PAD, y, { color: color || e.pal.body, align })
  return t.h
}

const cover: Block = (e, s, y, d) => {
  let h = emojiLine(e, s, y, d, 120)
  h += title(e, s.title, y + h, d, 116, 60, 6)
  if (s.body) h += 44 + para(e, s.body, y + h + 44, d, 46, 32, 4)
  return h
}

const text: Block = (e, s, y, d) => {
  let h = emojiLine(e, s, y, d, 84)
  if (d) { e.ctx.fillStyle = e.pal.accent; rrect(e.ctx, PAD, y + h, 96, 12, 6); e.ctx.fill() }
  h += 52
  h += title(e, s.title, y + h, d, 84, 48, 4)
  if (s.body) h += 40 + para(e, s.body, y + h + 40, d, 46, 30, 10)
  return h
}

function itemsBlock(e: Env, s: Slide, y: number, d: boolean, kind: 'list' | 'steps') {
  const items = s.items || []
  const size = items.length > 4 ? 38 : 42
  const tx = PAD + 112, tw = CW - 112 - 28
  let h = 0
  items.forEach((it, k) => {
    const t = fit(e.ctx, it, e.body.f, Math.max(e.body.w, 600), size, 28, 3, tw, 1.3)
    const ch = Math.max(t.h + 56, 112)
    if (d) {
      const cy = y + h + (kind === 'steps' ? 56 : ch / 2)
      if (kind === 'list') { e.ctx.fillStyle = e.pal.card; rrect(e.ctx, PAD, y + h, CW, ch, 28); e.ctx.fill() }
      else if (k < items.length - 1) {  // qadamlar orasidagi chiziq: shu doiradan keyingisigacha
        e.ctx.fillStyle = e.pal.muted; e.ctx.globalAlpha = 0.5
        e.ctx.fillRect(PAD + 54, cy + 42, 4, ch + 28 - 84); e.ctx.globalAlpha = 1
      }
      e.ctx.fillStyle = e.pal.accent
      e.ctx.beginPath(); e.ctx.arc(PAD + 56, cy, 34, 0, Math.PI * 2); e.ctx.fill()
      e.ctx.fillStyle = e.pal.onAccent
      e.ctx.font = `800 34px "${e.head.f}", ${FALLBACK}`
      e.ctx.textAlign = 'center'; e.ctx.textBaseline = 'middle'
      e.ctx.fillText(kind === 'steps' ? String(k + 1) : '✓', PAD + 56, cy + 2)
      e.ctx.textAlign = 'left'
      drawLines(e.ctx, t.ls, t.f, tx, y + h + (kind === 'steps' ? 28 : (ch - t.h) / 2), { color: e.pal.text }, tw)
    }
    h += ch + (kind === 'list' ? 20 : 28)
  })
  return h
}

const listB: Block = (e, s, y, d) => {
  let h = emojiLine(e, s, y, d, 72)
  h += title(e, s.title, y + h, d, 76, 46, 3)
  return h + 48 + itemsBlock(e, s, y + h + 48, d, 'list')
}
const stepsB: Block = (e, s, y, d) => {
  let h = emojiLine(e, s, y, d, 72)
  h += title(e, s.title, y + h, d, 76, 46, 3)
  return h + 52 + itemsBlock(e, s, y + h + 52, d, 'steps')
}

const numberB: Block = (e, s, y, d) => {
  const big = fit(e.ctx, s.big || '', e.head.f, e.head.w, 300, 120, 1, CW, 1)
  if (d) drawLines(e.ctx, big.ls, big.f, PAD, y, { color: e.pal.accent === e.pal.text ? e.pal.text : e.pal.accent })
  let h = big.h + 36
  h += title(e, s.title, y + h, d, 76, 46, 3)
  if (s.body) h += 36 + para(e, s.body, y + h + 36, d, 44, 30, 6)
  return h
}

const quoteB: Block = (e, s, y, d) => {
  if (d) {
    e.ctx.fillStyle = e.pal.accent
    e.ctx.font = `700 280px "Playfair Display", Georgia, serif`
    e.ctx.textBaseline = 'top'
    e.ctx.fillText('“', PAD - 10, y - 40)
  }
  let h = 170
  const q = fit(e.ctx, s.body || s.title, e.head.f, Math.min(e.head.w, 700), 64, 38, 8, CW, 1.25)
  if (d) drawLines(e.ctx, q.ls, q.f, PAD, y + h, { color: e.pal.text, accent: e.pal.accent, mark: e.pal.mark, hl: e.hl })
  h += q.h
  if (s.body && s.title) h += 44 + para(e, `— ${s.title}`, y + h + 44, d, 38, 28, 2, 'left', e.pal.muted)
  return h
}

const compareB: Block = (e, s, y, d) => {
  let h = title(e, s.title, y, d, 76, 46, 3) + 48
  const [bad, good] = s.items || []
  ;[bad, good].forEach((it, k) => {
    const t = fit(e.ctx, it || '', e.body.f, 600, 44, 30, 4, CW - 190, 1.3)
    const ch = Math.max(t.h + 72, 150)
    if (d) {
      e.ctx.fillStyle = k ? e.pal.accent : e.pal.card
      rrect(e.ctx, PAD, y + h, CW, ch, 32); e.ctx.fill()
      e.ctx.fillStyle = k ? e.pal.onAccent : e.pal.muted
      e.ctx.font = `800 64px "${e.head.f}", ${FALLBACK}`
      e.ctx.textBaseline = 'middle'
      e.ctx.fillText(k ? '✓' : '✕', PAD + 44, y + h + ch / 2 + 2)
      drawLines(e.ctx, t.ls, t.f, PAD + 140, y + h + (ch - t.h) / 2, { color: k ? e.pal.onAccent : e.pal.body }, CW - 190)
    }
    h += ch + 24
  })
  return h
}

const photoB: Block = (e, s, y, d) => {
  if (!e.img) return cover(e, s, y, d)
  const ih = 600
  if (d) {
    const img = e.img
    const r = Math.max(CW / img.width, ih / img.height)
    const sw = CW / r, sh = ih / r
    e.ctx.save()
    rrect(e.ctx, PAD, y, CW, ih, 40); e.ctx.clip()
    e.ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, PAD, y, CW, ih)
    e.ctx.restore()
  }
  let h = ih + 52
  h += title(e, s.title, y + h, d, 80, 46, 3)
  if (s.body) h += 30 + para(e, s.body, y + h + 30, d, 42, 30, 4)
  return h
}

const ctaB: Block = (e, s, y, d) => {
  let h = emojiLine(e, s, y, d, 140, true)
  h += title(e, s.title, y + h, d, 92, 52, 4, 'center')
  if (s.body) h += 36 + para(e, s.body, y + h + 36, d, 44, 30, 5, 'center')
  if (s.big) {
    h += 60
    const t = fit(e.ctx, s.big, e.head.f, e.head.w, 72, 40, 1, CW - 160, 1)
    const bw = Math.min(CW, e.ctx.measureText(s.big).width + 140), bh = t.f.size + 70
    if (d) {
      e.ctx.fillStyle = e.pal.accent
      rrect(e.ctx, (W - bw) / 2, y + h, bw, bh, bh / 2); e.ctx.fill()
      drawLines(e.ctx, t.ls, t.f, PAD, y + h + 35, { color: e.pal.onAccent, align: 'center' })
    }
    h += bh
  }
  return h
}

const BLOCKS: Record<string, Block> = { cover, text, list: listB, steps: stepsB, number: numberB, quote: quoteB, compare: compareB, photo: photoB, cta: ctaB }

export function layoutOf(s: Slide, i: number, total: number) {
  if (s.layout && BLOCKS[s.layout]) return s.layout
  return i === 0 ? 'cover' : i === total - 1 ? 'cta' : (s.items?.length || 0) >= 2 ? 'list' : 'text'
}

export function drawSlide(cv: HTMLCanvasElement, s: Slide, i: number, total: number, style: Style, handle: string, img: HTMLImageElement | null) {
  const ctx = cv.getContext('2d')
  if (!ctx) return
  cv.width = W; cv.height = H
  const pal = PALETTES[style.palette] || PALETTES.brand
  const font = FONTS[style.font] || FONTS.modern
  const e: Env = { ctx, pal, head: { f: font.head, w: font.headW }, body: { f: font.body, w: font.bodyW }, img,
    hl: new Set((s.highlight || '').split(/\s+/).map(norm).filter(Boolean)) }
  background(ctx, pal, style.decor, i)
  const block = BLOCKS[layoutOf(s, i, total)]
  const h = block(e, s, TOP, false)
  const y = Math.max(TOP, TOP + (BOTTOM - TOP - h) / 2)
  block(e, s, y, true)
  chrome(ctx, pal, font.body, i, total, handle, i === total - 1)
}
