import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';

import {
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

import { formatEasternTime } from '../time';
import type { TraceJourney, TraceStatus } from '../types';
import {
  canonicalStepId,
  formatRunLabel,
  formatStepDisplayLabel,
  getJourneySummaryStep,
} from '../runPresentation';
import { DurationBadge } from './DurationBadge';
import { sortIndicator } from './tableUtils';

interface RunsTableProps {
  journeys: TraceJourney[];
  selectedTraceId?: string;
  onSelectTrace: (traceId?: string) => void;
}

interface RunRowData {
  traceId: string;
  runLabel: string;
  latestStep: string;
  latestStepId?: string;
  status: TraceStatus;
  durationMs?: number;
  updatedAt: string;
  issue: string;
}

const STATUS_CLASSES: Record<TraceStatus, string> = {
  error: 'bg-[color-mix(in_srgb,var(--status-error)_12%,transparent)] text-[var(--status-error)]',
  success:
    'bg-[color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[var(--status-success)]',
  partial:
    'bg-[color-mix(in_srgb,var(--status-warning)_12%,transparent)] text-[var(--status-warning)]',
  running: 'bg-[var(--surface-inset)] text-[var(--text-muted)]',
};

function statusRank(status: TraceStatus) {
  if (status === 'error') {
    return 0;
  }
  if (status === 'running') {
    return 1;
  }
  if (status === 'partial') {
    return 2;
  }
  return 3;
}

export function RunsTable({ journeys, selectedTraceId, onSelectTrace }: RunsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updated', desc: true }]);

  const data = useMemo<RunRowData[]>(
    () =>
      journeys.map((journey) => {
        const summaryStage = getJourneySummaryStep(journey);
        return {
          traceId: journey.traceId,
          runLabel: formatRunLabel(journey),
          latestStep: summaryStage ? formatStepDisplayLabel(summaryStage) : '-',
          latestStepId: summaryStage ? canonicalStepId(summaryStage) : undefined,
          status: journey.status,
          durationMs: journey.durationMs,
          updatedAt: journey.lastUpdatedAt,
          issue: journey.errorSummary ?? '-',
        };
      }),
    [journeys],
  );

  const columns = useMemo<ColumnDef<RunRowData>[]>(
    () => [
      {
        id: 'run',
        accessorKey: 'runLabel',
        header: 'Run',
        cell: ({ row }) => (
          <span className="truncate font-mono text-[13px] leading-5">{row.original.runLabel}</span>
        ),
      },
      {
        id: 'latestStep',
        accessorKey: 'latestStep',
        header: 'Latest step',
        cell: ({ row }) => (
          <span
            className="truncate font-mono text-xs text-[var(--text-secondary)]"
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
        sortingFn: (rowA, rowB) =>
          statusRank(rowA.original.status) - statusRank(rowB.original.status),
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CLASSES[row.original.status]}`}
          >
            {row.original.status}
          </span>
        ),
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
        sortingFn: (rowA, rowB) =>
          (rowA.original.durationMs ?? -1) - (rowB.original.durationMs ?? -1),
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
        sortingFn: (rowA, rowB) =>
          Date.parse(rowA.original.updatedAt) - Date.parse(rowB.original.updatedAt),
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
        cell: ({ row }) =>
          row.original.issue !== '-' ? (
            <span
              className="block truncate font-mono text-[13px] leading-5 text-[var(--status-error)]"
              title={row.original.issue}
            >
              {row.original.issue}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">-</span>
          ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.traceId,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[20%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[15%]" />
          <col className="w-[25%]" />
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="cursor-default hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
      </Table>
      <ScrollArea className="flex-1">
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[25%]" />
          </colgroup>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="cursor-default hover:bg-transparent">
                <TableCell colSpan={6} className="py-8 text-center text-[var(--text-secondary)]">
                  No runs match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const selected = selectedTraceId === row.original.traceId;
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
                );
              })
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
