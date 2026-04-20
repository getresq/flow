import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette } from '../CommandPalette';
import { useCommandPaletteStore } from '../../../stores/commandPalette';
import { useLayoutStore } from '../../../stores/layout';
import { FlowRegistryProvider } from '../../../flows';
import type { FlowConfig } from '../../types';

const testFlow: FlowConfig = {
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
      parent_spans: true,
      root_spans: true,
      error_events: true,
      unmapped_events_for_kept_traces: true,
    },
  },
  hasGraph: true,
  nodes: [],
  edges: [],
  spanMapping: {},
};

describe('CommandPalette', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarOpen: true,
      commandPaletteOpen: true,
      bottomPanelSnap: 'partial',
      bottomPanelTab: 'logs',
      theme: 'dark',
    });
    useCommandPaletteStore.getState().clearContext();
  });

  afterEach(() => {
    useLayoutStore.getState().setCommandPaletteOpen(false);
    useCommandPaletteStore.getState().clearContext();
  });

  it('filters command results by search text', async () => {
    const user = userEvent.setup();
    const clearLogs = vi.fn();

    useCommandPaletteStore.getState().registerContext({
      onClearLogs: clearLogs,
    });

    render(
      <MemoryRouter initialEntries={['/flows/mail-pipeline?mode=live']}>
        <FlowRegistryProvider flows={[testFlow]}>
          <CommandPalette />
        </FlowRegistryProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('combobox'), 'clear');

    expect(screen.getByText('Clear logs')).toBeVisible();
  });

  it('supports keyboard navigation to a flow command', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <FlowRegistryProvider flows={[testFlow]}>
          <Routes>
            <Route path="/" element={<CommandPalette />} />
            <Route path="/flows/:flowId" element={<div>Flow route</div>} />
          </Routes>
        </FlowRegistryProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('combobox'), 'mail');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByText('Flow route')).toBeInTheDocument();
  });
});
