import type { LogEntry } from './types'
import { summarizeStepOutcome } from './stepOutcomePresentation'
import { combinedStepRef } from './stepRefs'

export function getLogSelectionId(entry: Pick<LogEntry, 'selectionId' | 'seq'>): string | undefined {
  return entry.selectionId ?? (entry.seq != null ? String(entry.seq) : undefined)
}

interface FlowLogPresentationInput {
  stepId?: string
  nodeId?: string
  stepName?: string
  message: string
  retryable?: boolean
  errorClass?: string
  attributes?: Record<string, unknown>
}

function defaultDisplayMessage(stageLabel: string | undefined, message: string): string {
  if (!stageLabel) {
    return message
  }

  return `${stageLabel}: ${message}`
}

function preferredLogStepLabel(
  input: Pick<FlowLogPresentationInput, 'nodeId' | 'stepId' | 'stepName'>,
): string | undefined {
  return input.stepName ?? combinedStepRef(input.nodeId, input.stepId) ?? input.stepId
}

export function buildFlowLogDisplayMessage(input: FlowLogPresentationInput): string {
  const summary = summarizeStepOutcome(input)
  if (summary) {
    return summary
  }

  return defaultDisplayMessage(preferredLogStepLabel(input), input.message)
}

export function getLogDisplayMessage(
  entry: Pick<LogEntry, 'displayMessage' | 'message' | 'stepId' | 'stepName' | 'componentId' | 'nodeId'>,
): string {
  if (entry.displayMessage) {
    return entry.displayMessage
  }

  return defaultDisplayMessage(
    preferredLogStepLabel({
      stepName: entry.stepName,
      stepId: entry.stepId,
      nodeId: entry.nodeId ?? entry.componentId,
    }),
    entry.message,
  )
}

export function buildLogSearchText(
  entry: Pick<
    LogEntry,
    'displayMessage' | 'message' | 'stepId' | 'stepName' | 'componentId' | 'runId' | 'traceId' | 'nodeId'
  >,
  nodeLabel?: string,
): string {
  return [
    getLogDisplayMessage(entry),
    entry.message,
    nodeLabel,
    entry.nodeId,
    entry.stepName,
    entry.stepId,
    entry.componentId,
    entry.runId,
    entry.traceId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
