import type { ReactNode } from 'react';

import { formatEasternTime } from '../time';
import type { LogEntry } from '../types';
import { DurationBadge } from './DurationBadge';

export function getEventInspectorPresentation(
  entry: LogEntry,
  nodeLabel?: string,
  onOpenNode?: (nodeId: string) => void,
): {
  title: ReactNode;
  description: ReactNode;
  headerContent: ReactNode;
} {
  const timestamp = formatEasternTime(entry.timestamp, { precise: true });
  const label = nodeLabel ?? entry.nodeId ?? 'Event';
  const canOpenNode = Boolean(entry.nodeId && onOpenNode);

  const title: ReactNode = canOpenNode ? (
    <button
      type="button"
      onClick={() => onOpenNode?.(entry.nodeId as string)}
      className="cursor-pointer border-b border-dashed border-transparent text-left transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
    >
      {label}
    </button>
  ) : (
    label
  );

  return {
    title,
    description: (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono">{timestamp}</span>
        <DurationBadge durationMs={entry.durationMs} />
      </span>
    ),
    headerContent: null,
  };
}
