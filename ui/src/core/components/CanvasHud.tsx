import { TooltipProvider } from '@/components/ui'

import type { ThemeMode } from '../types'
import { HudControlsPill } from './HudControlsPill'
import { HudIdentityPill } from './HudIdentityPill'

type HudVariant = 'floating' | 'inline'

interface CanvasHudProps {
  variant?: HudVariant
  flowName: string
  connected: boolean
  reconnecting: boolean
  relayWsUrl: string
  showCanvasControls: boolean
  focusActivePath: boolean
  theme: ThemeMode
  historyMode: boolean
  historyLoading: boolean
  historyWindow: string
  historyQuery: string
  historySummary?: string
  historyError?: string
  onNavigateBack: () => void
  onToggleFocusActivePath: () => void
  onToggleTheme: () => void
  onResetLayout: () => void
  onHistoryWindowChange: (window: string) => void
  onHistoryQueryChange: (query: string) => void
  onLoadHistory: () => void
  onExitHistory: () => void
  onClearSession: () => void
}

export function CanvasHud({
  variant = 'floating',
  flowName,
  connected,
  reconnecting,
  relayWsUrl,
  showCanvasControls,
  focusActivePath,
  theme,
  historyMode,
  historyLoading,
  historyWindow,
  historyQuery,
  historySummary,
  historyError,
  onNavigateBack,
  onToggleFocusActivePath,
  onToggleTheme,
  onResetLayout,
  onHistoryWindowChange,
  onHistoryQueryChange,
  onLoadHistory,
  onExitHistory,
  onClearSession,
}: CanvasHudProps) {
  const controlsPill = (
    <HudControlsPill
      showCanvasControls={showCanvasControls}
      focusActivePath={focusActivePath}
      theme={theme}
      historyMode={historyMode}
      historyLoading={historyLoading}
      historyWindow={historyWindow}
      historyQuery={historyQuery}
      historySummary={historySummary}
      historyError={historyError}
      onToggleFocusActivePath={onToggleFocusActivePath}
      onToggleTheme={onToggleTheme}
      onResetLayout={onResetLayout}
      onHistoryWindowChange={onHistoryWindowChange}
      onHistoryQueryChange={onHistoryQueryChange}
      onLoadHistory={onLoadHistory}
      onExitHistory={onExitHistory}
      onClearSession={onClearSession}
    />
  )

  const identityPill = (
    <HudIdentityPill
      flowName={flowName}
      connected={connected}
      reconnecting={reconnecting}
      relayWsUrl={relayWsUrl}
      onNavigateBack={onNavigateBack}
    />
  )

  if (variant === 'inline') {
    return (
      <TooltipProvider>
        <header className="relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-primary)] px-4">
          {identityPill}
          {controlsPill}
        </header>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="hud-pill pointer-events-auto absolute left-4 top-4 pr-3">
          {identityPill}
        </div>

        <div className="hud-pill pointer-events-auto absolute right-4 top-4">
          {controlsPill}
        </div>
      </div>
    </TooltipProvider>
  )
}
