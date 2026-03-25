import { readStringAttribute } from './mapping'

export interface StageOutcomeInput {
  stageId?: string
  nodeId?: string
  message?: string
  retryable?: boolean
  errorClass?: string
  attributes?: Record<string, unknown>
}

export type StagePresentationTier = 'outcome' | 'transition' | 'plumbing' | 'fallback'

const TRANSITION_SUMMARIES: Record<string, string> = {
  'actions.send_enqueue': 'send queued',
  'analyze.draft_insert': 'draft created',
  'extract.recompute_enqueue': 'recompute queued',
  'recompute.started': 'recompute started',
}

const PLUMBING_STAGE_IDS = new Set([
  'analyze.reply_status_write',
  'analyze.draft_status_write',
  'extract.state_write',
  'extract.upsert_contacts',
  'incoming.write_metadata',
  'incoming.write_threads',
  'incoming.cursor_update',
  'scheduler.cursor_update',
  'queue.enqueue',
  'worker.pickup',
  'worker.result',
  'send.precheck',
  'send.provider_call',
  'send.finalize',
])

function normalize(value?: string | null): string | undefined {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : undefined
}

function readNormalizedAttribute(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  return normalize(readStringAttribute(attributes, key))
}

function summarizeAnalyzeFinalResult(input: StageOutcomeInput): string | undefined {
  const replyStatus = readNormalizedAttribute(input.attributes, 'reply_status')
  const draftStatus = readNormalizedAttribute(input.attributes, 'draft_status')
  const resultAction = readNormalizedAttribute(input.attributes, 'result_action')
  const autoApproved = readNormalizedAttribute(input.attributes, 'auto_approved') === 'true'

  if (replyStatus === 'skipped' || resultAction === 'skip') {
    return 'skipped'
  }

  if (autoApproved || replyStatus === 'executing_actions') {
    return 'auto-send approved; execution enqueued'
  }

  if (draftStatus === 'approval_pending' || replyStatus === 'pending_action_approval') {
    return 'drafted; awaiting manual approval'
  }

  if (
    draftStatus === 'needs_review' ||
    replyStatus === 'needs_review' ||
    resultAction === 'needs_review'
  ) {
    return 'drafted; awaiting manual review'
  }

  if (resultAction === 'draft_reply') {
    return 'drafted'
  }

  return undefined
}

function summarizeSendFinalResult(input: StageOutcomeInput): string | undefined {
  const replyStatus = readNormalizedAttribute(input.attributes, 'reply_status')
  const draftStatus = readNormalizedAttribute(input.attributes, 'draft_status')
  const resultAction = readNormalizedAttribute(input.attributes, 'result_action')
  const errorClass =
    normalize(input.errorClass) ?? readNormalizedAttribute(input.attributes, 'error_class')
  const errorMessage =
    readNormalizedAttribute(input.attributes, 'error_message') ?? normalize(input.message)
  const retryable =
    input.retryable === true ||
    readNormalizedAttribute(input.attributes, 'retryable') === 'true' ||
    errorClass === 'retryable' ||
    Boolean(errorMessage?.includes('retryable'))

  if (resultAction === 'sent' || replyStatus === 'sent' || draftStatus === 'sent') {
    return 'sent'
  }

  if (draftStatus === 'approval_pending' || replyStatus === 'pending_action_approval') {
    return 'awaiting manual approval'
  }

  if (retryable) {
    return 'retryable send failure'
  }

  if (
    errorClass === 'terminal' ||
    replyStatus === 'send_failed' ||
    replyStatus === 'stale' ||
    draftStatus === 'send_failed'
  ) {
    return 'terminal send failure'
  }

  return undefined
}

function summarizeLifecycleOutcome(input: StageOutcomeInput): string | undefined {
  const stageId = normalize(input.stageId)

  if (!stageId) {
    return undefined
  }

  if (stageId === 'analyze.final_result') {
    return summarizeAnalyzeFinalResult(input)
  }

  if (stageId === 'send.final_result') {
    return summarizeSendFinalResult(input)
  }

  if (stageId === 'extract.final_result') {
    return 'extract completed'
  }

  if (stageId === 'recompute.final_result') {
    return 'recompute finished'
  }

  return undefined
}

function summarizeLifecycleTransition(input: StageOutcomeInput): string | undefined {
  const stageId = normalize(input.stageId)
  if (!stageId) {
    return undefined
  }

  return TRANSITION_SUMMARIES[stageId]
}

function isNodeWrapperStage(input: StageOutcomeInput): boolean {
  const stageId = normalize(input.stageId)
  const nodeId = normalize(input.nodeId)

  if (!stageId) {
    return Boolean(nodeId)
  }

  if (!nodeId) {
    return false
  }

  if (stageId === nodeId) {
    return true
  }

  const stageLeaf = stageId.split('.').at(-1)
  const nodeLeaf = nodeId.split('.').at(-1)
  return Boolean(stageLeaf && nodeLeaf && stageLeaf === nodeLeaf)
}

export function summarizeStageOutcome(input: StageOutcomeInput): string | undefined {
  return summarizeLifecycleOutcome(input) ?? summarizeLifecycleTransition(input)
}

export function getStagePresentationTier(input: StageOutcomeInput): StagePresentationTier {
  if (summarizeLifecycleOutcome(input)) {
    return 'outcome'
  }

  if (summarizeLifecycleTransition(input)) {
    return 'transition'
  }

  const stageId = normalize(input.stageId)
  if ((stageId && PLUMBING_STAGE_IDS.has(stageId)) || isNodeWrapperStage(input)) {
    return 'plumbing'
  }

  return 'fallback'
}

export function isLifecycleTerminalStage(stageId?: string): boolean {
  const normalized = normalize(stageId)
  return Boolean(normalized?.endsWith('final_result'))
}

export function isGenericOperationalStage(input: Pick<StageOutcomeInput, 'stageId' | 'nodeId'>): boolean {
  return getStagePresentationTier(input) === 'plumbing'
}
