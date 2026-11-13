import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type FinalConnectionState, type Node, type NodeChange,
} from '@xyflow/react'
import { AlertCircle, ArrowLeft, Check, Loader2, Maximize2, Minus, MonitorSmartphone, Play, Plus } from 'lucide-react'
import { api, type FlowFull, type ValidationError } from '../api'
import { useI18n, type TKey } from '../i18n'
import { Spinner, Toggle, useToast } from '../components/ui'
import Inspector from './Inspector'
import Simulator from './Simulator'
import { defaultData, NODE_META, PALETTE, uid, type NodeType } from './meta'
import { EditorCtx, edgeTypes, nodeTypes } from './nodes'

type SaveState = 'saved' | 'dirty' | 'saving'

function serialize(name: string, nodes: Node[], edges: Edge[]) {
  return JSON.stringify({
    name,
    graph: {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, data: n.data, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || 'out' })),
    },
  })
}

function Editor({ flow }: { flow: FlowFull }) {
  const { t } = useI18n()
  const toast = useToast()
  const rf = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)

  const [name, setName] = useState(flow.name)
  const [active, setActive] = useState(flow.active)
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>(
    flow.graph.nodes.map(n => ({ ...n, deletable: n.type !== 'trigger' })))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    flow.graph.edges.map(e => ({ ...e, type: 'deletable' })))
  const [errors, setErrors] = useState<ValidationError[]>(flow.errors)
  const [save, setSave] = useState<SaveState>('saved')
  const [stats, setStats] = useState<Record<string, Record<string, number>>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; source: string; handle: string | null } | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [sim, setSim] = useState<{ start: string | null } | null>(null)
  const [activeNode, setActiveNode] = useState<string | null>(null)

  const snapshot = useMemo(() => serialize(name, nodes, edges), [name, nodes, edges])
  const savedRef = useRef(snapshot)

  // --- avtomatik saqlash
  const doSave = useCallback(async (extra?: { active: boolean }) => {
    const body = JSON.parse(serialize(name, rf.getNodes(), rf.getEdges()))
    setSave('saving')
    try {
      const res = await api.put<FlowFull>(`/api/flows/${flow.id}`, { ...body, ...(extra || {}) })
      savedRef.current = JSON.stringify(body)
      setErrors(res.errors)
      setActive(res.active)
      setSave('saved')
      return res
    } catch {
      setSave('dirty')
      toast(t('common.error'), 'error')
      return null
    }
  }, [flow.id, name, rf, t, toast])

  useEffect(() => {
    if (snapshot === savedRef.current) return
    setSave('dirty')
    const timer = setTimeout(() => { doSave() }, 900)
    return () => clearTimeout(timer)
  }, [snapshot, doSave])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (savedRef.current !== snapshot) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [snapshot])

  // --- statistika
  useEffect(() => {
    const load = () => api.get<{ nodes: Record<string, Record<string, number>> }>(`/api/flows/${flow.id}/stats`).then(r => setStats(r.nodes)).catch(() => {})
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [flow.id])

  const errorsByNode = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const e of errors) if (e.node) (m[e.node] ||= []).push(e.code)
    return m
  }, [errors])

  // --- o'zgarishlar
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const c of changes) if (c.type === 'select' && c.selected) setSelectedId(c.id)
    onNodesChangeBase(changes)
  }, [onNodesChangeBase])

  const onConnect = useCallback((c: Connection) => {
    setEdges(es => [
      ...es.filter(e => !(e.source === c.source && (e.sourceHandle || 'out') === (c.sourceHandle || 'out'))),
      { id: uid(), source: c.source, target: c.target, sourceHandle: c.sourceHandle || 'out', type: 'deletable' },
    ])
  }, [setEdges])

  const isValidConnection = useCallback((c: Connection | Edge) => {
    if (c.source === c.target) return false
    const target = rf.getNode(c.target)
    return !!target && target.type !== 'trigger'
  }, [rf])

  const addNode = useCallback((type: NodeType, position?: { x: number; y: number }, from?: { source: string; handle: string | null }) => {
    let pos = position
    if (!pos) {
      const box = wrapper.current?.getBoundingClientRect()
      pos = rf.screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 800) / 2 - 136, y: (box?.top ?? 0) + (box?.height ?? 600) / 2 - 60 })
      pos = { x: pos.x + (Math.random() * 40 - 20), y: pos.y + (Math.random() * 40 - 20) }
    }
    const id = uid()
    setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), { id, type, position: pos!, data: defaultData(type), selected: true }])
    if (from) setEdges(es => [
      ...es.filter(e => !(e.source === from.source && (e.sourceHandle || 'out') === (from.handle || 'out'))),
      { id: uid(), source: from.source, target: id, sourceHandle: from.handle || 'out', type: 'deletable' },
    ])
    setSelectedId(id)
  }, [rf, setNodes, setEdges])

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || state.fromHandle?.type !== 'source') return
    const p = 'changedTouches' in event ? event.changedTouches[0] : event
    const box = wrapper.current!.getBoundingClientRect()
    setMenu({ x: p.clientX - box.left, y: p.clientY - box.top, source: state.fromNode.id, handle: state.fromHandle.id ?? null })
  }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/chatflow') as NodeType
    if (!type) return
    const pos = rf.screenToFlowPosition({ x: e.clientX - 136, y: e.clientY - 24 })
    addNode(type, pos)
  }, [rf, addNode])

  const updateData = useCallback((id: string, patch: Record<string, any>) => {
    setNodes(ns => ns.map(n => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
  }, [setNodes])

  const deleteNode = useCallback((id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id))
    setEdges(es => es.filter(e => e.source !== id && e.target !== id))
    setSelectedId(null)
  }, [setNodes, setEdges])

  // Tugma o'chirilsa — uning chizig'i ham o'chsin
  useEffect(() => {
    const valid = new Set<string>()
    for (const n of nodes) {
      const waits = n.type === 'message' && ((n.data as any).buttons || []).some((b: any) => b.kind !== 'url')
      if (!waits) valid.add(`${n.id}|out`)
      if (n.type === 'condition') { valid.add(`${n.id}|yes`); valid.add(`${n.id}|no`) }
      for (const b of ((n.data as any).buttons || [])) if (b.kind !== 'url') valid.add(`${n.id}|btn:${b.id}`)
    }
    if (edges.some(e => !valid.has(`${e.source}|${e.sourceHandle || 'out'}`)))
      setEdges(es => es.filter(e => valid.has(`${e.source}|${e.sourceHandle || 'out'}`)))
  }, [nodes, edges, setEdges])

  const toggleActive = async (v: boolean) => {
    const res = await doSave({ active: v })
    if (!res) return
    if (v && !res.active) { toast(t('ed.fix_first'), 'error'); setShowErrors(true) }
    else toast(t(v ? 'ed.activated' : 'ed.paused'))
  }

  const focusNode = (id: string) => {
    const n = rf.getNode(id)
    if (!n) return
    setNodes(ns => ns.map(x => ({ ...x, selected: x.id === id })))
    setSelectedId(id)
    rf.setCenter(n.position.x + 136, n.position.y + 80, { zoom: 1, duration: 400 })
  }

  const duplicateNode = useCallback((id: string) => {
    const src = rf.getNode(id)
    if (!src) return
    const nid = uid()
    const data = JSON.parse(JSON.stringify(src.data || {}))
    if (Array.isArray(data.buttons)) data.buttons = data.buttons.map((b: any) => ({ ...b, id: uid() }))
    setNodes(ns => [...ns.map(n => ({ ...n, selected: false })),
      { id: nid, type: src.type, position: { x: src.position.x + 40, y: src.position.y + 60 }, data, selected: true }])
    setSelectedId(nid)
  }, [rf, setNodes])

  const testFrom = useCallback((id: string | null) => { setSelectedId(null); setSim({ start: id }) }, [])
  const actions = useMemo(() => ({ test: (id: string) => testFrom(id), duplicate: duplicateNode, remove: deleteNode }), [testFrom, duplicateNode, deleteNode])

  const selected = nodes.find(n => n.id === selectedId)
  const errCount = errors.length

  return (
    <EditorCtx.Provider value={{ stats, errors: errorsByNode, active: activeNode, actions }}>
      <div className="flex h-screen flex-col bg-soft">
        {/* yuqori panel */}
        <header className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-3 sm:px-4">
          <Link to="/app/flows" className="rounded-lg p-2 text-ink-3 hover:bg-soft hover:text-ink"><ArrowLeft className="h-5 w-5" /></Link>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('ed.name_ph')}
            className="min-w-0 max-w-[340px] flex-1 rounded-lg bg-transparent px-2 py-1.5 text-[15px] font-semibold outline-none hover:bg-soft focus:bg-soft" />
          <span className="hidden items-center gap-1.5 text-[12.5px] text-ink-3 sm:flex">
            {save === 'saving' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('common.saving')}</>
              : save === 'dirty' ? <><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{t('ed.unsaved')}</>
              : <><Check className="h-3.5 w-3.5 text-emerald-500" />{t('ed.saved')}</>}
          </span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {errCount > 0 && (
              <div className="relative">
                <button onClick={() => setShowErrors(s => !s)} className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-700">
                  <AlertCircle className="h-4 w-4" />{t('ed.errors', { n: errCount })}
                </button>
                {showErrors && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-2xl border border-line bg-white p-2 shadow-pop">
                    {errors.map((e, i) => (
                      <button key={i} onClick={() => { if (e.node) focusNode(e.node); setShowErrors(false) }}
                        className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-soft">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        <span>{t(`ve.${e.code}` as TKey)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => testFrom(null)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#6d5dfc] to-[#a855f7] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(109,93,252,.8)] hover:opacity-95">
              <Play className="h-3.5 w-3.5" />{t('sim.test')}
            </button>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-1.5">
              <span className={`text-[13px] font-semibold ${active ? 'text-brand-700' : 'text-ink-3'}`}>{active ? t('ed.activate') : t('common.draft')}</span>
              <Toggle checked={active} onChange={toggleActive} size="sm" />
            </label>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div ref={wrapper} className="relative flex-1" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              onPaneClick={() => { setSelectedId(null); setMenu(null); setShowErrors(false) }}
              onNodeClick={(_, n) => { setSelectedId(n.id); setSim(null) }}
              deleteKeyCode={['Delete', 'Backspace']}
              fitView fitViewOptions={{ padding: 0.35, maxZoom: 1 }} minZoom={0.2} maxZoom={1.75}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="#d4d4dc" />
            </ReactFlow>

            {/* bloklar paneli */}
            <div className="absolute left-3 top-3 z-10 w-[200px] rounded-2xl border border-line bg-white/95 p-2 shadow-pop backdrop-blur sm:left-4 sm:top-4">
              <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t('ed.add_block')}</div>
              {PALETTE.map(type => {
                const m = NODE_META[type], Icon = m.icon
                return (
                  <button key={type} draggable onDragStart={e => { e.dataTransfer.setData('application/chatflow', type); e.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => addNode(type)}
                    className="group flex w-full cursor-grab items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-soft active:cursor-grabbing">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${m.tint}`}><Icon className="h-[15px] w-[15px]" /></span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight">{t(m.label)}</span>
                      <span className="block truncate text-[11px] leading-tight text-ink-3">{t(m.desc)}</span>
                    </span>
                  </button>
                )
              })}
              <p className="px-2 pb-1 pt-2 text-[11px] leading-snug text-ink-4">{t('ed.drop_hint')}</p>
            </div>

            {/* masshtab */}
            <div className="absolute bottom-4 left-4 z-10 flex overflow-hidden rounded-xl border border-line bg-white shadow-card">
              <button title={t('ed.zoom_out')} onClick={() => rf.zoomOut({ duration: 200 })} className="p-2.5 text-ink-2 hover:bg-soft"><Minus className="h-4 w-4" /></button>
              <button title={t('ed.zoom_in')} onClick={() => rf.zoomIn({ duration: 200 })} className="border-x border-line p-2.5 text-ink-2 hover:bg-soft"><Plus className="h-4 w-4" /></button>
              <button title={t('ed.fit')} onClick={() => rf.fitView({ padding: 0.3, duration: 300, maxZoom: 1 })} className="p-2.5 text-ink-2 hover:bg-soft"><Maximize2 className="h-4 w-4" /></button>
            </div>

            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-[12px] text-ink-3 shadow-card md:hidden">
              <MonitorSmartphone className="h-4 w-4" />{t('ed.desktop')}
            </div>

            {/* chiziqni bo'sh joyga tashlaganda — keyingi blok menyusi */}
            {menu && (
              <div className="absolute z-20 w-56 rounded-2xl border border-line bg-white p-1.5 shadow-pop animate-fade-up" style={{ left: menu.x, top: menu.y }}>
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t('ed.connect_menu')}</div>
                {PALETTE.map(type => {
                  const m = NODE_META[type], Icon = m.icon
                  return (
                    <button key={type} onClick={() => {
                      const box = wrapper.current!.getBoundingClientRect()
                      addNode(type, rf.screenToFlowPosition({ x: box.left + menu.x, y: box.top + menu.y - 30 }), { source: menu.source, handle: menu.handle })
                      setMenu(null)
                    }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium hover:bg-soft">
                      <span className={`grid h-6 w-6 place-items-center rounded-md ${m.tint}`}><Icon className="h-3.5 w-3.5" /></span>{t(m.label)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* simulyator */}
          {sim && (
            <aside className="absolute inset-y-14 right-0 z-30 w-full border-l border-line bg-white shadow-pop sm:w-[380px] lg:static lg:inset-auto lg:shadow-none">
              <Simulator nodes={nodes} edges={edges} startId={sim.start} accountId={flow.account_id}
                onActive={setActiveNode} onClose={() => { setSim(null); setActiveNode(null) }} />
            </aside>
          )}

          {/* inspektor */}
          {selected && !sim && (
            <aside className="absolute inset-y-14 right-0 z-30 w-full border-l border-line bg-white shadow-pop sm:w-[360px] lg:static lg:inset-auto lg:shadow-none">
              <Inspector key={selected.id}
                node={{ id: selected.id, type: selected.type as NodeType, data: selected.data as Record<string, any> }}
                accountId={flow.account_id}
                onChange={patch => updateData(selected.id, patch)}
                onDelete={() => deleteNode(selected.id)}
                onClose={() => { setSelectedId(null); setNodes(ns => ns.map(n => ({ ...n, selected: false }))) }} />
            </aside>
          )}
        </div>
      </div>
    </EditorCtx.Provider>
  )
}

export default function FlowEditor() {
  const { id } = useParams()
  const [flow, setFlow] = useState<FlowFull | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    api.get<FlowFull>(`/api/flows/${id}`).then(setFlow).catch(() => setFailed(true))
  }, [id])
  if (failed) return <div className="grid min-h-screen place-items-center text-ink-3"><Link to="/app/flows" className="font-semibold text-brand-600">← Back</Link></div>
  if (!flow) return <Spinner className="min-h-screen" />
  return <ReactFlowProvider><Editor flow={flow} /></ReactFlowProvider>
}
