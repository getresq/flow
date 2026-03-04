import { useEffect, useRef, useState } from 'react'

import type { FlowConfig, ThemeMode } from '../types'

interface FlowSelectorProps {
  flows: FlowConfig[]
  currentFlowId: string
  connected: boolean
  reconnecting: boolean
  relayWsUrl: string
  displayedEventCount: number
  totalEventCount: number
  queuedEventCount: number
  playbackPaused: boolean
  playbackSpeed: number
  focusActivePath: boolean
  theme: ThemeMode
  onSelectFlow: (flowId: string) => void
  onPlaybackPauseToggle: () => void
  onPlaybackStep: () => void
  onPlaybackSpeedChange: (speed: number) => void
  onToggleFocusActivePath: () => void
  onToggleTheme: () => void
  onClearSession: () => void
}

const playbackSpeedOptions = [0.25, 0.5, 1, 2, 4, 8]

export function FlowSelector({
  flows,
  currentFlowId,
  connected,
  reconnecting,
  relayWsUrl,
  displayedEventCount,
  totalEventCount,
  queuedEventCount,
  playbackPaused,
  playbackSpeed,
  focusActivePath,
  theme,
  onSelectFlow,
  onPlaybackPauseToggle,
  onPlaybackStep,
  onPlaybackSpeedChange,
  onToggleFocusActivePath,
  onToggleTheme,
  onClearSession,
}: FlowSelectorProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const connectionTooltip = connected
    ? `Connected to relay server at ${relayWsUrl}`
    : reconnecting
      ? `Reconnecting to relay server at ${relayWsUrl}`
      : `Disconnected from relay server at ${relayWsUrl}`

  useEffect(() => {
    if (!settingsOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!settingsRef.current) {
        return
      }

      if (!(event.target instanceof Node)) {
        return
      }

      if (settingsRef.current.contains(event.target)) {
        return
      }

      setSettingsOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [settingsOpen])

  return (
    <header className="relative z-50 flex flex-wrap items-center gap-3 border-b border-slate-700/50 bg-slate-900/95 px-4 py-2 backdrop-blur-sm">
      <div className="flex min-w-48 items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="flow-select">
          Flow
        </label>
        <select
          id="flow-select"
          value={currentFlowId}
          onChange={(event) => onSelectFlow(event.target.value)}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-100 outline-none focus:border-sky-400"
        >
          {flows.map((flow) => (
            <option key={flow.id} value={flow.id}>
              {flow.name}
            </option>
          ))}
        </select>
      </div>

      <div className="group relative flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? 'bg-emerald-400' : reconnecting ? 'bg-amber-400 animate-flow-pulse' : 'bg-rose-500'
          }`}
        />
        <span className="text-xs text-slate-400">
          {connected ? 'Connected' : reconnecting ? 'Reconnecting…' : 'Disconnected'}
        </span>
        <div className="pointer-events-none absolute left-0 top-full z-[80] mt-1 hidden max-w-[380px] whitespace-nowrap rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-200 shadow-lg group-hover:block">
          {connectionTooltip}
        </div>
      </div>

      <div className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
        {displayedEventCount}/{totalEventCount} events
        {queuedEventCount > 0 ? ` (${queuedEventCount} queued)` : ''}
      </div>

      <div className="flex items-center gap-2 rounded border border-slate-700/70 bg-slate-900/75 px-2 py-1">
        <label htmlFor="playback-speed" className="text-[10px] uppercase tracking-wide text-slate-500">
          Speed
        </label>
        <select
          id="playback-speed"
          value={playbackSpeed}
          onChange={(event) => onPlaybackSpeedChange(Number.parseFloat(event.target.value))}
          className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-100 outline-none focus:border-sky-400"
        >
          {playbackSpeedOptions.map((option) => (
            <option key={option} value={option}>
              {option}x
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onPlaybackPauseToggle}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-100 hover:border-slate-500"
        >
          {playbackPaused ? 'Resume' : 'Pause'}
        </button>

        <button
          type="button"
          onClick={onPlaybackStep}
          disabled={queuedEventCount === 0}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-100 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Step
        </button>
      </div>

      <button
        type="button"
        onClick={onToggleFocusActivePath}
        className={`rounded border px-2 py-0.5 text-xs ${
          focusActivePath
            ? 'border-sky-500/70 bg-sky-900/35 text-sky-200'
            : 'border-slate-600 bg-slate-800 text-slate-300'
        }`}
      >
        Focus active path {focusActivePath ? 'on' : 'off'}
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onClearSession} className="text-sm text-slate-400 hover:text-slate-200">
          Clear session
        </button>

        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((previous) => !previous)}
            aria-label="Open settings"
            title="Settings"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-700/70 bg-slate-800/90 text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M4 5.5h12M4 10h12M4 14.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="7" cy="5.5" r="1.5" fill="currentColor" />
              <circle cx="13" cy="10" r="1.5" fill="currentColor" />
              <circle cx="9" cy="14.5" r="1.5" fill="currentColor" />
            </svg>
          </button>

          {settingsOpen ? (
            <div className="absolute right-0 top-full z-[80] mt-2 min-w-44 rounded border border-slate-700 bg-slate-900 p-2 shadow-lg">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Appearance</p>
              <button
                type="button"
                onClick={() => {
                  onToggleTheme()
                  setSettingsOpen(false)
                }}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-left text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-700"
              >
                Theme: {theme === 'dark' ? 'Dark' : 'Light'} (switch)
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
