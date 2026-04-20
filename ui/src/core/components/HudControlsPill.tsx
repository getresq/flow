import { MoonStar, Settings2, SunMedium } from 'lucide-react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';

import type { ThemeMode } from '../types';

interface HudControlsPillProps {
  showCanvasControls: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onResetLayout: () => void;
  onClearLogs: () => void;
}

export function HudControlsPill({
  showCanvasControls,
  theme,
  onToggleTheme,
  onResetLayout,
  onClearLogs,
}: HudControlsPillProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="hud"
        size="icon"
        className="size-8"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? (
          <SunMedium className="size-4 transition-transform duration-150 ease-out" />
        ) : (
          <MoonStar className="size-4 transition-transform duration-150 ease-out" />
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="hud"
            size="icon"
            className="size-8"
            aria-label="Open settings"
          >
            <Settings2 className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {showCanvasControls ? (
            <>
              <DropdownMenuItem onSelect={onResetLayout}>Reset layout</DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuItem onSelect={onClearLogs}>Clear logs</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
