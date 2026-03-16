import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { mailPipelineFlow } from '../../../flows/mail-pipeline'
import type { FlowEvent } from '../../types'
import { useFlowAnimations } from '../useFlowAnimations'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

describe('useFlowAnimations', () => {
  it('activates a node on span_start then marks success and clears to idle', async () => {
    const start: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      span_name: 'handle_mail_extract',
      trace_id: 'trace-1',
      span_id: 'span-1',
      attributes: {
        function_name: 'handle_mail_extract',
      },
    }

    const end: FlowEvent = {
      type: 'span_end',
      timestamp: '2026-03-03T12:00:01.200Z',
      span_name: 'handle_mail_extract',
      trace_id: 'trace-1',
      span_id: 'span-1',
      duration_ms: 1_200,
      attributes: {
        function_name: 'handle_mail_extract',
        status: 'ok',
      },
    }

    const { result, rerender } = renderHook(
      ({ events }) =>
        useFlowAnimations({
          events,
          spanMapping: mailPipelineFlow.spanMapping,
          producerMapping: mailPipelineFlow.producerMapping,
          edges: mailPipelineFlow.edges,
          timings: {
            nodeSuccessResetMs: 30,
            nodePulseResetMs: 30,
            durationVisibleMs: 50,
            edgeActiveMs: 30,
          },
        }),
      {
        initialProps: { events: [] as FlowEvent[] },
      },
    )

    act(() => {
      rerender({ events: [start] })
    })

    expect(result.current.nodeStatuses.get('extract-worker')?.status).toBe('active')

    act(() => {
      rerender({ events: [start, end] })
    })

    const status = result.current.nodeStatuses.get('extract-worker')
    expect(status?.status).toBe('success')
    expect(status?.durationMs).toBe(1_200)

    await act(async () => {
      await sleep(50)
    })

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('extract-worker')?.status).toBe('idle')
    })
  })

  it('animates owning first-class nodes for demoted store touchpoints', async () => {
    const start: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      span_name: 'mail.store.write_threads',
      trace_id: 'trace-store-1',
      span_id: 'span-store-1',
      attributes: {
        component_id: 'incoming-worker',
        stage_id: 'incoming.write_threads',
        status: 'ok',
      },
    }

    const end: FlowEvent = {
      type: 'span_end',
      timestamp: '2026-03-03T12:00:00.250Z',
      span_name: 'mail.store.write_threads',
      trace_id: 'trace-store-1',
      span_id: 'span-store-1',
      duration_ms: 250,
      attributes: {
        component_id: 'incoming-worker',
        stage_id: 'incoming.write_threads',
        status: 'ok',
      },
    }

    const { result, rerender } = renderHook(
      ({ events }) =>
        useFlowAnimations({
          events,
          spanMapping: mailPipelineFlow.spanMapping,
          producerMapping: mailPipelineFlow.producerMapping,
          edges: mailPipelineFlow.edges,
          timings: {
            nodeSuccessResetMs: 30,
            nodePulseResetMs: 30,
            durationVisibleMs: 50,
            edgeActiveMs: 30,
          },
        }),
      {
        initialProps: { events: [] as FlowEvent[] },
      },
    )

    act(() => {
      rerender({ events: [start] })
    })

    expect(result.current.nodeStatuses.get('incoming-worker')?.status).toBe('active')

    act(() => {
      rerender({ events: [start, end] })
    })

    const status = result.current.nodeStatuses.get('incoming-worker')
    expect(status?.status).toBe('success')
    expect(status?.durationMs).toBe(250)
  })

  it('keeps node in error state after span_end error until next activity', async () => {
    const events: FlowEvent[] = [
      {
        type: 'span_start',
        timestamp: '2026-03-03T12:00:00.000Z',
        span_name: 'handle_mail_extract',
        trace_id: 'trace-2',
        span_id: 'span-2',
        attributes: {
          function_name: 'handle_mail_extract',
        },
      },
      {
        type: 'span_end',
        timestamp: '2026-03-03T12:00:00.900Z',
        span_name: 'handle_mail_extract',
        trace_id: 'trace-2',
        span_id: 'span-2',
        attributes: {
          function_name: 'handle_mail_extract',
          status: 'error',
          error_message: 'boom',
        },
      },
    ]

    const { result } = renderHook(() =>
      useFlowAnimations({
        events,
        spanMapping: mailPipelineFlow.spanMapping,
        producerMapping: mailPipelineFlow.producerMapping,
        edges: mailPipelineFlow.edges,
      }),
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('extract-worker')?.status).toBe('error')
    })
  })

  it('increments queue counter on enqueue and decrements on worker pickup', async () => {
    const enqueueEvent: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-3',
      span_id: 'log-1',
      attributes: {
        action: 'enqueue',
        queue_name: 'rrq:queue:mail-analyze',
      },
    }

    const pickupEvent: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.200Z',
      trace_id: 'trace-3',
      span_id: 'log-2',
      attributes: {
        action: 'worker_pickup',
        queue_name: 'rrq:queue:mail-analyze',
        worker_name: 'mail_analyze',
      },
    }

    const { result, rerender } = renderHook(
      ({ events }) =>
        useFlowAnimations({
          events,
          spanMapping: mailPipelineFlow.spanMapping,
          producerMapping: mailPipelineFlow.producerMapping,
          edges: mailPipelineFlow.edges,
        }),
      {
        initialProps: { events: [enqueueEvent] as FlowEvent[] },
      },
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('analyze-queue')?.counter).toBe(1)
    })

    act(() => {
      rerender({ events: [enqueueEvent, pickupEvent] })
    })

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('analyze-queue')?.counter).toBe(0)
      expect(result.current.nodeStatuses.get('analyze-worker')?.status).toBe('active')
    })
  })

  it('animates the autosend handoff when replay events use exact stage and component ids', async () => {
    const draftInserted: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-a',
      attributes: {
        action: 'stage',
        stage_id: 'analyze.draft_insert',
        component_id: 'draft-reply',
      },
    }
    const autoApproved: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.010Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-b',
      attributes: {
        action: 'stage',
        stage_id: 'analyze.action_batch_auto_approve',
        component_id: 'autosend-decision',
      },
    }
    const executeEnqueued: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.020Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-c',
      attributes: {
        action: 'stage',
        stage_id: 'analyze.execute_enqueue',
        component_id: 'autosend-decision',
      },
    }
    const sendHandoffDetail: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.025Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-c2',
      attributes: {
        action: 'stage',
        stage_id: 'actions.send_enqueue',
        queue_name: 'rrq:queue:mail-send',
        function_name: 'handle_mail_send_reply',
      },
    }
    const sendQueueEnqueued: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.030Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-d',
      attributes: {
        action: 'enqueue',
        queue_name: 'rrq:queue:mail-send',
        function_name: 'handle_mail_send_reply',
        component_id: 'send-queue',
      },
    }

    const { result, rerender } = renderHook(
      ({ events }) =>
        useFlowAnimations({
          events,
          spanMapping: mailPipelineFlow.spanMapping,
          producerMapping: mailPipelineFlow.producerMapping,
          edges: mailPipelineFlow.edges,
        }),
      {
        initialProps: { events: [draftInserted, autoApproved, executeEnqueued] as FlowEvent[] },
      },
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('draft-reply')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('autosend-decision')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('send-queue')?.status).toBeUndefined()
    })

    act(() => {
      rerender({ events: [draftInserted, autoApproved, executeEnqueued, sendHandoffDetail] })
    })

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('autosend-decision')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('send-queue')?.status).toBeUndefined()
    })

    act(() => {
      rerender({
        events: [draftInserted, autoApproved, executeEnqueued, sendHandoffDetail, sendQueueEnqueued],
      })
    })

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('send-queue')?.status).toBe('active')
      expect(result.current.activeEdges.has('e-draft-autosend')).toBe(true)
      expect(result.current.activeEdges.has('e-autosend-send')).toBe(true)
    })
  })

  it('pulses the oauth trigger and edge when the backfill queue is enqueued from connect flow', async () => {
    const enqueueEvent: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-4',
      span_id: 'log-4',
      attributes: {
        action: 'enqueue',
        queue_name: 'rrq:queue:mail-backfill',
        function_name: 'handle_mail_backfill_start',
      },
      message: 'rrq:queue:mail-backfill: job enqueued (handle_mail_backfill_start)',
    }

    const { result } = renderHook(() =>
      useFlowAnimations({
        events: [enqueueEvent],
        spanMapping: mailPipelineFlow.spanMapping,
        producerMapping: mailPipelineFlow.producerMapping,
        edges: mailPipelineFlow.edges,
        timings: {
          nodePulseResetMs: 50,
          edgeActiveMs: 50,
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('trigger-oauth')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('batchfill-queue')?.status).toBe('active')
      expect(result.current.activeEdges.has('e-trigger-batchfill')).toBe(true)
    })
  })
})
