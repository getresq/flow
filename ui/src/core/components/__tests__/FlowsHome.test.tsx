import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { FlowsHome } from '../FlowsHome';
import type { FlowMetricsSnapshot } from '../../mockMetrics';
import type { FlowConfig } from '../../types';

const testFlow: FlowConfig = {
  id: 'test-flow',
  name: 'Test Flow',
  description: 'Synthetic flow for home-page smoke coverage.',
  contract: {
    version: 1,
    id: 'test-flow',
    name: 'Test Flow',
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
  hasGraph: false,
  nodes: [],
  edges: [],
  spanMapping: {},
};

const testMetrics: FlowMetricsSnapshot[] = [
  {
    flowId: 'test-flow',
    health: 'warning',
    runCount: 52,
    successRate: 94,
    p95Ms: 1800,
    errorCount: 3,
    throughputSeries: [2, 3, 4, 5],
    errorSeries: [0, 1, 0, 1],
    latencySeries: [900, 1100, 1400, 1800],
    recentRuns: [],
  },
];

function renderFlowsHome() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={<FlowsHome registeredFlows={[testFlow]} initialMetrics={testMetrics} />}
          />
          <Route path="/flows/:flowId" element={<div>Flow detail route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FlowsHome', () => {
  it('renders flow health cards from mock data', () => {
    renderFlowsHome();

    expect(screen.getByText('Flows')).toBeInTheDocument();
    expect(screen.getByText('Test Flow')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText('1800ms')).toBeInTheDocument();
  });

  it('navigates to the flow view when a card is selected', async () => {
    const user = userEvent.setup();
    renderFlowsHome();

    await user.click(screen.getByRole('button', { name: /test flow/i }));
    expect(screen.getByText('Flow detail route')).toBeInTheDocument();
  });
});
