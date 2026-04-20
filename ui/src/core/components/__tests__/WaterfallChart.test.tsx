import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SpanEntry } from '../../types';
import { WaterfallChart } from '../WaterfallChart';

function makeSpan(overrides: Partial<SpanEntry> = {}): SpanEntry {
  return {
    spanName: 'test-span',
    nodeId: 'node-1',
    traceId: 'trace-1',
    spanId: 'span-1',
    startTime: '2024-01-01T00:00:00.000Z',
    endTime: '2024-01-01T00:00:00.100Z',
    durationMs: 100,
    status: 'success',
    ...overrides,
  };
}

describe('WaterfallChart', () => {
  it('renders empty state when no spans', () => {
    render(<WaterfallChart spans={[]} />);
    expect(screen.getByText(/no span timing data/i)).toBeInTheDocument();
  });

  it('renders bars for each span', () => {
    const spans: SpanEntry[] = [
      makeSpan({
        spanId: 's1',
        spanName: 'parse-headers',
        nodeId: 'parse',
        durationMs: 42,
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:00:00.042Z',
      }),
      makeSpan({
        spanId: 's2',
        spanName: 'analyze',
        nodeId: 'analyze',
        durationMs: 120,
        startTime: '2024-01-01T00:00:00.042Z',
        endTime: '2024-01-01T00:00:00.162Z',
      }),
      makeSpan({
        spanId: 's3',
        spanName: 'send-reply',
        nodeId: 'send',
        durationMs: 80,
        startTime: '2024-01-01T00:00:00.162Z',
        endTime: '2024-01-01T00:00:00.242Z',
      }),
    ];

    render(<WaterfallChart spans={spans} />);

    expect(screen.getByTestId('waterfall-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('waterfall-bar')).toHaveLength(3);
    expect(screen.getByText('parse')).toBeInTheDocument();
    expect(screen.getByText('analyze')).toBeInTheDocument();
    expect(screen.getByText('send')).toBeInTheDocument();
  });

  it('shows total and critical path duration', () => {
    const spans: SpanEntry[] = [
      makeSpan({
        spanId: 's1',
        spanName: 'a',
        durationMs: 50,
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:00:00.050Z',
      }),
      makeSpan({
        spanId: 's2',
        spanName: 'b',
        durationMs: 100,
        startTime: '2024-01-01T00:00:00.050Z',
        endTime: '2024-01-01T00:00:00.150Z',
      }),
    ];

    render(<WaterfallChart spans={spans} />);

    expect(screen.getByText('Total: 150ms')).toBeInTheDocument();
    expect(screen.getByText('Critical path: 150ms')).toBeInTheDocument();
  });

  it('calls onSelectNode when a bar is clicked', async () => {
    const handler = vi.fn();
    const spans: SpanEntry[] = [
      makeSpan({ spanId: 's1', spanName: 'my-span', nodeId: 'target-node' }),
    ];

    render(<WaterfallChart spans={spans} onSelectNode={handler} />);

    const bar = screen.getByTestId('waterfall-bar');
    bar.click();
    expect(handler).toHaveBeenCalledWith('target-node');
  });

  it('renders error status bars', () => {
    const spans: SpanEntry[] = [
      makeSpan({ spanId: 's1', spanName: 'fail-span', status: 'error', durationMs: 200 }),
    ];

    render(<WaterfallChart spans={spans} />);

    expect(screen.getByText('node-1')).toBeInTheDocument();
    expect(screen.getByText('200ms')).toBeInTheDocument();
  });
});
