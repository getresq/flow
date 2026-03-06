import { useCallback, useEffect, useMemo, useState } from 'react'

import { BottomLogPanel } from './core/components/BottomLogPanel'
import { eventMatchesFlow } from './core/events'
import { FlowCanvas } from './core/components/FlowCanvas'
import { FlowSelector } from './core/components/FlowSelector'
import { useEventPlayback } from './core/hooks/useEventPlayback'
import { NodeDetailPanel } from './core/components/NodeDetailPanel'
import { TraceDetailPanel } from './core/components/TraceDetailPanel'
import { useFlowAnimations } from './core/hooks/useFlowAnimations'
import { useLogStream } from './core/hooks/useLogStream'
import { DEFAULT_RELAY_WS_URL, useRelayConnection } from './core/hooks/useRelayConnection'
import { useTraceJourney } from './core/hooks/useTraceJourney'
import { useTraceTimeline } from './core/hooks/useTraceTimeline'
import type { FlowEvent, ThemeMode } from './core/types'
import { flows } from './flows'

const THEME_STORAGE_KEY = 'resq-flow-theme'
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

type SourceMode = 'live' | 'history'

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
  const from = new Date(fromIso)
  const to = new Date(toIso)
  const fromLabel = Number.isNaN(from.getTime()) ? fromIso : from.toLocaleTimeString()
  const toLabel = Number.isNaN(to.getTime()) ? toIso : to.toLocaleTimeString()
  return `${fromLabel} → ${toLabel}`
}

function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') {
    return stored
  }

  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
  return prefersLight ? 'light' : 'dark'
}

function App() {
  const [flowId, setFlowId] = useState(flows[0].id)
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [selectedTraceId, setSelectedTraceId] = useState<string | undefined>()
  const [focusActivePath, setFocusActivePath] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(resolveInitialTheme)
  const [sourceMode, setSourceMode] = useState<SourceMode>('live')
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

  const relay = useRelayConnection(relayWsUrl)

  const currentFlow = useMemo(
    () => flows.find((flow) => flow.id === flowId) ?? flows[0],
    [flowId],
  )

  const liveEvents = useMemo(
    () => relay.events.filter((event) => eventMatchesFlow(event, currentFlow.id)),
    [currentFlow.id, relay.events],
  )
  const historyEvents = useMemo(
    () => historyState.events.filter((event) => eventMatchesFlow(event, currentFlow.id)),
    [currentFlow.id, historyState.events],
  )
  const historyPlayback = useEventPlayback(historyEvents, { resetKey: historyState.resetKey })
  const runtimeSessionKey = `${sourceMode}:${currentFlow.id}:${sourceMode === 'history' ? historyState.resetKey : relay.resetKey}`
  const displayedEvents = sourceMode === 'history' ? historyPlayback.events : liveEvents
  const totalSourceEventCount = sourceMode === 'history' ? historyEvents.length : liveEvents.length

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
    setSelectedNodeId(undefined)
    setSelectedTraceId(undefined)
  }, [runtimeSessionKey])

  const clearAll = useCallback(() => {
    relay.clearEvents()
    setSourceMode('live')
    setHistoryState({ events: [], resetKey: 0 })
    setHistoryLoading(false)
    setHistoryError(undefined)
    setHistorySummary(undefined)
    setSelectedNodeId(undefined)
    setSelectedTraceId(undefined)
  }, [relay.clearEvents])

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
      setSourceMode('history')
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
  }, [currentFlow.id, historyQuery, historyWindow, relayWsUrl])

  const exitHistoryMode = useCallback(() => {
    setSourceMode('live')
    setHistoryState((previous) => ({
      events: [],
      resetKey: previous.resetKey + 1,
    }))
    setHistoryError(undefined)
    setHistorySummary(undefined)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.body.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const handleSelectNode = useCallback((nodeId?: string) => {
    setSelectedNodeId(nodeId)
    if (nodeId) {
      setSelectedTraceId(undefined)
    }
  }, [])

  const handleSelectTrace = useCallback((traceId?: string) => {
    setSelectedTraceId(traceId)
    if (traceId) {
      setSelectedNodeId(undefined)
    }
  }, [])

  const handleSelectFlow = useCallback((nextFlowId: string) => {
    setFlowId(nextFlowId)
    setSourceMode('live')
    setHistoryState((previous) => ({
      events: [],
      resetKey: previous.resetKey + 1,
    }))
    setHistoryError(undefined)
    setHistorySummary(undefined)
  }, [])

  const selectedNode = currentFlow.nodes.find((node) => node.id === selectedNodeId) ?? null

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100">
      <FlowSelector
        flows={flows}
        currentFlowId={flowId}
        connected={relay.connected}
        reconnecting={relay.reconnecting}
        relayWsUrl={relayWsUrl}
        displayedEventCount={displayedEvents.length}
        totalEventCount={totalSourceEventCount}
        queuedEventCount={sourceMode === 'history' ? historyPlayback.pendingCount : 0}
        playbackPaused={sourceMode === 'history' ? historyPlayback.paused : false}
        playbackSpeed={sourceMode === 'history' ? historyPlayback.speed : 1}
        focusActivePath={focusActivePath}
        theme={theme}
        historyMode={sourceMode === 'history'}
        historyLoading={historyLoading}
        historyWindow={historyWindow}
        historyQuery={historyQuery}
        historySummary={
          historySummary
            ? `${formatWindowSummary(historySummary.from, historySummary.to)} · ${historySummary.logCount} logs · ${historySummary.spanCount} spans${historySummary.truncated ? ' · truncated' : ''}${historySummary.warnings[0] ? ` · ${historySummary.warnings[0]}` : ''}`
            : undefined
        }
        historyError={historyError}
        onSelectFlow={handleSelectFlow}
        onPlaybackPauseToggle={historyPlayback.togglePaused}
        onPlaybackStep={() => {
          historyPlayback.pause()
          historyPlayback.stepForward()
        }}
        onPlaybackSpeedChange={historyPlayback.setSpeed}
        onToggleFocusActivePath={() => setFocusActivePath((previous) => !previous)}
        onToggleTheme={() => setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))}
        onHistoryWindowChange={setHistoryWindow}
        onHistoryQueryChange={setHistoryQuery}
        onLoadHistory={() => {
          void loadHistory()
        }}
        onExitHistory={exitHistoryMode}
        onClearSession={clearAll}
      />

      <div className="flex min-h-0 flex-1">
        <FlowCanvas
          flow={currentFlow}
          nodeStatuses={animations.nodeStatuses}
          activeEdges={animations.activeEdges}
          focusActivePath={focusActivePath}
          traceFocusNodeIds={traceFocus.nodeIds}
          traceFocusEdgeIds={traceFocus.edgeIds}
          theme={theme}
          nodeLogMap={logStream.nodeLogMap}
          nodeSpans={traceTimeline.nodeSpans}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />

        {selectedJourney ? (
          <TraceDetailPanel journey={selectedJourney} onClose={() => setSelectedTraceId(undefined)} />
        ) : null}

        {!selectedJourney && selectedNode ? (
          <NodeDetailPanel
            node={selectedNode}
            status={selectedNodeId ? animations.nodeStatuses.get(selectedNodeId) : undefined}
            logs={selectedNodeId ? logStream.nodeLogMap.get(selectedNodeId) ?? [] : []}
            spans={selectedNodeId ? traceTimeline.nodeSpans.get(selectedNodeId) ?? [] : []}
            onClose={() => setSelectedNodeId(undefined)}
          />
        ) : null}
      </div>

      <BottomLogPanel
        flow={currentFlow}
        globalLogs={logStream.globalLogs}
        journeys={traceJourney.journeys}
        selectedNodeId={selectedNodeId}
        selectedTraceId={selectedTraceId}
        onSelectNode={(nodeId) => handleSelectNode(nodeId)}
        onSelectTrace={handleSelectTrace}
      />
    </div>
  )
}

export default App
