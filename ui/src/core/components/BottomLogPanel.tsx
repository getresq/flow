import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Inbox, Radio } from 'lucide-react'

import {
  Button,
  Input,
  ScrollArea,
  Separator,
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

const MAX_HEIGHT_RATIO = 0.7

function getScrollViewport(root: HTMLDivElement | null) {
  return root?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
}

function resolveNodeDisplayLabel(nodeId: string, nodeLabels: Map<string, string>): string {
  const label = nodeLabels.get(nodeId)?.trim()
  return label || nodeId
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
  const [activeNodeFilters, setActiveNodeFilters] = useState<Set<string>>(new Set())
  const [pinnedTraceIds, setPinnedTraceIds] = useState<Set<string>>(new Set())
  const [liveTail, setLiveTail] = useState(true)
  const [showAllRuns, setShowAllRuns] = useState(false)
  const logsScrollAreaRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const previousExpandedHeightRef = useRef(Math.max(panelHeight, DEFAULT_BOTTOM_PANEL_HEIGHT))

  const collapsed = panelHeight <= MIN_BOTTOM_PANEL_HEIGHT
  const maximized = typeof window !== 'undefined' && panelHeight >= window.innerHeight * MAX_HEIGHT_RATIO - 4

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

  const activeNodeIds = useMemo(
    () => new Set(flowLogs.map((entry) => entry.nodeId).filter(Boolean) as string[]),
    [flowLogs],
  )

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...flowLogs]
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
        return buildLogSearchText(entry, nodeLabel).includes(query)
      })
  }, [activeNodeFilters, flowLogs, nodeLabels, search, selectedTraceId])

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
      body: 'Try clearing node filters or search to see more flow activity.',
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
        const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO
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

  const displayHeight = collapsed ? MIN_BOTTOM_PANEL_HEIGHT : panelHeight

  const toggleCollapsed = useCallback(() => {
    if (collapsed) {
      setPanelHeight(previousExpandedHeightRef.current || DEFAULT_BOTTOM_PANEL_HEIGHT)
      return
    }

    previousExpandedHeightRef.current = panelHeight
    setPanelHeight(MIN_BOTTOM_PANEL_HEIGHT)
  }, [collapsed, panelHeight, setPanelHeight])

  const toggleMaximized = useCallback(() => {
    const targetHeight = Math.round(window.innerHeight * MAX_HEIGHT_RATIO)
    if (maximized) {
      setPanelHeight(previousExpandedHeightRef.current || DEFAULT_BOTTOM_PANEL_HEIGHT)
      return
    }

    if (panelHeight > MIN_BOTTOM_PANEL_HEIGHT) {
      previousExpandedHeightRef.current = panelHeight
    }
    setPanelHeight(targetHeight)
  }, [maximized, panelHeight, setPanelHeight])

  return (
    <motion.div
      initial={{ y: 18, opacity: 0, height: displayHeight }}
      animate={{ y: 0, opacity: 1, height: displayHeight }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex flex-col border-t border-[var(--border-default)] bg-[var(--surface-raised)]/96 backdrop-blur-sm"
      style={{ minHeight: MIN_BOTTOM_PANEL_HEIGHT }}
    >
      <div
        className="flex h-1 cursor-row-resize items-center justify-center bg-[var(--border-subtle)] hover:bg-[var(--border-accent)]"
        onMouseDown={onDragStart}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PanelTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-[var(--border-default)] px-4 py-3">
          <TabsList className="shrink-0 border-0">
            <TabsTrigger value="logs" className="whitespace-nowrap">
              Logs
              <span className="ml-1.5 text-[var(--text-secondary)]">· {filteredLogs.length}</span>
            </TabsTrigger>
            <TabsTrigger value="traces" className="whitespace-nowrap">
              Runs
              <span className="ml-1.5 text-[var(--text-secondary)]">· {filteredJourneys.length}</span>
            </TabsTrigger>
          </TabsList>

          {tab === 'logs' ? (
            <>
              <Separator orientation="vertical" className="h-4 shrink-0" />
              <div
                className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto"
                style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' }}
              >
                <Button
                  type="button"
                  variant={activeNodeFilters.size === 0 ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={clearFilters}
                >
                  All
                </Button>
                {[...activeNodeIds]
                  .sort((left, right) =>
                    resolveNodeDisplayLabel(left, nodeLabels).localeCompare(
                      resolveNodeDisplayLabel(right, nodeLabels),
                    ),
                  )
                  .map((nodeId) => {
                  const active = activeNodeFilters.has(nodeId)
                  return (
                    <Button
                      key={nodeId}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      size="sm"
                      className="rounded-full"
                      onClick={() => toggleNodeFilter(nodeId)}
                    >
                      {resolveNodeDisplayLabel(nodeId, nodeLabels)}
                    </Button>
                  )
                })}
              </div>
            </>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {tab === 'traces' ? (
              <Toggle pressed={showAllRuns} size="sm" onPressedChange={setShowAllRuns} aria-label="Show all runs">
                Show all
              </Toggle>
            ) : null}
            <Input
              placeholder={tab === 'logs' ? 'Search logs…' : 'Search runs…'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-48"
            />
            <Button type="button" variant="ghost" size="sm" onClick={toggleMaximized}>
              {maximized ? 'Restore' : 'Maximize'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={toggleCollapsed}>
              {collapsed ? 'Expand' : 'Collapse'}
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
