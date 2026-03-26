import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingFn,
  type SortingState,
} from '@tanstack/react-table'

import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'

import { formatEasternTime } from '../time'
import type { TraceJourney, TraceStatus } from '../types'
import {
  canonicalStepId,
  formatRunLabel,
  formatStepDisplayLabel,
  getJourneySummaryStage,
} from '../runPresentation'
import { DurationBadge } from './DurationBadge'

interface RunsTableProps {
  journeys: TraceJourney[]
  selectedTraceId?: string
  pinnedTraceIds: Set<string>
  onSelectTrace: (traceId?: string) => void
  onTogglePinned: (traceId: string) => void
}

interface RunRowData {
  traceId: string
  runLabel: string
  latestStep: string
  latestStepId?: string
  status: TraceStatus
  durationMs?: number
  updatedAt: string
  issue: string
  pinned: boolean
}

function statusVariant(status: TraceStatus) {
  if (status === 'error') {
    return 'destructive' as const
  }
  if (status === 'success') {
    return 'success' as const
  }
  if (status === 'partial') {
    return 'warning' as const
  }
  return 'default' as const
}

function statusRank(status: TraceStatus) {
  if (status === 'error') {
    return 0
  }
  if (status === 'running') {
    return 1
  }
  if (status === 'partial') {
    return 2
  }
  return 3
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

function pinAwareSort(compare: (left: RunRowData, right: RunRowData) => number): SortingFn<RunRowData> {
  return (rowA: Row<RunRowData>, rowB: Row<RunRowData>) => {
    if (rowA.original.pinned !== rowB.original.pinned) {
      return rowA.original.pinned ? -1 : 1
    }
    return compare(rowA.original, rowB.original)
  }
}

export function RunsTable({
  journeys,
  selectedTraceId,
  pinnedTraceIds,
  onSelectTrace,
  onTogglePinned,
}: RunsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updated', desc: true }])

  const data = useMemo<RunRowData[]>(
    () =>
      journeys.map((journey) => {
        const summaryStage = getJourneySummaryStage(journey)
        return {
          traceId: journey.traceId,
          runLabel: formatRunLabel(journey),
          latestStep: summaryStage ? formatStepDisplayLabel(summaryStage) : '-',
          latestStepId: summaryStage ? canonicalStepId(summaryStage) : undefined,
          status: journey.status,
          durationMs: journey.durationMs,
          updatedAt: journey.lastUpdatedAt,
          issue: journey.errorSummary ?? '-',
          pinned: pinnedTraceIds.has(journey.traceId),
        }
      }),
    [journeys, pinnedTraceIds],
  )

  const columns = useMemo<ColumnDef<RunRowData>[]>(
    () => [
      {
        id: 'run',
        accessorKey: 'runLabel',
        header: 'Run',
        cell: ({ row }) => <span className="truncate">{row.original.runLabel}</span>,
      },
      {
        id: 'latestStep',
        accessorKey: 'latestStep',
        header: 'Latest step',
        cell: ({ row }) => (
          <span
            className="truncate text-[var(--text-secondary)]"
            title={row.original.latestStepId ?? row.original.latestStep}
          >
            {row.original.latestStep}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Status
            <span>{sortIndicator(column.getIsSorted())}</span>
          </button>
        ),
        sortingFn: pinAwareSort((left, right) => statusRank(left.status) - statusRank(right.status)),
        cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>,
      },
      {
        id: 'duration',
        accessorFn: (row) => row.durationMs ?? -1,
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
        sortingFn: pinAwareSort((left, right) => (left.durationMs ?? -1) - (right.durationMs ?? -1)),
        cell: ({ row }) => <DurationBadge durationMs={row.original.durationMs} />,
      },
      {
        id: 'updated',
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Updated
            <span>{sortIndicator(column.getIsSorted())}</span>
          </button>
        ),
        sortingFn: pinAwareSort(
          (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {formatEasternTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'issue',
        accessorKey: 'issue',
        header: 'Issue',
        cell: ({ row }) => (
          <span className="block truncate text-[var(--status-error)]" title={row.original.issue}>
            {row.original.issue}
          </span>
        ),
      },
      {
        id: 'pin',
        accessorKey: 'pinned',
        header: 'Pin',
        cell: ({ row }) => (
          <Button
            type="button"
            variant={row.original.pinned ? 'secondary' : 'outline'}
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              onTogglePinned(row.original.traceId)
            }}
          >
            {row.original.pinned ? 'Unpin' : 'Pin'}
          </Button>
        ),
      },
    ],
    [onTogglePinned],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.traceId,
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
            <TableCell colSpan={7} className="py-8 text-center text-[var(--text-secondary)]">
              No runs match the current filters.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => {
            const selected = selectedTraceId === row.original.traceId
            return (
              <TableRow
                key={row.id}
                data-state={selected ? 'selected' : undefined}
                onClick={() => onSelectTrace(selected ? undefined : row.original.traceId)}
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
