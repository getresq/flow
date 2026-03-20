import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  Card,
  CardContent,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
} from '@/components/ui'

import { LogsTable } from './LogsTable'
import type { FlowConfig, LogEntry } from '../types'
import type { SourceMode } from '../hooks/useUrlState'
import { isDefaultVisibleLogEntry } from '../telemetryClassification'

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

export function LogsView({
  flow,
  logs,
  selectedTraceId,
  sourceMode,
  onSelectNode,
  onSelectTrace,
}: LogsViewProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'info' | 'error'>('all')
  const [nodeFilter, setNodeFilter] = useState<string>('all')
  const [liveTail, setLiveTail] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)

  const nodeLabels = useMemo(() => {
    const map = new Map<string, string>()
    flow.nodes.forEach((node) => {
      map.set(node.id, node.label)
    })
    return map
  }, [flow.nodes])

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()

    return logs.filter((entry) => {
      if (!showAll && !isDefaultVisibleLogEntry(entry)) {
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

      const nodeLabel = entry.nodeId ? nodeLabels.get(entry.nodeId)?.toLowerCase() : ''
      const nodeId = entry.nodeId?.toLowerCase()
      const stageName = entry.stageName?.toLowerCase()
      const componentId = entry.componentId?.toLowerCase()
      return (
        entry.message.toLowerCase().includes(query) ||
        nodeLabel?.includes(query) ||
        nodeId?.includes(query) ||
        stageName?.includes(query) ||
        componentId?.includes(query) ||
        entry.traceId?.toLowerCase().includes(query) ||
        entry.runId?.toLowerCase().includes(query)
      )
    })
  }, [logs, nodeFilter, nodeLabels, search, selectedTraceId, showAll, statusFilter])

  useEffect(() => {
    if (!liveTail || sourceMode !== 'live') {
      return
    }

    const viewport = getScrollViewport(scrollAreaRef.current)
    if (viewport) {
      viewport.scrollTop = 0
    }
  }, [filteredLogs, liveTail, sourceMode])

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search logs, nodes, or run IDs…"
          className="w-full max-w-sm"
        />

        <Select value={nodeFilter} onValueChange={setNodeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All nodes</SelectItem>
            {flow.nodes.map((node) => (
              <SelectItem key={node.id} value={node.id}>
                {node.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          {(['all', 'info', 'error'] as const).map((status) => (
            <Button
              key={status}
              type="button"
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </Button>
          ))}
        </div>

        <Button
          type="button"
          variant={liveTail ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setLiveTail((previous) => !previous)}
          disabled={sourceMode !== 'live'}
        >
          Live tail {liveTail ? 'on' : 'off'}
        </Button>

        <Toggle pressed={showAll} size="sm" onPressedChange={setShowAll} aria-label="Show all telemetry">
          Show all
        </Toggle>
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="min-h-0 pt-3">
          <ScrollArea
            ref={scrollAreaRef}
            className="h-full"
            onScrollCapture={() => {
              const viewport = getScrollViewport(scrollAreaRef.current)
              if (!viewport || sourceMode !== 'live') {
                return
              }
              setLiveTail(viewport.scrollTop < 12)
            }}
          >
            <LogsTable
              logs={filteredLogs}
              nodeLabels={nodeLabels}
              selectedTraceId={selectedTraceId}
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
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
