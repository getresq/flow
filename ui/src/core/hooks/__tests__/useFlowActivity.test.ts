import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFlowActivity } from '../useFlowActivity';
import type { FlowEvent } from '../../types';

function createHistoryResponse(body: unknown, status = 200): Response {
  return new Response(status === 200 ? JSON.stringify(body) : null, {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

const liveEvents: FlowEvent[] = [
  {
    type: 'log',
    seq: 10,
    timestamp: '2026-04-11T10:10:10.000Z',
    trace_id: 'run-live',
    message: 'live event',
    attributes: {
      flow_id: 'mail-pipeline',
      run_id: 'run-live',
      component_id: 'send-worker',
    },
  },
  {
    type: 'log',
    seq: 11,
    timestamp: '2026-04-11T10:11:10.000Z',
    trace_id: 'run-shared',
    message: 'shared event',
    attributes: {
      flow_id: 'mail-pipeline',
      run_id: 'run-shared',
      component_id: 'analyze-worker',
    },
  },
];

const originalFetch = globalThis.fetch;

describe('useFlowActivity', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('hydrates recent history on mount and merges it with live events without duplicating overlap', async () => {
    const fetchMock = vi.fn(async () =>
      createHistoryResponse({
        from: '2026-04-11T04:10:10.000Z',
        to: '2026-04-11T10:12:10.000Z',
        anchor_to: '2026-04-11T10:12:10.000Z',
        events: [
          {
            type: 'log',
            seq: 1,
            timestamp: '2026-04-11T09:10:10.000Z',
            trace_id: 'run-older',
            message: 'older event',
            attributes: {
              flow_id: 'mail-pipeline',
              run_id: 'run-older',
              component_id: 'incoming-worker',
            },
          },
          {
            type: 'log',
            seq: 2,
            timestamp: '2026-04-11T10:11:10.000Z',
            trace_id: 'run-shared',
            message: 'shared event',
            attributes: {
              flow_id: 'mail-pipeline',
              run_id: 'run-shared',
              component_id: 'analyze-worker',
            },
          },
        ],
        log_count: 2,
        span_count: 0,
        truncated: true,
        has_more_older: true,
        next_cursor: 'cursor-1',
        warnings: [],
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useFlowActivity({
        flowId: 'mail-pipeline',
        wsUrl: 'ws://relay.example/ws',
        liveEvents,
        wasLiveBufferTruncated: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.retainedHistoryEvents).toHaveLength(2);
      expect(result.current.events).toHaveLength(3);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.anchorTo).toBe('2026-04-11T10:12:10.000Z');
    expect(result.current.loadedWindow).toEqual({
      from: '2026-04-11T04:10:10.000Z',
      to: '2026-04-11T10:12:10.000Z',
    });
    expect(result.current.hasMoreOlder).toBe(true);
    expect(result.current.events.map((event) => event.message)).toEqual([
      'older event',
      'live event',
      'shared event',
    ]);
  });

  it('resets retained history on cursor invalidation and re-anchors silently on the next load', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (input) => {
        const url = new URL(String(input));
        expect(url.searchParams.get('cursor')).toBeNull();
        return createHistoryResponse({
          from: '2026-04-11T04:10:10.000Z',
          to: '2026-04-11T10:12:10.000Z',
          anchor_to: '2026-04-11T10:12:10.000Z',
          events: [],
          log_count: 0,
          span_count: 0,
          truncated: true,
          has_more_older: true,
          next_cursor: 'cursor-stale',
          warnings: [],
        });
      })
      .mockImplementationOnce(async (input) => {
        const url = new URL(String(input));
        expect(url.searchParams.get('cursor')).toBe('cursor-stale');
        return createHistoryResponse({}, 400);
      })
      .mockImplementationOnce(async (input) => {
        const url = new URL(String(input));
        expect(url.searchParams.get('cursor')).toBeNull();
        return createHistoryResponse({
          from: '2026-04-11T04:10:10.000Z',
          to: '2026-04-11T10:12:10.000Z',
          anchor_to: '2026-04-11T10:12:10.000Z',
          events: [
            {
              type: 'log',
              seq: 1,
              timestamp: '2026-04-11T09:10:10.000Z',
              trace_id: 'run-older',
              message: 'older event',
              attributes: {
                flow_id: 'mail-pipeline',
                run_id: 'run-older',
              },
            },
          ],
          log_count: 1,
          span_count: 0,
          truncated: false,
          has_more_older: false,
          next_cursor: null,
          warnings: [],
        });
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useFlowActivity({
        flowId: 'mail-pipeline',
        wsUrl: 'ws://relay.example/ws',
        liveEvents: [],
        wasLiveBufferTruncated: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.hasMoreOlder).toBe(true);
      expect(result.current.anchorTo).toBe('2026-04-11T10:12:10.000Z');
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    await waitFor(() => {
      expect(result.current.retainedHistoryEvents).toEqual([]);
      expect(result.current.anchorTo).toBeUndefined();
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    await waitFor(() => {
      expect(result.current.retainedHistoryEvents).toHaveLength(1);
      expect(result.current.anchorTo).toBe('2026-04-11T10:12:10.000Z');
    });
  });

  it('clears the live-buffer truncation nudge after the first successful backfill page', async () => {
    const fetchMock = vi.fn(async () =>
      createHistoryResponse({
        from: '2026-04-11T04:10:10.000Z',
        to: '2026-04-11T10:12:10.000Z',
        anchor_to: '2026-04-11T10:12:10.000Z',
        events: [
          {
            type: 'log',
            seq: 1,
            timestamp: '2026-04-11T09:10:10.000Z',
            trace_id: 'run-older',
            message: 'older event',
            attributes: {
              flow_id: 'mail-pipeline',
              run_id: 'run-older',
            },
          },
        ],
        log_count: 1,
        span_count: 0,
        truncated: false,
        has_more_older: false,
        next_cursor: null,
        warnings: [],
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useFlowActivity({
        flowId: 'mail-pipeline',
        wsUrl: 'ws://relay.example/ws',
        liveEvents: [],
        wasLiveBufferTruncated: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.retainedHistoryEvents).toHaveLength(1);
      expect(result.current.wasLiveBufferTruncated).toBe(false);
      expect(result.current.hasMoreOlder).toBe(false);
    });
  });
});
