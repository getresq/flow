import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BottomLogPanel } from '../BottomLogPanel'
import type { FlowConfig, LogEntry, TraceJourney } from '../../types'
import { useLayoutStore } from '../../../stores/layout'

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
      id: 'incoming-worker',
      type: 'rectangle',
      label: 'Incoming Worker',
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
  spanMapping: {},
}

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
]

const journeys: TraceJourney[] = [
  {
    traceId: 'run-1',
    startedAt: '2026-03-24T16:00:00.000Z',
    status: 'success',
    stages: [],
    nodePath: ['incoming-worker'],
    lastUpdatedAt: '2026-03-24T16:00:01.000Z',
    eventCount: 2,
    identifiers: {},
  },
]

describe('BottomLogPanel', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarOpen: true,
      focusMode: false,
      commandPaletteOpen: false,
      bottomPanelHeight: 260,
      bottomPanelTab: 'logs',
      theme: 'dark',
    })
  })

  it('shows emitted flow logs by default on the logs tab and keeps show all for runs only', async () => {
    const user = userEvent.setup()

    render(
      <BottomLogPanel
        flow={flow}
        globalLogs={logs}
        journeys={journeys}
        onSelectNode={vi.fn()}
        onSelectTrace={vi.fn()}
      />,
    )

    expect(screen.getByText(/mail_incoming worker picked up job/i)).toBeInTheDocument()
    expect(screen.queryByText('span completed: rrq.job')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show all runs/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /runs/i }))

    expect(screen.getByRole('button', { name: /show all runs/i })).toBeInTheDocument()
  })
})
