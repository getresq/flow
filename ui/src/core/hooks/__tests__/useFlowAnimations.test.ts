import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { demoPipelineFlow } from '../../../flows/demo-pipeline'
import { mailPipelineFlow } from '../../../flows/mail-pipeline'
import { demoReplayEvents, rebaseReplayEventsForLivePlayback } from '../../../test/replay'
import type { FlowEvent } from '../../types'
import { useFlowAnimations } from '../useFlowAnimations'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function setNow(iso: string) {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(iso))
}

describe('useFlowAnimations', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('activates a node on span_start then marks active on finish and clears to idle', async () => {
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
            minVisualPulseMs: 30,
            durationVisibleMs: 50,
            edgeActiveMs: 30,
          },
        }),
      {
        initialProps: { events: [] as FlowEvent[] },
      },
    )

    setNow('2026-03-03T12:00:00.010Z')
    act(() => {
      rerender({ events: [start] })
    })

    expect(result.current.nodeStatuses.get('extract-worker')?.status).toBe('active')

    setNow('2026-03-03T12:00:01.210Z')
    act(() => {
      rerender({ events: [start, end] })
    })

    const status = result.current.nodeStatuses.get('extract-worker')
    expect(status?.status).toBe('active')
    expect(status?.durationMs).toBe(1_200)

    await act(async () => {
      await sleep(50)
    })

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('extract-worker')?.status).toBe('idle')
    })
  })

  it('animates incoming persistence step nodes for store touchpoints', async () => {
    const start: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      span_name: 'mail.store.write_threads',
      trace_id: 'trace-store-1',
      span_id: 'span-store-1',
      attributes: {
        component_id: 'incoming-worker',
        step_id: 'write-threads',
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
        step_id: 'write-threads',
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
            minVisualPulseMs: 30,
            durationVisibleMs: 50,
            edgeActiveMs: 30,
          },
        }),
      {
        initialProps: { events: [] as FlowEvent[] },
      },
    )

    setNow('2026-03-03T12:00:00.010Z')
    act(() => {
      rerender({ events: [start] })
    })

    expect(result.current.nodeStatuses.get('incoming-thread-metadata-write')?.status).toBe('active')

    setNow('2026-03-03T12:00:00.260Z')
    act(() => {
      rerender({ events: [start, end] })
    })

    const status = result.current.nodeStatuses.get('incoming-thread-metadata-write')
    expect(status?.status).toBe('active')
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

    setNow('2026-03-03T12:00:00.910Z')
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

    setNow('2026-03-03T12:00:00.010Z')
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

    setNow('2026-03-03T12:00:00.210Z')
    act(() => {
      rerender({ events: [enqueueEvent, pickupEvent] })
    })

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('analyze-queue')?.counter).toBe(0)
      expect(result.current.nodeStatuses.get('analyze-worker')?.status).toBe('active')
    })
  })

  it('animates the autosend -> send handoff when replay events use exact component ids', async () => {
    const draftInserted: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-a',
      attributes: {
        action: 'step',
        step_id: 'draft-status-write',
        component_id: 'draft-reply',
      },
    }
    const autoApproved: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.010Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-b',
      attributes: {
        action: 'step',
        step_id: 'action-batch-auto-approve',
        component_id: 'autosend-decision',
      },
    }
    const executeEnqueued: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.020Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-c',
      attributes: {
        action: 'step',
        step_id: 'execute-enqueue',
        component_id: 'autosend-decision',
      },
    }
    const sendHandoffDetail: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.025Z',
      trace_id: 'trace-autosend-1',
      span_id: 'log-c2',
      attributes: {
        action: 'step',
        step_id: 'send-enqueue',
        component_id: 'autosend-decision',
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

    setNow('2026-03-03T12:00:00.025Z')
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
      expect(result.current.nodeStatuses.get('actions-queue')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('send-queue')?.status).toBeUndefined()
    })

    setNow('2026-03-03T12:00:00.026Z')
    act(() => {
      rerender({ events: [draftInserted, autoApproved, executeEnqueued, sendHandoffDetail] })
    })

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('autosend-decision')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('send-queue')?.status).toBeUndefined()
    })

    setNow('2026-03-03T12:00:00.031Z')
    act(() => {
      rerender({
        events: [draftInserted, autoApproved, executeEnqueued, sendHandoffDetail, sendQueueEnqueued],
      })
    })

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('send-queue')?.status).toBe('active')
      expect(result.current.activeEdges.has('draft-autosend')).toBe(true)
      expect(result.current.activeEdges.has('actions-send')).toBe(true)
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

    setNow('2026-03-03T12:00:00.010Z')
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
      expect(result.current.nodeStatuses.get('backfill-queue')?.status).toBe('active')
      expect(result.current.activeEdges.has('trigger-backfill')).toBe(true)
    })
  })

  it('does not replay stale snapshot queue activity as fresh glow', async () => {
    const enqueueEvent: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-stale-1',
      span_id: 'log-stale-1',
      attributes: {
        action: 'enqueue',
        queue_name: 'rrq:queue:mail-backfill',
        function_name: 'handle_mail_backfill_start',
      },
      message: 'rrq:queue:mail-backfill: job enqueued (handle_mail_backfill_start)',
    }

    // Event is 10s old — well past the staleness threshold (5s default)
    setNow('2026-03-03T12:00:10.000Z')
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
      expect(result.current.nodeStatuses.get('trigger-oauth')?.status).toBe('idle')
      expect(result.current.nodeStatuses.get('backfill-queue')?.status).toBe('idle')
      // Counter still updates so the queue depth is accurate after replay
      expect(result.current.nodeStatuses.get('backfill-queue')?.counter).toBe(1)
      expect(result.current.activeEdges.has('trigger-backfill')).toBe(false)
    })
  })

  it('keeps snapshot spans active when they are still running', async () => {
    const runningStart: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      span_name: 'handle_mail_extract',
      trace_id: 'trace-running-1',
      span_id: 'span-running-1',
      attributes: {
        function_name: 'handle_mail_extract',
      },
    }

    setNow('2026-03-03T12:00:10.000Z')
    const { result } = renderHook(() =>
      useFlowAnimations({
        events: [runningStart],
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
      expect(result.current.nodeStatuses.get('extract-worker')?.status).toBe('active')
    })
  })

  it('animates the cron enqueue step and incoming queue for incoming-check enqueue events', async () => {
    setNow('2026-03-03T12:00:00.100Z')

    const event: FlowEvent = {
      type: 'log',
      event_kind: 'queue_enqueued',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-cron-enqueue-1',
      span_id: 'log-ce-1',
      span_name: 'mail.queue.enqueue',
      attributes: {
        component_id: 'incoming-queue',
        step_id: 'enqueue',
        function_name: 'handle_mail_incoming_check',
        queue_name: 'rrq:queue:mail-incoming',
      },
    }

    const { result } = renderHook(() =>
      useFlowAnimations({
        events: [event],
        spanMapping: mailPipelineFlow.spanMapping,
        producerMapping: mailPipelineFlow.producerMapping,
        edges: mailPipelineFlow.edges,
        timings: {
          nodePulseResetMs: 500,
          minVisualPulseMs: 500,
          stalenessThresholdMs: 1_000,
          edgeActiveMs: 500,
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('incoming-check-enqueue')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('incoming-queue')?.status).toBe('active')
      expect(result.current.activeEdges.has('incoming-check-enqueue-queue')).toBe(true)
    })
  })

  it('animates scheduler cursor updates on the step node and linked Postgres resource', async () => {
    setNow('2026-03-03T12:00:00.100Z')

    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-schedule-cursor-1',
      span_id: 'log-sc-1',
      span_name: 'mail.scheduler.cursor_update',
      attributes: {
        component_id: 'incoming-schedule-process',
        step_id: 'cursor-update',
        cursor_name: 'incoming_check_scheduled_at',
        status: 'ok',
      },
    }

    const { result } = renderHook(() =>
      useFlowAnimations({
        events: [event],
        spanMapping: mailPipelineFlow.spanMapping,
        producerMapping: mailPipelineFlow.producerMapping,
        edges: mailPipelineFlow.edges,
        resourceNodeIds: mailPipelineFlow.nodes.filter((node) => node.type === 'cylinder').map((node) => node.id),
        timings: {
          nodePulseResetMs: 500,
          minVisualPulseMs: 500,
          stalenessThresholdMs: 1_000,
          edgeActiveMs: 500,
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('incoming-scheduled-at')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('postgres-incoming')?.status).toBe('active')
      expect(result.current.activeEdges.has('schedule-postgres')).toBe(true)
    })
  })

  it('animates incoming cursor updates on the step node and linked Postgres resource', async () => {
    setNow('2026-03-03T12:00:00.100Z')

    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-incoming-cursor-1',
      span_id: 'log-ic-1',
      span_name: 'mail.store.write_cursor',
      attributes: {
        component_id: 'incoming-worker',
        step_id: 'cursor-update',
        cursor_name: 'incoming_history_id',
        status: 'ok',
      },
    }

    const { result } = renderHook(() =>
      useFlowAnimations({
        events: [event],
        spanMapping: mailPipelineFlow.spanMapping,
        producerMapping: mailPipelineFlow.producerMapping,
        edges: mailPipelineFlow.edges,
        resourceNodeIds: mailPipelineFlow.nodes.filter((node) => node.type === 'cylinder').map((node) => node.id),
        timings: {
          nodePulseResetMs: 500,
          minVisualPulseMs: 500,
          stalenessThresholdMs: 1_000,
          edgeActiveMs: 500,
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('update-history')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('postgres-incoming')?.status).toBe('active')
      expect(result.current.activeEdges.has('update-history-postgres')).toBe(true)
    })
  })

  it('animates backfill persistence step nodes for store touchpoints', async () => {
    setNow('2026-03-03T12:00:00.100Z')

    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-backfill-store-1',
      span_id: 'log-bs-1',
      span_name: 'mail.store.write_metadata',
      attributes: {
        component_id: 'backfill-worker',
        step_id: 'write-metadata',
        status: 'ok',
      },
    }

    const { result } = renderHook(() =>
      useFlowAnimations({
        events: [event],
        spanMapping: mailPipelineFlow.spanMapping,
        producerMapping: mailPipelineFlow.producerMapping,
        edges: mailPipelineFlow.edges,
        resourceNodeIds: mailPipelineFlow.nodes.filter((node) => node.type === 'cylinder').map((node) => node.id),
        timings: {
          nodePulseResetMs: 500,
          minVisualPulseMs: 500,
          stalenessThresholdMs: 1_000,
          edgeActiveMs: 500,
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('backfill-thread-metadata-write')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('postgres-backfill')?.status).toBe('active')
      expect(result.current.activeEdges.has('backfill-thread-metadata-postgres')).toBe(true)
    })
  })

  it('animates backfill cursor updates on the step node and linked Postgres resource', async () => {
    setNow('2026-03-03T12:00:00.100Z')

    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      trace_id: 'trace-backfill-cursor-1',
      span_id: 'log-bc-1',
      span_name: 'mail.store.write_cursor',
      attributes: {
        component_id: 'backfill-worker',
        step_id: 'cursor-update',
        cursor_name: 'backfill_page_token',
        status: 'ok',
      },
    }

    const { result } = renderHook(() =>
      useFlowAnimations({
        events: [event],
        spanMapping: mailPipelineFlow.spanMapping,
        producerMapping: mailPipelineFlow.producerMapping,
        edges: mailPipelineFlow.edges,
        resourceNodeIds: mailPipelineFlow.nodes.filter((node) => node.type === 'cylinder').map((node) => node.id),
        timings: {
          nodePulseResetMs: 500,
          minVisualPulseMs: 500,
          stalenessThresholdMs: 1_000,
          edgeActiveMs: 500,
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.nodeStatuses.get('backfill-cursor-write')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('postgres-backfill')?.status).toBe('active')
      expect(result.current.activeEdges.has('backfill-cursor-postgres')).toBe(true)
    })
  })

  it('activates key edges in the curated demo replay fixture', async () => {
    const rebasedEvents = rebaseReplayEventsForLivePlayback(
      demoReplayEvents,
      Date.parse('2026-04-14T20:00:00.000Z'),
    )

    setNow('2026-04-14T20:00:01.100Z')
    const { result } = renderHook(() =>
      useFlowAnimations({
        events: rebasedEvents,
        spanMapping: demoPipelineFlow.spanMapping,
        edges: demoPipelineFlow.edges,
        resourceNodeIds: demoPipelineFlow.nodes.filter((node) => node.type === 'cylinder').map((node) => node.id),
        timings: {
          nodePulseResetMs: 2_500,
          minVisualPulseMs: 2_500,
          stalenessThresholdMs: 5_000,
          edgeActiveMs: 2_500,
        },
      }),
    )

    await waitFor(() => {
      expect(result.current.activeEdges.has('external-event-intake-queue')).toBe(true)
      expect(result.current.activeEdges.has('intake-queue-intake-worker')).toBe(true)
      expect(result.current.activeEdges.has('intake-worker-parse-input')).toBe(true)
      expect(result.current.activeEdges.has('parse-input-persist-raw')).toBe(true)
      expect(result.current.activeEdges.has('persist-raw-normalize-record')).toBe(true)
      expect(result.current.activeEdges.has('normalize-record-input-valid')).toBe(true)
      expect(result.current.activeEdges.has('input-valid-publish-queue')).toBe(true)
      expect(result.current.activeEdges.has('publish-queue-publish-worker')).toBe(true)
      expect(result.current.activeEdges.has('publish-worker-persist-result')).toBe(true)
      expect(result.current.activeEdges.has('persist-result-archive-output')).toBe(true)
      expect(result.current.activeEdges.has('persist-raw-postgres')).toBe(true)
      expect(result.current.activeEdges.has('persist-result-postgres')).toBe(true)
      expect(result.current.activeEdges.has('archive-output-object-store')).toBe(true)
      expect(result.current.nodeStatuses.get('postgres')?.status).toBe('active')
      expect(result.current.nodeStatuses.get('object-store')?.status).toBe('active')
    })
  })
})
