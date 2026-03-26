import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'

import { getLogDisplayMessage } from '../logPresentation'
import { DurationBadge } from './DurationBadge'
import { PanelSkeleton } from './PanelSkeleton'
import { isDefaultVisibleLogEntry } from '../telemetryClassification'
import { normalizeTraceIdentifierValue } from '../traceIdentifiers'
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
}

type TabKey = 'overview' | 'timing'
type InsightTone = 'neutral' | 'success' | 'warning' | 'error'

interface InsightItem {
  tone: InsightTone
  text: string
}

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

function formatDurationText(durationMs?: number): string | null {
  if (typeof durationMs !== 'number') {
    return null
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`
  }

  return `${(durationMs / 1_000).toFixed(1)}s`
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

function compactIdentifier(value: string, maxLength = 12): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}…`
}

function readNormalizedLogAttribute(entry: LogEntry, key: string): string | undefined {
  const value = entry.attributes?.[key]

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeTraceIdentifierValue(value)
  }

  return undefined
}

function activityExecutionLabel(entry: LogEntry): string | null {
  const threadId = readNormalizedLogAttribute(entry, 'thread_id')
  const replyDraftId = readNormalizedLogAttribute(entry, 'reply_draft_id')
  const requestId = readNormalizedLogAttribute(entry, 'request_id')
  const runId = normalizeTraceIdentifierValue(entry.runId)
  const traceId = normalizeTraceIdentifierValue(entry.traceId)

  if (threadId) {
    return `thread ${compactIdentifier(threadId)}`
  }
  if (replyDraftId) {
    return `draft ${compactIdentifier(replyDraftId)}`
  }
  if (requestId) {
    return `request ${compactIdentifier(requestId)}`
  }
  if (runId) {
    return `run ${compactIdentifier(runId)}`
  }
  if (traceId) {
    return `trace ${compactIdentifier(traceId)}`
  }

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

function insightToneClasses(tone: InsightTone): string {
  if (tone === 'success') {
    return 'border-l-[var(--status-success)] border-[var(--border-default)] [background-color:color-mix(in_srgb,var(--status-success)_8%,transparent)] text-[var(--text-primary)]'
  }
  if (tone === 'warning') {
    return 'border-l-[var(--status-warning)] border-[var(--border-default)] [background-color:color-mix(in_srgb,var(--status-warning)_8%,transparent)] text-[var(--text-primary)]'
  }
  if (tone === 'error') {
    return 'border-l-[var(--status-error)] border-[var(--border-default)] [background-color:color-mix(in_srgb,var(--status-error)_8%,transparent)] text-[var(--text-primary)]'
  }
  return 'border-l-[var(--text-muted)] border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)]'
}

function insightIcon(tone: InsightTone) {
  if (tone === 'success') return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--status-success)]" />
  if (tone === 'warning') return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" />
  if (tone === 'error') return <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--status-error)]" />
  return <Info className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" />
}

export function NodeDetailContent({ node, status, logs, spans }: NodeDetailContentProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const showTimingTab = new Set(['queue', 'worker', 'scheduler', 'process', 'decision']).has(node.semanticRole ?? '')
  const showRuntimeCards = new Set(['queue', 'worker', 'scheduler', 'process', 'decision']).has(node.semanticRole ?? '')

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
  const failedSpanCount = spans.filter((span) => span.status === 'error').length
  const lastSeenTimestamp = Math.max(
    latestLog ? parseIsoTime(latestLog.timestamp) : 0,
    latestSpan ? spanSortTime(latestSpan) : 0,
  )
  const lastSeenLabel = formatRelativeTime(lastSeenTimestamp)
  const recentActivity = useMemo(() => {
    const latestPerExecution = new Map<string, LogEntry>()

    for (const entry of defaultVisibleLogs) {
      const executionKey = entry.runId ?? entry.traceId ?? `${entry.timestamp}:${entry.message}`
      if (!latestPerExecution.has(executionKey)) {
        latestPerExecution.set(executionKey, entry)
      }
    }

    return [...latestPerExecution.values()].slice(0, 50)
  }, [defaultVisibleLogs])
  const recentActivityHasMultipleRuns = useMemo(() => {
    const distinct = new Set(recentActivity.map((entry) => activityExecutionLabel(entry) ?? entry.runId ?? entry.traceId))
    return distinct.size > 1
  }, [recentActivity])

  const insights = useMemo(() => {
    const items: InsightItem[] = []

    if (logs.length === 0 && spans.length === 0) {
      items.push({
        tone: 'warning',
        text: 'No telemetry has reached this node yet.',
      })
    }

    if (status?.status === 'active') {
      const activeFor = formatDurationText(status.durationMs)
      items.push({
        tone: 'warning',
        text: activeFor
          ? `This node is active right now; the current execution has been running for ${activeFor}.`
          : 'This node is active right now.',
      })
    } else if (latestSpan) {
      const latestDuration = formatDurationText(latestSpan.durationMs)
      if (latestSpan.status === 'error') {
        items.push({
          tone: 'error',
          text: latestDuration
            ? `The latest execution failed after ${latestDuration}.`
            : 'The latest execution failed.',
        })
      } else if (typeof latestSpan.durationMs === 'number' && latestSpan.durationMs >= 5_000 && latestDuration) {
        items.push({
          tone: 'warning',
          text: `The latest execution was slow at ${latestDuration}.`,
        })
      } else if (latestDuration) {
        items.push({
          tone: 'neutral',
          text: `The latest execution completed in ${latestDuration}.`,
        })
      }
    } else if (latestErrorLog) {
      items.push({
        tone: 'error',
        text: 'Recent logs show an error at this node.',
      })
    }

    if (failedSpanCount > 0 && latestSpan?.status !== 'error') {
      items.push({
        tone: 'warning',
        text: `${failedSpanCount} recent ${failedSpanCount === 1 ? 'failure was' : 'failures were'} seen here.`,
      })
    } else if (spans.length === 0 && logs.length > 0) {
      items.push({
        tone: latestErrorLog ? 'error' : 'neutral',
        text: `${logs.length} log ${logs.length === 1 ? 'entry was' : 'entries were'} received for this node.`,
      })
    }

    return items.slice(0, 2)
  }, [failedSpanCount, latestErrorLog, latestSpan, logs.length, spans.length, status])

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as TabKey)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="border-b border-[var(--border-default)] px-4 py-3">
        <TabsList className="border-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {showTimingTab ? <TabsTrigger value="timing">Timing</TabsTrigger> : null}
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0 min-h-0 flex-1 overflow-hidden pt-0">
        <div className="flex h-full min-h-0 flex-col px-4 py-3">
          <div className="shrink-0 space-y-4">
            {showRuntimeCards ? (
              <section className="grid grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Latest Run</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold text-[var(--text-primary)]">
                      {formatDurationText(latestSpan?.durationMs) ?? 'None yet'}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Last Seen</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold text-[var(--text-primary)]">{lastSeenLabel ?? 'Waiting'}</p>
                  </CardContent>
                </Card>
              </section>
            ) : null}

            {insights.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Key Insights</h3>
                {insights.map((insight, index) => (
                  <div
                    key={`${insight.text}-${index}`}
                    className={`flex items-start gap-2.5 rounded-lg border border-l-[3px] p-3 text-sm leading-6 ${insightToneClasses(insight.tone)}`}
                  >
                    {insightIcon(insight.tone)}
                    <span>{insight.text}</span>
                  </div>
                ))}
              </section>
            ) : null}
          </div>

          <section className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Recent Activity</h3>
              <span className="truncate text-xs text-[var(--text-muted)]">most recent first</span>
            </div>
            {recentActivity.length === 0 ? (
              <Card>
                <CardContent className="p-3">
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">
                    No meaningful activity has been surfaced for this node yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-3 pr-3">
                  {recentActivity.map((entry, index) => (
                    <Card key={`${entry.timestamp}-${entry.message}-${index}`}>
                      <CardContent className="space-y-2 p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={entry.signal === 'critical' ? 'warning' : 'secondary'}>
                            {entry.signal}
                          </Badge>
                          <span className="text-xs text-[var(--text-muted)]">{formatRelativeTime(parseIsoTime(entry.timestamp)) ?? 'just now'}</span>
                          {recentActivityHasMultipleRuns ? (
                            <span className="truncate text-xs text-[var(--text-muted)]">
                              {activityExecutionLabel(entry) ?? 'unknown run'}
                            </span>
                          ) : null}
                          <DurationBadge className="ml-auto" durationMs={entry.durationMs} />
                        </div>
                        <p className="text-sm leading-6 text-[var(--text-primary)]">{getLogDisplayMessage(entry)}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </section>
        </div>
      </TabsContent>

      <TabsContent value="timing" className="mt-0 min-h-0 flex-1 pt-0" hidden={!showTimingTab}>
        <ScrollArea className="h-full">
          <div className="space-y-4 px-4 py-3">
            <Card>
              <CardContent className="p-3">
                <h3 className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Timing View</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  This view keeps the raw timing detail for deeper debugging. Each group below is one recent run seen at this node.
                </p>
              </CardContent>
            </Card>

            {tracesByTraceId.length === 0 ? (
              <PanelSkeleton lines={3} />
            ) : (
              tracesByTraceId.map(([traceId, traceSpans]) => {
                const maxDuration = Math.max(...traceSpans.map((span) => span.durationMs ?? 1), 1)
                const depthMap = computeDepthMap(traceSpans)

                return (
                  <details key={traceId} className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/50 p-3" open>
                    <summary className="cursor-pointer text-sm text-[var(--text-primary)]">
                      run: {traceId.slice(0, 12)}…
                    </summary>

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
                  </details>
                )
              })
            )}

            <details className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/60 p-3">
              <summary className="cursor-pointer text-sm text-[var(--text-primary)]">Latest telemetry attributes</summary>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] p-3 text-xs text-[var(--text-primary)]">
                {JSON.stringify(latestAttributes ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}
