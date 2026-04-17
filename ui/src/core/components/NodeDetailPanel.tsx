import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import {
  Button,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'

import { DurationBadge } from './DurationBadge'
import { getLogSelectionId } from '../logPresentation'
import { isDefaultVisibleLogEntry } from '../telemetryClassification'
import { normalizeTraceIdentifierValue } from '../traceIdentifiers'
import { firstClassColors } from '../nodes/nodePrimitives'
import { summarizeStepOutcome } from '../stepOutcomePresentation'
import type { FlowNodeConfig, LogEntry, NodeStatus, SpanEntry } from '../types'

export interface NodeDetailStatus {
  status: NodeStatus
  durationMs?: number
  durationVisibleUntil?: number
}

interface NodeDetailContentProps {
  node: FlowNodeConfig
  status?: NodeDetailStatus
  logs: LogEntry[]
  spans: SpanEntry[]
  onOpenRun?: (traceId: string) => void
  onOpenLog?: (entry: LogEntry) => void
}

type TabKey = 'overview' | 'debug'

const EVENTS_PAGE_SIZE = 5

function parseIsoTime(value?: string): number {
  if (!value) {
    return 0
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function compareLogEntriesDescending(left: LogEntry, right: LogEntry): number {
  if (typeof left.seq === 'number' && typeof right.seq === 'number' && left.seq !== right.seq) {
    return right.seq - left.seq
  }

  const byTime = parseIsoTime(right.timestamp) - parseIsoTime(left.timestamp)
  if (byTime !== 0) {
    return byTime
  }

  return (right.runId ?? right.traceId ?? '').localeCompare(left.runId ?? left.traceId ?? '')
}

function spanSortTime(span: SpanEntry): number {
  return parseIsoTime(span.endTime) || parseIsoTime(span.startTime)
}

function formatRelativeTime(timestampMs: number): string | null {
  if (!timestampMs) {
    return null
  }

  const deltaMs = Math.max(Date.now() - timestampMs, 0)

  if (deltaMs < 5_000) {
    return 'just now'
  }
  if (deltaMs < 60_000) {
    return `${Math.round(deltaMs / 1_000)}s ago`
  }
  if (deltaMs < 3_600_000) {
    return `${Math.round(deltaMs / 60_000)}m ago`
  }
  if (deltaMs < 86_400_000) {
    return `${Math.round(deltaMs / 3_600_000)}h ago`
  }

  return `${Math.round(deltaMs / 86_400_000)}d ago`
}

function compactIdentifier(value: string, maxLength = 16): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}…`
}

function compactErrorPreview(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1)}…`
}

function readNormalizedLogAttribute(entry: LogEntry, key: string): string | undefined {
  const value = entry.attributes?.[key]

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeTraceIdentifierValue(value)
  }

  return undefined
}

function recentRunLabel(entry: LogEntry): string | null {
  const threadId = readNormalizedLogAttribute(entry, 'thread_id')
  const replyDraftId = readNormalizedLogAttribute(entry, 'reply_draft_id')
  const requestId = readNormalizedLogAttribute(entry, 'request_id')
  const runId = normalizeTraceIdentifierValue(entry.runId)
  const traceId = normalizeTraceIdentifierValue(entry.traceId)

  if (threadId) return compactIdentifier(threadId)
  if (replyDraftId) return compactIdentifier(replyDraftId)
  if (requestId) return compactIdentifier(requestId)
  if (runId) return compactIdentifier(runId)
  if (traceId) return compactIdentifier(traceId)

  return null
}

function computeDepthMap(spans: SpanEntry[]): Map<string, number> {
  const depth = new Map<string, number>()

  const findDepth = (span: SpanEntry): number => {
    const cached = depth.get(span.spanId)
    if (typeof cached === 'number') {
      return cached
    }

    if (!span.parentSpanId) {
      depth.set(span.spanId, 0)
      return 0
    }

    const parent = spans.find((candidate) => candidate.spanId === span.parentSpanId)
    if (!parent) {
      depth.set(span.spanId, 0)
      return 0
    }

    const resolved = findDepth(parent) + 1
    depth.set(span.spanId, resolved)
    return resolved
  }

  for (const span of spans) {
    findDepth(span)
  }

  return depth
}

function summarizeEventMessage(entry: LogEntry): string {
  const outcome = summarizeStepOutcome({
    stepId: entry.stepId,
    nodeId: entry.nodeId ?? entry.componentId,
    message: entry.message,
    retryable: entry.retryable,
    errorClass: entry.errorClass,
    attributes: entry.attributes,
  })

  if (outcome) return outcome

  return entry.message
}

export function NodeDetailContent({ node, status, logs, spans, onOpenRun, onOpenLog }: NodeDetailContentProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [visibleEventCount, setVisibleEventCount] = useState<number>(EVENTS_PAGE_SIZE)
  const [copiedError, setCopiedError] = useState(false)
  const copyResetTimeoutRef = useRef<number | null>(null)
  const showRuntimeCards = firstClassColors.has(node.style?.color ?? '')

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    }
  }, [])

  // Reset pagination when the selected node changes
  useEffect(() => {
    setVisibleEventCount(EVENTS_PAGE_SIZE)
  }, [node.id])

  const sortedLogs = useMemo(
    () => [...logs].sort(compareLogEntriesDescending),
    [logs],
  )
  const defaultVisibleLogs = useMemo(
    () => sortedLogs.filter((entry) => isDefaultVisibleLogEntry(entry)),
    [sortedLogs],
  )

  const sortedSpans = useMemo(
    () => [...spans].sort((left, right) => spanSortTime(right) - spanSortTime(left)),
    [spans],
  )

  const tracesByTraceId = useMemo(() => {
    const grouped = new Map<string, SpanEntry[]>()

    for (const span of spans) {
      const executionId = span.runId ?? span.traceId
      const list = grouped.get(executionId) ?? []
      list.push(span)
      grouped.set(executionId, list)
    }

    return [...grouped.entries()]
      .map(([traceId, traceSpans]) => [
        traceId,
        [...traceSpans].sort((left, right) => parseIsoTime(left.startTime) - parseIsoTime(right.startTime)),
      ] as const)
      .sort((left, right) => {
        const leftLatest = Math.max(...left[1].map((span) => spanSortTime(span)))
        const rightLatest = Math.max(...right[1].map((span) => spanSortTime(span)))
        return rightLatest - leftLatest
      })
      .slice(0, 5)
  }, [spans])

  const latestLog = sortedLogs[0]
  const latestSpan = sortedSpans[0]
  const latestAttributes = latestLog?.attributes ?? latestSpan?.attributes
  const latestErrorLog = sortedLogs.find((entry) => entry.level === 'error')
  const latestErrorMessage =
    (typeof latestErrorLog?.attributes?.error_message === 'string'
      ? latestErrorLog.attributes.error_message
      : undefined) ?? latestErrorLog?.message
  const latestErrorPreview = latestErrorMessage ? compactErrorPreview(latestErrorMessage) : null
  const lastSeenTimestamp = Math.max(
    latestLog ? parseIsoTime(latestLog.timestamp) : 0,
    latestSpan ? spanSortTime(latestSpan) : 0,
  )
  const lastSeenLabel = formatRelativeTime(lastSeenTimestamp)

  // Status derivation: error > active > success > idle
  const effectiveStatus: NodeStatus =
    latestErrorLog
      ? 'error'
      : status?.status === 'active'
        ? 'active'
        : lastSeenTimestamp > 0
          ? 'success'
          : 'idle'

  const statusLabel =
    effectiveStatus === 'error'
      ? 'Recent failure'
      : effectiveStatus === 'active'
        ? 'Active'
        : effectiveStatus === 'success'
          ? 'Healthy'
          : 'No recent activity'

  // Latest run-backed execution for the "Last run" row.
  // Only real non-error runs qualify — errors are promoted via the Latest failure block,
  // so we don't double-surface the same run.
  const latestRunEntry = useMemo(() => {
    const source = defaultVisibleLogs.length > 0 ? defaultVisibleLogs : sortedLogs
    return source.find((entry) => Boolean(entry.runId) && entry.level !== 'error')
  }, [defaultVisibleLogs, sortedLogs])
  const latestRunDisplay = latestRunEntry ? recentRunLabel(latestRunEntry) : null
  const latestRunId = latestRunEntry?.runId

  const recentEvents = useMemo(() => {
    // Prefer the curated "default-visible" set. Fall back to all non-span logs when
    // the curated set is empty (e.g. demo/synthetic data without proper signal tags).
    const source = defaultVisibleLogs.length > 0 ? defaultVisibleLogs : sortedLogs
    return source
      .filter((entry) => entry.eventType !== 'span_start' && entry.eventType !== 'span_end')
      .map((entry) => ({
        entry,
        summary: summarizeEventMessage(entry),
        isError: entry.level === 'error',
      }))
      .filter((item) => Boolean(item.summary))
  }, [defaultVisibleLogs, sortedLogs])

  const visibleEvents = recentEvents.slice(0, visibleEventCount)
  const hasMoreEvents = recentEvents.length > visibleEventCount

  const handleCopyError = async () => {
    if (!latestErrorMessage || typeof navigator?.clipboard?.writeText !== 'function') {
      return
    }

    try {
      await navigator.clipboard.writeText(latestErrorMessage)
      setCopiedError(true)

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedError(false)
      }, 1_500)
    } catch {
      setCopiedError(false)
    }
  }

  const handleOpenLog = (entry: LogEntry) => {
    onOpenLog?.(entry)
  }

  // Status dot color based on effective status
  const statusDotClass =
    effectiveStatus === 'error'
      ? 'bg-[var(--status-error)]'
      : effectiveStatus === 'active'
        ? 'bg-[var(--status-active)] animate-flow-pulse'
        : effectiveStatus === 'success'
          ? 'bg-[var(--status-success)]'
          : 'bg-[var(--text-muted)]'

  const statusTextClass =
    effectiveStatus === 'error'
      ? 'text-[var(--status-error)]'
      : effectiveStatus === 'idle'
        ? 'text-[var(--text-secondary)]'
        : 'text-[var(--text-primary)]'

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as TabKey)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="border-b border-[var(--border-default)] px-4 py-3">
        <TabsList className="border-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0 min-h-0 flex-1 overflow-hidden pt-0">
        <div className="flex h-full min-h-0 flex-col px-4 py-3">
          {/* Status row — flat, no card */}
          <div className="flex items-center gap-3 py-1">
            <span className={`size-2 shrink-0 rounded-full ${statusDotClass}`} aria-hidden />
            <span className={`text-sm font-medium ${statusTextClass}`}>{statusLabel}</span>
            {lastSeenLabel && effectiveStatus !== 'idle' ? (
              <span className="ml-auto text-xs text-[var(--text-muted)]">{lastSeenLabel}</span>
            ) : null}
          </div>

          {/* Latest failure block — promoted when error exists */}
          {latestErrorLog && latestErrorMessage ? (
            <>
              <div className="my-3 h-px bg-[var(--border-default)]" />
              <div className="rounded-lg border-l-[3px] border-l-[var(--status-error)] border border-[var(--border-default)] px-3 py-3 [background-color:color-mix(in_srgb,var(--status-error)_10%,transparent)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs uppercase tracking-wide text-[var(--status-error)]">Latest failure</h3>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                      {formatRelativeTime(parseIsoTime(latestErrorLog.timestamp)) ?? 'just now'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={() => void handleCopyError()}
                    aria-label={copiedError ? 'Copied latest error' : 'Copy latest error'}
                  >
                    {copiedError ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    <span>{copiedError ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
                {latestErrorPreview ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-5 text-[var(--text-primary)]">{latestErrorPreview}</p>
                ) : null}
                {onOpenRun && latestErrorLog.runId ? (
                  <button
                    type="button"
                    className="mt-3 text-xs text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)]"
                    onClick={() => {
                      if (latestErrorLog.runId) onOpenRun(latestErrorLog.runId)
                    }}
                  >
                    View run →
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {/* Last run — compact row, only when runtime cards are relevant */}
          {showRuntimeCards && latestRunEntry && latestRunDisplay ? (
            <>
              <div className="my-3 h-px bg-[var(--border-default)]" />
              <div className="flex items-center justify-between gap-3 py-1">
                <div className="min-w-0">
                  <div className="text-xs text-[var(--text-secondary)]">Last run</div>
                  <div className="mt-0.5 truncate font-mono text-sm text-[var(--text-primary)]">{latestRunDisplay}</div>
                </div>
                {onOpenRun && latestRunId ? (
                  <button
                    type="button"
                    className="shrink-0 text-sm text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)]"
                    onClick={() => onOpenRun(latestRunId)}
                  >
                    View run →
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {/* Recent events */}
          {recentEvents.length > 0 ? (
            <>
              <div className="my-3 h-px bg-[var(--border-default)]" />
              <section className="flex min-h-0 flex-1 flex-col">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Recent events</h3>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="divide-y divide-[var(--border-subtle)] pr-3">
                    {visibleEvents.map(({ entry, summary, isError }, index) => {
                      const canOpen = Boolean(onOpenLog && getLogSelectionId(entry))
                      const content = (
                        <div className="flex items-start gap-2.5">
                          {isError ? (
                            <span
                              className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--status-error)]"
                              aria-hidden
                            />
                          ) : (
                            <span
                              className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--text-muted)] opacity-40"
                              aria-hidden
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-[var(--text-muted)]">
                              {formatRelativeTime(parseIsoTime(entry.timestamp)) ?? 'just now'}
                            </div>
                            <p
                              className={`mt-0.5 text-sm leading-5 ${
                                isError ? 'text-[var(--status-error)]' : 'text-[var(--text-primary)]'
                              }`}
                            >
                              {summary}
                            </p>
                          </div>
                        </div>
                      )

                      if (canOpen) {
                        return (
                          <button
                            key={`${entry.timestamp}-${entry.message}-${index}`}
                            type="button"
                            className="block w-full py-2.5 text-left first:pt-0 hover:bg-[var(--surface-overlay)]/40"
                            onClick={() => handleOpenLog(entry)}
                          >
                            {content}
                          </button>
                        )
                      }

                      return (
                        <div
                          key={`${entry.timestamp}-${entry.message}-${index}`}
                          className="py-2.5 first:pt-0"
                        >
                          {content}
                        </div>
                      )
                    })}
                    {hasMoreEvents ? (
                      <button
                        type="button"
                        className="block w-full py-3 text-center text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)]"
                        onClick={() => setVisibleEventCount((n) => n + EVENTS_PAGE_SIZE)}
                      >
                        Show older events
                      </button>
                    ) : null}
                  </div>
                </ScrollArea>
              </section>
            </>
          ) : effectiveStatus === 'idle' ? (
            <>
              <div className="my-3 h-px bg-[var(--border-default)]" />
              <p className="py-2 text-sm leading-5 text-[var(--text-secondary)]">
                Events will appear here as runs flow through this node.
              </p>
            </>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="debug" className="mt-0 min-h-0 flex-1 pt-0">
        <ScrollArea className="h-full">
          <div className="space-y-3 px-4 py-3">
            <details
              className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-default)]"
              open={Boolean(latestErrorLog || latestSpan?.status === 'error')}
            >
              <summary className="cursor-pointer p-3 text-sm text-[var(--text-primary)]">Attributes</summary>
              <pre className="mx-3 mb-3 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] p-3 text-xs text-[var(--text-primary)]">
                {JSON.stringify(latestAttributes ?? {}, null, 2)}
              </pre>
            </details>

            {tracesByTraceId.length > 0 ? (
              <details className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-default)]">
                <summary className="cursor-pointer p-3 text-sm text-[var(--text-primary)]">Timing</summary>
                <div className="mx-3 mb-3 space-y-4">
                  {tracesByTraceId.map(([traceId, traceSpans]) => {
                    const maxDuration = Math.max(...traceSpans.map((span) => span.durationMs ?? 1), 1)
                    const depthMap = computeDepthMap(traceSpans)

                    return (
                      <div key={traceId} className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/70 p-3">
                        <div className="text-sm text-[var(--text-primary)]">run: {traceId.slice(0, 12)}…</div>

                        <div className="mt-2 space-y-2">
                          {traceSpans.map((span) => {
                            const depth = depthMap.get(span.spanId) ?? 0
                            const widthPercent = Math.max(((span.durationMs ?? 1) / maxDuration) * 100, 8)
                            const seenLabel = formatRelativeTime(spanSortTime(span))

                            return (
                              <div key={span.spanId} style={{ marginLeft: `${depth * 14}px` }}>
                                <div className="mb-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                  <span>{span.spanName}</span>
                                  <DurationBadge durationMs={span.durationMs} />
                                  {seenLabel ? <span className="text-[var(--text-muted)]">{seenLabel}</span> : null}
                                </div>
                                <div className="h-2 rounded bg-[var(--surface-inset)]">
                                  <div
                                    className="h-2 rounded"
                                    style={{
                                      width: `${widthPercent}%`,
                                      backgroundColor: span.status === 'error' ? 'var(--status-error)' : 'var(--accent-primary)',
                                      opacity: 0.7,
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            ) : null}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}
