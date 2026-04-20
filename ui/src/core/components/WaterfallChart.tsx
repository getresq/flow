import { useMemo } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui';

import type { SpanEntry } from '../types';

interface WaterfallChartProps {
  spans: SpanEntry[];
  errorNodeIds?: Set<string>;
  onSelectNode?: (nodeId: string) => void;
}

interface WaterfallBar {
  span: SpanEntry;
  startOffset: number;
  duration: number;
  depth: number;
  isCriticalPath: boolean;
}

function parseMs(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

function computeDepth(span: SpanEntry, spanMap: Map<string, SpanEntry>): number {
  if (!span.parentSpanId) return 0;
  const parent = spanMap.get(span.parentSpanId);
  if (!parent) return 0;
  return computeDepth(parent, spanMap) + 1;
}

function computeCriticalPath(bars: WaterfallBar[]): Set<string> {
  // Critical path: longest chain of sequential spans
  // For simplicity, identify spans that are on the longest-duration path
  const criticalIds = new Set<string>();
  if (bars.length === 0) return criticalIds;

  // Sort by start offset
  const sorted = [...bars].sort((a, b) => a.startOffset - b.startOffset);

  // dp[i] = total critical duration ending at span i
  const dp: number[] = sorted.map((bar) => bar.duration);
  const prev: number[] = sorted.map((_, i) => i);

  for (let i = 1; i < sorted.length; i++) {
    for (let j = 0; j < i; j++) {
      const jEnd = sorted[j].startOffset + sorted[j].duration;
      // span j finishes before span i starts (sequential)
      if (jEnd <= sorted[i].startOffset + 1) {
        const candidate = dp[j] + sorted[i].duration;
        if (candidate > dp[i]) {
          dp[i] = candidate;
          prev[i] = j;
        }
      }
    }
  }

  // Find the end of the critical path
  let maxIdx = 0;
  for (let i = 1; i < dp.length; i++) {
    if (dp[i] > dp[maxIdx]) maxIdx = i;
  }

  // Trace back
  let idx = maxIdx;
  while (true) {
    criticalIds.add(sorted[idx].span.spanId);
    if (prev[idx] === idx) break;
    idx = prev[idx];
  }

  return criticalIds;
}

export function WaterfallChart({ spans, errorNodeIds, onSelectNode }: WaterfallChartProps) {
  const { bars, totalDuration, criticalPathDuration } = useMemo(() => {
    if (spans.length === 0) {
      return { bars: [], totalDuration: 0, criticalPathDuration: 0, runStart: 0 };
    }

    const spanMap = new Map(spans.map((s) => [s.spanId, s]));

    const startMs = Math.min(...spans.map((s) => parseMs(s.startTime)).filter((t) => t > 0));
    const endMs = Math.max(
      ...spans
        .map((s) => parseMs(s.endTime) || parseMs(s.startTime) + (s.durationMs ?? 0))
        .filter((t) => t > 0),
    );
    const total = Math.max(endMs - startMs, 1);

    const rawBars: WaterfallBar[] = spans
      .filter((s) => parseMs(s.startTime) > 0)
      .map((s) => ({
        span: s,
        startOffset: parseMs(s.startTime) - startMs,
        duration: s.durationMs ?? (parseMs(s.endTime) - parseMs(s.startTime) || 0),
        depth: computeDepth(s, spanMap),
        isCriticalPath: false,
      }))
      .sort((a, b) => a.startOffset - b.startOffset || a.depth - b.depth);

    const criticalIds = computeCriticalPath(rawBars);
    let critDuration = 0;
    for (const bar of rawBars) {
      if (criticalIds.has(bar.span.spanId)) {
        bar.isCriticalPath = true;
        critDuration += bar.duration;
      }
    }

    return { bars: rawBars, totalDuration: total, criticalPathDuration: critDuration };
  }, [spans]);

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-[var(--text-muted)]">
        No span timing data available for this run.
      </div>
    );
  }

  const labelWidth = 140;

  return (
    <TooltipProvider>
      <div className="space-y-1" data-testid="waterfall-chart">
        {bars.map((bar) => {
          const leftPercent = totalDuration > 0 ? (bar.startOffset / totalDuration) * 100 : 0;
          const widthPercent =
            totalDuration > 0 ? Math.max((bar.duration / totalDuration) * 100, 1.5) : 1.5;

          const isError = bar.span.status === 'error' || errorNodeIds?.has(bar.span.nodeId);
          const statusColor = isError
            ? 'var(--status-error)'
            : bar.isCriticalPath
              ? 'var(--status-warning)'
              : bar.span.status === 'active'
                ? 'var(--status-active)'
                : 'var(--status-success)';

          return (
            <Tooltip key={bar.span.spanId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="group flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-[var(--surface-overlay)]/50"
                  style={{ paddingLeft: `${bar.depth * 12 + 4}px` }}
                  onClick={() => onSelectNode?.(bar.span.nodeId)}
                  data-testid="waterfall-bar"
                >
                  <span
                    className="shrink-0 truncate text-xs text-[var(--text-secondary)]"
                    style={{ width: `${labelWidth - bar.depth * 12}px` }}
                  >
                    {bar.span.nodeId || bar.span.spanName}
                  </span>

                  <div className="relative h-5 flex-1 rounded bg-[var(--surface-inset)]">
                    <div
                      className="absolute top-0.5 h-4 rounded transition-all duration-200"
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        backgroundColor: statusColor,
                        opacity: bar.isCriticalPath ? 1 : 0.6,
                        boxShadow: bar.isCriticalPath ? `0 0 0 1px ${statusColor}` : undefined,
                      }}
                    />
                  </div>

                  <span
                    className={`shrink-0 w-14 text-right font-mono text-xs ${isError ? 'text-[var(--status-error)]' : 'text-[var(--text-muted)]'}`}
                  >
                    {formatDuration(bar.duration)}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="space-y-1">
                <p className="font-semibold">{bar.span.nodeId || bar.span.spanName}</p>
                {bar.span.nodeId ? (
                  <p className="text-xs text-[var(--text-muted)]">{bar.span.spanName}</p>
                ) : null}
                <p className="text-xs">Duration: {formatDuration(bar.duration)}</p>
                {bar.isCriticalPath ? (
                  <p className="text-xs font-semibold text-[var(--status-warning)]">
                    Critical path
                  </p>
                ) : null}
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--text-muted)]">
          <span>Total: {formatDuration(totalDuration)}</span>
          <span>Critical path: {formatDuration(criticalPathDuration)}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
