import { useState } from 'react'
import { MoonStar, Settings2, SunMedium } from 'lucide-react'

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui'

import type { ThemeMode } from '../types'

interface HudControlsPillProps {
  showCanvasControls: boolean
  theme: ThemeMode
  onToggleTheme: () => void
  onResetLayout: () => void
  onClearLogs: () => void
}

export function HudControlsPill({
  showCanvasControls,
  theme,
  onToggleTheme,
  onResetLayout,
  onClearLogs,
}: HudControlsPillProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={onToggleTheme}
          >
            {theme === 'dark'
              ? <SunMedium className="size-4 transition-transform duration-150 ease-out" />
              : <MoonStar className="size-4 transition-transform duration-150 ease-out" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
      </Tooltip>

      <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Open settings">
            <Settings2 className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {showCanvasControls ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  onResetLayout()
                  setSettingsOpen(false)
                }}
              >
                Reset layout
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuItem
            onSelect={() => {
              onClearLogs()
              setSettingsOpen(false)
            }}
          >
            Clear logs
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
