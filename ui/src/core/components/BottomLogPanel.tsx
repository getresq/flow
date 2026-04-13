import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Inbox, Maximize2, Minimize2, Radio, Search } from 'lucide-react'

import {
  Button,
  Input,
  Tabs,
  TabsContent,
} from '@/components/ui'

import type { FlowConfig, LogEntry, TraceJourney } from '../types'
import { formatRunLabel, formatStepDisplayLabel, isRunBackedJourney } from '../runPresentation'
import { useLayoutStore } from '../../stores/layout'
import { buildLogSearchText } from '../logPresentation'
import {
  bottomPanelSizing,
  getBottomPanelSnapFromHeight,
  getBottomPanelSnapHeight,
} from './bottomPanelSizing'
import { LogsTable } from './LogsTable'
import { RunsTable } from './RunsTable'

interface BottomLogPanelProps {
  flow: FlowConfig
  globalLogs: LogEntry[]
  journeys: TraceJourney[]
  selectedTraceId?: string
  selectedLogSeq?: string
  isBackfilling?: boolean
  hasMoreOlder?: boolean
  historyLimitReached?: boolean
  wasLiveBufferTruncated?: boolean
  onLoadOlder?: () => Promise<void> | void
  onSelectNode: (nodeId: string) => void
  onSelectLog: (entry: LogEntry) => void
  onSelectTrace: (traceId?: string) => void
}

type PanelTab = 'logs' | 'traces'

function getScrollViewport(root: HTMLDivElement | null) {
  return root?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
}

function resolveSemanticFamily(semanticRole: string | undefined): string | undefined {
  if (!semanticRole) return undefined
  if (semanticRole === 'scheduler') return 'cron'
  return semanticRole
}

export function BottomLogPanel({
  flow,
  globalLogs,
  journeys,
  selectedTraceId,
  selectedLogSeq,
  isBackfilling = false,
  hasMoreOlder = false,
  historyLimitReached: _historyLimitReached = false,
  wasLiveBufferTruncated = false,
  onLoadOlder = () => {},
  onSelectNode: _onSelectNode,
  onSelectLog,
  onSelectTrace,
}: BottomLogPanelProps) {
  const snap = useLayoutStore((state) => state.bottomPanelSnap)
  const setSnap = useLayoutStore((state) => state.setBottomPanelSnap)
  const tab = useLayoutStore((state) => state.bottomPanelTab)
  const setTab = useLayoutStore((state) => state.setBottomPanelTab)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'error'>('all')
  const [liveTail, setLiveTail] = useState(true)
  const logsScrollAreaRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [customHeight, setCustomHeight] = useState<number | null>(null)
  const [isPointerDown, setIsPointerDown] = useState(false)
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800

  const isWhisper = snap === 'whisper'
  const isFull = snap === 'full'
  const displayHeight =
    dragHeight ??
    (snap === 'partial' && customHeight !== null
      ? customHeight
      : getBottomPanelSnapHeight(snap, viewportHeight))

  const flowLogs = useMemo(
    () => globalLogs.filter((entry) => entry.eventType === 'log'),
    [globalLogs],
  )

  const nodeLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of flow.nodes) {
      map.set(node.id, node.label)
    }
    return map
  }, [flow.nodes])

  const nodeFamilies = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of flow.nodes) {
      const family = resolveSemanticFamily(node.semanticRole)
      if (family) map.set(node.id, family)
    }
    return map
  }, [flow.nodes])

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...flowLogs]
      .filter((entry) => {
        const executionId = entry.runId ?? entry.traceId
        if (selectedTraceId && executionId !== selectedTraceId) {
          return false
        }
        if (statusFilter !== 'all') {
          const matchesErrorFilter = entry.level === 'error' || entry.signal === 'critical'
          if (!matchesErrorFilter) {
            return false
          }
        }
        if (!query) {
          return true
        }
        const nodeLabel = entry.nodeId ? nodeLabels.get(entry.nodeId) : undefined
        return buildLogSearchText(entry, nodeLabel).includes(query)
      })
  }, [flowLogs, nodeLabels, search, selectedTraceId, statusFilter])

  const filteredJourneys = useMemo(() => {
    const query = search.trim().toLowerCase()
    const ordered = [...journeys]
      .filter((journey) => isRunBackedJourney(journey))
      .sort(
      (left, right) => Date.parse(right.lastUpdatedAt) - Date.parse(left.lastUpdatedAt),
      )

    return ordered.filter((journey) => {
      if (statusFilter !== 'all' && journey.status !== 'error') {
        return false
      }
      if (!query) {
        return true
      }
      const stage = journey.steps.at(-1)
      return (
        journey.traceId.toLowerCase().includes(query) ||
        formatRunLabel(journey).toLowerCase().includes(query) ||
        (stage ? formatStepDisplayLabel(stage).toLowerCase().includes(query) : false) ||
        (journey.errorSummary?.toLowerCase().includes(query) ?? false)
      )
    })
  }, [journeys, search, statusFilter])
  const canLoadOlder = hasMoreOlder || wasLiveBufferTruncated

  const logsEmptyState = useMemo(() => {
    if (flowLogs.length === 0) {
      return {
        title: 'Waiting for activity',
        body: 'Logs will appear here when the flow runs.',
      }
    }

    if (canLoadOlder || isBackfilling) {
      return {
        title: 'No logs in the loaded window',
        body: 'Load older activity or clear filters to see more.',
      }
    }

    return {
      title: 'No logs match the current filters',
      body: 'Try clearing search to see more flow activity.',
    }
  }, [canLoadOlder, flowLogs.length, isBackfilling])

  const runsEmptyState = useMemo(() => {
    if (journeys.length === 0) {
      return {
        title: 'Waiting for activity',
        body: 'Runs will appear here when the flow runs.',
      }
    }

    if (canLoadOlder || isBackfilling) {
      return {
        title: 'No runs in the loaded window',
        body: 'Load older activity to bring earlier runs into view.',
      }
    }

    if (!journeys.some((journey) => isRunBackedJourney(journey))) {
      return {
        title: 'No runs yet',
        body: 'Ambient flow activity still appears in Logs until a run-backed execution starts.',
      }
    }

    return {
      title: 'No runs match the current filters',
      body: 'Try clearing search to see more runs.',
    }
  }, [canLoadOlder, isBackfilling, journeys])

  useEffect(() => {
    if (!liveTail || isWhisper || tab !== 'logs') {
      return
    }
    const viewport = getScrollViewport(logsScrollAreaRef.current)
    if (!viewport) {
      return
    }
    viewport.scrollTop = 0
  }, [isWhisper, filteredLogs, liveTail, tab])

  useEffect(() => {
    if (isWhisper || tab !== 'logs') {
      return
    }

    const viewport = getScrollViewport(logsScrollAreaRef.current)
    if (!viewport) {
      return
    }

    const onScroll = () => {
      setLiveTail(viewport.scrollTop < 12)

      const canScrollOlder = viewport.scrollHeight > viewport.clientHeight + 12
      const distanceFromOlderEdge =
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
      if (
        canScrollOlder &&
        distanceFromOlderEdge < 120 &&
        (hasMoreOlder || wasLiveBufferTruncated) &&
        !isBackfilling
      ) {
        void onLoadOlder()
      }
    }

    viewport.addEventListener('scroll', onScroll)
    onScroll()

    return () => viewport.removeEventListener('scroll', onScroll)
  }, [hasMoreOlder, isBackfilling, isWhisper, onLoadOlder, tab, wasLiveBufferTruncated])

  const TAP_THRESHOLD = 5

  const onDragStart = useCallback(
    (event: React.PointerEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('button, input, [role="tab"], [role="tablist"]')) return
      event.preventDefault()
      setIsPointerDown(true)
      target.setPointerCapture(event.pointerId)
      const startHeight =
        snap === 'partial' && customHeight !== null
          ? customHeight
          : getBottomPanelSnapHeight(snap, window.innerHeight)
      dragRef.current = { startY: event.clientY, startHeight }
      let moved = false

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!dragRef.current) return
        const delta = dragRef.current.startY - moveEvent.clientY
        if (!moved && Math.abs(delta) < TAP_THRESHOLD) return
        moved = true
        const maxHeight = window.innerHeight - bottomPanelSizing.appHeaderHeight
        const nextHeight = Math.min(
          Math.max(dragRef.current.startHeight + delta, bottomPanelSizing.whisperHeight),
          maxHeight,
        )
        setDragHeight(nextHeight)
      }

      const onPointerUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        if (!dragRef.current) return

        const delta = dragRef.current.startY - upEvent.clientY
        const finalHeight = Math.max(
          dragRef.current.startHeight + delta,
          bottomPanelSizing.whisperHeight,
        )
        dragRef.current = null
        setDragHeight(null)
        setIsPointerDown(false)

        if (!moved) {
          if (snap === 'whisper') {
            setSnap('partial')
            setCustomHeight(null)
          }
          return
        }

        const resolved = getBottomPanelSnapFromHeight(finalHeight, window.innerHeight)
        if (resolved === 'whisper' || resolved === 'full') {
          setSnap(resolved)
          setCustomHeight(null)
        } else {
          setSnap('partial')
          setCustomHeight(finalHeight)
        }
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [customHeight, setSnap, snap],
  )

  return (
    <motion.div
      initial={{ y: 18, opacity: 0 }}
      animate={{ y: 0, opacity: 1, height: displayHeight }}
      transition={dragHeight !== null ? { duration: 0 } : { duration: 0.28, ease: 'easeOut' }}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-[var(--border-default)] bg-[var(--surface-raised)]/96 backdrop-blur-sm"
    >
      <div
        className={`flex shrink-0 ${isPointerDown ? 'cursor-grabbing' : 'cursor-grab'} items-center gap-3 border-b border-[var(--border-default)] px-4 py-2 touch-none select-none`}
        onPointerDown={onDragStart}
      >
        {isWhisper && dragHeight === null ? (
          <>
            <span className="text-xs font-medium text-[var(--text-secondary)]">Logs</span>
            {filteredLogs.length > 0 ? (
              <span className="rounded-[5px] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                {filteredLogs.length}
              </span>
            ) : null}
            <span className="text-xs font-medium text-[var(--text-secondary)]">Runs</span>
            {filteredJourneys.length > 0 ? (
              <span className="rounded-[5px] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                {filteredJourneys.length}
              </span>
            ) : null}
          </>
        ) : (
          <div className="flex flex-1 items-center gap-6">
            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--surface-inset)] p-1">
              {([['logs', 'Logs', flowLogs.length], ['traces', 'Runs', journeys.filter(isRunBackedJourney).length]] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={`inline-flex items-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    tab === value
                      ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                  onClick={() => setTab(value as PanelTab)}
                >
                  {label}
                  <span className="ml-1.5 rounded-[5px] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                    {count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex shrink-0 items-center rounded-lg bg-[var(--surface-inset)] p-1">
              {(['all', 'error'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    statusFilter === status
                      ? 'bg-[var(--text-primary)] text-[var(--surface-primary)]'
                      : 'bg-transparent text-[var(--text-muted)]'
                  }`}
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                placeholder={tab === 'logs' ? 'Search logs…' : 'Search runs…'}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 w-44 border-0 bg-[var(--surface-inset)] pl-8 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {tab === 'logs' ? (
                <button
                  type="button"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[10px] font-medium ${
                    liveTail
                      ? 'bg-[color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[var(--status-success)]'
                      : 'bg-[var(--surface-inset)] text-[var(--text-muted)]'
                  }`}
                  onClick={() => setLiveTail((prev) => !prev)}
                >
                  {liveTail ? (
                    <span className="inline-block h-1.5 w-1.5 animate-flow-pulse rounded-full bg-[var(--status-success)]" />
                  ) : null}
                  Live
                </button>
              ) : null}
              <Button
                type="button"
                variant="hud"
                size="icon"
                className="size-7"
                onClick={() => { setSnap(isFull ? 'partial' : 'full'); setCustomHeight(null) }}
                aria-label={isFull ? 'Exit full screen' : 'Full screen'}
              >
                {isFull ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </div>

      {!isWhisper || dragHeight !== null ? (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as PanelTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsContent value="logs" className="mt-0 flex min-h-0 flex-1 flex-col pt-0">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                <Radio className="size-8 text-[var(--text-muted)]" />
                <p className="text-sm text-[var(--text-secondary)]">{logsEmptyState.title}</p>
                <p className="text-xs text-[var(--text-muted)]">{logsEmptyState.body}</p>
              </div>
            ) : (
              <LogsTable
                logs={filteredLogs}
                nodeLabels={nodeLabels}
                nodeFamilies={nodeFamilies}
                selectedTraceId={selectedTraceId}
                selectedLogSeq={selectedLogSeq}
                liveTail={liveTail}
                scrollAreaRef={logsScrollAreaRef}
                onSelectLog={onSelectLog}
              />
            )}

            {!liveTail ? (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-none border-[var(--status-warning)] py-2 text-sm text-[var(--status-warning)] [background-color:color-mix(in_srgb,var(--status-warning)_12%,transparent)] hover:[background-color:color-mix(in_srgb,var(--status-warning)_16%,transparent)]"
                onClick={() => {
                  setLiveTail(true)
                  const viewport = getScrollViewport(logsScrollAreaRef.current)
                  if (viewport) {
                    viewport.scrollTop = 0
                  }
                }}
              >
                Live tail paused - click to resume
              </Button>
            ) : null}
          </TabsContent>

          <TabsContent value="traces" className="mt-0 flex min-h-0 flex-1 flex-col pt-0">
            {filteredJourneys.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                <Inbox className="size-8 text-[var(--text-muted)]" />
                <p className="text-sm text-[var(--text-secondary)]">{runsEmptyState.title}</p>
                <p className="text-xs text-[var(--text-muted)]">{runsEmptyState.body}</p>
              </div>
            ) : (
              <RunsTable
                journeys={filteredJourneys}
                selectedTraceId={selectedTraceId}
                onSelectTrace={onSelectTrace}
              />
            )}
          </TabsContent>
        </Tabs>
      ) : null}
    </motion.div>
  )
}
