import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'

import { formatEasternTime } from '../time'
import type { LogEntry } from '../types'
import { DurationBadge } from './DurationBadge'

interface LogsTableProps {
  logs: LogEntry[]
  nodeLabels: Map<string, string>
  selectedTraceId?: string
  onSelectLog: (entry: LogEntry) => void
}

interface LogRowData {
  id: string
  executionId?: string
  timestamp: string
  nodeLabel: string
  nodeId?: string
  message: string
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
  selectedTraceId,
  onSelectLog,
}: LogsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'time', desc: true }])

  const data = useMemo<LogRowData[]>(
    () =>
      logs.map((entry, index) => ({
        id: `${entry.seq ?? entry.timestamp}-${index}`,
        executionId: entry.runId ?? entry.traceId,
        timestamp: entry.timestamp,
        nodeLabel: entry.nodeId ? nodeLabels.get(entry.nodeId) ?? entry.nodeId : '—',
        nodeId: entry.nodeId,
        message: (entry.stageName ?? entry.stageId) ? `${entry.stageName ?? entry.stageId}: ${entry.message}` : entry.message,
        entry,
      })),
    [logs, nodeLabels],
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
            {formatEasternTime(row.original.timestamp)}
          </span>
        ),
      },
      {
        id: 'node',
        accessorKey: 'nodeLabel',
        header: 'Node',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-[var(--text-secondary)]">{row.original.nodeLabel}</div>
            {row.original.nodeId && row.original.nodeId !== row.original.nodeLabel ? (
              <div className="truncate font-mono text-[11px] text-[var(--text-muted)]">{row.original.nodeId}</div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'message',
        accessorKey: 'message',
        header: 'Message',
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.message}>
            {row.original.message}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.entry.level,
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.entry.level === 'error' ? 'destructive' : 'success'}>
            {row.original.entry.level === 'error' ? 'ERR' : 'OK'}
          </Badge>
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
    <Table>
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
            return (
              <TableRow
                key={row.id}
                data-state={selected ? 'selected' : undefined}
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
