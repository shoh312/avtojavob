import { useEffect, useRef, useState, type PointerEvent } from 'react'

export type Point = { date: string; value: number }

const BRAND = '#e5161f'
const GRID = '#ececf0'
const MUTED = '#a1a1ab'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(v: number) {
  if (v <= 4) return 4
  const mag = 10 ** Math.floor(Math.log10(v))
  for (const s of [1, 2, 2.5, 5, 10]) if (s * mag >= v) return s * mag
  return 10 * mag
}

export const fmtNum = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : n.toLocaleString('ru-RU')
const fmtDate = (d: string) => { const [, m, day] = d.split('-'); return `${day}.${m}` }

function Tooltip({ x, y, value, date, unit, width }: { x: number; y: number; value: number; date: string; unit?: string; width: number }) {
  const left = Math.min(Math.max(x, 50), width - 50)
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-ink px-3 py-2 text-center shadow-pop" style={{ left, top: y - 10 }}>
      <div className="text-[14px] font-bold tabular-nums text-white">{value.toLocaleString('ru-RU')}{unit ? ` ${unit}` : ''}</div>
      <div className="text-[11px] text-white/60">{fmtDate(date)}</div>
    </div>
  )
}

/** Jadval ko'rinishi — ekran o'quvchilar uchun (grafik qiymatlari rangsiz ham mavjud). */
function SrTable({ data, label }: { data: Point[]; label: string }) {
  return (
    <table className="sr-only"><caption>{label}</caption>
      <tbody>{data.map(p => <tr key={p.date}><th>{p.date}</th><td>{p.value}</td></tr>)}</tbody>
    </table>
  )
}

const M = { l: 40, r: 12, t: 12, b: 26 }

function Axes({ w, h, max, data }: { w: number; h: number; max: number; data: Point[] }) {
  const ih = h - M.t - M.b
  const ticks = [0, max / 2, max]
  const xIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1]
  const iw = w - M.l - M.r
  return (
    <g>
      {ticks.map(v => {
        const y = M.t + ih - (v / max) * ih
        return <g key={v}>
          <line x1={M.l} x2={w - M.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
          <text x={M.l - 8} y={y + 4} textAnchor="end" fontSize={11} fill={MUTED}>{fmtNum(Math.round(v))}</text>
        </g>
      })}
      {data.length > 1 && xIdx.map((i, k) => (
        <text key={k} x={M.l + (i / (data.length - 1)) * iw} y={h - 6} fontSize={11} fill={MUTED}
          textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>{fmtDate(data[i].date)}</text>
      ))}
    </g>
  )
}

export function AreaChart({ data, height = 220, label, unit }: { data: Point[]; height?: number; label: string; unit?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...data.map(d => d.value)))
  const iw = w - M.l - M.r, ih = height - M.t - M.b
  const x = (i: number) => M.l + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2)
  const y = (v: number) => M.t + ih - (v / max) * ih
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ')
  const area = data.length ? `${line} L${x(data.length - 1)},${M.t + ih} L${x(0)},${M.t + ih} Z` : ''
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - M.l) / iw) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={label} className="block touch-none">
        <Axes w={w} h={height} max={max} data={data} />
        <path d={area} fill={BRAND} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={BRAND} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <>
          <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} stroke="#c4c4cc" strokeWidth={1} />
          <circle cx={x(hover)} cy={y(data[hover].value)} r={5} fill={BRAND} stroke="#fff" strokeWidth={2} />
        </>}
      </svg>
      {hover !== null && <Tooltip x={x(hover)} y={y(data[hover].value)} value={data[hover].value} date={data[hover].date} unit={unit} width={w} />}
      <SrTable data={data} label={label} />
    </div>
  )
}

export function BarChart({ data, height = 220, label, unit }: { data: Point[]; height?: number; label: string; unit?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...data.map(d => d.value)))
  const iw = w - M.l - M.r, ih = height - M.t - M.b
  const slot = iw / Math.max(1, data.length)
  const bw = Math.max(2, Math.min(24, slot - 2))
  const cx = (i: number) => M.l + slot * i + slot / 2
  const xs = data.length > 1 ? data.map((_, i) => cx(i)) : []
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={height} role="img" aria-label={label} className="block" onPointerLeave={() => setHover(null)}>
        <Axes w={w} h={height} max={max} data={data} />
        {data.map((d, i) => {
          const hgt = (d.value / max) * ih
          const x0 = cx(i) - bw / 2, y0 = M.t + ih - hgt
          const r = Math.min(4, hgt, bw / 2)
          const path = hgt <= 0 ? '' :
            `M${x0},${M.t + ih} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} L${x0 + bw - r},${y0} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} L${x0 + bw},${M.t + ih} Z`
          return (
            <g key={d.date} onPointerEnter={() => setHover(i)}>
              <rect x={cx(i) - slot / 2} y={M.t} width={slot} height={ih} fill="transparent" />
              {path && <path d={path} fill={BRAND} opacity={hover === null || hover === i ? 1 : 0.45} />}
            </g>
          )
        })}
      </svg>
      {hover !== null && <Tooltip x={xs[hover] ?? cx(hover)} y={M.t + ih - (data[hover].value / max) * ih} value={data[hover].value} date={data[hover].date} unit={unit} width={w} />}
      <SrTable data={data} label={label} />
    </div>
  )
}

/** Gorizontal ro'yxat-bar: nom chapda, qiymat bar uchida. */
export function HBars({ items, empty }: { items: { name: string; value: number; href?: string }[]; empty: string }) {
  if (!items.length) return <p className="py-10 text-center text-[13px] text-ink-4">{empty}</p>
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-3.5">
      {items.map(it => (
        <div key={it.name}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium text-ink-2">{it.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{fmtNum(it.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-soft"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.max(3, (it.value / max) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

export function ChartCard({ title, value, sub, children }: { title: string; value?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-ink-3">{title}</div>
          {value && <div className="mt-1 text-[24px] font-extrabold tabular-nums tracking-tight">{value}</div>}
        </div>
        {sub && <div className="text-[12px] text-ink-4">{sub}</div>}
      </div>
      {children}
    </div>
  )
}
