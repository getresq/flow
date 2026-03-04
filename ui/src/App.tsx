import { useCallback, useEffect, useMemo, useState } from 'react'

import { BottomLogPanel } from './core/components/BottomLogPanel'
import { FlowCanvas } from './core/components/FlowCanvas'
import { FlowSelector } from './core/components/FlowSelector'
import { useEventPlayback } from './core/hooks/useEventPlayback'
import { NodeDetailPanel } from './core/components/NodeDetailPanel'
import { useFlowAnimations } from './core/hooks/useFlowAnimations'
import { useLogStream } from './core/hooks/useLogStream'
import { DEFAULT_RELAY_WS_URL, useRelayConnection } from './core/hooks/useRelayConnection'
import { useTraceTimeline } from './core/hooks/useTraceTimeline'
import type { ThemeMode } from './core/types'
import { flows } from './flows'

const THEME_STORAGE_KEY = 'resq-flow-theme'

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
  const [focusActivePath, setFocusActivePath] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(resolveInitialTheme)
  const relayWsUrl = DEFAULT_RELAY_WS_URL

  const relay = useRelayConnection(relayWsUrl)
  const playback = useEventPlayback(relay.events)

  const currentFlow = useMemo(
    () => flows.find((flow) => flow.id === flowId) ?? flows[0],
    [flowId],
  )

  const animations = useFlowAnimations({
    events: playback.events,
    spanMapping: currentFlow.spanMapping,
    edges: currentFlow.edges,
  })
  const logStream = useLogStream(playback.events, currentFlow.spanMapping)
  const traceTimeline = useTraceTimeline(playback.events, currentFlow.spanMapping)

  const clearAll = useCallback(() => {
    relay.clearEvents()
    playback.clearPlayback()
    animations.clearStatuses()
    logStream.clearSession()
    traceTimeline.clearTraces()
    setSelectedNodeId(undefined)
  }, [
    animations.clearStatuses,
    logStream.clearSession,
    playback.clearPlayback,
    relay.clearEvents,
    traceTimeline.clearTraces,
  ])

  useEffect(() => {
    clearAll()
  }, [flowId, clearAll])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.body.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const selectedNode = currentFlow.nodes.find((node) => node.id === selectedNodeId) ?? null

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100">
      <FlowSelector
        flows={flows}
        currentFlowId={flowId}
        connected={relay.connected}
        reconnecting={relay.reconnecting}
        relayWsUrl={relayWsUrl}
        displayedEventCount={playback.events.length}
        totalEventCount={relay.events.length}
        queuedEventCount={playback.pendingCount}
        playbackPaused={playback.paused}
        playbackSpeed={playback.speed}
        focusActivePath={focusActivePath}
        theme={theme}
        onSelectFlow={setFlowId}
        onPlaybackPauseToggle={playback.togglePaused}
        onPlaybackStep={() => {
          playback.pause()
          playback.stepForward()
        }}
        onPlaybackSpeedChange={playback.setSpeed}
        onToggleFocusActivePath={() => setFocusActivePath((previous) => !previous)}
        onToggleTheme={() => setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))}
        onClearSession={clearAll}
      />

      <div className="flex min-h-0 flex-1">
        <FlowCanvas
          flow={currentFlow}
          nodeStatuses={animations.nodeStatuses}
          activeEdges={animations.activeEdges}
          focusActivePath={focusActivePath}
          theme={theme}
          nodeLogMap={logStream.nodeLogMap}
          nodeSpans={traceTimeline.nodeSpans}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />

        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            status={selectedNodeId ? animations.nodeStatuses.get(selectedNodeId) : undefined}
            logs={selectedNodeId ? logStream.nodeLogMap.get(selectedNodeId) ?? [] : []}
            spans={selectedNodeId ? traceTimeline.nodeSpans.get(selectedNodeId) ?? [] : []}
            onClose={() => setSelectedNodeId(undefined)}
          />
        )}
      </div>

      <BottomLogPanel
        flow={currentFlow}
        globalLogs={logStream.globalLogs}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
      />
    </div>
  )
}

export default App
