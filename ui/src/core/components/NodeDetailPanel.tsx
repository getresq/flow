import { useMemo, useState } from 'react'

import { DurationBadge } from './DurationBadge'
import { NodeStatusBadge } from './NodeStatusBadge'
import type { FlowNodeConfig, LogEntry, NodeStatus, SpanEntry } from '../types'

interface NodeDetailPanelProps {
  node: FlowNodeConfig | null
  status?: {
    status: NodeStatus
    durationMs?: number
    durationVisibleUntil?: number
  }
  logs: LogEntry[]
  spans: SpanEntry[]
  onClose: () => void
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

function resolveNodeRole(node: FlowNodeConfig): string | null {
  if (node.style?.icon === 'worker') {
    return 'Worker'
  }
  if (node.style?.icon === 'queue') {
    return 'Queue'
  }
  if (node.style?.icon === 'cron') {
    return 'Scheduler'
  }
  if (node.type === 'diamond') {
    return 'Decision'
  }
  if (node.type === 'cylinder') {
    return 'Store'
  }
  if (node.type === 'badge') {
    return 'Step'
  }

  const sublabel = node.sublabel?.trim()
  if (!sublabel) {
    return null
  }

  if (sublabel.toLowerCase() === 'workers') {
    return 'Worker'
  }

  return sublabel.replace(/^\(/, '').replace(/\)$/, '')
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
    return 'border-emerald-500/30 bg-emerald-950/30 text-emerald-100'
  }
  if (tone === 'warning') {
    return 'border-amber-500/30 bg-amber-950/30 text-amber-100'
  }
  if (tone === 'error') {
    return 'border-rose-500/30 bg-rose-950/30 text-rose-100'
  }
  return 'border-slate-700 bg-slate-900/60 text-slate-200'
}

export function NodeDetailPanel({ node, status, logs, spans, onClose }: NodeDetailPanelProps) {
  const [tab, setTab] = useState<TabKey>('overview')

  const sortedLogs = useMemo(
    () => [...logs].sort((left, right) => parseIsoTime(right.timestamp) - parseIsoTime(left.timestamp)),
    [logs],
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
  const roleLabel = node ? resolveNodeRole(node) : null

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

  if (!node) {
    return null
  }

  return (
    <aside
      className="flex w-[340px] flex-col border-l border-slate-700/50 bg-slate-900"
      style={{ transition: 'transform 200ms ease', transform: 'translateX(0)' }}
    >
      <header className="border-b border-slate-700/50 px-4 py-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{node.label}</h2>
            {roleLabel ? <p className="mt-1 text-xs text-slate-500">{roleLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-200">
            close
          </button>
        </div>

        <div className="flex items-center gap-2">
          <NodeStatusBadge status={status?.status ?? 'idle'} />
        </div>

        {node.description ? <p className="mt-3 text-xs leading-5 text-slate-300">{node.description}</p> : null}
      </header>

      <div className="flex border-b border-slate-700/50 px-2 py-2">
        {(['overview', 'timing'] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`rounded px-3 py-1 text-xs uppercase ${
              tab === tabKey ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tabKey}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tab === 'overview' ? (
          <div className="space-y-4">
            <section className="grid grid-cols-2 gap-2">
              <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Latest Run</div>
                <div className="mt-1 text-sm text-slate-100">{formatDurationText(latestSpan?.durationMs) ?? 'None yet'}</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Last Seen</div>
                <div className="mt-1 text-sm text-slate-100">{lastSeenLabel ?? 'Waiting'}</div>
              </div>
            </section>

            {insights.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-wide text-slate-500">Key Insights</h3>
                {insights.map((insight, index) => (
                  <div key={`${insight.text}-${index}`} className={`rounded border p-2 text-xs leading-5 ${insightToneClasses(insight.tone)}`}>
                    {insight.text}
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === 'timing' ? (
          <div className="space-y-4">
            <section className="rounded border border-slate-700 bg-slate-900/60 p-3">
              <h3 className="text-[10px] uppercase tracking-wide text-slate-500">Timing View</h3>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                This view keeps the raw timing detail for deeper debugging. Each group below is one recent run seen at this node.
              </p>
            </section>

            {tracesByTraceId.length === 0 ? (
              <p className="text-xs text-slate-500">No completed timings yet.</p>
            ) : (
              tracesByTraceId.map(([traceId, traceSpans]) => {
                const maxDuration = Math.max(...traceSpans.map((span) => span.durationMs ?? 1), 1)
                const depthMap = computeDepthMap(traceSpans)

                return (
                  <details key={traceId} className="rounded border border-slate-700 bg-slate-900/50 p-2" open>
                    <summary className="cursor-pointer text-xs text-slate-200">
                      run: {traceId.slice(0, 12)}…
                    </summary>

                    <div className="mt-2 space-y-2">
                      {traceSpans.map((span) => {
                        const depth = depthMap.get(span.spanId) ?? 0
                        const widthPercent = Math.max(((span.durationMs ?? 1) / maxDuration) * 100, 8)
                        const seenLabel = formatRelativeTime(spanSortTime(span))

                        return (
                          <div key={span.spanId} style={{ marginLeft: `${depth * 14}px` }}>
                            <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-300">
                              <span>{span.spanName}</span>
                              <DurationBadge durationMs={span.durationMs} />
                              {seenLabel ? <span className="text-slate-500">{seenLabel}</span> : null}
                            </div>
                            <div className="h-2 rounded bg-slate-800">
                              <div
                                className={`h-2 rounded ${span.status === 'error' ? 'bg-rose-500/70' : 'bg-sky-500/70'}`}
                                style={{ width: `${widthPercent}%` }}
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

            <details className="rounded border border-slate-700 bg-slate-900/60 p-3">
              <summary className="cursor-pointer text-xs text-slate-200">Latest telemetry attributes</summary>
              <pre className="mt-3 overflow-x-auto rounded border border-slate-700 bg-slate-950/70 p-3 text-[11px] text-slate-200">
                {JSON.stringify(latestAttributes ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
