import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import {
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'

import { buildLogSearchText } from '../logPresentation'
import { LogsTable } from './LogsTable'
import type { FlowConfig, LogEntry } from '../types'
import type { SourceMode } from '../hooks/useUrlState'

interface LogsViewProps {
  flow: FlowConfig
  logs: LogEntry[]
  selectedTraceId?: string
  sourceMode: SourceMode
  onSelectNode: (nodeId?: string) => void
  onSelectTrace: (traceId?: string) => void
}

function getScrollViewport(root: HTMLDivElement | null) {
  return root?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
}

function resolveNodeDisplayLabel(nodeId: string, nodeLabels: Map<string, string>): string {
  const label = nodeLabels.get(nodeId)?.trim()
  return label || nodeId
}

function resolveSemanticFamily(semanticRole: string | undefined): string | undefined {
  if (!semanticRole) return undefined
  if (semanticRole === 'scheduler') return 'cron'
  return semanticRole
}

export function LogsView({
  flow,
  logs,
  selectedTraceId,
  sourceMode,
  onSelectNode,
  onSelectTrace,
}: LogsViewProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'error'>('all')
  const [nodeFilter, setNodeFilter] = useState<string>('all')
  const [liveTail, setLiveTail] = useState(true)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)

  const nodeLabels = useMemo(() => {
    const map = new Map<string, string>()
    flow.nodes.forEach((node) => {
      map.set(node.id, node.label)
    })
    return map
  }, [flow.nodes])

  const nodeFamilies = useMemo(() => {
    const map = new Map<string, string>()
    flow.nodes.forEach((node) => {
      const family = resolveSemanticFamily(node.semanticRole)
      if (family) map.set(node.id, family)
    })
    return map
  }, [flow.nodes])

  const availableNodeIds = useMemo(() => {
    const ids = new Set<string>()

    for (const entry of logs) {
      if (entry.eventType !== 'log' || !entry.nodeId) {
        continue
      }
      ids.add(entry.nodeId)
    }

    if (nodeFilter !== 'all') {
      ids.add(nodeFilter)
    }

    return [...ids].sort((left, right) =>
      resolveNodeDisplayLabel(left, nodeLabels).localeCompare(resolveNodeDisplayLabel(right, nodeLabels)),
    )
  }, [logs, nodeFilter, nodeLabels])

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()

    return logs.filter((entry) => {
      if (entry.eventType !== 'log') {
        return false
      }
      if (selectedTraceId && (entry.runId ?? entry.traceId) !== selectedTraceId) {
        return false
      }
      if (statusFilter !== 'all' && entry.level !== statusFilter) {
        return false
      }
      if (nodeFilter !== 'all' && entry.nodeId !== nodeFilter) {
        return false
      }
      if (!query) {
        return true
      }

      const nodeLabel = entry.nodeId ? resolveNodeDisplayLabel(entry.nodeId, nodeLabels).toLowerCase() : ''
      return buildLogSearchText(entry, nodeLabel).includes(query)
    })
  }, [logs, nodeFilter, nodeLabels, search, selectedTraceId, statusFilter])

  const hasAnyFlowLogs = useMemo(
    () => logs.some((entry) => entry.eventType === 'log'),
    [logs],
  )

  const logsEmptyState = useMemo(() => {
    if (!hasAnyFlowLogs) {
      return {
        title: 'Waiting for activity',
        body: 'Logs will appear here when the flow runs.',
      }
    }

    return {
      title: 'No logs match the current filters',
      body: 'Try clearing search, node, or error filters to see more flow activity.',
    }
  }, [hasAnyFlowLogs])

  useEffect(() => {
    if (!liveTail || sourceMode !== 'live') {
      return
    }

    const viewport = getScrollViewport(scrollAreaRef.current)
    if (viewport) {
      viewport.scrollTop = 0
    }
  }, [filteredLogs, liveTail, sourceMode])

  useEffect(() => {
    const viewport = getScrollViewport(scrollAreaRef.current)
    if (!viewport || sourceMode !== 'live') {
      return
    }

    const onScroll = () => {
      setLiveTail(viewport.scrollTop < 12)
    }

    viewport.addEventListener('scroll', onScroll)
    onScroll()

    return () => viewport.removeEventListener('scroll', onScroll)
  }, [sourceMode])

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search logs, nodes, or run IDs…"
            className="border-0 bg-[var(--surface-inset)] pl-8 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <Select value={nodeFilter} onValueChange={setNodeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All nodes</SelectItem>
            {availableNodeIds.map((nodeId) => (
              <SelectItem key={nodeId} value={nodeId}>
                {resolveNodeDisplayLabel(nodeId, nodeLabels)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center overflow-hidden rounded-lg bg-[var(--surface-inset)]">
          {(['all', 'error'] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={`px-3 py-1 text-[10px] font-medium capitalize ${
                statusFilter === status
                  ? 'rounded-lg bg-[var(--text-primary)] text-[var(--surface-primary)]'
                  : 'bg-transparent text-[var(--text-muted)]'
              }`}
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[10px] font-medium ${
            liveTail
              ? 'bg-[color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[var(--status-success)]'
              : 'bg-[var(--surface-inset)] text-[var(--text-muted)]'
          }`}
          onClick={() => setLiveTail((previous) => !previous)}
          disabled={sourceMode !== 'live'}
        >
          {liveTail ? (
            <span className="inline-block h-1.5 w-1.5 animate-flow-pulse rounded-full bg-[var(--status-success)]" />
          ) : null}
          Live
        </button>

      </div>

      <ScrollArea
        ref={scrollAreaRef}
        className="min-h-0 flex-1"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-sm text-[var(--text-secondary)]">{logsEmptyState.title}</p>
            <p className="text-xs text-[var(--text-muted)]">{logsEmptyState.body}</p>
          </div>
        ) : (
          <LogsTable
            logs={filteredLogs}
            nodeLabels={nodeLabels}
            nodeFamilies={nodeFamilies}
            selectedTraceId={selectedTraceId}
            liveTail={liveTail && sourceMode === 'live'}
            onSelectLog={(entry) => {
              const executionId = entry.runId ?? entry.traceId
              if (executionId) {
                onSelectTrace(executionId)
              }
              if (entry.nodeId) {
                onSelectNode(entry.nodeId)
              }
            }}
          />
        )}
      </ScrollArea>
    </div>
  )
}
