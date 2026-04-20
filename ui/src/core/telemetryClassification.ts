import { resolveEventKind } from './events';
import { inferErrorState, readStringAttribute } from './mapping';
import { getStepPresentationTier } from './stepOutcomePresentation';
import type { FlowEvent, LogEntry, TelemetrySignal } from './types';

const CRITICAL_TOKENS = ['manual', 'needs_review', 'retry', 'pause', 'stuck'];
const MEANINGFUL_TOKENS = [
  'decision',
  'final-result',
  'enqueue',
  'approved',
  'approval',
  'draft',
  'send',
  'upsert-contacts',
  'cursor-update',
  'record_extract_state',
  'state-write',
  'skip',
  'skipped',
];
const OPERATIONAL_TOKENS = [
  'write-metadata',
  'write-threads',
  'fetch',
  'lookup',
  'load_config_file',
  'build_profile_token_provider',
  'precheck',
];
const GENERIC_RAW_SPANS = new Set(['rrq.job', 'mail.component']);

function includesAnyToken(source: string, tokens: string[]): boolean {
  return tokens.some((token) => source.includes(token));
}

function eventSourceText(event: FlowEvent): string {
  return [
    readStringAttribute(event.attributes, 'step_id'),
    readStringAttribute(event.attributes, 'step_name'),
    readStringAttribute(event.attributes, 'action'),
    readStringAttribute(event.attributes, 'function_name'),
    event.span_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasExplicitMessage(event: FlowEvent): boolean {
  const message = event.message?.trim();
  if (!message) {
    return false;
  }

  return !['span started', 'span completed', 'log event'].includes(message.toLowerCase());
}

export function classifyFlowEvent(event: FlowEvent): TelemetrySignal {
  const stepId = readStringAttribute(event.attributes, 'step_id')?.toLowerCase();
  const stepName = readStringAttribute(event.attributes, 'step_name')?.toLowerCase();
  const componentId = readStringAttribute(event.attributes, 'component_id')?.toLowerCase();
  const status = readStringAttribute(event.attributes, 'status')?.toLowerCase();
  const outcome = readStringAttribute(event.attributes, 'outcome')?.toLowerCase();
  const retryable = readStringAttribute(event.attributes, 'retryable')?.toLowerCase() === 'true';
  const spanName = event.span_name?.toLowerCase();
  const eventKind = resolveEventKind(event);
  const sourceText = eventSourceText(event);
  const stageTier = getStepPresentationTier({
    stepId,
    nodeId: componentId,
    attributes: event.attributes,
  });

  if (
    inferErrorState(event) ||
    retryable ||
    status === 'warning' ||
    outcome === 'warning' ||
    includesAnyToken(sourceText, CRITICAL_TOKENS)
  ) {
    return 'critical';
  }

  if (event.type === 'span_start' || event.type === 'span_end') {
    return 'raw';
  }

  if (spanName && GENERIC_RAW_SPANS.has(spanName)) {
    return 'raw';
  }

  if (stageTier === 'outcome' || stageTier === 'transition') {
    return 'meaningful';
  }

  if (stageTier === 'plumbing') {
    return 'operational';
  }

  if (eventKind === 'queue_enqueued') {
    return 'meaningful';
  }

  if (eventKind === 'queue_picked') {
    return 'operational';
  }

  if (
    includesAnyToken(sourceText, OPERATIONAL_TOKENS) ||
    (spanName?.startsWith('mail.store.') ?? false)
  ) {
    return 'operational';
  }

  if (
    hasExplicitMessage(event) ||
    includesAnyToken(sourceText, MEANINGFUL_TOKENS) ||
    Boolean(stepId || stepName)
  ) {
    return 'meaningful';
  }

  return event.type === 'log' ? 'meaningful' : 'raw';
}

export function isDefaultVisibleSignal(signal: TelemetrySignal): boolean {
  return signal === 'critical' || signal === 'meaningful';
}

export function isDefaultVisibleLogEntry(
  entry: Pick<LogEntry, 'signal' | 'defaultVisible' | 'eventType'>,
): boolean {
  if ('eventType' in entry && entry.eventType !== 'log') {
    return false;
  }

  return typeof entry.defaultVisible === 'boolean'
    ? entry.defaultVisible
    : isDefaultVisibleSignal(entry.signal);
}
