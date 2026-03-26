import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LogsTable } from '../LogsTable'
import type { LogEntry } from '../../types'

const nodeLabels = new Map([
  ['node-a', 'Analyze'],
  ['node-b', 'Send'],
])

const nodeFamilies = new Map([
  ['node-a', 'worker'],
  ['node-b', 'queue'],
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
      <LogsTable logs={logs} nodeLabels={nodeLabels} nodeFamilies={nodeFamilies} onSelectLog={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: /duration/i }))

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Analyzed message')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Provider timeout')).toBeInTheDocument()
  })

  it('calls the row click handler and marks error rows with data-level', async () => {
    const user = userEvent.setup()
    const onSelectLog = vi.fn()

    render(
      <LogsTable
        logs={logs}
        nodeLabels={nodeLabels}
        nodeFamilies={nodeFamilies}
        selectedTraceId="run-2"
        onSelectLog={onSelectLog}
      />,
    )

    await user.click(screen.getByText('Provider timeout'))

    expect(onSelectLog).toHaveBeenCalledWith(logs[1])

    // Error row has data-level="error" (no longer a text badge)
    const rows = screen.getAllByRole('row').slice(1)
    const errorRow = rows.find((row) => row.getAttribute('data-level') === 'error')
    expect(errorRow).toBeDefined()

    const selectedRow = screen.getAllByRole('row').find((row) => row.getAttribute('data-state') === 'selected')
    expect(selectedRow).toBeDefined()
    expect(within(selectedRow!).getByText('Send')).toBeInTheDocument()
  })

  it('shows summary-first messages when a display message is present', () => {
    render(
      <LogsTable
        logs={[
          {
            timestamp: '2026-03-17T13:13:00.000Z',
            level: 'info',
            nodeId: 'node-a',
            message: 'analyze finalized reply branch',
            displayMessage: 'drafted; awaiting manual review',
            durationMs: 80,
            signal: 'meaningful',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'run-4',
            stageId: 'analyze.final_result',
          },
        ]}
        nodeLabels={nodeLabels}
        nodeFamilies={nodeFamilies}
        onSelectLog={vi.fn()}
      />,
    )

    expect(screen.getByText('drafted; awaiting manual review')).toBeInTheDocument()
  })

  it('renders node chips with family-based color tokens', () => {
    render(
      <LogsTable logs={logs} nodeLabels={nodeLabels} nodeFamilies={nodeFamilies} onSelectLog={vi.fn()} />,
    )

    // Node labels appear as chips with inline CSS variable styles
    const chips = screen.getAllByText('Analyze')
    expect(chips.length).toBeGreaterThan(0)
    const style = chips[0].getAttribute('style') ?? ''
    expect(style).toContain('--chip-worker-bg')
  })

  it('splits message prefix from body when a colon is present', () => {
    render(
      <LogsTable
        logs={[
          {
            timestamp: '2026-03-17T13:14:00.000Z',
            level: 'info',
            nodeId: 'node-a',
            message: 'status: processing request',
            signal: 'meaningful',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'run-5',
          },
        ]}
        nodeLabels={nodeLabels}
        nodeFamilies={nodeFamilies}
        onSelectLog={vi.fn()}
      />,
    )

    expect(screen.getByText('status:')).toBeInTheDocument()
    expect(screen.getByText('processing request')).toBeInTheDocument()
  })

  it('uses a fixed column layout so filtering does not reflow columns', () => {
    const { container } = render(
      <LogsTable logs={logs} nodeLabels={nodeLabels} nodeFamilies={nodeFamilies} onSelectLog={vi.fn()} />,
    )

    expect(screen.getByRole('table')).toHaveClass('table-fixed')
    expect(container.querySelectorAll('col')).toHaveLength(5)
  })
})
