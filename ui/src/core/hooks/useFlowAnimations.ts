import { useCallback, useEffect, useRef, useState } from 'react'

import { inferErrorState, readStringAttribute, resolveMappedNodeId } from '../mapping'
import type {
  FlowAnimationState,
  FlowEdgeConfig,
  FlowEvent,
  NodeRuntimeStatus,
  SpanMapping,
} from '../types'

const NODE_SUCCESS_RESET_MS = 3_000
const NODE_PULSE_RESET_MS = 750
const DURATION_VISIBLE_MS = 5_000
const EDGE_ACTIVE_MS = 900

interface FlowAnimationTimings {
  nodeSuccessResetMs: number
  nodePulseResetMs: number
  durationVisibleMs: number
  edgeActiveMs: number
}

function nowMs(): number {
  return Date.now()
}

function parseTimestampMs(timestamp: string | undefined): number | null {
  if (!timestamp) {
    return null
  }

  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) {
    return null
  }

  return parsed
}

function resolveDurationMs(event: FlowEvent, spanStarts: Map<string, number>): number | undefined {
  if (typeof event.duration_ms === 'number') {
    return event.duration_ms
  }

  if (!event.span_id) {
    return undefined
  }

  const start = spanStarts.get(event.span_id)
  const end = parseTimestampMs(event.end_time ?? event.timestamp)
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    return end - start
  }

  return undefined
}

function matchCandidate(spanMapping: SpanMapping, candidate: string | undefined): string | null {
  if (!candidate) {
    return null
  }

  if (spanMapping[candidate]) {
    return spanMapping[candidate]
  }

  for (const [pattern, nodeId] of Object.entries(spanMapping)) {
    if (candidate.includes(pattern)) {
      return nodeId
    }
  }

  return null
}

function resolveEventKind(event: FlowEvent): NonNullable<FlowEvent['event_kind']> {
  if (event.event_kind) {
    return event.event_kind
  }

  if (event.type === 'span_start') {
    return 'node_started'
  }

  if (event.type === 'span_end') {
    return 'node_finished'
  }

  const action = readStringAttribute(event.attributes, 'action')
  if (action === 'enqueue') {
    return 'queue_enqueued'
  }
  if (action === 'worker_pickup') {
    return 'queue_picked'
  }

  return 'log_event'
}

interface UseFlowAnimationsInput {
  events: FlowEvent[]
  spanMapping: SpanMapping
  edges?: FlowEdgeConfig[]
  timings?: Partial<FlowAnimationTimings>
}

export function useFlowAnimations({
  events,
  spanMapping,
  edges = [],
  timings,
}: UseFlowAnimationsInput): FlowAnimationState {
  const resolvedTimings: FlowAnimationTimings = {
    nodeSuccessResetMs: timings?.nodeSuccessResetMs ?? NODE_SUCCESS_RESET_MS,
    nodePulseResetMs: timings?.nodePulseResetMs ?? NODE_PULSE_RESET_MS,
    durationVisibleMs: timings?.durationVisibleMs ?? DURATION_VISIBLE_MS,
    edgeActiveMs: timings?.edgeActiveMs ?? EDGE_ACTIVE_MS,
  }
  const [nodeStatuses, setNodeStatuses] = useState<Map<string, NodeRuntimeStatus>>(new Map())
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set())

  const processedIndexRef = useRef(0)
  const spanStartRef = useRef<Map<string, number>>(new Map())
  const nodeResetTimersRef = useRef<Map<string, number>>(new Map())
  const edgeResetTimersRef = useRef<Map<string, number>>(new Map())
  const traceLastNodeRef = useRef<Map<string, string>>(new Map())

  const clearStatuses = useCallback(() => {
    for (const timer of nodeResetTimersRef.current.values()) {
      window.clearTimeout(timer)
    }
    for (const timer of edgeResetTimersRef.current.values()) {
      window.clearTimeout(timer)
    }

    nodeResetTimersRef.current.clear()
    edgeResetTimersRef.current.clear()
    spanStartRef.current.clear()
    traceLastNodeRef.current.clear()
    processedIndexRef.current = 0

    setNodeStatuses(new Map())
    setActiveEdges(new Set())
  }, [])

  const updateNodeStatus = useCallback(
    (nodeId: string, updater: (previous: NodeRuntimeStatus | undefined) => NodeRuntimeStatus) => {
      setNodeStatuses((previous) => {
        const next = new Map(previous)
        next.set(nodeId, updater(previous.get(nodeId)))
        return next
      })
    },
    [],
  )

  const scheduleNodeIdle = useCallback(
    (nodeId: string, delayMs: number) => {
      const existing = nodeResetTimersRef.current.get(nodeId)
      if (existing) {
        window.clearTimeout(existing)
      }

      const timer = window.setTimeout(() => {
        updateNodeStatus(nodeId, (previous) => {
          const nextCounter = previous?.counter
          return {
            status: 'idle',
            updatedAt: nowMs(),
            counter: nextCounter,
            durationMs: previous?.durationMs,
            durationVisibleUntil: previous?.durationVisibleUntil,
            lastMessage: previous?.lastMessage,
          }
        })
        nodeResetTimersRef.current.delete(nodeId)
      }, delayMs)

      nodeResetTimersRef.current.set(nodeId, timer)
    },
    [updateNodeStatus],
  )

  const activateEdge = useCallback((edgeId: string) => {
    setActiveEdges((previous) => {
      const next = new Set(previous)
      next.add(edgeId)
      return next
    })

    const existing = edgeResetTimersRef.current.get(edgeId)
    if (existing) {
      window.clearTimeout(existing)
    }

    const timer = window.setTimeout(() => {
      setActiveEdges((previous) => {
        const next = new Set(previous)
        next.delete(edgeId)
        return next
      })
      edgeResetTimersRef.current.delete(edgeId)
    }, resolvedTimings.edgeActiveMs)

    edgeResetTimersRef.current.set(edgeId, timer)
  }, [resolvedTimings.edgeActiveMs])

  useEffect(() => {
    if (events.length < processedIndexRef.current) {
      clearStatuses()
      processedIndexRef.current = 0
    }

    if (events.length === processedIndexRef.current) {
      return
    }

    const edgeLookup = new Map(edges.map((edge) => [`${edge.source}->${edge.target}`, edge.id]))

    const pending = events.slice(processedIndexRef.current)
    processedIndexRef.current = events.length

    for (const event of pending) {
      const eventKind = resolveEventKind(event)
      const mappedNodeId = resolveMappedNodeId(event, spanMapping)
      const queueName = readStringAttribute(event.attributes, 'queue_name')
      const workerName = readStringAttribute(event.attributes, 'worker_name')
      const functionName = readStringAttribute(event.attributes, 'function_name')
      const queueNodeId = matchCandidate(spanMapping, queueName)
      const workerNodeId = matchCandidate(spanMapping, workerName)
      const producerNodeId = matchCandidate(spanMapping, functionName) ?? matchCandidate(spanMapping, event.span_name)
      const timestamp = parseTimestampMs(event.start_time ?? event.timestamp) ?? nowMs()

      if (event.trace_id && mappedNodeId) {
        const previousNode = traceLastNodeRef.current.get(event.trace_id)
        if (previousNode && previousNode !== mappedNodeId) {
          const edgeId = edgeLookup.get(`${previousNode}->${mappedNodeId}`)
          if (edgeId) {
            activateEdge(edgeId)
          }
        }
        traceLastNodeRef.current.set(event.trace_id, mappedNodeId)
      }

      if (eventKind === 'node_started') {
        if (event.span_id) {
          spanStartRef.current.set(event.span_id, timestamp)
        }

        if (mappedNodeId) {
          updateNodeStatus(mappedNodeId, (previous) => ({
            status: 'active',
            counter: previous?.counter,
            updatedAt: nowMs(),
            lastMessage: event.message ?? event.span_name,
            durationMs: previous?.durationMs,
            durationVisibleUntil: previous?.durationVisibleUntil,
          }))
        }

        continue
      }

      if (eventKind === 'node_finished') {
        if (!mappedNodeId) {
          continue
        }

        const durationMs = resolveDurationMs(event, spanStartRef.current)
        if (event.span_id) {
          spanStartRef.current.delete(event.span_id)
        }

        const isError = inferErrorState(event)
        updateNodeStatus(mappedNodeId, (previous) => ({
          status: isError ? 'error' : 'success',
          counter: previous?.counter,
          durationMs,
          durationVisibleUntil: nowMs() + resolvedTimings.durationVisibleMs,
          updatedAt: nowMs(),
          lastMessage: event.message ?? event.span_name,
        }))

        if (!isError) {
          scheduleNodeIdle(mappedNodeId, resolvedTimings.nodeSuccessResetMs)
        }

        continue
      }

      if (eventKind === 'queue_enqueued') {
        const targetQueueNodeId = queueNodeId ?? mappedNodeId
        if (targetQueueNodeId) {
          const delta = typeof event.queue_delta === 'number' ? event.queue_delta : 1
          updateNodeStatus(targetQueueNodeId, (previous) => ({
            status: 'active',
            counter: Math.max((previous?.counter ?? 0) + delta, 0),
            updatedAt: nowMs(),
            lastMessage: event.message ?? queueName,
            durationMs: previous?.durationMs,
            durationVisibleUntil: previous?.durationVisibleUntil,
          }))
          scheduleNodeIdle(targetQueueNodeId, resolvedTimings.nodePulseResetMs)

          if (producerNodeId && producerNodeId !== targetQueueNodeId) {
            const edgeId = edgeLookup.get(`${producerNodeId}->${targetQueueNodeId}`)
            if (edgeId) {
              activateEdge(edgeId)
            }
          }
        }

        continue
      }

      if (eventKind === 'queue_picked') {
        if (queueNodeId) {
          const delta = typeof event.queue_delta === 'number' ? event.queue_delta : -1
          updateNodeStatus(queueNodeId, (previous) => ({
            status: 'active',
            counter: Math.max((previous?.counter ?? 0) + delta, 0),
            updatedAt: nowMs(),
            lastMessage: event.message ?? queueName,
            durationMs: previous?.durationMs,
            durationVisibleUntil: previous?.durationVisibleUntil,
          }))
          scheduleNodeIdle(queueNodeId, resolvedTimings.nodePulseResetMs)
        }

        const targetWorkerNodeId = workerNodeId ?? mappedNodeId
        if (targetWorkerNodeId) {
          updateNodeStatus(targetWorkerNodeId, (previous) => ({
            status: 'active',
            counter: previous?.counter,
            updatedAt: nowMs(),
            lastMessage: event.message ?? workerName ?? event.span_name,
            durationMs: previous?.durationMs,
            durationVisibleUntil: previous?.durationVisibleUntil,
          }))
          scheduleNodeIdle(targetWorkerNodeId, resolvedTimings.nodePulseResetMs)

          if (queueNodeId) {
            const edgeId = edgeLookup.get(`${queueNodeId}->${targetWorkerNodeId}`)
            if (edgeId) {
              activateEdge(edgeId)
            }
          }
        }

        continue
      }

      if (mappedNodeId) {
        updateNodeStatus(mappedNodeId, (previous) => ({
          status: 'active',
          counter: previous?.counter,
          updatedAt: nowMs(),
          lastMessage: event.message ?? event.span_name,
          durationMs: previous?.durationMs,
          durationVisibleUntil: previous?.durationVisibleUntil,
        }))
        scheduleNodeIdle(mappedNodeId, resolvedTimings.nodePulseResetMs)
      }
    }
  }, [
    activateEdge,
    clearStatuses,
    edges,
    events,
    resolvedTimings.durationVisibleMs,
    resolvedTimings.nodePulseResetMs,
    resolvedTimings.nodeSuccessResetMs,
    scheduleNodeIdle,
    spanMapping,
    updateNodeStatus,
  ])

  useEffect(
    () => () => {
      for (const timer of nodeResetTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      for (const timer of edgeResetTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
    },
    [],
  )

  return {
    nodeStatuses,
    activeEdges,
    clearStatuses,
  }
}
