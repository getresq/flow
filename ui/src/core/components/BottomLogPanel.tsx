import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronDown, Inbox, Radio, Search } from 'lucide-react'

import {
  Button,
  Input,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
} from '@/components/ui'

import type { FlowConfig, LogEntry, TraceJourney } from '../types'
import { formatRunLabel, formatStepDisplayLabel, isDefaultVisibleJourney } from '../runPresentation'
import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  MIN_BOTTOM_PANEL_HEIGHT,
  useLayoutStore,
} from '../../stores/layout'
import { buildLogSearchText } from '../logPresentation'
import { LogsTable } from './LogsTable'
import { RunsTable } from './RunsTable'

interface BottomLogPanelProps {
  flow: FlowConfig
  globalLogs: LogEntry[]
  journeys: TraceJourney[]
  selectedTraceId?: string
  onSelectNode: (nodeId: string) => void
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
  onSelectNode,
  onSelectTrace,
}: BottomLogPanelProps) {
  const panelHeight = useLayoutStore((state) => state.bottomPanelHeight)
  const setPanelHeight = useLayoutStore((state) => state.setBottomPanelHeight)
  const tab = useLayoutStore((state) => state.bottomPanelTab)
  const setTab = useLayoutStore((state) => state.setBottomPanelTab)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'error'>('all')
  const [pinnedTraceIds, setPinnedTraceIds] = useState<Set<string>>(new Set())
  const [liveTail, setLiveTail] = useState(true)
  const [showAllRuns, setShowAllRuns] = useState(false)
  const logsScrollAreaRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const previousExpandedHeightRef = useRef(Math.max(panelHeight, DEFAULT_BOTTOM_PANEL_HEIGHT))

  const collapsed = panelHeight <= MIN_BOTTOM_PANEL_HEIGHT

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
        if (statusFilter !== 'all' && entry.level !== statusFilter) {
          return false
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
    const ordered = [...journeys].sort((left, right) => {
      const pinnedLeft = pinnedTraceIds.has(left.traceId)
      const pinnedRight = pinnedTraceIds.has(right.traceId)
      if (pinnedLeft !== pinnedRight) {
        return pinnedLeft ? -1 : 1
      }
      return Date.parse(right.lastUpdatedAt) - Date.parse(left.lastUpdatedAt)
    })

    if (!query) {
      return showAllRuns ? ordered : ordered.filter((journey) => isDefaultVisibleJourney(journey))
    }

    return ordered.filter((journey) => {
      if (!showAllRuns && !isDefaultVisibleJourney(journey)) {
        return false
      }
      const stage = journey.stages.at(-1)
      return (
        journey.traceId.toLowerCase().includes(query) ||
        formatRunLabel(journey).toLowerCase().includes(query) ||
        (stage ? formatStepDisplayLabel(stage).toLowerCase().includes(query) : false) ||
        (journey.errorSummary?.toLowerCase().includes(query) ?? false)
      )
    })
  }, [journeys, pinnedTraceIds, search, showAllRuns])

  const logsEmptyState = useMemo(() => {
    if (flowLogs.length === 0) {
      return {
        title: 'Waiting for activity',
        body: 'Logs will appear here when the flow runs.',
      }
    }

    return {
      title: 'No logs match the current filters',
      body: 'Try clearing search to see more flow activity.',
    }
  }, [flowLogs.length])

  const runsEmptyState = useMemo(() => {
    if (journeys.length === 0) {
      return {
        title: 'Waiting for activity',
        body: 'Runs will appear here when the flow runs.',
      }
    }

    if (!showAllRuns) {
      return {
        title: 'No lifecycle runs yet',
        body: 'Turn on Show all to inspect queue and worker runs.',
      }
    }

    return {
      title: 'No runs match the current filters',
      body: 'Try clearing search to see more runs.',
    }
  }, [journeys.length, showAllRuns])


  useEffect(() => {
    if (panelHeight > MIN_BOTTOM_PANEL_HEIGHT) {
      previousExpandedHeightRef.current = panelHeight
    }
  }, [panelHeight])

  useEffect(() => {
    if (!liveTail || collapsed || tab !== 'logs') {
      return
    }
    const viewport = getScrollViewport(logsScrollAreaRef.current)
    if (!viewport) {
      return
    }
    viewport.scrollTop = 0
  }, [collapsed, filteredLogs, liveTail, tab])

  useEffect(() => {
    if (collapsed || tab !== 'logs') {
      return
    }

    const viewport = getScrollViewport(logsScrollAreaRef.current)
    if (!viewport) {
      return
    }

    const onScroll = () => {
      setLiveTail(viewport.scrollTop < 12)
    }

    viewport.addEventListener('scroll', onScroll)
    onScroll()

    return () => viewport.removeEventListener('scroll', onScroll)
  }, [collapsed, tab])

  const onDragStart = useCallback(
    (event: React.MouseEvent) => {
      dragRef.current = { startY: event.clientY, startHeight: panelHeight }
      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!dragRef.current) {
          return
        }
        const maxHeight = window.innerHeight * 0.7
        const delta = dragRef.current.startY - moveEvent.clientY
        const nextHeight = Math.min(
          Math.max(dragRef.current.startHeight + delta, MIN_BOTTOM_PANEL_HEIGHT),
          maxHeight,
        )
        setPanelHeight(nextHeight)
      }
      const onMouseUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [panelHeight, setPanelHeight],
  )

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

  const displayHeight = collapsed ? MIN_BOTTOM_PANEL_HEIGHT : panelHeight

  const toggleCollapsed = useCallback(() => {
    if (collapsed) {
      setPanelHeight(previousExpandedHeightRef.current || DEFAULT_BOTTOM_PANEL_HEIGHT)
      return
    }

    previousExpandedHeightRef.current = panelHeight
    setPanelHeight(MIN_BOTTOM_PANEL_HEIGHT)
  }, [collapsed, panelHeight, setPanelHeight])

  return (
    <motion.div
      initial={{ y: 18, opacity: 0, height: displayHeight }}
      animate={{ y: 0, opacity: 1, height: displayHeight }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex flex-col border-t border-[var(--border-default)] bg-[var(--surface-raised)]/96 backdrop-blur-sm"
      style={{ minHeight: MIN_BOTTOM_PANEL_HEIGHT }}
    >
      <div
        className="flex h-5 cursor-row-resize items-center justify-center"
        onMouseDown={onDragStart}
      >
        <div className="h-[3px] w-8 rounded-full bg-[var(--text-muted)] opacity-30" />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PanelTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-[var(--border-default)] px-4 py-3">
          <TabsList className="shrink-0 border-0">
            <TabsTrigger value="logs" className="whitespace-nowrap">
              Logs
              <span className="ml-1.5 rounded-[5px] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                {filteredLogs.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="traces" className="whitespace-nowrap">
              Runs
              <span className="ml-1.5 rounded-[5px] bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                {filteredJourneys.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {tab === 'traces' ? (
              <Toggle pressed={showAllRuns} size="sm" onPressedChange={setShowAllRuns} aria-label="Show all runs">
                Show all
              </Toggle>
            ) : null}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                placeholder={tab === 'logs' ? 'Search logs…' : 'Search runs…'}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-48 border-0 bg-[var(--surface-inset)] pl-8 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            {tab === 'logs' ? (
              <div className="flex items-center overflow-hidden rounded-lg bg-[var(--surface-inset)]">
                {(['all', 'error'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`px-3 py-1 text-[10px] font-medium capitalize ${
                      statusFilter === status
                        ? 'rounded-lg bg-[var(--text-primary)] text-[var(--surface-primary)]'
                        : 'bg-transparent text-[var(--text-muted)]'
                    }`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            ) : null}
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
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <ChevronDown className={`size-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        {!collapsed ? (
          <>
            <TabsContent value="logs" className="mt-0 flex min-h-0 flex-1 flex-col pt-0">
              <ScrollArea ref={logsScrollAreaRef} className="flex-1">
                {filteredLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
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
                    onSelectLog={(entry) => {
                      const executionId = entry.runId ?? entry.traceId
                      if (executionId) {
                        onSelectTrace(executionId)
                      }
                      if (entry.nodeId) {
                        onSelectNode(entry.nodeId)
                      }
                    }}
                  />
                )}
              </ScrollArea>

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
              <ScrollArea className="flex-1">
                {filteredJourneys.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <Inbox className="size-8 text-[var(--text-muted)]" />
                    <p className="text-sm text-[var(--text-secondary)]">{runsEmptyState.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{runsEmptyState.body}</p>
                  </div>
                ) : (
                  <RunsTable
                    journeys={filteredJourneys}
                    selectedTraceId={selectedTraceId}
                    pinnedTraceIds={pinnedTraceIds}
                    onSelectTrace={onSelectTrace}
                    onTogglePinned={togglePinnedTrace}
                  />
                )}
              </ScrollArea>
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </motion.div>
  )
}
