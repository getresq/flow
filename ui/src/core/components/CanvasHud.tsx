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
  theme: ThemeMode
  onNavigateBack: () => void
  onToggleTheme: () => void
  onResetLayout: () => void
  onClearLogs: () => void
}

export function CanvasHud({
  variant = 'floating',
  flowName,
  connected,
  reconnecting,
  relayWsUrl,
  showCanvasControls,
  theme,
  onNavigateBack,
  onToggleTheme,
  onResetLayout,
  onClearLogs,
}: CanvasHudProps) {
  const controlsPill = (
    <HudControlsPill
      showCanvasControls={showCanvasControls}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onResetLayout={onResetLayout}
      onClearLogs={onClearLogs}
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
        <header className="relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4">
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
