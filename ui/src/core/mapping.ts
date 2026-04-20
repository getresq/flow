import type { FlowEvent, SpanMapping } from './types';

function readAttr(event: FlowEvent, key: string): string | null {
  const value = event.attributes?.[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function lookupPattern(mapping: SpanMapping, candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }

  const exact = mapping[candidate];
  if (exact) {
    return exact;
  }

  for (const [pattern, nodeId] of Object.entries(mapping)) {
    if (candidate.includes(pattern)) {
      return nodeId;
    }
  }

  return null;
}

function lookupExact(mapping: SpanMapping, candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }

  return mapping[candidate] ?? null;
}

export function resolveMappedNodeId(event: FlowEvent, spanMapping: SpanMapping): string | null {
  const componentId = readAttr(event, 'component_id');
  const stepId = readAttr(event, 'step_id');
  const functionName = readAttr(event, 'function_name');
  const workerName = readAttr(event, 'worker_name');
  const rrqQueue = readAttr(event, 'rrq.queue');
  const rrqFunction = readAttr(event, 'rrq.function');
  const queueName = readAttr(event, 'queue_name');
  const messagingDestination = readAttr(event, 'messaging.destination.name');
  const messagingOperation = readAttr(event, 'messaging.operation');

  const exactCandidates = [
    componentId && stepId ? `${componentId}.${stepId}` : null,
    functionName && stepId ? `${functionName}.${stepId}` : null,
    rrqFunction && stepId ? `${rrqFunction}.${stepId}` : null,
    workerName && stepId ? `${workerName}.${stepId}` : null,
    queueName && stepId ? `${queueName}.${stepId}` : null,
    rrqQueue && stepId ? `${rrqQueue}.${stepId}` : null,
  ];

  for (const candidate of exactCandidates) {
    const mapped = lookupExact(spanMapping, candidate);
    if (mapped) {
      return mapped;
    }
  }

  if (componentId) {
    return spanMapping[componentId] ?? null;
  }

  const queueFirst = event.event_kind === 'queue_enqueued' || event.event_kind === 'queue_picked';

  const candidates = queueFirst
    ? [
        event.node_key,
        stepId,
        rrqQueue,
        messagingDestination,
        queueName,
        rrqFunction,
        messagingOperation,
        functionName,
        workerName,
        event.span_name,
        readAttr(event, 'action'),
      ]
    : [
        event.node_key,
        stepId,
        rrqFunction,
        messagingOperation,
        event.span_name,
        functionName,
        workerName,
        rrqQueue,
        messagingDestination,
        queueName,
        readAttr(event, 'action'),
      ];

  for (const candidate of candidates) {
    const mapped = lookupPattern(spanMapping, candidate);
    if (mapped) {
      return mapped;
    }
  }

  return null;
}

export function inferErrorState(event: FlowEvent): boolean {
  const status = readAttr(event, 'status')?.toLowerCase();
  const outcome = readAttr(event, 'outcome')?.toLowerCase();
  const errorType = readAttr(event, 'error_type');
  const errorMessage = readAttr(event, 'error_message');

  return (
    status === 'error' ||
    status === 'failed' ||
    outcome === 'error' ||
    outcome === 'failed' ||
    Boolean(errorType) ||
    Boolean(errorMessage)
  );
}

export function readStringAttribute(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}
