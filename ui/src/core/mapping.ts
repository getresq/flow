import type { FlowEvent, SpanMapping } from './types'

function readAttr(event: FlowEvent, key: string): string | null {
  const value = event.attributes?.[key]
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function lookupPattern(mapping: SpanMapping, candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null
  }

  const exact = mapping[candidate]
  if (exact) {
    return exact
  }

  for (const [pattern, nodeId] of Object.entries(mapping)) {
    if (candidate.includes(pattern)) {
      return nodeId
    }
  }

  return null
}

function isEdgeOwnedStage(event: FlowEvent): boolean {
  return readAttr(event, 'stage_id') === 'actions.send_enqueue'
}

export function resolveMappedNodeId(event: FlowEvent, spanMapping: SpanMapping): string | null {
  const componentId = readAttr(event, 'component_id')
  if (componentId) {
    return spanMapping[componentId] ?? null
  }

  // This handoff belongs to the autosend -> send-queue edge, so we only map it
  // when a producer explicitly opted into node identity via component_id.
  if (isEdgeOwnedStage(event)) {
    return null
  }

  const queueFirst = event.event_kind === 'queue_enqueued' || event.event_kind === 'queue_picked'
  const rrqQueue = readAttr(event, 'rrq.queue')
  const rrqFunction = readAttr(event, 'rrq.function')
  const messagingDestination = readAttr(event, 'messaging.destination.name')
  const messagingOperation = readAttr(event, 'messaging.operation')

  const candidates = queueFirst
    ? [
        event.node_key,
        readAttr(event, 'stage_id'),
        rrqQueue,
        messagingDestination,
        readAttr(event, 'queue_name'),
        rrqFunction,
        messagingOperation,
        readAttr(event, 'function_name'),
        readAttr(event, 'worker_name'),
        event.span_name,
        readAttr(event, 'action'),
      ]
    : [
        event.node_key,
        readAttr(event, 'stage_id'),
        rrqFunction,
        messagingOperation,
        event.span_name,
        readAttr(event, 'function_name'),
        readAttr(event, 'worker_name'),
        rrqQueue,
        messagingDestination,
        readAttr(event, 'queue_name'),
        readAttr(event, 'action'),
      ]

  for (const candidate of candidates) {
    const mapped = lookupPattern(spanMapping, candidate)
    if (mapped) {
      return mapped
    }
  }

  return null
}

export function inferErrorState(event: FlowEvent): boolean {
  const status = readAttr(event, 'status')?.toLowerCase()
  const outcome = readAttr(event, 'outcome')?.toLowerCase()
  const errorType = readAttr(event, 'error_type')
  const errorMessage = readAttr(event, 'error_message')

  return (
    status === 'error' ||
    status === 'failed' ||
    outcome === 'error' ||
    outcome === 'failed' ||
    Boolean(errorType) ||
    Boolean(errorMessage)
  )
}

export function readStringAttribute(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key]
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return undefined
}
