import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MetricsView } from '../MetricsView';
import type { FlowConfig } from '../../types';

const flow: FlowConfig = {
  id: 'mail-pipeline',
  name: 'Mail Pipeline',
  contract: {
    version: 1,
    id: 'mail-pipeline',
    name: 'Mail Pipeline',
    telemetry: {
      log_events: [],
      queue_prefixes: [],
      function_prefixes: [],
      worker_prefixes: [],
      step_prefixes: [],
    },
    keep_context: {
      parent_spans: false,
      root_spans: false,
      error_events: false,
      unmapped_events_for_kept_traces: false,
    },
  },
  hasGraph: true,
  nodes: [],
  edges: [],
  spanMapping: {},
};

describe('MetricsView', () => {
  it('renders stat cards and sparklines', async () => {
    const client = new QueryClient();

    render(
      <QueryClientProvider client={client}>
        <MetricsView flow={flow} onSelectTrace={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('Runs')).toBeInTheDocument();
    expect(screen.getByText('Recent runs')).toBeInTheDocument();
    expect(screen.getByLabelText('Throughput sparkline')).toBeInTheDocument();
    expect(screen.getByLabelText('Error sparkline')).toBeInTheDocument();
    expect(screen.getByLabelText('Latency sparkline')).toBeInTheDocument();
  });
});
