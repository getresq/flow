import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { FlowsHome } from '../FlowsHome';
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

function renderFlowsHome(flows: FlowConfig[] = [testFlow]) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<FlowsHome registeredFlows={flows} />} />
        <Route path="/flows/:flowId" element={<div>Flow detail route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FlowsHome', () => {
  it('renders registered flows as a list with name and description', () => {
    renderFlowsHome();

    expect(screen.getByText('Flows')).toBeInTheDocument();
    expect(screen.getByText('Test Flow')).toBeInTheDocument();
    expect(screen.getByText(testFlow.description!)).toBeInTheDocument();
  });

  it('navigates to the flow view when a row is selected', async () => {
    const user = userEvent.setup();
    renderFlowsHome();

    await user.click(screen.getByRole('button', { name: /test flow/i }));
    expect(screen.getByText('Flow detail route')).toBeInTheDocument();
  });

  it('shows an empty state when no flows are registered', () => {
    renderFlowsHome([]);

    expect(screen.getByText('No flows registered')).toBeInTheDocument();
  });
});
