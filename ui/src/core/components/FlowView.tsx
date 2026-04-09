import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useNavigate, useParams } from 'react-router-dom'

import { BottomLogPanel } from './BottomLogPanel'
import { CanvasHud } from './CanvasHud'
import { EventDetailContent } from './EventDetailContent'
import { getEventInspectorPresentation } from './EventInspectorPresentation'
import { eventMatchesFlow } from '../events'
import { FlowCanvas } from './FlowCanvas'
import { InspectorPanel } from './InspectorPanel'
import { LogsView } from './LogsView'
import { getNodeInspectorPresentation } from './NodeInspectorPresentation'
import { getTraceInspectorPresentation } from './TraceInspectorPresentation'
import { useEventPlayback } from '../hooks/useEventPlayback'
import { NodeDetailContent } from './NodeDetailPanel'
import { TraceDetailContent } from './TraceDetailPanel'
import { useFlowAnimations } from '../hooks/useFlowAnimations'
import { useLogStream } from '../hooks/useLogStream'
import { DEFAULT_RELAY_WS_URL, useRelayConnection } from '../hooks/useRelayConnection'
import { formatRunLabel } from '../runPresentation'
import { formatEasternTime } from '../time'
import { useTraceJourney } from '../hooks/useTraceJourney'
import { useTraceTimeline } from '../hooks/useTraceTimeline'
import { useUrlState } from '../hooks/useUrlState'
import type { FlowEvent, LogEntry } from '../types'
import { flows } from '../../flows'
import { useCommandPaletteStore } from '../../stores/commandPalette'
import { useLayoutStore } from '../../stores/layout'

const DEFAULT_HISTORY_WINDOW = '30m'

const HISTORY_WINDOW_OPTIONS: Record<string, number> = {
  '15m': 15 * 60,
  '30m': 30 * 60,
  '1h': 60 * 60,
  '6h': 6 * 60 * 60,
  '24h': 24 * 60 * 60,
}

interface HistoryResponse {
  from: string
  to: string
  flow_id?: string
  events: FlowEvent[]
  log_count: number
  span_count: number
  truncated: boolean
  warnings?: string[]
}

function windowToSeconds(window: string): number {
  return HISTORY_WINDOW_OPTIONS[window] ?? HISTORY_WINDOW_OPTIONS[DEFAULT_HISTORY_WINDOW]
}

function toHttpBase(wsUrl: string): string {
  try {
    const url = new URL(wsUrl)
    if (url.protocol === 'ws:') {
      url.protocol = 'http:'
    }
    if (url.protocol === 'wss:') {
      url.protocol = 'https:'
    }
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return 'http://localhost:4200'
  }
}

function formatWindowSummary(fromIso: string, toIso: string): string {
  return `${formatEasternTime(fromIso)} → ${formatEasternTime(toIso)}`
}

export function FlowView() {
  const navigate = useNavigate()
  const { flowId: flowIdParam } = useParams()
  const {
    hasModeParam,
    hasViewParam,
    selectedNodeId,
    selectedTraceId,
    selectedLogSeq,
    sourceMode,
    viewMode,
    updateUrlState,
    setSelectedNodeId,
    setSelectedLogSeq,
    setSelectedTraceId,
    setSourceMode,
    setViewMode,
  } = useUrlState()
  const theme = useLayoutStore((state) => state.theme)
  const setTheme = useLayoutStore((state) => state.setTheme)
  const bottomPanelSnap = useLayoutStore((state) => state.bottomPanelSnap)
  const setBottomPanelSnap = useLayoutStore((state) => state.setBottomPanelSnap)
  const registerCommandContext = useCommandPaletteStore((state) => state.registerContext)
  const clearCommandContext = useCommandPaletteStore((state) => state.clearContext)

  const [resetLayoutKey, setResetLayoutKey] = useState(0)
  const [historyState, setHistoryState] = useState<{ events: FlowEvent[]; resetKey: number }>({
    events: [],
    resetKey: 0,
  })
  const [historyWindow, setHistoryWindow] = useState(DEFAULT_HISTORY_WINDOW)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | undefined>()
  const [historySummary, setHistorySummary] = useState<{
    from: string
    to: string
    logCount: number
    spanCount: number
    truncated: boolean
    warnings: string[]
  }>()

  const relayWsUrl = DEFAULT_RELAY_WS_URL
  const {
    events: relayEvents,
    connected: relayConnected,
    reconnecting: relayReconnecting,
    resetKey: relayResetKey,
    clearEvents: clearRelayEvents,
  } = useRelayConnection(relayWsUrl)

  const currentFlow = useMemo(
    () => flows.find((flow) => flow.id === flowIdParam) ?? flows[0],
    [flowIdParam],
  )

  const previousFlowIdRef = useRef(currentFlow.id)
  const previousSessionKeyRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!flowIdParam && currentFlow) {
      navigate(`/flows/${currentFlow.id}?mode=live`, { replace: true })
      return
    }

    if (flowIdParam && !flows.some((flow) => flow.id === flowIdParam)) {
      navigate(`/flows/${flows[0].id}?mode=live`, { replace: true })
    }
  }, [currentFlow, flowIdParam, navigate])

  useEffect(() => {
    if (!hasModeParam) {
      setSourceMode('live', { replace: true })
    }
  }, [hasModeParam, setSourceMode])

  useEffect(() => {
    if (!hasViewParam) {
      setViewMode(currentFlow.hasGraph ? 'canvas' : 'logs', { replace: true })
    }
  }, [currentFlow.hasGraph, hasViewParam, setViewMode])

  // Sync URL view param with card snap state (graph flows only)
  useEffect(() => {
    if (!currentFlow.hasGraph) return

    if (bottomPanelSnap === 'full' && viewMode !== 'logs') {
      setViewMode('logs', { replace: true })
    } else if (bottomPanelSnap !== 'full' && viewMode === 'logs') {
      setViewMode('canvas', { replace: true })
    }
  }, [bottomPanelSnap, currentFlow.hasGraph, setViewMode, viewMode])

  // When URL navigates to view=logs on graph flows, expand panel to full.
  // Intentionally excludes bottomPanelSnap from deps — this should only
  // react to URL changes, not fight back when the user collapses the panel.
  useEffect(() => {
    if (!currentFlow.hasGraph) return
    if (viewMode === 'logs') {
      setBottomPanelSnap('full')
    }
  }, [currentFlow.hasGraph, setBottomPanelSnap, viewMode])

  const liveEvents = useMemo(
    () => relayEvents.filter((event) => eventMatchesFlow(event, currentFlow.id)),
    [currentFlow.id, relayEvents],
  )
  const historyEvents = useMemo(
    () => historyState.events.filter((event) => eventMatchesFlow(event, currentFlow.id)),
    [currentFlow.id, historyState.events],
  )
  const historyPlayback = useEventPlayback(historyEvents, { resetKey: historyState.resetKey })
  const runtimeSessionKey = `${sourceMode}:${currentFlow.id}:${sourceMode === 'history' ? historyState.resetKey : relayResetKey}`
  const displayedEvents = sourceMode === 'history' ? historyPlayback.events : liveEvents

  const animations = useFlowAnimations({
    events: displayedEvents,
    spanMapping: currentFlow.spanMapping,
    producerMapping: currentFlow.producerMapping,
    edges: currentFlow.edges,
    sessionKey: runtimeSessionKey,
  })
  const logStream = useLogStream(displayedEvents, currentFlow.spanMapping, runtimeSessionKey)
  const traceTimeline = useTraceTimeline(displayedEvents, currentFlow.spanMapping, runtimeSessionKey)
  const traceJourney = useTraceJourney(displayedEvents, currentFlow.spanMapping, runtimeSessionKey)

  const selectedJourney = useMemo(
    () => (selectedTraceId ? traceJourney.journeyByTraceId.get(selectedTraceId) : undefined),
    [selectedTraceId, traceJourney.journeyByTraceId],
  )
  const selectedLogEntry = useMemo(
    () => logStream.globalLogs.find((entry) => String(entry.seq) === selectedLogSeq),
    [logStream.globalLogs, selectedLogSeq],
  )

  const traceFocus = useMemo(() => {
    if (!selectedJourney || selectedJourney.nodePath.length === 0) {
      return {
        nodeIds: undefined as Set<string> | undefined,
        edgeIds: undefined as Set<string> | undefined,
      }
    }

    const nodeIds = new Set(selectedJourney.nodePath)
    const edgeIds = new Set<string>()
    const edgeLookup = new Map(currentFlow.edges.map((edge) => [`${edge.source}->${edge.target}`, edge.id]))
    for (let index = 1; index < selectedJourney.nodePath.length; index += 1) {
      const source = selectedJourney.nodePath[index - 1]
      const target = selectedJourney.nodePath[index]
      const edgeId = edgeLookup.get(`${source}->${target}`)
      if (edgeId) {
        edgeIds.add(edgeId)
      }
    }

    return {
      nodeIds,
      edgeIds,
    }
  }, [currentFlow.edges, selectedJourney])

  useEffect(() => {
    if (previousFlowIdRef.current === currentFlow.id) {
      return
    }

    previousFlowIdRef.current = currentFlow.id
    setHistoryState((previous) => ({
      events: [],
      resetKey: previous.resetKey + 1,
    }))
    setHistoryLoading(false)
    setHistoryError(undefined)
    setHistorySummary(undefined)
  }, [currentFlow.id])

  useEffect(() => {
    if (previousSessionKeyRef.current === runtimeSessionKey) {
      return
    }

    if (previousSessionKeyRef.current !== undefined) {
      updateUrlState({ node: null, run: null, log: null }, { replace: true })
    }

    previousSessionKeyRef.current = runtimeSessionKey
  }, [runtimeSessionKey, updateUrlState])

  const clearAll = useCallback(() => {
    clearRelayEvents()
    updateUrlState({ node: null, run: null, log: null, mode: 'live' }, { replace: true })
    setHistoryState({ events: [], resetKey: 0 })
    setHistoryLoading(false)
    setHistoryError(undefined)
    setHistorySummary(undefined)
  }, [clearRelayEvents, updateUrlState])

  const loadHistory = useCallback(async () => {
    const now = new Date()
    const seconds = windowToSeconds(historyWindow)
    const from = new Date(now.getTime() - seconds * 1_000)
    const relayHttpBase = toHttpBase(relayWsUrl)

    const url = new URL('/v1/history', relayHttpBase)
    url.searchParams.set('from', from.toISOString())
    url.searchParams.set('to', now.toISOString())
    url.searchParams.set('window', historyWindow)
    url.searchParams.set('limit', '12000')
    url.searchParams.set('flow_id', currentFlow.id)
    if (historyQuery.trim()) {
      url.searchParams.set('query', historyQuery.trim())
    }

    setHistoryLoading(true)
    setHistoryError(undefined)
    setHistorySummary(undefined)

    try {
      const response = await fetch(url.toString())
      if (!response.ok) {
        const body = await response.text()
        throw new Error(body || `history request failed (${response.status})`)
      }
      const payload = (await response.json()) as HistoryResponse
      const events = Array.isArray(payload.events) ? payload.events : []

      setHistoryState((previous) => ({
        events,
        resetKey: previous.resetKey + 1,
      }))
      setSourceMode('history', { replace: true })
      setHistorySummary({
        from: payload.from,
        to: payload.to,
        logCount: payload.log_count,
        spanCount: payload.span_count,
        truncated: payload.truncated,
        warnings: payload.warnings ?? [],
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to load history'
      setHistoryError(message)
    } finally {
      setHistoryLoading(false)
    }
  }, [currentFlow.id, historyQuery, historyWindow, relayWsUrl, setSourceMode])

  const exitHistoryMode = useCallback(() => {
    setSourceMode('live', { replace: true })
    setHistoryState((previous) => ({
      events: [],
      resetKey: previous.resetKey + 1,
    }))
    setHistoryError(undefined)
    setHistorySummary(undefined)
  }, [setSourceMode])

  const handleSelectViewMode = useCallback(
    (mode: 'canvas' | 'metrics' | 'logs') => {
      if (!currentFlow.hasGraph) return

      if (mode === 'logs') {
        setBottomPanelSnap('full')
      } else {
        if (bottomPanelSnap === 'full') {
          setBottomPanelSnap('partial')
        }
      }
    },
    [bottomPanelSnap, currentFlow.hasGraph, setBottomPanelSnap],
  )

  const handleSelectNode = useCallback(
    (nodeId?: string) => {
      updateUrlState(
        {
          node: nodeId ?? null,
          run: nodeId ? null : undefined,
          log: nodeId ? null : undefined,
        },
        { replace: true },
      )
    },
    [updateUrlState],
  )

  const handleSelectTrace = useCallback(
    (traceId?: string) => {
      updateUrlState(
        {
          node: traceId ? null : undefined,
          run: traceId ?? null,
          log: traceId ? null : undefined,
        },
        { replace: true },
      )
    },
    [updateUrlState],
  )

  const handleSelectLog = useCallback(
    (entry: LogEntry) => {
      if (entry.seq != null) {
        updateUrlState(
          {
            log: String(entry.seq),
            node: null,
            run: null,
          },
          { replace: true },
        )
        return
      }

      const executionId = entry.runId ?? entry.traceId
      if (executionId) {
        handleSelectTrace(executionId)
      }
    },
    [handleSelectTrace, updateUrlState],
  )

  const handleNavigateBack = useCallback(() => {
    navigate('/flows')
  }, [navigate])

  const selectedNode = currentFlow.nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedNodeStatus = selectedNodeId ? animations.nodeStatuses.get(selectedNodeId) : undefined
  const selectedNodeLogs = selectedNodeId ? logStream.nodeLogMap.get(selectedNodeId) ?? [] : []
  const selectedNodeSpans = selectedNodeId ? traceTimeline.nodeSpans.get(selectedNodeId) ?? [] : []
  const selectedLogNode = selectedLogEntry
    ? currentFlow.nodes.find((node) => node.id === selectedLogEntry.nodeId) ?? null
    : null
  const selectedLogExecutionId = selectedLogEntry?.runId ?? selectedLogEntry?.traceId
  const selectedLogHasJourney = selectedLogExecutionId
    ? traceJourney.journeyByTraceId.has(selectedLogExecutionId)
    : false
  const commandRunOptions = useMemo(
    () =>
      traceJourney.journeys.slice(0, 12).map((journey) => ({
        traceId: journey.traceId,
        label: formatRunLabel(journey),
      })),
    [traceJourney.journeys],
  )
  const handleCommandPaletteEscape = useCallback(() => {
    if (selectedLogEntry) {
      setSelectedLogSeq(undefined, { replace: true })
      return
    }

    if (selectedJourney) {
      setSelectedTraceId(undefined, { replace: true })
      return
    }

    if (selectedNode) {
      setSelectedNodeId(undefined, { replace: true })
    }
  }, [
    selectedLogEntry,
    selectedJourney,
    selectedNode,
    setSelectedNodeId,
    setSelectedLogSeq,
    setSelectedTraceId,
  ])

  useEffect(() => {
    registerCommandContext({
      runOptions: commandRunOptions,
      onSelectViewMode: handleSelectViewMode,
      onClearLogs: clearAll,
      onEscape: handleCommandPaletteEscape,
    })

    return () => clearCommandContext()
  }, [
    clearAll,
    clearCommandContext,
    commandRunOptions,
    handleCommandPaletteEscape,
    handleSelectViewMode,
    registerCommandContext,
  ])

  const hudSharedProps = {
    flowName: currentFlow.name,
    connected: relayConnected,
    reconnecting: relayReconnecting,
    relayWsUrl,
    theme,
    onNavigateBack: handleNavigateBack,
    onToggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    onResetLayout: () => setResetLayoutKey((k) => k + 1),
    onClearLogs: clearAll,
  } as const

  if (!currentFlow.hasGraph) {
    return (
      <div className="relative flex h-full w-full flex-col bg-[var(--surface-raised)] text-[var(--text-primary)]">
        <CanvasHud
          variant="inline"
          showCanvasControls={false}
          {...hudSharedProps}
        />
        <div className="relative min-h-0 flex-1">
          <LogsView
            flow={currentFlow}
            logs={logStream.globalLogs}
            selectedTraceId={selectedTraceId}
            sourceMode={sourceMode}
            onSelectNode={handleSelectNode}
            onSelectTrace={handleSelectTrace}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-[var(--surface-primary)] text-[var(--text-primary)]">
      <div className="relative min-h-0 flex-1">
        <FlowCanvas
          flow={currentFlow}
          nodeStatuses={animations.nodeStatuses}
          activeEdges={animations.activeEdges}
          traceFocusNodeIds={traceFocus.nodeIds}
          traceFocusEdgeIds={traceFocus.edgeIds}
          theme={theme}
          nodeLogMap={logStream.nodeLogMap}
          nodeSpans={traceTimeline.nodeSpans}
          selectedNodeId={selectedNodeId}
          resetLayoutKey={resetLayoutKey}
          onSelectNode={handleSelectNode}
        />

        {bottomPanelSnap === 'full' ? (
          <div className="absolute inset-x-0 top-0 z-50">
            <CanvasHud
              variant="inline"
              showCanvasControls
              {...hudSharedProps}
            />
          </div>
        ) : (
          <CanvasHud
            variant="floating"
            showCanvasControls
            {...hudSharedProps}
          />
        )}
      </div>

      <BottomLogPanel
        flow={currentFlow}
        globalLogs={logStream.globalLogs}
        journeys={traceJourney.journeys}
        selectedTraceId={selectedTraceId}
        onSelectNode={handleSelectNode}
        onSelectLog={handleSelectLog}
        onSelectTrace={handleSelectTrace}
      />

      {(() => {
        if (selectedJourney) {
          const presentation = getTraceInspectorPresentation(selectedJourney)

          return (
            <AnimatePresence initial={false}>
              <InspectorPanel
                title={presentation.title}
                description={presentation.description}
                headerContent={presentation.headerContent}
                onClose={() => setSelectedTraceId(undefined, { replace: true })}
              >
                <TraceDetailContent
                  key={selectedJourney.traceId}
                  journey={selectedJourney}
                  spans={selectedTraceId ? traceTimeline.traceTree.get(selectedTraceId) ?? [] : []}
                  onSelectNode={(nodeId) => handleSelectNode(nodeId)}
                />
              </InspectorPanel>
            </AnimatePresence>
          )
        }

        if (selectedLogEntry) {
          const presentation = getEventInspectorPresentation(selectedLogEntry, selectedLogNode?.label)

          return (
            <AnimatePresence initial={false}>
              <InspectorPanel
                title={presentation.title}
                description={presentation.description}
                headerContent={presentation.headerContent}
                onClose={() => setSelectedLogSeq(undefined, { replace: true })}
              >
                <EventDetailContent
                  entry={selectedLogEntry}
                  hasJourney={selectedLogHasJourney}
                  onOpenRun={(traceId) => updateUrlState({ run: traceId, node: null }, { replace: true })}
                />
              </InspectorPanel>
            </AnimatePresence>
          )
        }

        if (selectedNode) {
          const presentation = getNodeInspectorPresentation(selectedNode)

          return (
            <AnimatePresence initial={false}>
              <InspectorPanel
                title={presentation.title}
                description={presentation.description}
                headerContent={presentation.headerContent}
                onClose={() => setSelectedNodeId(undefined, { replace: true })}
              >
                <NodeDetailContent
                  key={selectedNode.id}
                  node={selectedNode}
                  status={selectedNodeStatus}
                  logs={selectedNodeLogs}
                  spans={selectedNodeSpans}
                  onOpenRun={(traceId) => updateUrlState({ run: traceId, log: null }, { replace: true })}
                />
              </InspectorPanel>
            </AnimatePresence>
          )
        }

        return null
      })()}

    </div>
  )
}
