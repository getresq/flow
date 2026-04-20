import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';

import {
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

import { getLogDisplayMessage, getLogSelectionId } from '../logPresentation';
import { formatEasternTime } from '../time';
import type { LogEntry } from '../types';
import { DurationBadge } from './DurationBadge';
import { sortIndicator } from './tableUtils';

const FRESH_BATCH_LIMIT = 20;
const LOG_ROW_ESTIMATE_PX = 42;
const VIRTUALIZATION_THRESHOLD = 100;
const VIRTUAL_OVERSCAN = 10;
const FALLBACK_VIEWPORT_RECT = { width: 1024, height: 360 };

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) {
    return;
  }
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  ref.current = value;
}

interface LogsTableProps {
  logs: LogEntry[];
  nodeLabels: Map<string, string>;
  nodeFamilies: Map<string, string>;
  selectedTraceId?: string;
  selectedLogSeq?: string;
  liveTail?: boolean;
  onSelectLog: (entry: LogEntry) => void;
  scrollAreaRef?: React.RefObject<HTMLDivElement | null>;
  scrollViewportRef?: React.Ref<HTMLDivElement>;
}

interface LogRowData {
  id: string;
  executionId?: string;
  timestamp: string;
  nodeLabel: string;
  nodeId?: string;
  nodeFamily?: string;
  messagePrefix?: string;
  messageBody: string;
  messageTitle: string;
  entry: LogEntry;
}

function getLogRowId(entry: LogEntry, index: number): string {
  const selectionId = getLogSelectionId(entry);
  if (selectionId) return `log:${selectionId}`;

  // Some direct callers may pass rows before useLogStream has assigned selection ids.
  // Keep that fallback isolated so live data with seq/selectionId never re-keys on prepend.
  return [
    'fallback',
    entry.timestamp,
    entry.runId ?? '',
    entry.traceId ?? '',
    entry.nodeId ?? '',
    entry.message,
    index,
  ].join(':');
}

function observeScrollElementRect(
  instance: Virtualizer<HTMLDivElement, HTMLTableRowElement>,
  cb: (rect: { width: number; height: number }) => void,
) {
  const element = instance.scrollElement;
  if (!element) return undefined;

  const notify = () => {
    const rect = element.getBoundingClientRect();
    cb({
      width: rect.width || FALLBACK_VIEWPORT_RECT.width,
      height: rect.height || FALLBACK_VIEWPORT_RECT.height,
    });
  };

  notify();

  if (typeof ResizeObserver === 'undefined') {
    return undefined;
  }

  const observer = new ResizeObserver(notify);
  observer.observe(element);

  return () => observer.disconnect();
}

export function LogsTable({
  logs,
  nodeLabels,
  nodeFamilies,
  selectedTraceId,
  selectedLogSeq,
  liveTail,
  onSelectLog,
  scrollAreaRef,
  scrollViewportRef,
}: LogsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'time', desc: true }]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);

  const prevMaxSeqRef = useRef<number | null>(null);

  const handleViewportRef = useCallback(
    (element: HTMLDivElement | null) => {
      assignRef(scrollViewportRef, element);
      setViewportElement(element);
    },
    [scrollViewportRef],
  );

  const freshSeqs = useMemo(() => {
    if (prevMaxSeqRef.current === null || !liveTail) return new Set<number>();

    const prevMax = prevMaxSeqRef.current;
    const fresh = new Set<number>();
    for (const entry of logs) {
      if (typeof entry.seq === 'number' && entry.seq > prevMax) {
        fresh.add(entry.seq);
      }
    }

    if (fresh.size > FRESH_BATCH_LIMIT) return new Set<number>();

    return fresh;
  }, [logs, liveTail]);

  useEffect(() => {
    let max = 0;
    for (const entry of logs) {
      if (typeof entry.seq === 'number') {
        max = Math.max(max, entry.seq);
      }
    }
    prevMaxSeqRef.current = max;
  }, [logs]);

  const data = useMemo<LogRowData[]>(
    () =>
      logs.map((entry, index) => {
        const fullMsg = getLogDisplayMessage(entry);
        const colonIdx = fullMsg.indexOf(':');
        const messagePrefix =
          colonIdx > 0 && colonIdx < 40 ? fullMsg.slice(0, colonIdx) : undefined;
        const messageBody =
          colonIdx > 0 && colonIdx < 40 ? fullMsg.slice(colonIdx + 1).trimStart() : fullMsg;

        return {
          id: getLogRowId(entry, index),
          executionId: entry.runId ?? entry.traceId,
          timestamp: entry.timestamp,
          nodeLabel: entry.nodeId ? (nodeLabels.get(entry.nodeId) ?? entry.nodeId) : '—',
          nodeId: entry.nodeId,
          nodeFamily: entry.nodeId ? nodeFamilies.get(entry.nodeId) : undefined,
          messagePrefix,
          messageBody,
          messageTitle:
            entry.displayMessage && entry.displayMessage !== entry.message
              ? `${entry.displayMessage}\nraw: ${entry.message}`
              : fullMsg,
          entry,
        };
      }),
    [logs, nodeLabels, nodeFamilies],
  );

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
              background: `var(--chip-${row.original.nodeFamily ?? 'slate'}-bg)`,
              color: `var(--chip-${row.original.nodeFamily ?? 'slate'}-text)`,
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
          <span className="flex min-w-0 items-center gap-3" title={row.original.messageTitle}>
            <span className="min-w-0 truncate">
              {row.original.messagePrefix && (
                <span className="mr-1 font-mono text-[11px] text-[var(--text-muted)]">
                  {row.original.messagePrefix}:
                </span>
              )}
              <span className="font-mono text-[13px] leading-5 text-[var(--text-primary)]">
                {row.original.messageBody}
              </span>
            </span>
            {typeof row.original.entry.durationMs === 'number' &&
              row.original.entry.durationMs >= 1000 && (
                <DurationBadge
                  durationMs={row.original.entry.durationMs}
                  className="flex-shrink-0"
                />
              )}
          </span>
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
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;
  const shouldVirtualize = rows.length > VIRTUALIZATION_THRESHOLD;
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: rows.length,
    getScrollElement: () => viewportElement,
    estimateSize: () => LOG_ROW_ESTIMATE_PX,
    getItemKey: (index) => rows[index]?.id ?? index,
    observeElementRect: observeScrollElementRect,
    overscan: VIRTUAL_OVERSCAN,
    initialRect: FALLBACK_VIEWPORT_RECT,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const fallbackVirtualRowCount = Math.min(
    rows.length,
    Math.ceil(FALLBACK_VIEWPORT_RECT.height / LOG_ROW_ESTIMATE_PX) + VIRTUAL_OVERSCAN * 2,
  );
  const rowIndexes = shouldVirtualize
    ? virtualRows.length > 0
      ? virtualRows.map((virtualRow) => virtualRow.index)
      : Array.from({ length: fallbackVirtualRowCount }, (_, index) => index)
    : rows.map((_, index) => index);
  const virtualPaddingTop = shouldVirtualize && virtualRows.length > 0 ? virtualRows[0].start : 0;
  const virtualPaddingBottom = shouldVirtualize
    ? virtualRows.length > 0
      ? Math.max(0, rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end)
      : Math.max(0, (rows.length - fallbackVirtualRowCount) * LOG_ROW_ESTIMATE_PX)
    : 0;

  const isRowSelected = useCallback(
    (row: (typeof rows)[number]) => {
      if (selectedLogSeq != null && getLogSelectionId(row.original.entry) === selectedLogSeq) {
        return true;
      }
      if (selectedTraceId != null && row.original.executionId === selectedTraceId) return true;
      return false;
    },
    [selectedLogSeq, selectedTraceId],
  );

  const selectedRowIndex = useMemo(() => rows.findIndex(isRowSelected), [rows, isRowSelected]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();

      if (rows.length === 0) return;

      const direction = e.key === 'ArrowDown' ? 1 : -1;
      const current = selectedRowIndex >= 0 ? selectedRowIndex : direction === 1 ? -1 : rows.length;
      const next = Math.max(0, Math.min(current + direction, rows.length - 1));

      onSelectLog(rows[next].original.entry);
      if (shouldVirtualize) {
        rowVirtualizer.scrollToIndex(next, { align: 'auto' });
      } else {
        const targetEl = containerRef.current?.querySelector(`[data-index="${next}"]`) as
          | HTMLElement
          | undefined;
        targetEl?.scrollIntoView({ block: 'nearest' });
      }
      containerRef.current?.focus({ preventScroll: true });
    },
    [rows, selectedRowIndex, onSelectLog, rowVirtualizer, shouldVirtualize],
  );

  useEffect(() => {
    if (!shouldVirtualize || !selectedLogSeq || selectedRowIndex < 0) return;
    rowVirtualizer.scrollToIndex(selectedRowIndex, { align: 'auto' });
  }, [rowVirtualizer, selectedLogSeq, selectedRowIndex, shouldVirtualize]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[160px]" />
          <col className="w-[200px]" />
          <col />
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
      <ScrollArea ref={scrollAreaRef} viewportRef={handleViewportRef} className="flex-1">
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[160px]" />
            <col className="w-[200px]" />
            <col />
          </colgroup>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="cursor-default hover:bg-transparent">
                <TableCell colSpan={3} className="py-8 text-center text-[var(--text-secondary)]">
                  No logs match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {virtualPaddingTop > 0 ? (
                  <tr aria-hidden="true" role="presentation">
                    <td colSpan={3} style={{ height: `${virtualPaddingTop}px`, padding: 0 }} />
                  </tr>
                ) : null}
                {rowIndexes.map((rowIndex) => {
                  const row = rows[rowIndex];
                  if (!row) return null;
                  const selected = isRowSelected(row);
                  const isFresh =
                    typeof row.original.entry.seq === 'number' &&
                    freshSeqs.has(row.original.entry.seq);
                  const severity =
                    row.original.entry.level === 'error' || row.original.entry.signal === 'critical'
                      ? 'error'
                      : typeof row.original.entry.durationMs === 'number' &&
                          row.original.entry.durationMs >= 1000
                        ? 'warning'
                        : undefined;
                  return (
                    <TableRow
                      key={row.id}
                      data-state={selected ? 'selected' : undefined}
                      data-index={rowIndex}
                      data-level={row.original.entry.level}
                      data-severity={severity}
                      data-fresh={isFresh ? '' : undefined}
                      onClick={() => {
                        onSelectLog(row.original.entry);
                        containerRef.current?.focus({ preventScroll: true });
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {virtualPaddingBottom > 0 ? (
                  <tr aria-hidden="true" role="presentation">
                    <td colSpan={3} style={{ height: `${virtualPaddingBottom}px`, padding: 0 }} />
                  </tr>
                ) : null}
              </>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
