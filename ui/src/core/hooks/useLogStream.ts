import { useCallback, useMemo, useState } from 'react'

import { eventExecutionKey, getEventSelectionKey } from '../events'
import { buildFlowLogDisplayMessage } from '../logPresentation'
import { inferErrorState, readStringAttribute, resolveMappedNodeId } from '../mapping'
import { classifyFlowEvent, isDefaultVisibleSignal } from '../telemetryClassification'
import type { FlowEvent, LogEntry, LogStreamState, SpanMapping } from '../types'

function compareTimestamp(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right)
}

function compareLogs(left: LogEntry, right: LogEntry): number {
  if (typeof left.seq === 'number' && typeof right.seq === 'number') {
    return left.seq - right.seq
  }
  return compareTimestamp(left.timestamp, right.timestamp)
}

function toLogEntry(event: FlowEvent, nodeId?: string): LogEntry {
  const isError = inferErrorState(event)
  const stepId = readStringAttribute(event.attributes, 'step_id')
  const stepName = readStringAttribute(event.attributes, 'step_name')
  const retryable = readStringAttribute(event.attributes, 'retryable')
  const signal = classifyFlowEvent(event)
  const message =
    event.message ??
    event.span_name ??
    (event.type === 'span_start' ? 'span started' : event.type === 'span_end' ? 'span completed' : 'log event')

  return {
    selectionId: typeof event.seq === 'number' ? String(event.seq) : getEventSelectionKey(event),
    timestamp: event.timestamp,
    seq: event.seq,
    traceId: event.trace_id,
    runId: eventExecutionKey(event),
    flowId: readStringAttribute(event.attributes, 'flow_id'),
    componentId: readStringAttribute(event.attributes, 'component_id'),
    stepId,
    stepName,
    errorClass: readStringAttribute(event.attributes, 'error_class'),
    errorCode: readStringAttribute(event.attributes, 'error_code'),
    retryable: retryable ? retryable.toLowerCase() === 'true' : undefined,
    nodeId,
    level: isError ? 'error' : 'info',
    status: isError ? 'error' : 'ok',
    durationMs: event.duration_ms,
    signal,
    defaultVisible: isDefaultVisibleSignal(signal),
    message,
    displayMessage: buildFlowLogDisplayMessage({
      stepId,
      nodeId,
      stepName,
      message,
      retryable: retryable ? retryable.toLowerCase() === 'true' : undefined,
      errorClass: readStringAttribute(event.attributes, 'error_class'),
      attributes: event.attributes,
    }),
    attributes: event.attributes,
    eventType: event.type,
  }
}

export function useLogStream(
  events: FlowEvent[],
  spanMapping: SpanMapping,
  sessionKey?: number | string,
): LogStreamState {
  const [clearMarker, setClearMarker] = useState<{
    sessionKey?: number | string
    eventCount: number
  }>({
    sessionKey,
    eventCount: 0,
  })

  const clearSession = useCallback(() => {
    setClearMarker({
      sessionKey,
      eventCount: events.length,
    })
  }, [events.length, sessionKey])

  const startIndex =
    clearMarker.sessionKey === sessionKey && clearMarker.eventCount <= events.length
      ? clearMarker.eventCount
      : 0

  const visibleEvents = useMemo(() => events.slice(startIndex), [events, startIndex])

  const globalLogs = useMemo(() => {
    const next = visibleEvents.map((event) => {
      const nodeId = resolveMappedNodeId(event, spanMapping) ?? undefined
      return toLogEntry(event, nodeId)
    })
    next.sort(compareLogs)
    return next
  }, [spanMapping, visibleEvents])

  const nodeLogMap = useMemo(() => {
    const next = new Map<string, LogEntry[]>()

    for (const event of visibleEvents) {
      const nodeId = resolveMappedNodeId(event, spanMapping)
      if (!nodeId) {
        continue
      }

      const list = next.get(nodeId) ?? []
      list.push(toLogEntry(event, nodeId))
      next.set(nodeId, list)
    }

    for (const list of next.values()) {
      list.sort(compareLogs)
    }

    return next
  }, [spanMapping, visibleEvents])

  return {
    globalLogs,
    nodeLogMap,
    clearSession,
  }
}
