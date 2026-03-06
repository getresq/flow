import { useCallback, useEffect, useRef, useState } from 'react'

import { inferErrorState, readStringAttribute, resolveMappedNodeId } from '../mapping'
import type {
  FlowEvent,
  SpanMapping,
  TraceIdentifiers,
  TraceJourney,
  TraceJourneyState,
  TraceStage,
  TraceStatus,
} from '../types'

interface MutableStage {
  stageId: string
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
  stagesById: Map<string, MutableStage>
  stageOrder: string[]
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

function resolveStageId(event: FlowEvent, nodeId: string | null): string {
  const explicitStage = readStringAttribute(event.attributes, 'stage_id')
  if (explicitStage) {
    return explicitStage
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

function resolveStageLabel(event: FlowEvent, stageId: string): string {
  return readStringAttribute(event.attributes, 'stage_name') ?? stageId
}

function resolveStageStatus(event: FlowEvent, current: TraceStatus): TraceStatus {
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
  if (event.event_kind === 'node_finished' || event.type === 'span_end') {
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
  if (!value || target[key]) {
    return
  }
  target[key] = value
}

function materializeJourneys(journeyMap: Map<string, MutableJourney>): TraceJourney[] {
  return [...journeyMap.values()]
    .map((journey): TraceJourney => {
      const stages: TraceStage[] = journey.stageOrder
        .map((stageId) => journey.stagesById.get(stageId))
        .filter((stage): stage is MutableStage => Boolean(stage))
        .sort((left, right) => {
          const bySeq = left.startSeq - right.startSeq
          if (bySeq !== 0) {
            return bySeq
          }
          return Date.parse(left.startTs) - Date.parse(right.startTs)
        })
        .map((stage) => ({
          stageId: stage.stageId,
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

      const hasError = stages.some((stage) => stage.status === 'error')
      const hasRunning = stages.some((stage) => stage.status === 'running')
      const hasSuccess = stages.some((stage) => stage.status === 'success')

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
        stages,
        nodePath: journey.nodePath,
        errorSummary: stages.find((stage) => stage.status === 'error')?.errorSummary,
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
  sessionKey?: number | string,
): TraceJourneyState {
  const [journeys, setJourneys] = useState<TraceJourney[]>([])
  const [journeyByTraceId, setJourneyByTraceId] = useState<Map<string, TraceJourney>>(new Map())

  const processedIndexRef = useRef(0)
  const sessionKeyRef = useRef<number | string | undefined>(sessionKey)
  const journeysRef = useRef<Map<string, MutableJourney>>(new Map())

  const clearJourneys = useCallback(() => {
    processedIndexRef.current = 0
    journeysRef.current = new Map()
    setJourneys([])
    setJourneyByTraceId(new Map())
  }, [])

  useEffect(() => {
    if (sessionKeyRef.current === sessionKey) {
      return
    }
    sessionKeyRef.current = sessionKey
    clearJourneys()
  }, [clearJourneys, sessionKey])

  useEffect(() => {
    if (events.length < processedIndexRef.current) {
      clearJourneys()
    }

    if (events.length === processedIndexRef.current) {
      return
    }

    const journeyMap = new Map(journeysRef.current)
    const pending = [...events.slice(processedIndexRef.current)].sort((left, right) => {
      const bySeq = (left.seq ?? 0) - (right.seq ?? 0)
      if (bySeq !== 0) {
        return bySeq
      }
      return Date.parse(left.timestamp) - Date.parse(right.timestamp)
    })
    processedIndexRef.current = events.length

    for (let index = 0; index < pending.length; index += 1) {
      const event = pending[index]
      if (!event.trace_id) {
        continue
      }

      const traceId = event.trace_id
      const seq = typeof event.seq === 'number' ? event.seq : processedIndexRef.current - pending.length + index + 1
      const nodeId = resolveMappedNodeId(event, spanMapping)
      const journey = journeyMap.get(traceId) ?? {
        traceId,
        startedAt: event.timestamp,
        endedAt: event.timestamp,
        lastUpdatedAt: event.timestamp,
        eventCount: 0,
        nodePath: [],
        nodePathSet: new Set<string>(),
        stagesById: new Map<string, MutableStage>(),
        stageOrder: [],
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

      const stageId = resolveStageId(event, nodeId)
      const previousStageId = journey.stageOrder[journey.stageOrder.length - 1]
      if (previousStageId && previousStageId !== stageId) {
        const previousStage = journey.stagesById.get(previousStageId)
        if (previousStage && previousStage.status === 'running') {
          previousStage.status = 'success'
          previousStage.endSeq = Math.max(previousStage.endSeq, seq)
          previousStage.endTs = event.timestamp
          journey.stagesById.set(previousStageId, previousStage)
        }
      }

      const stage = journey.stagesById.get(stageId) ?? {
        stageId,
        label: resolveStageLabel(event, stageId),
        nodeId: nodeId ?? undefined,
        startSeq: seq,
        endSeq: seq,
        startTs: event.timestamp,
        endTs: event.timestamp,
        status: 'running',
      }

      if (!journey.stagesById.has(stageId)) {
        journey.stageOrder.push(stageId)
      }

      stage.label = resolveStageLabel(event, stageId)
      stage.nodeId = stage.nodeId ?? nodeId ?? undefined
      stage.endSeq = Math.max(stage.endSeq, seq)
      stage.endTs = event.timestamp
      stage.attrs = event.attributes
      stage.status = resolveStageStatus(event, stage.status)

      const attempt = readAttempt(event.attributes)
      if (typeof attempt === 'number') {
        stage.attempt = Math.max(stage.attempt ?? 0, attempt)
      }

      if (stage.status === 'error') {
        stage.errorSummary = stage.errorSummary ?? resolveErrorSummary(event)
      }

      journey.stagesById.set(stageId, stage)
      journeyMap.set(traceId, journey)
    }

    journeysRef.current = journeyMap
    const nextJourneys = materializeJourneys(journeyMap)
    setJourneys(nextJourneys)
    setJourneyByTraceId(new Map(nextJourneys.map((journey) => [journey.traceId, journey])))
  }, [clearJourneys, events, spanMapping])

  return {
    journeys,
    journeyByTraceId,
    clearJourneys,
  }
}
