import type { TraceJourney, TraceStage } from './types'
import {
  getStagePresentationTier,
  isGenericOperationalStage,
  isLifecycleTerminalStage,
  summarizeStageOutcome,
} from './stageOutcomePresentation'
import { normalizeTraceIdentifierValue } from './traceIdentifiers'

function compactIdentifier(value: string, maxLength = 10): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}…`
}

function humanizeMachineLabel(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_:.\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return '-'
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
}

function stageLeaf(stageId: string): string {
  const withoutNamespace = stageId.split('::').at(-1) ?? stageId
  return withoutNamespace.split('.').at(-1) ?? withoutNamespace
}

function preferredRunIdentity(journey: TraceJourney): string | undefined {
  const mailboxOwner = normalizeTraceIdentifierValue(journey.identifiers.mailboxOwner)
  const threadId = normalizeTraceIdentifierValue(journey.identifiers.threadId)
  const replyDraftId = normalizeTraceIdentifierValue(journey.identifiers.replyDraftId)
  const requestId = normalizeTraceIdentifierValue(journey.identifiers.requestId)
  const journeyKey = normalizeTraceIdentifierValue(journey.identifiers.journeyKey)
  const runId = normalizeTraceIdentifierValue(journey.identifiers.runId)
  const jobId = normalizeTraceIdentifierValue(journey.identifiers.jobId)
  const rootEntity = normalizeTraceIdentifierValue(journey.rootEntity)

  if (mailboxOwner && threadId) {
    return `${mailboxOwner} · thread ${compactIdentifier(threadId, 12)}`
  }
  if (mailboxOwner && replyDraftId) {
    return `${mailboxOwner} · draft ${compactIdentifier(replyDraftId, 12)}`
  }
  if (mailboxOwner) {
    return mailboxOwner
  }
  if (threadId) {
    return `Thread ${compactIdentifier(threadId, 12)}`
  }
  if (replyDraftId) {
    return `Draft ${compactIdentifier(replyDraftId, 12)}`
  }
  if (requestId) {
    return `Request ${compactIdentifier(requestId, 12)}`
  }
  if (journeyKey) {
    return `Journey ${compactIdentifier(journeyKey, 12)}`
  }
  if (runId) {
    return `Run ${compactIdentifier(runId, 12)}`
  }
  if (jobId) {
    return `Job ${compactIdentifier(jobId, 12)}`
  }
  if (rootEntity) {
    return rootEntity
  }

  return undefined
}

export function formatRunLabel(journey: TraceJourney): string {
  return preferredRunIdentity(journey) ?? `Run ${journey.traceId.slice(0, 8)}…`
}

export function isDefaultVisibleJourney(journey: TraceJourney): boolean {
  if (journey.status === 'error') {
    return true
  }

  if (
    normalizeTraceIdentifierValue(journey.identifiers.threadId) ||
    normalizeTraceIdentifierValue(journey.identifiers.replyDraftId)
  ) {
    return true
  }

  return journey.stages.some((stage) => {
    const stageId = normalizeTraceIdentifierValue(stage.stageId)
    return isLifecycleTerminalStage(stageId)
  })
}

export function canonicalStepId(stage: Pick<TraceStage, 'nodeId' | 'stageId'>): string | undefined {
  const componentId = normalizeTraceIdentifierValue(stage.nodeId)
  const stageId = normalizeTraceIdentifierValue(stage.stageId)

  if (!componentId) {
    return stageId
  }
  if (!stageId) {
    return componentId
  }

  return `${componentId}.${stageLeaf(stageId)}`
}

export function formatStepLabel(stage: Pick<TraceStage, 'label' | 'nodeId' | 'stageId'>): string {
  const componentId = normalizeTraceIdentifierValue(stage.nodeId)
  const explicitLabel = normalizeTraceIdentifierValue(stage.label)
  const stageId = normalizeTraceIdentifierValue(stage.stageId)

  const componentLabel = componentId ? humanizeMachineLabel(componentId) : undefined
  const detailSource = explicitLabel && explicitLabel !== stageId ? explicitLabel : stageId ? stageLeaf(stageId) : undefined
  const detailLabel = detailSource ? humanizeMachineLabel(detailSource) : undefined

  if (componentLabel && detailLabel && componentLabel !== detailLabel) {
    return `${componentLabel} · ${detailLabel}`
  }

  return componentLabel ?? detailLabel ?? '-'
}

export function formatStepDisplayLabel(
  stage: Pick<TraceStage, 'label' | 'nodeId' | 'stageId' | 'attrs'>,
): string {
  const summary = summarizeStageOutcome({
    stageId: stage.stageId,
    nodeId: stage.nodeId,
    attributes: stage.attrs,
  })

  if (summary) {
    return summary
  }

  return formatStepLabel(stage)
}

export function getOverviewStages(stages: TraceStage[]): TraceStage[] {
  const lifecycleStages = stages.filter((stage) => {
    const tier = getStagePresentationTier({
      stageId: stage.stageId,
      nodeId: stage.nodeId,
      attributes: stage.attrs,
    })

    return tier === 'outcome' || tier === 'transition' || isLifecycleTerminalStage(stage.stageId)
  })

  if (lifecycleStages.length > 0) {
    return lifecycleStages
  }

  const filtered = stages.filter(
    (stage) =>
      !isGenericOperationalStage({
        stageId: stage.stageId,
        nodeId: stage.nodeId,
      }),
  )

  return filtered.length > 0 ? filtered : stages
}

export function getJourneySummaryStage(journey: TraceJourney): TraceStage | undefined {
  return getOverviewStages(journey.stages).at(-1) ?? journey.stages.at(-1)
}
