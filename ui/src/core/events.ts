import type { FlowEvent } from './types'

interface RelayEnvelope {
  type: 'snapshot' | 'batch'
  events: unknown[]
}

function readAttr(event: FlowEvent, key: string): string | undefined {
  const value = event.attributes?.[key]
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return undefined
}

function inferEventKind(event: FlowEvent): NonNullable<FlowEvent['event_kind']> {
  if (event.type === 'span_start') {
    return 'node_started'
  }
  if (event.type === 'span_end') {
    return 'node_finished'
  }

  const action = readAttr(event, 'action')
  if (action === 'enqueue') {
    return 'queue_enqueued'
  }
  if (action === 'worker_pickup') {
    return 'queue_picked'
  }

  return 'log_event'
}

function toFlowEvent(payload: unknown): FlowEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const event = payload as Partial<FlowEvent>
  if (!event.type || !event.timestamp) {
    return null
  }

  return event as FlowEvent
}

export function normalizeFlowEvent(event: FlowEvent, nextSeq: number): FlowEvent {
  const seq = typeof event.seq === 'number' ? event.seq : nextSeq
  const eventKind = event.event_kind ?? inferEventKind(event)
  const queueDelta =
    typeof event.queue_delta === 'number'
      ? event.queue_delta
      : eventKind === 'queue_enqueued'
        ? 1
        : eventKind === 'queue_picked'
          ? -1
          : undefined

  const queueName = readAttr(event, 'queue_name')
  const functionName = readAttr(event, 'function_name')
  const workerName = readAttr(event, 'worker_name')
  const action = readAttr(event, 'action')
  const nodeKey =
    event.node_key ??
    ((eventKind === 'queue_enqueued' || eventKind === 'queue_picked'
      ? queueName ?? functionName ?? workerName ?? event.span_name ?? action
      : functionName ?? event.span_name ?? workerName ?? queueName ?? action) ??
      undefined)

  return {
    ...event,
    seq,
    event_kind: eventKind,
    queue_delta: queueDelta,
    node_key: nodeKey,
  }
}

export function parseRelayEvents(data: string, currentMaxSeq: number): FlowEvent[] {
  try {
    const parsed = JSON.parse(data) as unknown
    const candidates = unwrapRelayPayload(parsed)
    let nextSeq = currentMaxSeq

    return candidates
      .map(toFlowEvent)
      .filter((event): event is FlowEvent => Boolean(event))
      .map((event) => {
        nextSeq += typeof event.seq === 'number' ? 0 : 1
        return normalizeFlowEvent(event, nextSeq)
      })
  } catch {
    return []
  }
}

export function eventMatchesFlow(event: FlowEvent, flowId: string): boolean {
  if (!Array.isArray(event.matched_flow_ids) || event.matched_flow_ids.length === 0) {
    return true
  }
  return event.matched_flow_ids.includes(flowId)
}

function unwrapRelayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }
  if (isRelayEnvelope(payload)) {
    return payload.events
  }
  return [payload]
}

function isRelayEnvelope(payload: unknown): payload is RelayEnvelope {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const envelope = payload as Partial<RelayEnvelope>
  return (
    (envelope.type === 'snapshot' || envelope.type === 'batch') &&
    Array.isArray(envelope.events)
  )
}
