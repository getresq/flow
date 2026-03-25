import type { LogEntry } from './types'
import { summarizeStageOutcome } from './stageOutcomePresentation'

interface FlowLogPresentationInput {
  stageId?: string
  nodeId?: string
  stageName?: string
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

export function buildFlowLogDisplayMessage(input: FlowLogPresentationInput): string {
  const summary = summarizeStageOutcome(input)
  if (summary) {
    return summary
  }

  return defaultDisplayMessage(input.stageName ?? input.stageId, input.message)
}

export function getLogDisplayMessage(
  entry: Pick<LogEntry, 'displayMessage' | 'message' | 'stageId' | 'stageName'>,
): string {
  if (entry.displayMessage) {
    return entry.displayMessage
  }

  return defaultDisplayMessage(entry.stageName ?? entry.stageId, entry.message)
}

export function buildLogSearchText(
  entry: Pick<
    LogEntry,
    'displayMessage' | 'message' | 'stageId' | 'stageName' | 'componentId' | 'runId' | 'traceId' | 'nodeId'
  >,
  nodeLabel?: string,
): string {
  return [
    getLogDisplayMessage(entry),
    entry.message,
    nodeLabel,
    entry.nodeId,
    entry.stageName,
    entry.stageId,
    entry.componentId,
    entry.runId,
    entry.traceId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
