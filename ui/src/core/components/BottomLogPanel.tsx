import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { formatEasternTime } from '../time'
import type { FlowConfig, LogEntry, TraceJourney, TraceStatus } from '../types'
import { DurationBadge } from './DurationBadge'

interface BottomLogPanelProps {
  flow: FlowConfig
  globalLogs: LogEntry[]
  journeys: TraceJourney[]
  selectedNodeId?: string
  selectedTraceId?: string
  onSelectNode: (nodeId: string) => void
  onSelectTrace: (traceId?: string) => void
}

type PanelTab = 'logs' | 'traces'

const TAB_LABELS: Record<PanelTab, string> = {
  logs: 'Logs',
  traces: 'Runs',
}

const MIN_HEIGHT = 48
const DEFAULT_HEIGHT = 220
const MAX_HEIGHT_VH = 0.5

function compareLogsDescending(left: LogEntry, right: LogEntry): number {
  if (typeof left.seq === 'number' && typeof right.seq === 'number') {
    return right.seq - left.seq
  }
  return Date.parse(right.timestamp) - Date.parse(left.timestamp)
}

function statusClass(status: TraceStatus): string {
  if (status === 'error') {
    return 'text-rose-300'
  }
  if (status === 'success') {
    return 'text-emerald-300'
  }
  if (status === 'partial') {
    return 'text-amber-300'
  }
  return 'text-sky-300'
}

function currentStepLabel(journey: TraceJourney): string {
  const currentStep = journey.stages.at(-1)
  if (!currentStep) {
    return '-'
  }

  return currentStep.label || currentStep.nodeId || currentStep.stageId
}

export function BottomLogPanel({
  flow,
  globalLogs,
  journeys,
  selectedNodeId,
  selectedTraceId,
  onSelectNode,
  onSelectTrace,
}: BottomLogPanelProps) {
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<PanelTab>('logs')
  const [activeNodeFilters, setActiveNodeFilters] = useState<Set<string>>(new Set())
  const [pinnedTraceIds, setPinnedTraceIds] = useState<Set<string>>(new Set())
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
    () => new Set(globalLogs.map((entry) => entry.nodeId).filter(Boolean) as string[]),
    [globalLogs],
  )

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...globalLogs]
      .filter((entry) => {
        const executionId = entry.runId ?? entry.traceId
        if (selectedTraceId && executionId !== selectedTraceId) {
          return false
        }
        if (activeNodeFilters.size > 0 && (!entry.nodeId || !activeNodeFilters.has(entry.nodeId))) {
          return false
        }
        if (!query) {
          return true
        }
        const nodeLabel = entry.nodeId ? nodeLabels.get(entry.nodeId) : undefined
        return (
          entry.message.toLowerCase().includes(query) ||
          (nodeLabel ? nodeLabel.toLowerCase().includes(query) : false) ||
          (entry.runId ? entry.runId.toLowerCase().includes(query) : false) ||
          (entry.traceId ? entry.traceId.toLowerCase().includes(query) : false) ||
          (entry.stageId ? entry.stageId.toLowerCase().includes(query) : false)
        )
      })
      .sort(compareLogsDescending)
  }, [activeNodeFilters, globalLogs, nodeLabels, search, selectedTraceId])

  const filteredJourneys = useMemo(() => {
    const query = search.trim().toLowerCase()
    const ordered = [...journeys].sort((left, right) => {
      const pinnedLeft = pinnedTraceIds.has(left.traceId)
      const pinnedRight = pinnedTraceIds.has(right.traceId)
      if (pinnedLeft !== pinnedRight) {
        return pinnedLeft ? -1 : 1
      }
      return Date.parse(right.lastUpdatedAt) - Date.parse(left.lastUpdatedAt)
    })

    if (!query) {
      return ordered
    }

    return ordered.filter((journey) => {
      const stage = journey.stages.at(-1)
      return (
        journey.traceId.toLowerCase().includes(query) ||
        (journey.rootEntity?.toLowerCase().includes(query) ?? false) ||
        (stage?.label.toLowerCase().includes(query) ?? false) ||
        (journey.errorSummary?.toLowerCase().includes(query) ?? false)
      )
    })
  }, [journeys, pinnedTraceIds, search])

  const logsSummary = useMemo(() => {
    if (selectedTraceId) {
      return `Showing ${filteredLogs.length} logs for the selected run`
    }

    if (activeNodeFilters.size === 1) {
      const onlyNodeId = [...activeNodeFilters][0]
      const nodeLabel = nodeLabels.get(onlyNodeId) ?? onlyNodeId
      return `Showing ${filteredLogs.length} logs for ${nodeLabel}`
    }

    if (activeNodeFilters.size > 1) {
      return `Showing ${filteredLogs.length} logs for ${activeNodeFilters.size} nodes`
    }

    return `Showing ${filteredLogs.length} logs`
  }, [activeNodeFilters, filteredLogs.length, nodeLabels, selectedTraceId])

  useEffect(() => {
    if (!liveTail || collapsed || tab !== 'logs') {
      return
    }
    const list = listRef.current
    if (!list) {
      return
    }
    list.scrollTop = 0
  }, [collapsed, filteredLogs, liveTail, tab])

  const onDragStart = useCallback(
    (event: React.MouseEvent) => {
      dragRef.current = { startY: event.clientY, startHeight: panelHeight }
      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!dragRef.current) {
          return
        }
        const maxHeight = window.innerHeight * MAX_HEIGHT_VH
        const delta = dragRef.current.startY - moveEvent.clientY
        const nextHeight = Math.min(Math.max(dragRef.current.startHeight + delta, MIN_HEIGHT), maxHeight)
        setPanelHeight(nextHeight)
        setCollapsed(nextHeight <= MIN_HEIGHT)
      }
      const onMouseUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [panelHeight],
  )

  const toggleNodeFilter = useCallback((nodeId: string) => {
    setActiveNodeFilters((previous) => {
      const next = new Set(previous)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const togglePinnedTrace = useCallback((traceId: string) => {
    setPinnedTraceIds((previous) => {
      const next = new Set(previous)
      if (next.has(traceId)) {
        next.delete(traceId)
      } else {
        next.add(traceId)
      }
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setActiveNodeFilters(new Set())
    onSelectTrace(undefined)
  }, [onSelectTrace])

  const displayHeight = collapsed ? MIN_HEIGHT : panelHeight

  return (
    <div
      className="flex flex-col border-t border-slate-700/50 bg-slate-900"
      style={{ height: displayHeight, minHeight: MIN_HEIGHT }}
    >
      <div
        className="flex h-1 cursor-row-resize items-center justify-center bg-slate-700/30 hover:bg-sky-500/30"
        onMouseDown={onDragStart}
      />

      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-700/50 px-3">
        <div className="flex items-center gap-1">
          {(['logs', 'traces'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setTab(tabKey)}
              className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                tab === tabKey ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {TAB_LABELS[tabKey]}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-slate-500">{tab === 'logs' ? logsSummary : `${filteredJourneys.length} runs`}</span>

        {tab === 'logs' ? (
          <>
            <div className="mx-1 h-4 w-px bg-slate-700" />
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
                    {nodeLabels.get(nodeId) ?? nodeId}
                  </button>
                )
              })}
            </div>
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <input
            placeholder={tab === 'logs' ? 'Search logs…' : 'Search runs…'}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-6 w-40 rounded border border-slate-700 bg-slate-800 px-2 text-[10px] text-slate-100 outline-none focus:border-sky-400"
          />
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="text-[10px] text-slate-500 hover:text-slate-200"
          >
            {collapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {!collapsed && tab === 'logs' ? (
        <>
          <div
            className="grid shrink-0 border-b border-slate-700/40 px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500"
            style={{ gridTemplateColumns: '120px 140px 1fr 60px 70px' }}
          >
            <span>Time</span>
            <span>Node</span>
            <span>Message</span>
            <span>Status</span>
            <span>Duration</span>
          </div>

          <div
            ref={listRef}
            className="flex-1 overflow-y-auto"
            onScroll={(event) => setLiveTail(event.currentTarget.scrollTop < 12)}
          >
            {filteredLogs.map((entry, index) => {
              const nodeLabel = entry.nodeId ? nodeLabels.get(entry.nodeId) ?? entry.nodeId : '—'
              const timestamp = formatEasternTime(entry.timestamp)
              return (
                <button
                  key={`${entry.timestamp}-${entry.message}-${index}`}
                  type="button"
                  onClick={() => {
                    const executionId = entry.runId ?? entry.traceId
                    if (executionId) {
                      onSelectTrace(executionId)
                    }
                    if (entry.nodeId) {
                      onSelectNode(entry.nodeId)
                    }
                  }}
                  className="grid w-full border-b border-slate-800/60 px-3 py-1.5 text-left text-[11px] hover:bg-slate-800/50"
                  style={{ gridTemplateColumns: '120px 140px 1fr 60px 70px' }}
                >
                  <span className="text-slate-500">{timestamp}</span>
                  <span className="truncate text-slate-400">{nodeLabel}</span>
                  <span className="truncate text-slate-200">{entry.stageId ? `${entry.stageId}: ${entry.message}` : entry.message}</span>
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

          {!liveTail ? (
            <button
              type="button"
              onClick={() => {
                setLiveTail(true)
                if (listRef.current) {
                  listRef.current.scrollTop = 0
                }
              }}
              className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-100"
            >
              Live tail paused - click to resume
            </button>
          ) : null}
        </>
      ) : null}

      {!collapsed && tab === 'traces' ? (
        <>
          <div
            className="grid shrink-0 border-b border-slate-700/40 px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500"
            style={{ gridTemplateColumns: '180px 1fr 70px 70px 120px 1fr 46px' }}
          >
            <span>Run</span>
            <span>Current step</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Updated</span>
            <span>Issue</span>
            <span>Pin</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredJourneys.map((journey) => {
              const selected = selectedTraceId === journey.traceId
              const pinned = pinnedTraceIds.has(journey.traceId)
              const runLabel = journey.rootEntity ?? `Run ${journey.traceId.slice(0, 8)}...`
              return (
                <div
                  key={journey.traceId}
                  onClick={() => onSelectTrace(selected ? undefined : journey.traceId)}
                  className={`grid w-full cursor-pointer border-b border-slate-800/60 px-3 py-1.5 text-left text-[11px] hover:bg-slate-800/50 ${
                    selected ? 'bg-sky-900/20' : ''
                  }`}
                  style={{ gridTemplateColumns: '180px 1fr 70px 70px 120px 1fr 46px' }}
                >
                  <span className="truncate text-slate-200">{runLabel}</span>
                  <span className="truncate text-slate-300">{currentStepLabel(journey)}</span>
                  <span className={statusClass(journey.status)}>{journey.status}</span>
                  <span className="text-slate-300">
                    <DurationBadge durationMs={journey.durationMs} />
                  </span>
                  <span className="truncate text-slate-500">
                    {formatEasternTime(journey.lastUpdatedAt)}
                  </span>
                  <span className="truncate text-rose-300">{journey.errorSummary ?? '-'}</span>
                  <span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        togglePinnedTrace(journey.traceId)
                      }}
                      className={`rounded border px-1.5 py-0.5 text-[10px] ${
                        pinned
                          ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                          : 'border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      {pinned ? 'Unpin' : 'Pin'}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}
