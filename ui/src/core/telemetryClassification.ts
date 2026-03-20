import { resolveEventKind } from './events'
import { inferErrorState, readStringAttribute } from './mapping'
import type { FlowEvent, LogEntry, TelemetrySignal } from './types'

const CRITICAL_TOKENS = ['manual', 'needs_review', 'retry', 'pause', 'stuck']
const MEANINGFUL_TOKENS = [
  'decision',
  'final_result',
  'enqueue',
  'approved',
  'approval',
  'draft',
  'send',
  'recompute',
  'upsert_contacts',
  'cursor_update',
  'record_extract_state',
  'state_write',
  'skip',
  'skipped',
]
const OPERATIONAL_TOKENS = [
  'write_metadata',
  'write_threads',
  'fetch',
  'lookup',
  'load_config_file',
  'build_profile_token_provider',
  'precheck',
]
const GENERIC_RAW_SPANS = new Set(['rrq.job', 'mail.component'])

function includesAnyToken(source: string, tokens: string[]): boolean {
  return tokens.some((token) => source.includes(token))
}

function eventSourceText(event: FlowEvent): string {
  return [
    readStringAttribute(event.attributes, 'stage_id'),
    readStringAttribute(event.attributes, 'stage_name'),
    readStringAttribute(event.attributes, 'action'),
    readStringAttribute(event.attributes, 'function_name'),
    event.span_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function hasExplicitMessage(event: FlowEvent): boolean {
  const message = event.message?.trim()
  if (!message) {
    return false
  }

  return !['span started', 'span completed', 'log event'].includes(message.toLowerCase())
}

export function classifyFlowEvent(event: FlowEvent): TelemetrySignal {
  const stageId = readStringAttribute(event.attributes, 'stage_id')?.toLowerCase()
  const stageName = readStringAttribute(event.attributes, 'stage_name')?.toLowerCase()
  const status = readStringAttribute(event.attributes, 'status')?.toLowerCase()
  const outcome = readStringAttribute(event.attributes, 'outcome')?.toLowerCase()
  const retryable = readStringAttribute(event.attributes, 'retryable')?.toLowerCase() === 'true'
  const spanName = event.span_name?.toLowerCase()
  const eventKind = resolveEventKind(event)
  const sourceText = eventSourceText(event)

  if (
    inferErrorState(event) ||
    retryable ||
    status === 'warning' ||
    outcome === 'warning' ||
    includesAnyToken(sourceText, CRITICAL_TOKENS)
  ) {
    return 'critical'
  }

  if (eventKind === 'queue_enqueued') {
    return 'meaningful'
  }

  if (eventKind === 'queue_picked') {
    return 'operational'
  }

  if ((event.type === 'span_start' || event.type === 'span_end') && (!stageId && !stageName)) {
    return 'raw'
  }

  if (spanName && GENERIC_RAW_SPANS.has(spanName)) {
    return 'raw'
  }

  if (includesAnyToken(sourceText, OPERATIONAL_TOKENS) || (spanName?.startsWith('mail.store.') ?? false)) {
    return 'operational'
  }

  if (hasExplicitMessage(event) || includesAnyToken(sourceText, MEANINGFUL_TOKENS) || Boolean(stageId || stageName)) {
    return 'meaningful'
  }

  return event.type === 'log' ? 'meaningful' : 'raw'
}

export function isDefaultVisibleSignal(signal: TelemetrySignal): boolean {
  return signal === 'critical' || signal === 'meaningful'
}

export function isDefaultVisibleLogEntry(entry: Pick<LogEntry, 'signal' | 'defaultVisible'>): boolean {
  return typeof entry.defaultVisible === 'boolean' ? entry.defaultVisible : isDefaultVisibleSignal(entry.signal)
}
