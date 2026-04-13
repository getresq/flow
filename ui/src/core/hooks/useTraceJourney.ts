import { useCallback, useMemo } from 'react'

import { compareFlowEventsForDisplay, eventExecutionKey, resolveEventKind } from '../events'
import { inferErrorState, readStringAttribute, resolveMappedNodeId } from '../mapping'
import { normalizeTraceIdentifierValue } from '../traceIdentifiers'
import type {
  FlowEvent,
  SpanMapping,
  TraceIdentifiers,
  TraceJourney,
  TraceJourneyState,
  TraceStep,
  TraceStatus,
} from '../types'

interface MutableStep {
  instanceId: string
  stepId: string
  label: string
  nodeId?: string
  startSeq: number
  endSeq: number
  startTs: string
  endTs?: string
  attempt?: number
  status: TraceStatus
  errorSummary?: string
  attrs?: Record<string, unknown>
}

interface MutableJourney {
  traceId: string
  startedAt: string
  endedAt?: string
  lastUpdatedAt: string
  eventCount: number
  nodePath: string[]
  nodePathSet: Set<string>
  stepsById: Map<string, MutableStep>
  stepOrder: string[]
  identifiers: TraceIdentifiers
}

function readAttempt(attributes: Record<string, unknown> | undefined): number | undefined {
  const value = attributes?.attempt
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function durationFromIso(start: string, end: string | undefined): number | undefined {
  if (!end) {
    return undefined
  }

  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return undefined
  }
  return endMs - startMs
}

function resolveStepId(event: FlowEvent, nodeId: string | null): string {
  const explicitStep = readStringAttribute(event.attributes, 'step_id')
  if (explicitStep) {
    return explicitStep
  }
  if (nodeId) {
    return nodeId
  }
  if (event.span_name) {
    return event.span_name
  }
  if (event.event_kind) {
    return event.event_kind
  }
  return event.type
}

function resolveStepKey(event: FlowEvent, stepId: string, nodeId: string | null): string {
  const componentKey =
    readStringAttribute(event.attributes, 'component_id') ??
    nodeId ??
    event.node_key ??
    readStringAttribute(event.attributes, 'function_name') ??
    event.span_name ??
    event.type

  return `${componentKey}::${stepId}`
}

function resolveLatestStepInstanceKey(stepOrder: string[], baseStepKey: string): string | undefined {
  for (let index = stepOrder.length - 1; index >= 0; index -= 1) {
    const stepKey = stepOrder[index]
    if (stepKey === baseStepKey || stepKey.startsWith(`${baseStepKey}#`)) {
      return stepKey
    }
  }

  return undefined
}

function nextStepInstanceKey(stepOrder: string[], baseStepKey: string): string {
  let occurrence = 2
  let candidate = `${baseStepKey}#${occurrence}`
  while (stepOrder.includes(candidate)) {
    occurrence += 1
    candidate = `${baseStepKey}#${occurrence}`
  }
  return candidate
}

function resolveStepLabel(event: FlowEvent, stepId: string): string {
  return readStringAttribute(event.attributes, 'step_name') ?? stepId
}

function mergeStepAttributes(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!existing) {
    return incoming
  }
  if (!incoming) {
    return existing
  }
  return { ...existing, ...incoming }
}

function resolveStepStatus(event: FlowEvent, current: TraceStatus): TraceStatus {
  if (inferErrorState(event)) {
    return 'error'
  }
  if (current === 'error') {
    return current
  }

  const outcome = readStringAttribute(event.attributes, 'outcome')?.toLowerCase()
  if (outcome === 'success' || outcome === 'ok') {
    return 'success'
  }
  if (resolveEventKind(event) === 'node_finished') {
    return 'success'
  }
  return current
}

function resolveErrorSummary(event: FlowEvent): string | undefined {
  const errorMessage = readStringAttribute(event.attributes, 'error_message')
  if (errorMessage) {
    return errorMessage
  }
  const errorCode = readStringAttribute(event.attributes, 'error_code')
  const errorClass = readStringAttribute(event.attributes, 'error_class')
  if (errorClass && errorCode) {
    return `${errorClass}:${errorCode}`
  }
  if (errorClass) {
    return errorClass
  }
  if (errorCode) {
    return errorCode
  }
  const outcome = readStringAttribute(event.attributes, 'outcome')
  if (outcome && outcome.toLowerCase() === 'error') {
    return 'outcome:error'
  }
  return undefined
}

function setIdentifierIfEmpty(target: TraceIdentifiers, key: keyof TraceIdentifiers, value: string | undefined) {
  const normalized = normalizeTraceIdentifierValue(value)
  if (!normalized || target[key]) {
    return
  }
  target[key] = normalized
}

function materializeJourneys(journeyMap: Map<string, MutableJourney>): TraceJourney[] {
  return [...journeyMap.values()]
    .map((journey): TraceJourney => {
      const steps: TraceStep[] = journey.stepOrder
        .map((stepId) => journey.stepsById.get(stepId))
        .filter((stage): stage is MutableStep => Boolean(stage))
        .sort((left, right) => {
          const bySeq = left.startSeq - right.startSeq
          if (bySeq !== 0) {
            return bySeq
          }
          return Date.parse(left.startTs) - Date.parse(right.startTs)
        })
        .map((stage) => ({
          instanceId: stage.instanceId,
          stepId: stage.stepId,
          label: stage.label,
          nodeId: stage.nodeId,
          startSeq: stage.startSeq,
          endSeq: stage.endSeq,
          startTs: stage.startTs,
          endTs: stage.endTs,
          durationMs: durationFromIso(stage.startTs, stage.endTs),
          status: stage.status,
          attempt: stage.attempt,
          errorSummary: stage.errorSummary,
          attrs: stage.attrs,
        }))

      const hasError = steps.some((stage) => stage.status === 'error')
      const hasRunning = steps.some((stage) => stage.status === 'running')
      const hasSuccess = steps.some((stage) => stage.status === 'success')

      let status: TraceStatus = 'running'
      if (hasError) {
        status = 'error'
      } else if (hasRunning && hasSuccess) {
        status = 'partial'
      } else if (!hasRunning) {
        status = 'success'
      }

      const rootEntity =
        journey.identifiers.threadId ??
        journey.identifiers.replyDraftId ??
        journey.identifiers.runId ??
        journey.identifiers.jobId ??
        journey.identifiers.requestId ??
        journey.identifiers.mailboxOwner

      return {
        traceId: journey.traceId,
        rootEntity,
        startedAt: journey.startedAt,
        endedAt: journey.endedAt,
        durationMs: durationFromIso(journey.startedAt, journey.endedAt),
        status,
        steps,
        nodePath: journey.nodePath,
        errorSummary: steps.find((stage) => stage.status === 'error')?.errorSummary,
        lastUpdatedAt: journey.lastUpdatedAt,
        eventCount: journey.eventCount,
        identifiers: journey.identifiers,
      }
    })
    .sort((left, right) => {
      const byTs = Date.parse(right.lastUpdatedAt) - Date.parse(left.lastUpdatedAt)
      if (byTs !== 0) {
        return byTs
      }
      return right.eventCount - left.eventCount
    })
}

export function useTraceJourney(
  events: FlowEvent[],
  spanMapping: SpanMapping,
  _sessionKey?: number | string,
): TraceJourneyState {
  const journeys = useMemo(() => {
    const journeyMap = new Map<string, MutableJourney>()
    const orderedEvents = [...events].sort(compareFlowEventsForDisplay)

    for (let index = 0; index < orderedEvents.length; index += 1) {
      const event = orderedEvents[index]
      const executionKey = eventExecutionKey(event)
      if (!executionKey) {
        continue
      }

      const traceId = executionKey
      const seq = typeof event.seq === 'number' ? event.seq : index + 1
      const nodeId = resolveMappedNodeId(event, spanMapping)
      const journey = journeyMap.get(traceId) ?? {
        traceId,
        startedAt: event.timestamp,
        endedAt: event.timestamp,
        lastUpdatedAt: event.timestamp,
        eventCount: 0,
        nodePath: [],
        nodePathSet: new Set<string>(),
        stepsById: new Map<string, MutableStep>(),
        stepOrder: [],
        identifiers: {},
      }

      journey.eventCount += 1
      journey.lastUpdatedAt = event.timestamp
      journey.endedAt = event.timestamp

      if (nodeId && !journey.nodePathSet.has(nodeId)) {
        journey.nodePath.push(nodeId)
        journey.nodePathSet.add(nodeId)
      }

      setIdentifierIfEmpty(journey.identifiers, 'mailboxOwner', readStringAttribute(event.attributes, 'mailbox_owner'))
      setIdentifierIfEmpty(journey.identifiers, 'provider', readStringAttribute(event.attributes, 'provider'))
      setIdentifierIfEmpty(journey.identifiers, 'flowId', readStringAttribute(event.attributes, 'flow_id'))
      setIdentifierIfEmpty(journey.identifiers, 'runId', readStringAttribute(event.attributes, 'run_id'))
      setIdentifierIfEmpty(journey.identifiers, 'componentId', readStringAttribute(event.attributes, 'component_id'))
      setIdentifierIfEmpty(journey.identifiers, 'threadId', readStringAttribute(event.attributes, 'thread_id'))
      setIdentifierIfEmpty(
        journey.identifiers,
        'replyDraftId',
        readStringAttribute(event.attributes, 'reply_draft_id'),
      )
      setIdentifierIfEmpty(journey.identifiers, 'jobId', readStringAttribute(event.attributes, 'job_id'))
      setIdentifierIfEmpty(journey.identifiers, 'requestId', readStringAttribute(event.attributes, 'request_id'))
      setIdentifierIfEmpty(journey.identifiers, 'contentHash', readStringAttribute(event.attributes, 'content_hash'))
      setIdentifierIfEmpty(journey.identifiers, 'journeyKey', readStringAttribute(event.attributes, 'journey_key'))

      const stepId = resolveStepId(event, nodeId)
      const baseStepKey = resolveStepKey(event, stepId, nodeId)
      const previousStepKey = journey.stepOrder[journey.stepOrder.length - 1]
      const latestStageInstanceKey = resolveLatestStepInstanceKey(journey.stepOrder, baseStepKey)
      const stepKey =
        latestStageInstanceKey && previousStepKey === latestStageInstanceKey
          ? latestStageInstanceKey
          : latestStageInstanceKey
            ? nextStepInstanceKey(journey.stepOrder, baseStepKey)
            : baseStepKey

      if (previousStepKey && previousStepKey !== stepKey) {
        const previousStep = journey.stepsById.get(previousStepKey)
        if (previousStep && previousStep.status === 'running') {
          previousStep.status = 'success'
          previousStep.endSeq = Math.max(previousStep.endSeq, seq)
          previousStep.endTs = event.timestamp
          journey.stepsById.set(previousStepKey, previousStep)
        }
      }

      const stage = journey.stepsById.get(stepKey) ?? {
        instanceId: stepKey,
        stepId,
        label: resolveStepLabel(event, stepId),
        nodeId: nodeId ?? undefined,
        startSeq: seq,
        endSeq: seq,
        startTs: event.timestamp,
        endTs: event.timestamp,
        status: 'running',
      }

      if (!journey.stepsById.has(stepKey)) {
        journey.stepOrder.push(stepKey)
      }

      const nextLabel = resolveStepLabel(event, stepId)
      if (stage.label === stage.stepId || nextLabel !== stepId) {
        stage.label = nextLabel
      }
      stage.nodeId = stage.nodeId ?? nodeId ?? undefined
      stage.endSeq = Math.max(stage.endSeq, seq)
      stage.endTs = event.timestamp
      stage.attrs = mergeStepAttributes(stage.attrs, event.attributes)
      stage.status = resolveStepStatus(event, stage.status)

      const attempt = readAttempt(event.attributes)
      if (typeof attempt === 'number') {
        stage.attempt = Math.max(stage.attempt ?? 0, attempt)
      }

      if (stage.status === 'error') {
        stage.errorSummary = stage.errorSummary ?? resolveErrorSummary(event)
      }

      journey.stepsById.set(stepKey, stage)
      journeyMap.set(traceId, journey)
    }

    return materializeJourneys(journeyMap)
  }, [events, spanMapping])

  const journeyByTraceId = useMemo(
    () => new Map(journeys.map((journey) => [journey.traceId, journey])),
    [journeys],
  )

  const clearJourneys = useCallback(() => {}, [])

  return {
    journeys,
    journeyByTraceId,
    clearJourneys,
  }
}
