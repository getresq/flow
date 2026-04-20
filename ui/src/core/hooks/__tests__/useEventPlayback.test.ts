import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { FlowEvent } from '../../types';
import { useEventPlayback } from '../useEventPlayback';

function buildEvent(timestamp: string, spanId: string): FlowEvent {
  return {
    type: 'span_start',
    timestamp,
    trace_id: 'trace-1',
    span_id: spanId,
    span_name: 'handle_mail_extract',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

describe('useEventPlayback', () => {
  it('supports pause, step, and resume controls', async () => {
    const sourceEvents: FlowEvent[] = [
      buildEvent('2026-03-04T14:00:00.000Z', 'span-1'),
      buildEvent('2026-03-04T14:00:00.040Z', 'span-2'),
      buildEvent('2026-03-04T14:00:00.080Z', 'span-3'),
    ];

    const { result } = renderHook(() => useEventPlayback(sourceEvents));

    act(() => {
      result.current.pause();
    });

    await sleep(50);
    expect(result.current.events).toHaveLength(0);

    act(() => {
      result.current.stepForward();
    });
    expect(result.current.events).toHaveLength(1);

    await sleep(60);
    expect(result.current.events).toHaveLength(1);

    act(() => {
      result.current.stepForward();
    });
    expect(result.current.events).toHaveLength(2);

    act(() => {
      result.current.resume();
    });

    await waitFor(() => {
      expect(result.current.events).toHaveLength(3);
    });
    expect(result.current.pendingCount).toBe(0);
  });

  it('applies playback speed to timestamp delay', async () => {
    const sourceEvents: FlowEvent[] = [
      buildEvent('2026-03-04T14:00:00.000Z', 'span-1'),
      buildEvent('2026-03-04T14:00:00.100Z', 'span-2'),
    ];

    const { result } = renderHook(() => useEventPlayback(sourceEvents));

    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });

    act(() => {
      result.current.setSpeed(2);
    });

    await sleep(25);
    expect(result.current.events).toHaveLength(1);

    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
    });
  });

  it('clears visible events when source events are cleared', async () => {
    const sourceEvents: FlowEvent[] = [
      buildEvent('2026-03-04T14:00:00.000Z', 'span-1'),
      buildEvent('2026-03-04T14:00:00.100Z', 'span-2'),
    ];

    const { result, rerender } = renderHook(({ events }) => useEventPlayback(events), {
      initialProps: { events: sourceEvents },
    });

    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });

    act(() => {
      rerender({ events: [] });
    });

    expect(result.current.events).toHaveLength(0);
    expect(result.current.pendingCount).toBe(0);
  });
});
