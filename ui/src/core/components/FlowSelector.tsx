import { useState } from 'react'
import { ChevronLeft, Maximize2, MoonStar, RotateCcw, Settings2, SunMedium } from 'lucide-react'

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'

import type { FlowViewMode, ThemeMode } from '../types'

interface FlowSelectorProps {
  currentFlowId: string
  currentFlowName: string
  connected: boolean
  reconnecting: boolean
  relayWsUrl: string
  viewMode: FlowViewMode
  availableViewModes: FlowViewMode[]
  focusMode: boolean
  focusActivePath: boolean
  theme: ThemeMode
  historyMode: boolean
  historyLoading: boolean
  historyWindow: string
  historyQuery: string
  historySummary?: string
  historyError?: string
  onNavigateBack: () => void
  onViewModeChange: (viewMode: FlowViewMode) => void
  onToggleFocusMode: () => void
  onToggleFocusActivePath: () => void
  onToggleTheme: () => void
  onResetLayout: () => void
  onHistoryWindowChange: (window: string) => void
  onHistoryQueryChange: (query: string) => void
  onLoadHistory: () => void
  onExitHistory: () => void
  onClearSession: () => void
}

const historyWindowOptions = [
  { value: '15m', label: 'Last 15m' },
  { value: '30m', label: 'Last 30m' },
  { value: '1h', label: 'Last 1h' },
  { value: '6h', label: 'Last 6h' },
  { value: '24h', label: 'Last 24h' },
]

export function FlowSelector({
  currentFlowName,
  connected,
  reconnecting,
  relayWsUrl,
  viewMode,
  availableViewModes,
  focusMode,
  focusActivePath,
  theme,
  historyMode,
  historyLoading,
  historyWindow,
  historyQuery,
  historySummary,
  historyError,
  onNavigateBack,
  onViewModeChange,
  onToggleFocusMode,
  onToggleFocusActivePath,
  onToggleTheme,
  onResetLayout,
  onHistoryWindowChange,
  onHistoryQueryChange,
  onLoadHistory,
  onExitHistory,
  onClearSession,
}: FlowSelectorProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const connectionLabel = connected
    ? 'Connected'
    : reconnecting
      ? 'Reconnecting…'
      : 'Disconnected'
  const connectionTooltip = connected
    ? `Connected to relay server at ${relayWsUrl}`
    : reconnecting
      ? `Reconnecting to relay server at ${relayWsUrl}`
      : `Disconnected from relay server at ${relayWsUrl}`
  const showCanvasControls = viewMode === 'canvas' && availableViewModes.includes('canvas')

  return (
    <TooltipProvider>
      <header className="relative z-50 grid h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 bg-[var(--surface-raised)]/95 px-4 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onNavigateBack}
              className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-secondary)]"
              aria-label="Back to flows"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">
              {currentFlowName}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label={connectionLabel}
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    connected
                      ? 'bg-[var(--status-success)]'
                      : reconnecting
                        ? 'animate-flow-pulse bg-[var(--status-warning)]'
                        : 'bg-[var(--status-error)]'
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent>{connectionTooltip}</TooltipContent>
            </Tooltip>
            <span className="text-sm text-[var(--text-secondary)]">{connectionLabel}</span>
          </div>

        </div>

        <div className="flex items-center justify-center gap-2">
          <Tabs value={viewMode} onValueChange={(value) => onViewModeChange(value as FlowViewMode)}>
            <TabsList className="min-h-0 gap-0 rounded-lg border-0 bg-[var(--surface-inset)] px-1 py-1">
              {availableViewModes.map((mode) => (
                <TabsTrigger
                  key={mode}
                  value={mode}
                  className="h-7 rounded-md border-0 px-3 text-xs transition-all duration-150 active:scale-[0.94] data-[state=active]:border-0 data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm"
                >
                  {mode === 'canvas' ? 'Flow' : mode === 'metrics' ? 'Metrics' : 'Logs'}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center justify-end gap-2">
          {showCanvasControls ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleFocusMode}
                  aria-label="Toggle focus mode"
                  className={focusMode ? 'bg-[var(--surface-inset)]' : ''}
                >
                  <Maximize2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Focus mode</TooltipContent>
            </Tooltip>
          ) : null}

          <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Open settings">
                <Settings2 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="space-y-3 p-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Appearance
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      onToggleTheme()
                      setSettingsOpen(false)
                    }}
                  >
                    {theme === 'dark' ? <SunMedium className="mr-2 size-4" /> : <MoonStar className="mr-2 size-4" />}
                    Switch to {theme === 'dark' ? 'light' : 'dark'} mode
                  </Button>
                </div>

                {showCanvasControls ? (
                  <>
                    <DropdownMenuSeparator />
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Canvas
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          onResetLayout()
                          setSettingsOpen(false)
                        }}
                      >
                        <RotateCcw className="mr-2 size-4" />
                        Reset to default layout
                      </Button>
                    </div>
                  </>
                ) : null}

                <DropdownMenuSeparator />

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Session
                  </p>
                  {showCanvasControls ? (
                    <Button
                      type="button"
                      variant={focusActivePath ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => {
                        onToggleFocusActivePath()
                        setSettingsOpen(false)
                      }}
                    >
                      Focus active path: {focusActivePath ? 'on' : 'off'}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      onClearSession()
                      setSettingsOpen(false)
                    }}
                  >
                    Clear session
                  </Button>
                </div>

                <DropdownMenuSeparator />

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    History
                  </p>
                  <Select value={historyWindow} onValueChange={onHistoryWindowChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {historyWindowOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={historyQuery}
                    onChange={(event) => onHistoryQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !historyLoading) {
                        onLoadHistory()
                        setSettingsOpen(false)
                      }
                    }}
                    placeholder="trace/job/thread id (optional)"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={historyLoading}
                    onClick={() => {
                      onLoadHistory()
                      setSettingsOpen(false)
                    }}
                  >
                    {historyLoading ? 'Loading…' : 'Load history window'}
                  </Button>

                  {historyMode ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => {
                        onExitHistory()
                        setSettingsOpen(false)
                      }}
                    >
                      Return to live
                    </Button>
                  ) : null}

                  {historySummary ? (
                    <p className="text-xs text-[var(--text-secondary)]">{historySummary}</p>
                  ) : null}
                  {historyError ? (
                    <p className="text-xs text-[var(--status-error)]">{historyError}</p>
                  ) : null}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </TooltipProvider>
  )
}
