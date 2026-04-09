import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui'

import { flows } from '../../flows'
import { useCommandPaletteStore } from '../../stores/commandPalette'
import { useLayoutStore } from '../../stores/layout'

function currentFlowFromPath(pathname: string) {
  const match = pathname.match(/^\/flows\/([^/]+)/)
  if (!match) {
    return undefined
  }

  return flows.find((flow) => flow.id === match[1])
}

function updateSearchParams(
  search: string,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams(search)

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null) {
      params.delete(key)
      return
    }

    params.set(key, value)
  })

  const nextSearch = params.toString()
  return nextSearch ? `?${nextSearch}` : ''
}

export function CommandPalette() {
  const navigate = useNavigate()
  const location = useLocation()
  const commandPaletteOpen = useLayoutStore((state) => state.commandPaletteOpen)
  const setCommandPaletteOpen = useLayoutStore((state) => state.setCommandPaletteOpen)
  const theme = useLayoutStore((state) => state.theme)
  const setTheme = useLayoutStore((state) => state.setTheme)

  const runOptions = useCommandPaletteStore((state) => state.runOptions)
  const onClearLogs = useCommandPaletteStore((state) => state.onClearLogs)

  const currentFlow = useMemo(
    () => currentFlowFromPath(location.pathname),
    [location.pathname],
  )

  const nodeOptions = currentFlow?.nodes.map((node) => ({
    id: node.id,
    label: node.label,
  })) ?? []

  const closePalette = () => setCommandPaletteOpen(false)

  return (
    <CommandDialog
      open={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      title="Command palette"
      description="Search flows, actions, node filters, and run filters."
    >
      <CommandInput placeholder="Search flows, actions, nodes, or runs…" />
      <CommandList>
        <CommandEmpty>No commands match that search.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {flows.map((flow) => (
            <CommandItem
              key={flow.id}
              value={`${flow.name} ${flow.id}`}
              onSelect={() => {
                navigate(`/flows/${flow.id}?mode=live`)
                closePalette()
              }}
            >
              <span>{flow.name}</span>
              {!flow.hasGraph ? <span className="ml-auto text-xs text-[var(--text-secondary)]">Headless</span> : null}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              setTheme(theme === 'dark' ? 'light' : 'dark')
              closePalette()
            }}
          >
            <span>Toggle theme</span>
            <span className="ml-auto text-xs text-[var(--text-secondary)]">
              {theme === 'dark' ? 'Light' : 'Dark'}
            </span>
          </CommandItem>

          {onClearLogs ? (
            <CommandItem
              onSelect={() => {
                onClearLogs()
                closePalette()
              }}
            >
              Clear logs
            </CommandItem>
          ) : null}
        </CommandGroup>

        {currentFlow ? <CommandSeparator /> : null}

        {currentFlow ? (
          <CommandGroup heading="Filter">
            {nodeOptions.map((node) => (
              <CommandItem
                key={node.id}
                value={`${node.label} ${node.id}`}
                onSelect={() => {
                  navigate({
                    pathname: location.pathname,
                    search: updateSearchParams(location.search, {
                      node: node.id,
                      run: null,
                    }),
                  })
                  closePalette()
                }}
              >
                <span>Filter logs by node</span>
                <span className="ml-auto text-xs text-[var(--text-secondary)]">{node.label}</span>
              </CommandItem>
            ))}

            {runOptions.map((run) => (
              <CommandItem
                key={run.traceId}
                value={`${run.label} ${run.traceId}`}
                onSelect={() => {
                  navigate({
                    pathname: location.pathname,
                    search: updateSearchParams(location.search, {
                      run: run.traceId,
                      node: null,
                    }),
                  })
                  closePalette()
                }}
              >
                <span>Filter by trace ID</span>
                <span className="ml-auto truncate text-xs text-[var(--text-secondary)]">
                  {run.label}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
