import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LogsTable } from '../LogsTable'
import type { LogEntry } from '../../types'

const nodeLabels = new Map([
  ['node-a', 'Analyze'],
  ['node-b', 'Send'],
])

const logs: LogEntry[] = [
  {
    timestamp: '2026-03-17T13:10:00.000Z',
    level: 'info',
    nodeId: 'node-a',
    message: 'Analyzed message',
    durationMs: 120,
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-1',
  },
  {
    timestamp: '2026-03-17T13:12:00.000Z',
    level: 'error',
    nodeId: 'node-b',
    message: 'Provider timeout',
    durationMs: 980,
    signal: 'critical',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-2',
  },
  {
    timestamp: '2026-03-17T13:11:00.000Z',
    level: 'info',
    nodeId: 'node-b',
    message: 'Send complete',
    durationMs: 430,
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-3',
  },
]

describe('LogsTable', () => {
  it('sorts by duration when the header is clicked', async () => {
    const user = userEvent.setup()

    render(
      <LogsTable logs={logs} nodeLabels={nodeLabels} onSelectLog={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: /duration/i }))

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Analyzed message')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Provider timeout')).toBeInTheDocument()
  })

  it('calls the row click handler and renders error badges', async () => {
    const user = userEvent.setup()
    const onSelectLog = vi.fn()

    render(
      <LogsTable
        logs={logs}
        nodeLabels={nodeLabels}
        selectedTraceId="run-2"
        onSelectLog={onSelectLog}
      />,
    )

    await user.click(screen.getByText('Provider timeout'))

    expect(onSelectLog).toHaveBeenCalledWith(logs[1])
    expect(screen.getByText('ERR')).toBeInTheDocument()
    const selectedRow = screen.getAllByRole('row').find((row) => row.getAttribute('data-state') === 'selected')
    expect(selectedRow).toBeDefined()
    expect(within(selectedRow!).getByText('node-b')).toBeInTheDocument()
  })
})
