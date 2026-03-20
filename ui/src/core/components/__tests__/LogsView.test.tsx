import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LogsView } from '../LogsView'
import type { FlowConfig, LogEntry } from '../../types'

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
      stage_prefixes: [],
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
      id: 'analyze',
      type: 'rectangle',
      label: 'Analyze',
      position: { x: 0, y: 0 },
    },
    {
      id: 'send',
      type: 'rectangle',
      label: 'Send',
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
  spanMapping: {},
}

const logs: LogEntry[] = [
  {
    timestamp: '2026-03-17T13:10:00.000Z',
    level: 'info',
    nodeId: 'analyze',
    message: 'Analysis complete',
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-1',
  },
  {
    timestamp: '2026-03-17T13:11:00.000Z',
    level: 'error',
    nodeId: 'send',
    message: 'Provider timeout',
    stageName: 'Send: provider call',
    signal: 'critical',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-2',
  },
  {
    timestamp: '2026-03-17T13:12:00.000Z',
    level: 'info',
    nodeId: 'send',
    message: 'span completed: rrq.job',
    signal: 'raw',
    defaultVisible: false,
    eventType: 'span_end',
    traceId: 'run-2',
  },
]

describe('LogsView', () => {
  it('renders the log stream and filters by status', async () => {
    const user = userEvent.setup()

    render(
      <LogsView
        flow={flow}
        logs={logs}
        sourceMode="live"
        onSelectNode={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    )

    expect(screen.getByPlaceholderText(/search logs/i)).toBeInTheDocument()
    expect(screen.getByText('Analysis complete')).toBeInTheDocument()
    expect(screen.getByText(/Provider timeout/)).toBeInTheDocument()
    expect(screen.queryByText('span completed: rrq.job')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'error' }))

    expect(screen.queryByText('Analysis complete')).not.toBeInTheDocument()
    expect(screen.getByText(/Provider timeout/)).toBeInTheDocument()
  })

  it('reveals raw telemetry when show all is enabled', async () => {
    const user = userEvent.setup()

    render(
      <LogsView
        flow={flow}
        logs={logs}
        sourceMode="live"
        onSelectNode={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /show all telemetry/i }))

    expect(screen.getByText('span completed: rrq.job')).toBeInTheDocument()
  })

  it('matches search against stable node ids and stage names', async () => {
    const user = userEvent.setup()

    render(
      <LogsView
        flow={flow}
        logs={logs}
        sourceMode="live"
        onSelectNode={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    )

    await user.type(screen.getByPlaceholderText(/search logs/i), 'send')
    expect(screen.getByText(/Provider timeout/)).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText(/search logs/i))
    await user.type(screen.getByPlaceholderText(/search logs/i), 'provider call')
    expect(screen.getByText(/Provider timeout/)).toBeInTheDocument()
  })
})
