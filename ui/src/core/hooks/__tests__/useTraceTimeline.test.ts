import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mailPipelineFlow } from '../../../flows/mail-pipeline';
import type { FlowEvent } from '../../types';
import { useTraceTimeline } from '../useTraceTimeline';

describe('useTraceTimeline', () => {
  it('creates span entries with durations when span_start and span_end match', async () => {
    const events: FlowEvent[] = [
      {
        type: 'span_start',
        timestamp: '2026-03-03T12:00:00.000Z',
        span_name: 'handle_mail_extract',
        trace_id: 'trace-1',
        span_id: 'span-1',
        start_time: '2026-03-03T12:00:00.000Z',
        attributes: {
          run_id: 'run-1',
          function_name: 'handle_mail_extract',
        },
      },
      {
        type: 'span_end',
        timestamp: '2026-03-03T12:00:00.900Z',
        span_name: 'handle_mail_extract',
        trace_id: 'trace-1',
        span_id: 'span-1',
        start_time: '2026-03-03T12:00:00.000Z',
        end_time: '2026-03-03T12:00:00.900Z',
        attributes: {
          run_id: 'run-1',
          function_name: 'handle_mail_extract',
          status: 'ok',
        },
      },
    ];

    const { result } = renderHook(() => useTraceTimeline(events, mailPipelineFlow.spanMapping));

    await waitFor(() => {
      expect(result.current.nodeSpans.get('extract-worker')).toHaveLength(1);
    });

    const span = result.current.nodeSpans.get('extract-worker')?.[0];
    expect(span?.durationMs).toBe(900);
    expect(span?.runId).toBe('run-1');
    expect(result.current.traceTree.get('run-1')).toHaveLength(1);
  });

  it('preserves parent-child relationships in trace tree', async () => {
    const events: FlowEvent[] = [
      {
        type: 'span_start',
        timestamp: '2026-03-03T12:00:00.000Z',
        span_name: 'handle_mail_incoming_check',
        trace_id: 'trace-2',
        span_id: 'parent-span',
        attributes: {
          run_id: 'run-2',
          function_name: 'handle_mail_incoming_check',
        },
      },
      {
        type: 'span_start',
        timestamp: '2026-03-03T12:00:00.150Z',
        span_name: 'handle_mail_extract',
        trace_id: 'trace-2',
        span_id: 'child-span',
        parent_span_id: 'parent-span',
        attributes: {
          run_id: 'run-2',
          function_name: 'handle_mail_extract',
        },
      },
      {
        type: 'span_end',
        timestamp: '2026-03-03T12:00:00.750Z',
        span_name: 'handle_mail_extract',
        trace_id: 'trace-2',
        span_id: 'child-span',
        parent_span_id: 'parent-span',
        start_time: '2026-03-03T12:00:00.150Z',
        end_time: '2026-03-03T12:00:00.750Z',
        attributes: {
          run_id: 'run-2',
          function_name: 'handle_mail_extract',
          status: 'ok',
        },
      },
      {
        type: 'span_end',
        timestamp: '2026-03-03T12:00:01.000Z',
        span_name: 'handle_mail_incoming_check',
        trace_id: 'trace-2',
        span_id: 'parent-span',
        start_time: '2026-03-03T12:00:00.000Z',
        end_time: '2026-03-03T12:00:01.000Z',
        attributes: {
          run_id: 'run-2',
          function_name: 'handle_mail_incoming_check',
          status: 'ok',
        },
      },
    ];

    const { result } = renderHook(() => useTraceTimeline(events, mailPipelineFlow.spanMapping));

    await waitFor(() => {
      expect(result.current.traceTree.get('run-2')).toHaveLength(2);
    });

    const traceEntries = result.current.traceTree.get('run-2') ?? [];
    const child = traceEntries.find((entry) => entry.spanId === 'child-span');
    expect(child?.parentSpanId).toBe('parent-span');
  });
});
