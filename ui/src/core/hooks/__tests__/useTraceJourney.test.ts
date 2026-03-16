import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { mailPipelineFlow } from '../../../flows/mail-pipeline'
import type { FlowEvent } from '../../types'
import { useTraceJourney } from '../useTraceJourney'

describe('useTraceJourney', () => {
  it('derives ordered stages and identifiers from mixed events', () => {
    const events: FlowEvent[] = [
      {
        type: 'log',
        seq: 3,
        timestamp: '2026-03-05T12:00:00.300Z',
        trace_id: 'trace-a',
        attributes: {
          event: 'mail_e2e_event',
          run_id: 'run-1',
          action: 'worker_result',
          stage_id: 'send.finalize',
          function_name: 'handle_mail_send_reply',
          outcome: 'success',
          thread_id: 'thread-1',
          job_id: 'job-1',
          reply_draft_id: 'draft-1',
        },
      },
      {
        type: 'log',
        seq: 1,
        timestamp: '2026-03-05T12:00:00.100Z',
        trace_id: 'trace-a',
        attributes: {
          event: 'mail_e2e_event',
          run_id: 'run-1',
          action: 'enqueue',
          stage_id: 'incoming.write_threads',
          function_name: 'handle_mail_incoming_check',
          thread_id: 'thread-1',
          job_id: 'job-1',
          reply_draft_id: 'draft-1',
        },
      },
      {
        type: 'log',
        seq: 2,
        timestamp: '2026-03-05T12:00:00.200Z',
        trace_id: 'trace-a',
        attributes: {
          event: 'mail_e2e_event',
          run_id: 'run-1',
          action: 'worker_pickup',
          stage_id: 'analyze.decision',
          function_name: 'handle_mail_analyze_reply',
          thread_id: 'thread-1',
          job_id: 'job-1',
          reply_draft_id: 'draft-1',
        },
      },
    ]

    const { result } = renderHook(() => useTraceJourney(events, mailPipelineFlow.spanMapping))
    expect(result.current.journeys).toHaveLength(1)

    const journey = result.current.journeys[0]
    expect(journey.traceId).toBe('run-1')
    expect(journey.identifiers.runId).toBe('run-1')
    expect(journey.stages.map((stage) => stage.stageId)).toEqual([
      'incoming.write_threads',
      'analyze.decision',
      'send.finalize',
    ])
    expect(journey.identifiers.threadId).toBe('thread-1')
    expect(journey.identifiers.jobId).toBe('job-1')
    expect(journey.identifiers.replyDraftId).toBe('draft-1')
    expect(journey.status).toBe('success')
  })

  it('marks journey error when stage has error payload', () => {
    const events: FlowEvent[] = [
      {
        type: 'span_start',
        seq: 10,
        timestamp: '2026-03-05T12:00:00.000Z',
        trace_id: 'trace-b',
        span_id: 'span-b',
        span_name: 'handle_mail_extract',
        attributes: {
          run_id: 'run-2',
          function_name: 'handle_mail_extract',
          stage_id: 'extract.upsert_contacts',
          thread_id: 'thread-2',
        },
      },
      {
        type: 'span_end',
        seq: 11,
        timestamp: '2026-03-05T12:00:00.200Z',
        trace_id: 'trace-b',
        span_id: 'span-b',
        span_name: 'handle_mail_extract',
        attributes: {
          run_id: 'run-2',
          function_name: 'handle_mail_extract',
          stage_id: 'extract.upsert_contacts',
          error_class: 'db',
          error_code: 'unique_violation',
          error_message: 'upsert failed',
        },
      },
    ]

    const { result } = renderHook(() => useTraceJourney(events, mailPipelineFlow.spanMapping))
    const journey = result.current.journeys[0]
    expect(journey.traceId).toBe('run-2')
    expect(journey.status).toBe('error')
    expect(journey.errorSummary).toBe('upsert failed')
    expect(journey.stages[0].status).toBe('error')
    expect(journey.stages[0].nodeId).toBe('extract-worker')
  })

  it('prefers explicit component_id when deriving journey nodes', () => {
    const events: FlowEvent[] = [
      {
        type: 'log',
        seq: 1,
        timestamp: '2026-03-05T12:00:00.000Z',
        trace_id: 'trace-c',
        attributes: {
          run_id: 'run-3',
          component_id: 'send-process',
          function_name: 'handle_mail_extract',
          stage_id: 'send.final_result',
        },
      },
    ]

    const { result } = renderHook(() => useTraceJourney(events, mailPipelineFlow.spanMapping))
    const journey = result.current.journeys[0]

    expect(journey.traceId).toBe('run-3')
    expect(journey.stages[0].nodeId).toBe('send-process')
  })

  it('keeps repeated generic stage ids separate across distinct components', () => {
    const events: FlowEvent[] = [
      {
        type: 'log',
        seq: 1,
        timestamp: '2026-03-05T12:00:00.000Z',
        trace_id: 'trace-d',
        attributes: {
          event: 'mail_e2e_event',
          run_id: 'thread-301',
          component_id: 'analyze-queue',
          action: 'enqueue',
          stage_id: 'queue.enqueue',
        },
      },
      {
        type: 'log',
        seq: 2,
        timestamp: '2026-03-05T12:00:00.100Z',
        trace_id: 'trace-d',
        attributes: {
          event: 'mail_e2e_event',
          run_id: 'thread-301',
          component_id: 'send-queue',
          action: 'enqueue',
          stage_id: 'queue.enqueue',
        },
      },
      {
        type: 'log',
        seq: 3,
        timestamp: '2026-03-05T12:00:00.200Z',
        trace_id: 'trace-d',
        attributes: {
          event: 'mail_e2e_event',
          run_id: 'thread-301',
          component_id: 'send-worker',
          action: 'worker_pickup',
          stage_id: 'worker.pickup',
        },
      },
    ]

    const { result } = renderHook(() => useTraceJourney(events, mailPipelineFlow.spanMapping))
    const journey = result.current.journeys[0]

    expect(journey.stages.map((stage) => `${stage.nodeId}:${stage.stageId}`)).toEqual([
      'analyze-queue:queue.enqueue',
      'send-queue:queue.enqueue',
      'send-worker:worker.pickup',
    ])
  })
})
