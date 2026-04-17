import { describe, expect, it } from 'vitest'

import type { FlowEdgeConfig, FlowNodeConfig, TraceJourney } from '../types'
import {
  formatRunLabel,
  formatStepDisplayLabel,
  formatStepLabel,
  getJourneySummaryStep,
  getJourneyOverviewModel,
  getOverviewSteps,
  isRunBackedJourney,
} from '../runPresentation'

function makeJourney(overrides: Partial<TraceJourney> = {}): TraceJourney {
  return {
    traceId: 'trace-1',
    startedAt: '2026-03-24T12:00:00.000Z',
    durationMs: 450,
    status: 'success',
    steps: [],
    nodePath: [],
    lastUpdatedAt: '2026-03-24T12:00:01.000Z',
    eventCount: 1,
    identifiers: {},
    ...overrides,
  }
}

const flowNodes: FlowNodeConfig[] = [
  {
    id: 'incoming-worker',
    type: 'roundedRect',
    label: 'Incoming Worker',
    position: { x: 0, y: 0 },
    layout: { order: 10 },
  },
  {
    id: 'incoming-schedule-process',
    type: 'roundedRect',
    label: 'Schedule Incoming Checks',
    position: { x: 0, y: 0 },
    style: { color: 'muted' },
  },
  {
    id: 'send-process',
    type: 'roundedRect',
    label: 'Send Reply',
    position: { x: 0, y: 0 },
    layout: { order: 20 },
  },
]

const flowEdges: FlowEdgeConfig[] = [
  { id: 'incoming-worker->send-process', source: 'incoming-worker', target: 'send-process' },
]

const autosendFlowNodes: FlowNodeConfig[] = [
  {
    id: 'autosend-decision',
    type: 'diamond',
    label: 'Auto Send?',
    position: { x: 0, y: 0 },
    layout: { order: 10 },
  },
  {
    id: 'actions-queue',
    type: 'roundedRect',
    label: 'Actions Queue',
    position: { x: 0, y: 0 },
    layout: { order: 20 },
  },
]

const autosendFlowEdges: FlowEdgeConfig[] = [
  { id: 'autosend-decision->actions-queue', source: 'autosend-decision', target: 'actions-queue' },
]

describe('runPresentation', () => {
  it('prefers meaningful mailbox and thread identifiers over placeholder root labels', () => {
    const journey = makeJourney({
      rootEntity: '0',
      identifiers: {
        mailboxOwner: 'jrojas@getresq.com',
        threadId: '19d1f6ffa726e354',
      },
    })

    expect(formatRunLabel(journey)).toBe('jrojas@getresq.com · thread 19d1f6ffa726…')
  })

  it('humanizes canonical step labels', () => {
    expect(
      formatStepLabel({
        stepId: 'final-result',
        label: 'final-result',
        nodeId: 'extract-worker',
      }),
    ).toBe('Extract worker · Final result')
  })

  it('prefers outcome summaries for lifecycle steps when attrs are present', () => {
    expect(
      formatStepDisplayLabel({
        stepId: 'final-result',
        label: 'final-result',
        nodeId: 'analyze-decision',
        attrs: {
          reply_status: 'needs_review',
          draft_status: 'needs_review',
          result_action: 'draft_reply',
          auto_approved: false,
        },
      }),
    ).toBe('drafted; awaiting manual review')

    expect(
      formatStepDisplayLabel({
        stepId: 'final-result',
        label: 'final-result',
        nodeId: 'send-process',
        attrs: {
          reply_status: 'sent',
          draft_status: 'sent',
          result_action: 'sent',
        },
      }),
    ).toBe('sent')
  })

  it('treats only explicit run_id journeys as run-backed', () => {
    const runBackedJourney = makeJourney({
      identifiers: {
        runId: 'mail-pipeline_123',
        threadId: 'thread-1',
      },
    })
    const ambientJourney = makeJourney({
      identifiers: {
        requestId: 'request-1',
      },
    })

    expect(isRunBackedJourney(runBackedJourney)).toBe(true)
    expect(isRunBackedJourney(ambientJourney)).toBe(false)
  })

  it('groups steps by node id and orders cards by first reach', () => {
    const journey = makeJourney({
      steps: [
        {
          stepId: 'write-metadata',
          label: 'write-metadata',
          nodeId: 'incoming-worker',
          startSeq: 1,
          endSeq: 1,
          startTs: '2026-03-24T12:00:00.000Z',
          durationMs: 1100,
          status: 'success',
        },
        {
          stepId: 'cursor-update',
          label: 'cursor-update',
          nodeId: 'incoming-schedule-process',
          startSeq: 2,
          endSeq: 2,
          startTs: '2026-03-24T12:00:01.000Z',
          durationMs: 0,
          status: 'success',
        },
        {
          stepId: 'final-result',
          label: 'final-result',
          nodeId: 'incoming-worker',
          startSeq: 3,
          endSeq: 3,
          startTs: '2026-03-24T12:00:02.000Z',
          durationMs: 0,
          status: 'success',
        },
      ],
    })

    const overview = getJourneyOverviewModel(journey, flowNodes, flowEdges)

    expect(overview.cards.map((card) => card.nodeLabel)).toEqual([
      'Incoming Worker',
      'Schedule Incoming Checks',
    ])
    // Most recent step in the first group wins the summary.
    // Humanized step_id — no lifecycle-terminal substitution.
    expect(overview.cards[0]?.summary).toBe('Final result')
    expect(overview.focusNodeIds).toEqual(['incoming-worker', 'incoming-schedule-process'])
  })

  it('uses resolved node ownership instead of raw component_id when they disagree', () => {
    const journey = makeJourney({
      steps: [
        {
          stepId: 'final-result',
          label: 'final-result',
          nodeId: 'autosend-decision',
          startSeq: 1,
          endSeq: 1,
          startTs: '2026-03-24T12:00:00.000Z',
          durationMs: 0,
          status: 'success',
          attrs: {
            reply_status: 'executing_actions',
            result_action: 'draft_reply',
            auto_approved: true,
          },
        },
        {
          stepId: 'execute-enqueue',
          label: 'execute-enqueue',
          nodeId: 'actions-queue',
          startSeq: 2,
          endSeq: 2,
          startTs: '2026-03-24T12:00:01.000Z',
          durationMs: 0,
          status: 'success',
          attrs: {
            component_id: 'autosend-decision',
          },
        },
      ],
    })

    const overview = getJourneyOverviewModel(journey, autosendFlowNodes, autosendFlowEdges)

    expect(overview.cards.map((card) => card.nodeLabel)).toEqual(['Auto Send?', 'Actions Queue'])
    expect(overview.cards[1]?.summary).toBe('Execute enqueue')
  })

  it('falls back to a shared Other Activity bucket when no node ownership exists', () => {
    const journey = makeJourney({
      steps: [
        {
          stepId: 'mystery-step',
          label: 'mystery-step',
          startSeq: 1,
          endSeq: 1,
          startTs: '2026-03-24T12:00:00.000Z',
          durationMs: 0,
          status: 'success',
        },
        {
          stepId: 'another-mystery-step',
          label: 'another-mystery-step',
          startSeq: 2,
          endSeq: 2,
          startTs: '2026-03-24T12:00:01.000Z',
          durationMs: 0,
          status: 'success',
        },
      ],
    })

    const overview = getJourneyOverviewModel(journey)

    expect(overview.cards).toHaveLength(1)
    expect(overview.cards[0]?.nodeLabel).toBe('Other Activity')
    expect(overview.cards[0]?.nodeId).toBeUndefined()
    // Most recent step wins the summary (first-error-else-latest rule).
    expect(overview.cards[0]?.summary).toBe('Another mystery step')
  })

  it('surfaces the first error as the summary when the group contains one', () => {
    const journey = makeJourney({
      steps: [
        {
          stepId: 'provider-call',
          label: 'provider-call',
          nodeId: 'send-process',
          startSeq: 1,
          endSeq: 1,
          startTs: '2026-03-24T12:00:00.000Z',
          durationMs: 500,
          status: 'error',
          attrs: {
            error_message: 'temporary provider error',
          },
          errorSummary: 'temporary provider error',
        },
        {
          stepId: 'final-result',
          label: 'final-result',
          nodeId: 'send-process',
          startSeq: 2,
          endSeq: 2,
          startTs: '2026-03-24T12:00:01.000Z',
          durationMs: 1000,
          status: 'success',
          attrs: {
            reply_status: 'sent',
            draft_status: 'sent',
            result_action: 'sent',
          },
        },
      ],
    })

    const overview = getJourneyOverviewModel(journey, flowNodes, flowEdges)

    expect(overview.cards).toHaveLength(1)
    // First error wins over any later success in the same group.
    expect(overview.cards[0]?.summary).toBe('temporary provider error')
    expect(overview.cards[0]?.representativeStep.stepId).toBe('provider-call')
    // getJourneySummaryStep now also surfaces the error as the representative step.
    expect(getJourneySummaryStep(journey, flowNodes, flowEdges)?.stepId).toBe('provider-call')
  })

  it('returns one representative overview step per grouped node', () => {
    const steps = [
      {
        stepId: 'write-metadata',
        label: 'write-metadata',
        nodeId: 'incoming-worker',
        startSeq: 1,
        endSeq: 1,
        startTs: '2026-03-24T12:00:00.000Z',
        durationMs: 0,
        status: 'success' as const,
      },
      {
        stepId: 'final-result',
        label: 'final-result',
        nodeId: 'incoming-worker',
        startSeq: 2,
        endSeq: 2,
        startTs: '2026-03-24T12:00:01.000Z',
        durationMs: 0,
        status: 'success' as const,
      },
      {
        stepId: 'cursor-update',
        label: 'cursor-update',
        nodeId: 'incoming-schedule-process',
        startSeq: 3,
        endSeq: 3,
        startTs: '2026-03-24T12:00:02.000Z',
        durationMs: 0,
        status: 'success' as const,
      },
    ]

    expect(getOverviewSteps(steps).map((stage) => `${stage.nodeId}:${stage.stepId}`)).toEqual([
      'incoming-worker:final-result',
      'incoming-schedule-process:cursor-update',
    ])
  })
})
