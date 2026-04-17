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
import { NodeDetailContent } from './NodeDetailPanel'
import { TraceDetailContent } from './TraceDetailPanel'
import { useFlowAnimations } from '../hooks/useFlowAnimations'
import { useFlowActivity } from '../hooks/useFlowActivity'
import { useLogStream } from '../hooks/useLogStream'
import { DEFAULT_RELAY_WS_URL, useRelayConnection } from '../hooks/useRelayConnection'
import { getLogSelectionId } from '../logPresentation'
import { formatRunLabel, getJourneyOverviewModel } from '../runPresentation'
import { useTraceJourney } from '../hooks/useTraceJourney'
import { useTraceTimeline } from '../hooks/useTraceTimeline'
import { useUrlState } from '../hooks/useUrlState'
import type { LogEntry } from '../types'
import { flows } from '../../flows'
import { useCommandPaletteStore } from '../../stores/commandPalette'
import { useLayoutStore } from '../../stores/layout'

type SidebarEntry =
  | { type: 'node'; nodeId: string }
  | { type: 'run'; runId: string }
  | { type: 'log'; logSeq: string }

const BACK_STACK_LIMIT = 3

function formatRunBreadcrumb(runId: string): string {
  return runId.length > 16 ? `Run ${runId.slice(0, 12)}\u2026` : `Run ${runId}`
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
    runTab,
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

  const relayWsUrl = DEFAULT_RELAY_WS_URL
  const {
    events: relayEvents,
    connected: relayConnected,
    reconnecting: relayReconnecting,
    resetKey: relayResetKey,
    wasTruncated: relayWasTruncated,
    clearEvents: clearRelayEvents,
  } = useRelayConnection(relayWsUrl)

  const currentFlow = useMemo(
    () => flows.find((flow) => flow.id === flowIdParam) ?? flows[0],
    [flowIdParam],
  )

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
  const flowActivity = useFlowActivity({
    flowId: currentFlow.id,
    wsUrl: relayWsUrl,
    liveEvents,
    wasLiveBufferTruncated: relayWasTruncated,
  })
  const runtimeSessionKey = `${currentFlow.id}:${relayResetKey}`
  const displayedEvents = flowActivity.events

  const animations = useFlowAnimations({
    events: liveEvents,
    spanMapping: currentFlow.spanMapping,
    producerMapping: currentFlow.producerMapping,
    edges: currentFlow.edges,
    resourceNodeIds: currentFlow.nodes.filter((node) => node.type === 'cylinder').map((node) => node.id),
    sessionKey: runtimeSessionKey,
  })
  const logStream = useLogStream(displayedEvents, currentFlow.spanMapping, runtimeSessionKey)
  // Logs and runs backfill from retained history, but the timing waterfall stays live-driven in
  // v1 so we do not invent older span timing we do not actually have.
  const traceTimeline = useTraceTimeline(liveEvents, currentFlow.spanMapping, runtimeSessionKey)
  const traceJourney = useTraceJourney(displayedEvents, currentFlow.spanMapping, runtimeSessionKey)

  const selectedJourney = useMemo(
    () => (selectedTraceId ? traceJourney.journeyByTraceId.get(selectedTraceId) : undefined),
    [selectedTraceId, traceJourney.journeyByTraceId],
  )
  const selectedJourneyOverview = useMemo(
    () =>
      selectedJourney
        ? getJourneyOverviewModel(selectedJourney, currentFlow.nodes, currentFlow.edges)
        : undefined,
    [currentFlow.edges, currentFlow.nodes, selectedJourney],
  )
  const selectedLogEntry = useMemo(
    () =>
      logStream.globalLogs.find((entry) => getLogSelectionId(entry) === selectedLogSeq),
    [logStream.globalLogs, selectedLogSeq],
  )

  const traceFocus = useMemo(() => {
    if (!selectedJourney || !selectedJourneyOverview) {
      return {
        nodeIds: undefined as Set<string> | undefined,
        edgeIds: undefined as Set<string> | undefined,
      }
    }

    if (selectedJourneyOverview.focusNodeIds.length === 0) {
      return {
        nodeIds: undefined as Set<string> | undefined,
        edgeIds: undefined as Set<string> | undefined,
      }
    }

    return {
      nodeIds: new Set(selectedJourneyOverview.focusNodeIds),
      edgeIds: new Set(selectedJourneyOverview.focusEdgeIds),
    }
  }, [selectedJourney, selectedJourneyOverview])

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
    flowActivity.resetRetainedHistory()
    clearRelayEvents()
    updateUrlState({ node: null, run: null, log: null, mode: 'live' }, { replace: true })
  }, [clearRelayEvents, flowActivity, updateUrlState])

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

  const [backStack, setBackStack] = useState<SidebarEntry[]>([])

  const currentEntry = useCallback((): SidebarEntry | null => {
    if (selectedLogSeq) return { type: 'log', logSeq: selectedLogSeq }
    if (selectedTraceId) return { type: 'run', runId: selectedTraceId }
    if (selectedNodeId) return { type: 'node', nodeId: selectedNodeId }
    return null
  }, [selectedLogSeq, selectedNodeId, selectedTraceId])

  const applyPanel = useCallback(
    (target: SidebarEntry | null) => {
      updateUrlState(
        {
          node: target?.type === 'node' ? target.nodeId : null,
          run: target?.type === 'run' ? target.runId : null,
          log: target?.type === 'log' ? target.logSeq : null,
          runTab: target?.type === 'run' ? undefined : null,
          panel: null,
        },
        { replace: true },
      )
    },
    [updateUrlState],
  )

  const pushDrill = useCallback(
    (target: SidebarEntry) => {
      const previous = currentEntry()
      setBackStack((stack) =>
        previous ? [...stack, previous].slice(-BACK_STACK_LIMIT) : stack,
      )
      applyPanel(target)
    },
    [applyPanel, currentEntry],
  )

  const popBack = useCallback(() => {
    setBackStack((stack) => {
      const previous = stack.at(-1)
      if (!previous) return stack
      applyPanel(previous)
      return stack.slice(0, -1)
    })
  }, [applyPanel])

  const closeSidebar = useCallback(() => {
    setBackStack([])
    applyPanel(null)
  }, [applyPanel])

  const selectTopLevel = useCallback(
    (target: SidebarEntry | null) => {
      setBackStack([])
      applyPanel(target)
    },
    [applyPanel],
  )

  const handleSelectNode = useCallback(
    (nodeId?: string) => {
      selectTopLevel(nodeId ? { type: 'node', nodeId } : null)
    },
    [selectTopLevel],
  )

  const handleSelectTrace = useCallback(
    (traceId?: string) => {
      selectTopLevel(traceId ? { type: 'run', runId: traceId } : null)
    },
    [selectTopLevel],
  )

  const handleSelectLog = useCallback(
    (entry: LogEntry) => {
      const logSeq = getLogSelectionId(entry)
      if (!logSeq) return
      selectTopLevel({ type: 'log', logSeq })
    },
    [selectTopLevel],
  )

  const drillToRun = useCallback(
    (traceId: string) => pushDrill({ type: 'run', runId: traceId }),
    [pushDrill],
  )
  const drillToNode = useCallback(
    (nodeId: string) => pushDrill({ type: 'node', nodeId }),
    [pushDrill],
  )
  const drillToLog = useCallback(
    (entry: LogEntry) => {
      const logSeq = getLogSelectionId(entry)
      if (!logSeq) return
      pushDrill({ type: 'log', logSeq })
    },
    [pushDrill],
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
  const backLabel = useMemo(() => {
    const top = backStack.at(-1)
    if (!top) return undefined
    if (top.type === 'node') {
      return currentFlow.nodes.find((n) => n.id === top.nodeId)?.label ?? 'Node'
    }
    if (top.type === 'run') return formatRunBreadcrumb(top.runId)
    return 'Log'
  }, [backStack, currentFlow.nodes])
  const canGoBack = backStack.length > 0
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
            isBackfilling={flowActivity.isBackfilling}
            hasMoreOlder={flowActivity.hasMoreOlder}
            historyLimitReached={flowActivity.historyLimitReached}
            wasLiveBufferTruncated={flowActivity.wasLiveBufferTruncated}
            onLoadOlder={flowActivity.loadOlder}
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
        selectedLogSeq={selectedLogSeq}
        isBackfilling={flowActivity.isBackfilling}
        hasMoreOlder={flowActivity.hasMoreOlder}
        historyLimitReached={flowActivity.historyLimitReached}
        wasLiveBufferTruncated={flowActivity.wasLiveBufferTruncated}
        onLoadOlder={flowActivity.loadOlder}
        onSelectNode={handleSelectNode}
        onSelectLog={handleSelectLog}
        onSelectTrace={handleSelectTrace}
      />

      <AnimatePresence>
        {(() => {
          // URL carries exactly one of node/run/log. Back stack is memory-only
          // and handles multi-level drill-down. Log wins if set, then Run, then Node.
          if (selectedLogEntry) {
            const presentation = getEventInspectorPresentation(
              selectedLogEntry,
              selectedLogNode?.label,
              drillToNode,
            )

            return (
              <InspectorPanel
                key="inspector"
                title={presentation.title}
                description={presentation.description}
                headerContent={presentation.headerContent}
                onBack={canGoBack ? popBack : undefined}
                backLabel={canGoBack ? backLabel : undefined}
                onClose={closeSidebar}
              >
                <EventDetailContent
                  entry={selectedLogEntry}
                  hasJourney={selectedLogHasJourney}
                  onOpenRun={drillToRun}
                />
              </InspectorPanel>
            )
          }

          if (selectedJourney) {
            const presentation = getTraceInspectorPresentation(selectedJourney, currentFlow.nodes, currentFlow.edges)

            return (
              <InspectorPanel
                key="inspector"
                title={presentation.title}
                description={presentation.description}
                headerContent={presentation.headerContent}
                onBack={canGoBack ? popBack : undefined}
                backLabel={canGoBack ? backLabel : undefined}
                onClose={closeSidebar}
              >
                <TraceDetailContent
                  key={selectedJourney.traceId}
                  journey={selectedJourney}
                  flowNodes={currentFlow.nodes}
                  flowEdges={currentFlow.edges}
                  spans={selectedTraceId ? traceTimeline.traceTree.get(selectedTraceId) ?? [] : []}
                  initialTab={runTab === 'timing' ? 'timing' : 'overview'}
                  onTabChange={(tab) => updateUrlState({ runTab: tab === 'overview' ? null : tab }, { replace: true })}
                  onSelectNode={drillToNode}
                />
              </InspectorPanel>
            )
          }

          if (selectedNode) {
            const presentation = getNodeInspectorPresentation(selectedNode)

            return (
              <InspectorPanel
                key="inspector"
                title={presentation.title}
                description={presentation.description}
                headerContent={presentation.headerContent}
                onBack={canGoBack ? popBack : undefined}
                backLabel={canGoBack ? backLabel : undefined}
                onClose={closeSidebar}
              >
                <NodeDetailContent
                  key={selectedNode.id}
                  node={selectedNode}
                  status={selectedNodeStatus}
                  logs={selectedNodeLogs}
                  spans={selectedNodeSpans}
                  onOpenRun={drillToRun}
                  onOpenLog={drillToLog}
                />
              </InspectorPanel>
            )
          }

          return null
        })()}
      </AnimatePresence>

    </div>
  )
}
