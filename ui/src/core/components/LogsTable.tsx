import { useEffect, useMemo, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'

import { getLogDisplayMessage } from '../logPresentation'
import { formatEasternTime } from '../time'
import type { LogEntry } from '../types'
import { DurationBadge } from './DurationBadge'

const FRESH_BATCH_LIMIT = 20

interface LogsTableProps {
  logs: LogEntry[]
  nodeLabels: Map<string, string>
  nodeFamilies: Map<string, string>
  selectedTraceId?: string
  liveTail?: boolean
  onSelectLog: (entry: LogEntry) => void
}

interface LogRowData {
  id: string
  executionId?: string
  timestamp: string
  nodeLabel: string
  nodeId?: string
  nodeFamily?: string
  messagePrefix?: string
  messageBody: string
  messageTitle: string
  entry: LogEntry
}

function sortIndicator(direction: false | 'asc' | 'desc') {
  if (direction === 'asc') {
    return '↑'
  }
  if (direction === 'desc') {
    return '↓'
  }
  return ''
}

export function LogsTable({
  logs,
  nodeLabels,
  nodeFamilies,
  selectedTraceId,
  liveTail,
  onSelectLog,
}: LogsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'time', desc: true }])

  const prevMaxSeqRef = useRef<number | null>(null)

  const freshSeqs = useMemo(() => {
    if (prevMaxSeqRef.current === null || !liveTail) return new Set<number>()

    const prevMax = prevMaxSeqRef.current
    const fresh = new Set<number>()
    for (const entry of logs) {
      if (typeof entry.seq === 'number' && entry.seq > prevMax) {
        fresh.add(entry.seq)
      }
    }

    if (fresh.size > FRESH_BATCH_LIMIT) return new Set<number>()

    return fresh
  }, [logs, liveTail])

  useEffect(() => {
    let max = 0
    for (const entry of logs) {
      if (typeof entry.seq === 'number') {
        max = Math.max(max, entry.seq)
      }
    }
    prevMaxSeqRef.current = max
  }, [logs])

  const data = useMemo<LogRowData[]>(
    () =>
      logs.map((entry, index) => {
        const fullMsg = getLogDisplayMessage(entry)
        const colonIdx = fullMsg.indexOf(':')
        const messagePrefix = colonIdx > 0 && colonIdx < 40 ? fullMsg.slice(0, colonIdx) : undefined
        const messageBody = colonIdx > 0 && colonIdx < 40 ? fullMsg.slice(colonIdx + 1).trimStart() : fullMsg

        return {
          id: `${entry.seq ?? entry.timestamp}-${index}`,
          executionId: entry.runId ?? entry.traceId,
          timestamp: entry.timestamp,
          nodeLabel: entry.nodeId ? nodeLabels.get(entry.nodeId) ?? entry.nodeId : '—',
          nodeId: entry.nodeId,
          nodeFamily: entry.nodeId ? nodeFamilies.get(entry.nodeId) : undefined,
          messagePrefix,
          messageBody,
          messageTitle:
            entry.displayMessage && entry.displayMessage !== entry.message
              ? `${entry.displayMessage}\nraw: ${entry.message}`
              : fullMsg,
          entry,
        }
      }),
    [logs, nodeLabels, nodeFamilies],
  )

  const columns = useMemo<ColumnDef<LogRowData>[]>(
    () => [
      {
        id: 'time',
        accessorKey: 'timestamp',
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Time
            <span>{sortIndicator(column.getIsSorted())}</span>
          </button>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {formatEasternTime(row.original.timestamp, { precise: true })}
          </span>
        ),
      },
      {
        id: 'node',
        accessorKey: 'nodeLabel',
        header: 'Node',
        cell: ({ row }) => (
          <span
            className="inline-block rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: `var(--chip-${row.original.nodeFamily ?? 'cron'}-bg)`,
              color: `var(--chip-${row.original.nodeFamily ?? 'cron'}-text)`,
            }}
            title={row.original.nodeId ?? row.original.nodeLabel}
          >
            {row.original.nodeLabel}
          </span>
        ),
      },
      {
        id: 'message',
        accessorKey: 'messageBody',
        header: 'Message',
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.messageTitle}>
            {row.original.messagePrefix && (
              <span className="mr-1 font-mono text-[10px] text-[var(--text-muted)]">
                {row.original.messagePrefix}:
              </span>
            )}
            <span className="text-[var(--text-primary)]">{row.original.messageBody}</span>
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.entry.level,
        header: '',
        cell: ({ row }) => (
          <span
            className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{
              background:
                row.original.entry.level === 'error'
                  ? 'var(--status-error)'
                  : 'var(--status-success)',
            }}
          />
        ),
      },
      {
        id: 'duration',
        accessorFn: (row) => row.entry.durationMs ?? -1,
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Duration
            <span>{sortIndicator(column.getIsSorted())}</span>
          </button>
        ),
        cell: ({ row }) => <DurationBadge durationMs={row.original.entry.durationMs} />,
      },
    ],
    [],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  })

  return (
    <Table className="table-fixed">
      <colgroup>
        <col className="w-[160px]" />
        <col className="w-[200px]" />
        <col />
        <col className="w-[24px]" />
        <col className="w-[90px]" />
      </colgroup>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="cursor-default hover:bg-transparent">
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow className="cursor-default hover:bg-transparent">
            <TableCell colSpan={5} className="py-8 text-center text-[var(--text-secondary)]">
              No logs match the current filters.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => {
            const selected = selectedTraceId && row.original.executionId === selectedTraceId
            const isFresh = typeof row.original.entry.seq === 'number' && freshSeqs.has(row.original.entry.seq)
            return (
              <TableRow
                key={row.id}
                data-state={selected ? 'selected' : undefined}
                data-level={row.original.entry.level}
                data-fresh={isFresh ? '' : undefined}
                onClick={() => onSelectLog(row.original.entry)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
