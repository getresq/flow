import { readStringAttribute } from './mapping';
import { combinedStepRef, stepLeaf } from './stepRefs';

export interface StepOutcomeInput {
  stepId?: string;
  nodeId?: string;
  message?: string;
  retryable?: boolean;
  errorClass?: string;
  attributes?: Record<string, unknown>;
}

export type StepPresentationTier = 'outcome' | 'transition' | 'plumbing' | 'fallback';

const TRANSITION_SUMMARIES: Record<string, string> = {
  'autosend-decision.send-enqueue': 'send queued',
  'draft-reply.draft-insert': 'draft created',
  'draft-reply.draft-status-write': 'draft created',
  'extract-worker.started': 'extract started',
};

const PLUMBING_STEP_REFS = new Set([
  'analyze-decision.reply-status-write',
  'draft-reply.draft-status-write',
  'extract-worker.state-write',
  'extract-worker.upsert-contacts',
  'extract-worker.upsert-insights',
  'incoming-worker.write-metadata',
  'incoming-worker.write-threads',
  'incoming-worker.cursor-update',
  'incoming-schedule-process.cursor-update',
  'send-process.precheck',
]);

const GENERIC_PLUMBING_STEP_LEAVES = new Set(['enqueue', 'pickup', 'result']);

function normalize(value?: string | null): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

function readNormalizedAttribute(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  return normalize(readStringAttribute(attributes, key));
}

function normalizedStepRef(input: Pick<StepOutcomeInput, 'stepId' | 'nodeId'>): string | undefined {
  return normalize(combinedStepRef(input.nodeId, input.stepId));
}

function summarizeAnalyzeFinalResult(input: StepOutcomeInput): string | undefined {
  const replyStatus = readNormalizedAttribute(input.attributes, 'reply_status');
  const draftStatus = readNormalizedAttribute(input.attributes, 'draft_status');
  const resultAction = readNormalizedAttribute(input.attributes, 'result_action');
  const autoApproved = readNormalizedAttribute(input.attributes, 'auto_approved') === 'true';

  if (replyStatus === 'skipped' || resultAction === 'skip') {
    return 'skipped';
  }

  if (autoApproved || replyStatus === 'executing_actions') {
    return 'auto-send approved; execution enqueued';
  }

  if (draftStatus === 'approval_pending' || replyStatus === 'pending_action_approval') {
    return 'drafted; awaiting manual approval';
  }

  if (
    draftStatus === 'needs_review' ||
    replyStatus === 'needs_review' ||
    resultAction === 'needs_review'
  ) {
    return 'drafted; awaiting manual review';
  }

  if (resultAction === 'draft_reply') {
    return 'drafted';
  }

  return undefined;
}

function summarizeSendFinalResult(input: StepOutcomeInput): string | undefined {
  const replyStatus = readNormalizedAttribute(input.attributes, 'reply_status');
  const draftStatus = readNormalizedAttribute(input.attributes, 'draft_status');
  const resultAction = readNormalizedAttribute(input.attributes, 'result_action');
  const errorClass =
    normalize(input.errorClass) ?? readNormalizedAttribute(input.attributes, 'error_class');
  const errorMessage =
    readNormalizedAttribute(input.attributes, 'error_message') ?? normalize(input.message);
  const retryable =
    input.retryable === true ||
    readNormalizedAttribute(input.attributes, 'retryable') === 'true' ||
    errorClass === 'retryable' ||
    Boolean(errorMessage?.includes('retryable'));

  if (resultAction === 'sent' || replyStatus === 'sent' || draftStatus === 'sent') {
    return 'sent';
  }

  if (draftStatus === 'approval_pending' || replyStatus === 'pending_action_approval') {
    return 'awaiting manual approval';
  }

  if (retryable) {
    return 'retryable send failure';
  }

  if (
    errorClass === 'terminal' ||
    replyStatus === 'send_failed' ||
    replyStatus === 'stale' ||
    draftStatus === 'send_failed'
  ) {
    return 'terminal send failure';
  }

  return undefined;
}

function summarizeLifecycleOutcome(input: StepOutcomeInput): string | undefined {
  const stepRef = normalizedStepRef(input);

  if (!stepRef) {
    return undefined;
  }

  if (stepRef === 'analyze-decision.final-result') {
    return summarizeAnalyzeFinalResult(input);
  }

  if (stepRef === 'send-process.final-result') {
    return summarizeSendFinalResult(input);
  }

  if (stepRef === 'extract-worker.final-result') {
    return 'extract completed';
  }

  return undefined;
}

function summarizeLifecycleTransition(input: StepOutcomeInput): string | undefined {
  const stepRef = normalizedStepRef(input);
  if (!stepRef) {
    return undefined;
  }

  return TRANSITION_SUMMARIES[stepRef];
}

function isNodeWrapperStep(input: StepOutcomeInput): boolean {
  const stepId = normalize(input.stepId);
  const nodeId = normalize(input.nodeId);

  if (!stepId) {
    return Boolean(nodeId);
  }

  if (!nodeId) {
    return false;
  }

  if (stepId === nodeId) {
    return true;
  }

  const stepLeafValue = stepLeaf(stepId);
  const nodeLeaf = nodeId.split('.').at(-1);
  return Boolean(stepLeafValue && nodeLeaf && stepLeafValue === nodeLeaf);
}

export function summarizeStepOutcome(input: StepOutcomeInput): string | undefined {
  return summarizeLifecycleOutcome(input) ?? summarizeLifecycleTransition(input);
}

export function getStepPresentationTier(input: StepOutcomeInput): StepPresentationTier {
  if (summarizeLifecycleOutcome(input)) {
    return 'outcome';
  }

  if (summarizeLifecycleTransition(input)) {
    return 'transition';
  }

  const stepRef = normalizedStepRef(input);
  const stepLeafValue = stepLeaf(input.stepId);
  if (
    (stepRef && PLUMBING_STEP_REFS.has(stepRef)) ||
    (stepLeafValue && GENERIC_PLUMBING_STEP_LEAVES.has(stepLeafValue)) ||
    isNodeWrapperStep(input)
  ) {
    return 'plumbing';
  }

  return 'fallback';
}

export function isLifecycleTerminalStep(stepId?: string): boolean {
  return stepLeaf(stepId) === 'final-result';
}

export function isGenericOperationalStep(
  input: Pick<StepOutcomeInput, 'stepId' | 'nodeId'>,
): boolean {
  return getStepPresentationTier(input) === 'plumbing';
}
