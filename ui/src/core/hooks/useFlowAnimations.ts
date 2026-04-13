import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { eventExecutionKey, resolveEventKind } from '../events'
import { inferErrorState, readStringAttribute, resolveMappedNodeId } from '../mapping'
import type {
  FlowAnimationState,
  FlowEdgeConfig,
  FlowEvent,
  NodeRuntimeStatus,
  SpanMapping,
} from '../types'

const NODE_SUCCESS_RESET_MS = 3_000
const NODE_PULSE_RESET_MS = 3_000
const MIN_VISUAL_PULSE_MS = 2_000
/** Events older than this are treated as historical (snapshot replay) and don't glow. */
const STALENESS_THRESHOLD_MS = 5_000
const DURATION_VISIBLE_MS = 5_000
const EDGE_ACTIVE_MS = 1_200

interface FlowAnimationTimings {
  nodeSuccessResetMs: number
  nodePulseResetMs: number
  minVisualPulseMs: number
  stalenessThresholdMs: number
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

function remainingWindowMs(eventTimeMs: number, windowMs: number, currentTimeMs: number): number {
  return Math.max(eventTimeMs + windowMs - currentTimeMs, 0)
}

/**
 * Compute the visual pulse duration for an event:
 *   - Within the natural window: use the remaining window, but at least `minMs`
 *   - Slightly past the window but within `staleThresholdMs`: use `minMs` (latency tolerance)
 *   - Beyond `staleThresholdMs`: return 0 (truly historical, no glow)
 */
function visualPulseMs(
  eventTimeMs: number,
  windowMs: number,
  currentTimeMs: number,
  minMs: number,
  staleThresholdMs: number,
): number {
  const age = currentTimeMs - eventTimeMs
  if (age > staleThresholdMs) {
    return 0
  }
  const remaining = eventTimeMs + windowMs - currentTimeMs
  return Math.max(remaining, minMs)
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

function eventWindowSignature(events: FlowEvent[]): string {
  if (events.length === 0) {
    return '0'
  }

  const first = events[0]
  const last = events[events.length - 1]
  return [
    events.length,
    first?.seq ?? '',
    first?.timestamp ?? '',
    last?.seq ?? '',
    last?.timestamp ?? '',
    last?.type ?? '',
  ].join('::')
}

interface UseFlowAnimationsInput {
  events: FlowEvent[]
  spanMapping: SpanMapping
  producerMapping?: SpanMapping
  edges?: FlowEdgeConfig[]
  timings?: Partial<FlowAnimationTimings>
  sessionKey?: number | string
}

export function useFlowAnimations({
  events,
  spanMapping,
  producerMapping,
  edges = [],
  timings,
  sessionKey,
}: UseFlowAnimationsInput): FlowAnimationState {
  const resolvedTimings = useMemo<FlowAnimationTimings>(
    () => ({
      nodeSuccessResetMs: timings?.nodeSuccessResetMs ?? NODE_SUCCESS_RESET_MS,
      nodePulseResetMs: timings?.nodePulseResetMs ?? NODE_PULSE_RESET_MS,
      minVisualPulseMs: timings?.minVisualPulseMs ?? MIN_VISUAL_PULSE_MS,
      stalenessThresholdMs: timings?.stalenessThresholdMs ?? STALENESS_THRESHOLD_MS,
      durationVisibleMs: timings?.durationVisibleMs ?? DURATION_VISIBLE_MS,
      edgeActiveMs: timings?.edgeActiveMs ?? EDGE_ACTIVE_MS,
    }),
    [
      timings?.durationVisibleMs,
      timings?.edgeActiveMs,
      timings?.minVisualPulseMs,
      timings?.nodePulseResetMs,
      timings?.nodeSuccessResetMs,
      timings?.stalenessThresholdMs,
    ],
  )
  const [nodeStatuses, setNodeStatuses] = useState<Map<string, NodeRuntimeStatus>>(new Map())
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set())

  const processedIndexRef = useRef(0)
  const eventWindowSignatureRef = useRef(eventWindowSignature(events))
  const sessionKeyRef = useRef<number | string | undefined>(sessionKey)
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
    eventWindowSignatureRef.current = eventWindowSignature(events)

    setNodeStatuses(new Map())
    setActiveEdges(new Set())
  }, [events])

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

  const setNodeIdle = useCallback(
    (
      nodeId: string,
      updatedAt: number,
      overrides?: Partial<Pick<NodeRuntimeStatus, 'counter' | 'durationMs' | 'durationVisibleUntil' | 'lastMessage'>>,
    ) => {
      updateNodeStatus(nodeId, (previous) => ({
        status: 'idle',
        updatedAt,
        counter: overrides?.counter ?? previous?.counter,
        durationMs: overrides?.durationMs ?? previous?.durationMs,
        durationVisibleUntil: overrides?.durationVisibleUntil ?? previous?.durationVisibleUntil,
        lastMessage: overrides?.lastMessage ?? previous?.lastMessage,
      }))
    },
    [updateNodeStatus],
  )

  const scheduleNodeIdle = useCallback(
    (
      nodeId: string,
      delayMs: number,
      updatedAt: number,
      overrides?: Partial<Pick<NodeRuntimeStatus, 'counter' | 'durationMs' | 'durationVisibleUntil' | 'lastMessage'>>,
    ) => {
      const existing = nodeResetTimersRef.current.get(nodeId)
      if (existing) {
        window.clearTimeout(existing)
      }

      const timer = window.setTimeout(() => {
        setNodeIdle(nodeId, updatedAt, overrides)
        nodeResetTimersRef.current.delete(nodeId)
      }, delayMs)

      nodeResetTimersRef.current.set(nodeId, timer)
    },
    [setNodeIdle],
  )

  const activateEdge = useCallback((edgeId: string, activeForMs: number) => {
    if (activeForMs <= 0) {
      return
    }

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
    }, activeForMs)

    edgeResetTimersRef.current.set(edgeId, timer)
  }, [])

  useEffect(() => {
    if (sessionKeyRef.current === sessionKey) {
      return
    }
    sessionKeyRef.current = sessionKey
    clearStatuses()
  }, [clearStatuses, sessionKey])

  useEffect(() => {
    const currentSignature = eventWindowSignature(events)
    if (
      events.length === processedIndexRef.current &&
      eventWindowSignatureRef.current !== currentSignature
    ) {
      clearStatuses()
      processedIndexRef.current = 0
    }
    eventWindowSignatureRef.current = currentSignature

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
    const currentTime = nowMs()

    for (const event of pending) {
      const eventKind = resolveEventKind(event)
      const mappedNodeId = resolveMappedNodeId(event, spanMapping)
      const queueName = readStringAttribute(event.attributes, 'queue_name')
      const workerName = readStringAttribute(event.attributes, 'worker_name')
      const functionName = readStringAttribute(event.attributes, 'function_name')
      const queueNodeId = matchCandidate(spanMapping, queueName)
      const workerNodeId = matchCandidate(spanMapping, workerName)
      const producerLookup = producerMapping ?? spanMapping
      const producerNodeId =
        matchCandidate(producerLookup, functionName) ??
        matchCandidate(producerLookup, event.span_name) ??
        matchCandidate(spanMapping, functionName) ??
        matchCandidate(spanMapping, event.span_name)
      const startTimestamp = parseTimestampMs(event.start_time ?? event.timestamp) ?? currentTime
      const eventTimestamp = parseTimestampMs(event.end_time ?? event.timestamp) ?? currentTime
      const executionKey = eventExecutionKey(event)

      if (executionKey && mappedNodeId) {
        const previousNode = traceLastNodeRef.current.get(executionKey)
        if (previousNode && previousNode !== mappedNodeId) {
          const edgeId = edgeLookup.get(`${previousNode}->${mappedNodeId}`)
          if (edgeId) {
            activateEdge(
              edgeId,
              remainingWindowMs(eventTimestamp, resolvedTimings.edgeActiveMs, currentTime),
            )
          }
        }
        traceLastNodeRef.current.set(executionKey, mappedNodeId)
      }

      if (eventKind === 'node_started') {
        if (event.span_id) {
          spanStartRef.current.set(event.span_id, startTimestamp)
        }

        if (mappedNodeId) {
          updateNodeStatus(mappedNodeId, (previous) => ({
            status: 'active',
            counter: previous?.counter,
            updatedAt: startTimestamp,
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
        const durationVisibleUntil = eventTimestamp + resolvedTimings.durationVisibleMs

        if (isError) {
          updateNodeStatus(mappedNodeId, (previous) => ({
            status: 'error',
            counter: previous?.counter,
            durationMs,
            durationVisibleUntil,
            updatedAt: eventTimestamp,
            lastMessage: event.message ?? event.span_name,
          }))
        } else {
          const pulseMs = visualPulseMs(
            eventTimestamp,
            resolvedTimings.nodePulseResetMs,
            currentTime,
            resolvedTimings.minVisualPulseMs,
            resolvedTimings.stalenessThresholdMs,
          )

          if (pulseMs > 0) {
            updateNodeStatus(mappedNodeId, (previous) => ({
              status: 'active',
              counter: previous?.counter,
              durationMs,
              durationVisibleUntil,
              updatedAt: eventTimestamp,
              lastMessage: event.message ?? event.span_name,
            }))
            scheduleNodeIdle(mappedNodeId, pulseMs, eventTimestamp, {
              durationMs,
              durationVisibleUntil,
              lastMessage: event.message ?? event.span_name,
            })
          } else {
            setNodeIdle(mappedNodeId, eventTimestamp, {
              durationMs,
              durationVisibleUntil,
              lastMessage: event.message ?? event.span_name,
            })
          }
        }

        continue
      }

      if (eventKind === 'queue_enqueued') {
        const targetQueueNodeId = queueNodeId ?? mappedNodeId
        if (targetQueueNodeId) {
          const delta = typeof event.queue_delta === 'number' ? event.queue_delta : 1
          const pulseMs = visualPulseMs(
            eventTimestamp,
            resolvedTimings.nodePulseResetMs,
            currentTime,
            resolvedTimings.minVisualPulseMs,
            resolvedTimings.stalenessThresholdMs,
          )
          const isFresh = pulseMs > 0

          updateNodeStatus(targetQueueNodeId, (previous) => ({
            status: isFresh ? 'active' : 'idle',
            counter: Math.max((previous?.counter ?? 0) + delta, 0),
            updatedAt: eventTimestamp,
            lastMessage: event.message ?? queueName,
            durationMs: previous?.durationMs,
            durationVisibleUntil: previous?.durationVisibleUntil,
          }))
          if (isFresh) {
            scheduleNodeIdle(targetQueueNodeId, pulseMs, eventTimestamp, {
              lastMessage: event.message ?? queueName,
            })
          }

          if (producerNodeId && producerNodeId !== targetQueueNodeId) {
            updateNodeStatus(producerNodeId, (previous) => ({
              status: isFresh ? 'active' : 'idle',
              counter: previous?.counter,
              updatedAt: eventTimestamp,
              lastMessage: event.message ?? functionName ?? event.span_name,
              durationMs: previous?.durationMs,
              durationVisibleUntil: previous?.durationVisibleUntil,
            }))
            if (isFresh) {
              scheduleNodeIdle(producerNodeId, pulseMs, eventTimestamp, {
                lastMessage: event.message ?? functionName ?? event.span_name,
              })
            }

            const edgeId = edgeLookup.get(`${producerNodeId}->${targetQueueNodeId}`)
            if (edgeId) {
              activateEdge(
                edgeId,
                remainingWindowMs(eventTimestamp, resolvedTimings.edgeActiveMs, currentTime),
              )
            }
          }
        }

        continue
      }

      if (eventKind === 'queue_picked') {
        const pulseMs = visualPulseMs(
          eventTimestamp,
          resolvedTimings.nodePulseResetMs,
          currentTime,
          resolvedTimings.minVisualPulseMs,
          resolvedTimings.stalenessThresholdMs,
        )
        const isFresh = pulseMs > 0

        if (queueNodeId) {
          const delta = typeof event.queue_delta === 'number' ? event.queue_delta : -1
          updateNodeStatus(queueNodeId, (previous) => ({
            status: isFresh ? 'active' : 'idle',
            counter: Math.max((previous?.counter ?? 0) + delta, 0),
            updatedAt: eventTimestamp,
            lastMessage: event.message ?? queueName,
            durationMs: previous?.durationMs,
            durationVisibleUntil: previous?.durationVisibleUntil,
          }))
          if (isFresh) {
            scheduleNodeIdle(queueNodeId, pulseMs, eventTimestamp, {
              lastMessage: event.message ?? queueName,
            })
          }
        }

        const targetWorkerNodeId = workerNodeId ?? mappedNodeId
        if (targetWorkerNodeId) {
          updateNodeStatus(targetWorkerNodeId, (previous) => ({
            status: isFresh ? 'active' : 'idle',
            counter: previous?.counter,
            updatedAt: eventTimestamp,
            lastMessage: event.message ?? workerName ?? event.span_name,
            durationMs: previous?.durationMs,
            durationVisibleUntil: previous?.durationVisibleUntil,
          }))
          if (isFresh) {
            scheduleNodeIdle(targetWorkerNodeId, pulseMs, eventTimestamp, {
              lastMessage: event.message ?? workerName ?? event.span_name,
            })
          }

          if (queueNodeId) {
            const edgeId = edgeLookup.get(`${queueNodeId}->${targetWorkerNodeId}`)
            if (edgeId) {
              activateEdge(
                edgeId,
                remainingWindowMs(eventTimestamp, resolvedTimings.edgeActiveMs, currentTime),
              )
            }
          }
        }

        continue
      }

      if (mappedNodeId) {
        const pulseMs = visualPulseMs(
          eventTimestamp,
          resolvedTimings.nodePulseResetMs,
          currentTime,
          resolvedTimings.minVisualPulseMs,
          resolvedTimings.stalenessThresholdMs,
        )
        const isFresh = pulseMs > 0

        updateNodeStatus(mappedNodeId, (previous) => ({
          status: isFresh ? 'active' : 'idle',
          counter: previous?.counter,
          updatedAt: eventTimestamp,
          lastMessage: event.message ?? event.span_name,
          durationMs: previous?.durationMs,
          durationVisibleUntil: previous?.durationVisibleUntil,
        }))
        if (isFresh) {
          scheduleNodeIdle(mappedNodeId, pulseMs, eventTimestamp, {
            lastMessage: event.message ?? event.span_name,
          })
        }
      }
    }
  }, [
    activateEdge,
    clearStatuses,
    edges,
    events,
    resolvedTimings.durationVisibleMs,
    resolvedTimings.minVisualPulseMs,
    resolvedTimings.nodePulseResetMs,
    resolvedTimings.nodeSuccessResetMs,
    resolvedTimings.stalenessThresholdMs,
    setNodeIdle,
    scheduleNodeIdle,
    producerMapping,
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
