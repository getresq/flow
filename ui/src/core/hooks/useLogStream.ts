import { useCallback, useEffect, useRef, useState } from 'react'

import { inferErrorState, readStringAttribute, resolveMappedNodeId } from '../mapping'
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
  const stageId = readStringAttribute(event.attributes, 'stage_id')
  const stageName = readStringAttribute(event.attributes, 'stage_name')
  const retryable = readStringAttribute(event.attributes, 'retryable')

  return {
    timestamp: event.timestamp,
    seq: event.seq,
    traceId: event.trace_id,
    stageId,
    stageName,
    errorClass: readStringAttribute(event.attributes, 'error_class'),
    errorCode: readStringAttribute(event.attributes, 'error_code'),
    retryable: retryable ? retryable.toLowerCase() === 'true' : undefined,
    nodeId,
    level: isError ? 'error' : 'info',
    status: isError ? 'error' : 'ok',
    durationMs: event.duration_ms,
    message:
      event.message ??
      event.span_name ??
      (event.type === 'span_start' ? 'span started' : event.type === 'span_end' ? 'span completed' : 'log event'),
    attributes: event.attributes,
    eventType: event.type,
  }
}

export function useLogStream(
  events: FlowEvent[],
  spanMapping: SpanMapping,
  sessionKey?: number | string,
): LogStreamState {
  const [globalLogs, setGlobalLogs] = useState<LogEntry[]>([])
  const [nodeLogMap, setNodeLogMap] = useState<Map<string, LogEntry[]>>(new Map())

  const processedIndexRef = useRef(0)
  const sessionKeyRef = useRef<number | string | undefined>(sessionKey)

  const clearSession = useCallback(() => {
    processedIndexRef.current = 0
    setGlobalLogs([])
    setNodeLogMap(new Map())
  }, [])

  useEffect(() => {
    if (sessionKeyRef.current === sessionKey) {
      return
    }
    sessionKeyRef.current = sessionKey
    clearSession()
  }, [clearSession, sessionKey])

  useEffect(() => {
    if (events.length < processedIndexRef.current) {
      clearSession()
      processedIndexRef.current = 0
    }

    if (events.length === processedIndexRef.current) {
      return
    }

    const pending = events.slice(processedIndexRef.current)
    processedIndexRef.current = events.length

    setGlobalLogs((previous) => {
      const merged = [...previous]
      for (const event of pending) {
        const nodeId = resolveMappedNodeId(event, spanMapping) ?? undefined
        merged.push(toLogEntry(event, nodeId))
      }
      merged.sort(compareLogs)
      return merged
    })

    setNodeLogMap((previous) => {
      const next = new Map(previous)

      for (const event of pending) {
        const nodeId = resolveMappedNodeId(event, spanMapping)
        if (!nodeId) {
          continue
        }

        const list = next.get(nodeId) ?? []
        list.push(toLogEntry(event, nodeId))
        list.sort(compareLogs)
        next.set(nodeId, list)
      }

      return next
    })
  }, [clearSession, events, spanMapping])

  return {
    globalLogs,
    nodeLogMap,
    clearSession,
  }
}
