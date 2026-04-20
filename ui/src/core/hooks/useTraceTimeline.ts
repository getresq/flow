import { useCallback, useMemo } from 'react';

import { compareFlowEventsForDisplay, eventExecutionKey } from '../events';
import { inferErrorState, resolveMappedNodeId } from '../mapping';
import type { FlowEvent, SpanEntry, SpanMapping, TraceTimelineState } from '../types';

function spanKey(event: FlowEvent): string | null {
  if (!event.trace_id || !event.span_id) {
    return null;
  }

  return `${event.trace_id}:${event.span_id}`;
}

function parseDurationMs(startTime: string, endTime: string): number | undefined {
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return undefined;
  }

  return endMs - startMs;
}

function sortSpans(spans: SpanEntry[]): SpanEntry[] {
  return [...spans].sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
}

export function useTraceTimeline(
  events: FlowEvent[],
  spanMapping: SpanMapping,
  _sessionKey?: number | string,
): TraceTimelineState {
  const { nodeSpans, traceTree } = useMemo(() => {
    const openSpans = new Map<string, SpanEntry>();
    const nextNodeMap = new Map<string, SpanEntry[]>();
    const nextTraceMap = new Map<string, SpanEntry[]>();

    for (const event of [...events].sort(compareFlowEventsForDisplay)) {
      if (event.type !== 'span_start' && event.type !== 'span_end') {
        continue;
      }

      const nodeId = resolveMappedNodeId(event, spanMapping);
      const key = spanKey(event);
      const executionKey = eventExecutionKey(event);

      if (event.type === 'span_start') {
        if (!key || !nodeId || !event.trace_id || !event.span_id) {
          continue;
        }

        const entry: SpanEntry = {
          spanName: event.span_name ?? 'unknown_span',
          nodeId,
          traceId: event.trace_id,
          runId: executionKey,
          flowId:
            typeof event.attributes?.flow_id === 'string' ? event.attributes.flow_id : undefined,
          componentId:
            typeof event.attributes?.component_id === 'string'
              ? event.attributes.component_id
              : undefined,
          spanId: event.span_id,
          parentSpanId: event.parent_span_id,
          startTime: event.start_time ?? event.timestamp,
          status: 'active',
          attributes: event.attributes,
        };

        openSpans.set(key, entry);
        continue;
      }

      if (!key) {
        continue;
      }

      const openEntry = openSpans.get(key);
      const resolvedNodeId = nodeId ?? openEntry?.nodeId;

      if (!resolvedNodeId || !event.trace_id || !event.span_id) {
        continue;
      }

      const startTime = openEntry?.startTime ?? event.start_time ?? event.timestamp;
      const endTime = event.end_time ?? event.timestamp;
      const durationMs =
        event.duration_ms ??
        (startTime && endTime ? parseDurationMs(startTime, endTime) : undefined);

      const finalEntry: SpanEntry = {
        spanName: event.span_name ?? openEntry?.spanName ?? 'unknown_span',
        nodeId: resolvedNodeId,
        traceId: event.trace_id,
        runId: executionKey ?? openEntry?.runId,
        flowId:
          (typeof event.attributes?.flow_id === 'string' ? event.attributes.flow_id : undefined) ??
          openEntry?.flowId,
        componentId:
          (typeof event.attributes?.component_id === 'string'
            ? event.attributes.component_id
            : undefined) ?? openEntry?.componentId,
        spanId: event.span_id,
        parentSpanId: event.parent_span_id ?? openEntry?.parentSpanId,
        startTime,
        endTime,
        durationMs,
        status: inferErrorState(event) ? 'error' : 'success',
        attributes: event.attributes ?? openEntry?.attributes,
      };

      const nodeList = nextNodeMap.get(resolvedNodeId) ?? [];
      nodeList.push(finalEntry);
      nextNodeMap.set(resolvedNodeId, sortSpans(nodeList));

      const traceList = nextTraceMap.get(executionKey ?? event.trace_id) ?? [];
      traceList.push(finalEntry);
      nextTraceMap.set(executionKey ?? event.trace_id, sortSpans(traceList));

      openSpans.delete(key);
    }
    return {
      nodeSpans: nextNodeMap,
      traceTree: nextTraceMap,
    };
  }, [events, spanMapping]);

  const clearTraces = useCallback(() => {}, []);

  return {
    nodeSpans,
    traceTree,
    clearTraces,
  };
}
