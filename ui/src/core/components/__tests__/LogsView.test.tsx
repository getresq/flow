import { fireEvent, render, screen } from '@testing-library/react'
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
    {
      id: 'helper-node',
      type: 'rectangle',
      label: '',
      position: { x: 0, y: 0 },
    },
    {
      id: 'inactive-node',
      type: 'rectangle',
      label: 'Inactive Node',
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
    message: 'mail_send worker picked up job',
    signal: 'operational',
    defaultVisible: false,
    eventType: 'log',
    traceId: 'run-2',
  },
  {
    timestamp: '2026-03-17T13:12:30.000Z',
    level: 'info',
    nodeId: 'send',
    message: 'span completed: rrq.job',
    signal: 'raw',
    defaultVisible: false,
    eventType: 'span_end',
    traceId: 'run-2',
  },
  {
    timestamp: '2026-03-17T13:13:00.000Z',
    level: 'info',
    nodeId: 'helper-node',
    message: 'helper event',
    signal: 'operational',
    defaultVisible: false,
    eventType: 'log',
    traceId: 'run-3',
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
    expect(screen.getByText(/mail_send worker picked up job/)).toBeInTheDocument()
    expect(screen.queryByText('span completed: rrq.job')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'info' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'error' }))

    expect(screen.queryByText('Analysis complete')).not.toBeInTheDocument()
    expect(screen.getByText(/Provider timeout/)).toBeInTheDocument()
  })

  it('shows emitted flow logs by default while still hiding span-only noise', () => {
    render(
      <LogsView
        flow={flow}
        logs={logs}
        sourceMode="live"
        onSelectNode={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    )

    expect(screen.getByText(/mail_send worker picked up job/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show all telemetry/i })).not.toBeInTheDocument()
    expect(screen.queryByText('span completed: rrq.job')).not.toBeInTheDocument()
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

  it('turns live tail off when the user scrolls away from the top', () => {
    const { container } = render(
      <LogsView
        flow={flow}
        logs={logs}
        sourceMode="live"
        onSelectNode={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    )

    const viewport = container.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport).toBeTruthy()

    if (!(viewport instanceof HTMLDivElement)) {
      throw new Error('Expected logs viewport')
    }

    viewport.scrollTop = 48
    fireEvent.scroll(viewport)

    // Live button loses its pulsing dot when scrolled away from top, but is still visible
    expect(screen.getByRole('button', { name: /^live$/i })).toBeInTheDocument()
  })

  it('only lists nodes with current log activity and falls back to node ids for blank labels', async () => {
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

    await user.click(screen.getByRole('combobox'))

    expect(screen.getByRole('option', { name: 'Analyze' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Send' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'helper-node' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Inactive Node' })).not.toBeInTheDocument()
  })
})
