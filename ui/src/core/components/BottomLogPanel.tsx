import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { FlowConfig, LogEntry } from '../types'
import { DurationBadge } from './DurationBadge'

interface BottomLogPanelProps {
  flow: FlowConfig
  globalLogs: LogEntry[]
  selectedNodeId?: string
  onSelectNode: (nodeId: string) => void
}

const MIN_HEIGHT = 48
const DEFAULT_HEIGHT = 220
const MAX_HEIGHT_VH = 0.5

export function BottomLogPanel({ flow, globalLogs, selectedNodeId, onSelectNode }: BottomLogPanelProps) {
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [activeNodeFilters, setActiveNodeFilters] = useState<Set<string>>(new Set())
  const [liveTail, setLiveTail] = useState(true)
  const listRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  useEffect(() => {
    if (selectedNodeId) {
      setActiveNodeFilters(new Set([selectedNodeId]))
    } else {
      setActiveNodeFilters(new Set())
    }
  }, [selectedNodeId])

  const nodeLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of flow.nodes) {
      map.set(node.id, node.label)
    }
    return map
  }, [flow.nodes])

  const activeNodeIds = useMemo(
    () => new Set(globalLogs.map((l) => l.nodeId).filter(Boolean) as string[]),
    [globalLogs],
  )

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...globalLogs]
      .filter((entry) => {
        if (activeNodeFilters.size > 0 && (!entry.nodeId || !activeNodeFilters.has(entry.nodeId))) {
          return false
        }
        if (!query) return true
        return (
          entry.message.toLowerCase().includes(query) ||
          (entry.nodeId ? nodeLabels.get(entry.nodeId)?.toLowerCase().includes(query) : false)
        )
      })
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  }, [globalLogs, activeNodeFilters, nodeLabels, search])

  const logsSummary = useMemo(() => {
    if (activeNodeFilters.size === 1) {
      const onlyNodeId = [...activeNodeFilters][0]
      const nodeLabel = nodeLabels.get(onlyNodeId) ?? onlyNodeId
      return `Showing ${filteredLogs.length} logs for ${nodeLabel}`
    }

    if (activeNodeFilters.size > 1) {
      return `Showing ${filteredLogs.length} logs for ${activeNodeFilters.size} nodes`
    }

    return `Showing ${filteredLogs.length} logs`
  }, [activeNodeFilters, filteredLogs.length, nodeLabels])

  useEffect(() => {
    if (!liveTail || collapsed) return
    const list = listRef.current
    if (!list) return
    list.scrollTop = 0
  }, [filteredLogs, liveTail, collapsed])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startHeight: panelHeight }
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return
      const maxHeight = window.innerHeight * MAX_HEIGHT_VH
      const delta = dragRef.current.startY - moveEvent.clientY
      const newHeight = Math.min(Math.max(dragRef.current.startHeight + delta, MIN_HEIGHT), maxHeight)
      setPanelHeight(newHeight)
      if (newHeight <= MIN_HEIGHT) setCollapsed(true)
      else setCollapsed(false)
    }
    const onMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [panelHeight])

  const toggleNodeFilter = (nodeId: string) => {
    setActiveNodeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const clearFilters = () => setActiveNodeFilters(new Set())

  const displayHeight = collapsed ? MIN_HEIGHT : panelHeight

  return (
    <div
      className="flex flex-col border-t border-slate-700/50 bg-slate-900"
      style={{ height: displayHeight, minHeight: MIN_HEIGHT }}
    >
      {/* Drag handle */}
      <div
        className="flex h-1 cursor-row-resize items-center justify-center bg-slate-700/30 hover:bg-sky-500/30"
        onMouseDown={onDragStart}
      />

      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-700/50 px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Logs</span>
        <span className="text-[10px] text-slate-500">{logsSummary}</span>

        <div className="mx-2 h-4 w-px bg-slate-700" />

        {/* Node filter chips */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={clearFilters}
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              activeNodeFilters.size === 0
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            All
          </button>
          {[...activeNodeIds].map((nodeId) => {
            const label = nodeLabels.get(nodeId) ?? nodeId
            const active = activeNodeFilters.has(nodeId)
            return (
              <button
                key={nodeId}
                type="button"
                onClick={() => toggleNodeFilter(nodeId)}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  active ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 w-36 rounded border border-slate-700 bg-slate-800 px-2 text-[10px] text-slate-100 outline-none focus:border-sky-400"
          />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-[10px] text-slate-500 hover:text-slate-200"
          >
            {collapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Column headers */}
          <div className="grid shrink-0 border-b border-slate-700/40 px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500"
            style={{ gridTemplateColumns: '80px 140px 1fr 60px 70px' }}
          >
            <span>Time</span>
            <span>Node</span>
            <span>Message</span>
            <span>Status</span>
            <span>Duration</span>
          </div>

          {/* Log rows */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              setLiveTail(e.currentTarget.scrollTop < 12)
            }}
          >
            {filteredLogs.map((entry, index) => {
              const nodeLabel = entry.nodeId ? nodeLabels.get(entry.nodeId) ?? entry.nodeId : '—'
              const timestamp = new Date(entry.timestamp).toLocaleTimeString()
              return (
                <button
                  key={`${entry.timestamp}-${entry.message}-${index}`}
                  type="button"
                  onClick={() => entry.nodeId && onSelectNode(entry.nodeId)}
                  className="grid w-full border-b border-slate-800/60 px-3 py-1.5 text-left text-[11px] hover:bg-slate-800/50"
                  style={{ gridTemplateColumns: '80px 140px 1fr 60px 70px' }}
                >
                  <span className="text-slate-500">{timestamp}</span>
                  <span className="truncate text-slate-400">{nodeLabel}</span>
                  <span className="truncate text-slate-200">{entry.message}</span>
                  <span className={entry.level === 'error' ? 'text-rose-400' : 'text-emerald-400'}>
                    {entry.level === 'error' ? 'ERR' : 'OK'}
                  </span>
                  <span>
                    <DurationBadge durationMs={entry.durationMs} />
                  </span>
                </button>
              )
            })}
          </div>

          {!liveTail && (
            <button
              type="button"
              onClick={() => {
                setLiveTail(true)
                if (listRef.current) listRef.current.scrollTop = 0
              }}
              className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-100"
            >
              Live tail paused — click to resume
            </button>
          )}
        </>
      )}
    </div>
  )
}
