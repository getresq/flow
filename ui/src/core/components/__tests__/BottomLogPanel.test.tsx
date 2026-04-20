import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BottomLogPanel } from '../BottomLogPanel';
import type { FlowConfig, LogEntry, TraceJourney } from '../../types';
import { useLayoutStore } from '../../../stores/layout';

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
  nodes: [
    {
      id: 'incoming-worker',
      type: 'rectangle',
      label: 'Incoming Worker',
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
  spanMapping: {},
};

const logs: LogEntry[] = [
  {
    timestamp: '2026-03-24T16:00:00.000Z',
    level: 'info',
    nodeId: 'incoming-worker',
    message: 'mail_incoming worker picked up job',
    signal: 'operational',
    defaultVisible: false,
    eventType: 'log',
    traceId: 'run-1',
    runId: 'run-1',
  },
  {
    timestamp: '2026-03-24T16:00:01.000Z',
    level: 'info',
    nodeId: 'incoming-worker',
    message: 'span completed: rrq.job',
    signal: 'raw',
    defaultVisible: false,
    eventType: 'span_end',
    traceId: 'run-1',
    runId: 'run-1',
  },
];

const runBackedJourneys: TraceJourney[] = [
  {
    traceId: 'run-1',
    startedAt: '2026-03-24T16:00:00.000Z',
    status: 'success',
    steps: [],
    nodePath: ['incoming-worker'],
    lastUpdatedAt: '2026-03-24T16:00:01.000Z',
    eventCount: 2,
    identifiers: {
      runId: 'run-1',
    },
  },
];

const ambientJourneys: TraceJourney[] = [
  {
    traceId: 'ambient-1',
    startedAt: '2026-03-24T16:00:00.000Z',
    status: 'success',
    steps: [],
    nodePath: ['incoming-worker'],
    lastUpdatedAt: '2026-03-24T16:00:01.000Z',
    eventCount: 1,
    identifiers: {},
  },
];

describe('BottomLogPanel', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarOpen: true,
      commandPaletteOpen: false,
      bottomPanelSnap: 'partial',
      bottomPanelTab: 'logs',
      theme: 'dark',
    });
  });

  it('shows emitted flow logs by default and only lists run-backed journeys on the runs tab', () => {
    render(
      <BottomLogPanel
        flow={flow}
        globalLogs={logs}
        journeys={runBackedJourneys}
        onSelectNode={vi.fn()}
        onSelectLog={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    );

    expect(screen.getByText(/mail_incoming worker picked up job/i)).toBeInTheDocument();
    expect(screen.queryByText('span completed: rrq.job')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /runs/i }));

    expect(screen.getByText('Run run-1')).toBeInTheDocument();
  });

  it('shows the empty state when journeys are ambient-only and have no explicit run id', () => {
    render(
      <BottomLogPanel
        flow={flow}
        globalLogs={logs}
        journeys={ambientJourneys}
        onSelectNode={vi.fn()}
        onSelectLog={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /runs/i }));

    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ambient flow activity still appears in Logs until a run-backed execution starts.',
      ),
    ).toBeInTheDocument();
  });

  it('shows whisper state with minimal content', () => {
    useLayoutStore.setState({ bottomPanelSnap: 'whisper' });

    render(
      <BottomLogPanel
        flow={flow}
        globalLogs={logs}
        journeys={runBackedJourneys}
        onSelectNode={vi.fn()}
        onSelectLog={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    );

    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Runs')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('keeps critical non-error logs visible when the error filter is active', () => {
    render(
      <BottomLogPanel
        flow={flow}
        globalLogs={[
          ...logs,
          {
            timestamp: '2026-03-24T16:00:02.000Z',
            level: 'info',
            nodeId: 'incoming-worker',
            message: 'provider timeout — will retry',
            signal: 'critical',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'run-2',
          },
        ]}
        journeys={runBackedJourneys}
        onSelectNode={vi.fn()}
        onSelectLog={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /error/i }));

    expect(screen.getByText(/provider timeout/i)).toBeInTheDocument();
    expect(screen.queryByText(/mail_incoming worker picked up job/i)).not.toBeInTheDocument();
  });

  it('routes log rows with a seq through onSelectLog instead of trace and node selection', () => {
    const onSelectLog = vi.fn();
    const onSelectTrace = vi.fn();
    const onSelectNode = vi.fn();
    const entryWithSeq: LogEntry = {
      timestamp: '2026-03-24T16:00:03.000Z',
      seq: 42,
      level: 'error',
      nodeId: 'incoming-worker',
      message: 'provider timeout',
      signal: 'critical',
      defaultVisible: true,
      eventType: 'log',
      traceId: 'run-2',
      runId: 'run-2',
    };

    render(
      <BottomLogPanel
        flow={flow}
        globalLogs={[entryWithSeq]}
        journeys={runBackedJourneys}
        onSelectNode={onSelectNode}
        onSelectLog={onSelectLog}
        onSelectTrace={onSelectTrace}
      />,
    );

    fireEvent.click(screen.getByText('provider timeout'));

    expect(onSelectLog).toHaveBeenCalledWith(entryWithSeq);
    expect(onSelectTrace).not.toHaveBeenCalled();
    expect(onSelectNode).not.toHaveBeenCalled();
  });
});
