import { useCallback, useEffect, useRef, useState } from 'react'

import { eventExecutionKey } from '../events'
import { inferErrorState, resolveMappedNodeId } from '../mapping'
import type { FlowEvent, SpanEntry, SpanMapping, TraceTimelineState } from '../types'

function spanKey(event: FlowEvent): string | null {
  if (!event.trace_id || !event.span_id) {
    return null
  }

  return `${event.trace_id}:${event.span_id}`
}

function parseDurationMs(startTime: string, endTime: string): number | undefined {
  const startMs = Date.parse(startTime)
  const endMs = Date.parse(endTime)

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return undefined
  }

  return endMs - startMs
}

function sortSpans(spans: SpanEntry[]): SpanEntry[] {
  return [...spans].sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))
}

export function useTraceTimeline(
  events: FlowEvent[],
  spanMapping: SpanMapping,
  sessionKey?: number | string,
): TraceTimelineState {
  const [nodeSpans, setNodeSpans] = useState<Map<string, SpanEntry[]>>(new Map())
  const [traceTree, setTraceTree] = useState<Map<string, SpanEntry[]>>(new Map())

  const processedIndexRef = useRef(0)
  const sessionKeyRef = useRef<number | string | undefined>(sessionKey)
  const openSpansRef = useRef<Map<string, SpanEntry>>(new Map())
  const nodeSpansRef = useRef<Map<string, SpanEntry[]>>(new Map())
  const traceTreeRef = useRef<Map<string, SpanEntry[]>>(new Map())

  const clearTraces = useCallback(() => {
    processedIndexRef.current = 0
    openSpansRef.current.clear()
    nodeSpansRef.current = new Map()
    traceTreeRef.current = new Map()
    setNodeSpans(new Map())
    setTraceTree(new Map())
  }, [])

  useEffect(() => {
    if (sessionKeyRef.current === sessionKey) {
      return
    }
    sessionKeyRef.current = sessionKey
    clearTraces()
  }, [clearTraces, sessionKey])

  useEffect(() => {
    if (events.length < processedIndexRef.current) {
      clearTraces()
      processedIndexRef.current = 0
    }

    if (events.length === processedIndexRef.current) {
      return
    }

    const nextNodeMap = new Map(nodeSpansRef.current)
    const nextTraceMap = new Map(traceTreeRef.current)

    const pending = events.slice(processedIndexRef.current)
    processedIndexRef.current = events.length

    for (const event of pending) {
      if (event.type !== 'span_start' && event.type !== 'span_end') {
        continue
      }

      const nodeId = resolveMappedNodeId(event, spanMapping)
      const key = spanKey(event)
      const executionKey = eventExecutionKey(event)

      if (event.type === 'span_start') {
        if (!key || !nodeId || !event.trace_id || !event.span_id) {
          continue
        }

        const entry: SpanEntry = {
          spanName: event.span_name ?? 'unknown_span',
          nodeId,
          traceId: event.trace_id,
          runId: executionKey,
          flowId: typeof event.attributes?.flow_id === 'string' ? event.attributes.flow_id : undefined,
          componentId:
            typeof event.attributes?.component_id === 'string' ? event.attributes.component_id : undefined,
          spanId: event.span_id,
          parentSpanId: event.parent_span_id,
          startTime: event.start_time ?? event.timestamp,
          status: 'active',
          attributes: event.attributes,
        }

        openSpansRef.current.set(key, entry)
        continue
      }

      if (!key) {
        continue
      }

      const openEntry = openSpansRef.current.get(key)
      const resolvedNodeId = nodeId ?? openEntry?.nodeId

      if (!resolvedNodeId || !event.trace_id || !event.span_id) {
        continue
      }

      const startTime = openEntry?.startTime ?? event.start_time ?? event.timestamp
      const endTime = event.end_time ?? event.timestamp
      const durationMs =
        event.duration_ms ??
        (startTime && endTime ? parseDurationMs(startTime, endTime) : undefined)

      const finalEntry: SpanEntry = {
        spanName: event.span_name ?? openEntry?.spanName ?? 'unknown_span',
        nodeId: resolvedNodeId,
        traceId: event.trace_id,
        runId: executionKey ?? openEntry?.runId,
        flowId:
          (typeof event.attributes?.flow_id === 'string' ? event.attributes.flow_id : undefined) ??
          openEntry?.flowId,
        componentId:
          (typeof event.attributes?.component_id === 'string' ? event.attributes.component_id : undefined) ??
          openEntry?.componentId,
        spanId: event.span_id,
        parentSpanId: event.parent_span_id ?? openEntry?.parentSpanId,
        startTime,
        endTime,
        durationMs,
        status: inferErrorState(event) ? 'error' : 'success',
        attributes: event.attributes ?? openEntry?.attributes,
      }

      const nodeList = nextNodeMap.get(resolvedNodeId) ?? []
      nodeList.push(finalEntry)
      nextNodeMap.set(resolvedNodeId, sortSpans(nodeList))

      const traceList = nextTraceMap.get(executionKey ?? event.trace_id) ?? []
      traceList.push(finalEntry)
      nextTraceMap.set(executionKey ?? event.trace_id, sortSpans(traceList))

      openSpansRef.current.delete(key)
    }

    nodeSpansRef.current = nextNodeMap
    traceTreeRef.current = nextTraceMap
    setNodeSpans(new Map(nextNodeMap))
    setTraceTree(new Map(nextTraceMap))
  }, [clearTraces, events, spanMapping])

  return {
    nodeSpans,
    traceTree,
    clearTraces,
  }
}
