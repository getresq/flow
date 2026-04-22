import { useNavigate } from 'react-router-dom'
import { ChevronRight, MoonStar, SunMedium, Zap } from 'lucide-react'

import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'

import { flows } from '../../flows'
import { useLayoutStore } from '../../stores/layout'
import type { FlowConfig } from '../types'

interface FlowsHomeProps {
  registeredFlows?: FlowConfig[]
}

export function FlowsHome({ registeredFlows = flows }: FlowsHomeProps) {
  const navigate = useNavigate()
  const setCommandPaletteOpen = useLayoutStore((state) => state.setCommandPaletteOpen)
  const theme = useLayoutStore((state) => state.theme)
  const setTheme = useLayoutStore((state) => state.setTheme)

  return (
    <main className="min-h-screen bg-[var(--surface-primary)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Flows</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Pipelines available in this workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    {theme === 'dark'
                      ? <SunMedium className="size-4" />
                      : <MoonStar className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button type="button" variant="outline" onClick={() => setCommandPaletteOpen(true)}>
              Cmd+K
            </Button>
          </div>
        </header>

        {registeredFlows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Zap className="size-10 text-[var(--text-muted)]" />
            <p className="text-lg font-medium text-[var(--text-secondary)]">No flows registered</p>
            <p className="text-sm text-[var(--text-muted)]">Register flows in the flow config to see them here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)]">
            {registeredFlows.map((flow) => (
              <li key={flow.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/flows/${flow.id}?mode=live`)}
                  className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium text-[var(--text-primary)]">{flow.name}</div>
                    {flow.description ? (
                      <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-secondary)]">{flow.description}</p>
                    ) : null}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-[var(--text-secondary)]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
