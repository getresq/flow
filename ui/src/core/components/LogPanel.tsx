import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Badge,
  Button,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

import { buildLogSearchText, getLogDisplayMessage } from '../logPresentation';
import { formatEasternTime } from '../time';
import { DurationBadge } from './DurationBadge';
import type { FlowConfig, LogEntry } from '../types';

interface LogPanelProps {
  flow: FlowConfig;
  globalLogs: LogEntry[];
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
}

function logVariant(level: LogEntry['level']): 'destructive' | 'success' {
  return level === 'error' ? 'destructive' : 'success';
}

function compareLogEntriesDescending(left: LogEntry, right: LogEntry): number {
  if (typeof left.seq === 'number' && typeof right.seq === 'number' && left.seq !== right.seq) {
    return right.seq - left.seq;
  }

  return Date.parse(right.timestamp) - Date.parse(left.timestamp);
}

export function LogPanel({ flow, globalLogs, selectedNodeId, onSelectNode }: LogPanelProps) {
  const [open, setOpen] = useState(true);
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'error'>('all');
  const [search, setSearch] = useState('');
  const [nodeFilter, setNodeFilter] = useState<string | 'all'>('all');
  const [liveTail, setLiveTail] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const effectiveNodeFilter = selectedNodeId ?? nodeFilter;

  const nodeLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of flow.nodes) {
      map.set(node.id, node.label);
    }
    return map;
  }, [flow.nodes]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...globalLogs]
      .filter((entry) => {
        if (levelFilter !== 'all' && entry.level !== levelFilter) {
          return false;
        }

        if (effectiveNodeFilter !== 'all' && entry.nodeId !== effectiveNodeFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        return buildLogSearchText(
          entry,
          entry.nodeId ? nodeLabels.get(entry.nodeId) : undefined,
        ).includes(query);
      })
      .sort(compareLogEntriesDescending);
  }, [effectiveNodeFilter, globalLogs, levelFilter, nodeLabels, search]);

  useEffect(() => {
    if (!open || !liveTail) {
      return;
    }

    const viewport = listRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport instanceof HTMLDivElement) {
      viewport.scrollTop = 0;
    }
  }, [filteredLogs, liveTail, open]);

  if (!open) {
    return (
      <aside className="w-16 border-l border-[var(--border-default)] bg-[var(--surface-primary)]/90 p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          Logs
        </Button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[340px] flex-col border-l border-[var(--border-default)] bg-[var(--surface-primary)]/90">
      <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">
          Live logs
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Collapse
        </Button>
      </div>

      <div className="space-y-3 border-b border-[var(--border-default)] px-4 py-3">
        <Input
          placeholder="Search logs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="flex gap-2">
          {(['all', 'info', 'error'] as const).map((level) => (
            <Button
              key={level}
              type="button"
              variant={levelFilter === level ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLevelFilter(level)}
            >
              {level}
            </Button>
          ))}
        </div>

        <Select
          value={effectiveNodeFilter}
          onValueChange={(value) => setNodeFilter(value as string | 'all')}
        >
          <SelectTrigger>
            <SelectValue placeholder="All nodes" />
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
      </div>

      <ScrollArea
        ref={listRef}
        className="flex-1"
        onScrollCapture={(event) => {
          if (event.target instanceof HTMLDivElement) {
            setLiveTail(event.target.scrollTop < 12);
          }
        }}
      >
        <div className="space-y-3 px-4 py-3">
          {filteredLogs.map((entry, index) => {
            const nodeLabel = entry.nodeId
              ? (nodeLabels.get(entry.nodeId) ?? entry.nodeId)
              : 'unmapped';
            const timestamp = formatEasternTime(entry.timestamp, { precise: true });

            return (
              <button
                key={`${entry.timestamp}-${entry.message}-${index}`}
                type="button"
                onClick={() => entry.nodeId && onSelectNode(entry.nodeId)}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] p-3 text-left transition-colors hover:border-[var(--border-accent)]"
              >
                <div className="mb-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="font-mono">{timestamp}</span>
                  <Badge variant="secondary">{nodeLabel}</Badge>
                  <Badge variant={logVariant(entry.level)}>
                    {entry.level === 'error' ? 'Error' : 'OK'}
                  </Badge>
                  <DurationBadge className="ml-auto" durationMs={entry.durationMs} />
                </div>
                <p className="truncate text-sm text-[var(--text-primary)]">
                  {getLogDisplayMessage(entry)}
                </p>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {!liveTail ? (
        <Button
          type="button"
          variant="secondary"
          className="justify-start rounded-none border-t border-[var(--border-default)]"
          onClick={() => {
            setLiveTail(true);
            const viewport = listRef.current?.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport instanceof HTMLDivElement) {
              viewport.scrollTop = 0;
            }
          }}
        >
          Live tail paused. Click to resume.
        </Button>
      ) : null}
    </aside>
  );
}
