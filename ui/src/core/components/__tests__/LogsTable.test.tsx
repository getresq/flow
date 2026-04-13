import { fireEvent, render, screen, within } from '@testing-library/react'
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
  it('shows inline duration only when crossing the warning threshold (>= 1s)', () => {
    const mixed: LogEntry[] = [
      {
        timestamp: '2026-03-17T13:10:00.000Z',
        level: 'info',
        nodeId: 'node-a',
        message: 'slow operation',
        durationMs: 1500,
        signal: 'meaningful',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-a',
      },
      {
        timestamp: '2026-03-17T13:11:00.000Z',
        level: 'info',
        nodeId: 'node-a',
        message: 'normal speed',
        durationMs: 250,
        signal: 'meaningful',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-b',
      },
      {
        timestamp: '2026-03-17T13:12:00.000Z',
        level: 'info',
        nodeId: 'node-a',
        message: 'no duration',
        signal: 'meaningful',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-c',
      },
    ]

    render(
      <LogsTable logs={mixed} nodeLabels={nodeLabels} nodeFamilies={nodeFamilies} onSelectLog={vi.fn()} />,
    )

    expect(screen.getAllByTestId('duration-badge')).toHaveLength(1)
  })

  it('marks error and critical-signal rows with data-severity="error" and slow rows with "warning"', () => {
    const mixed: LogEntry[] = [
      {
        timestamp: '2026-03-17T13:10:00.000Z',
        level: 'error',
        nodeId: 'node-a',
        message: 'hard error',
        signal: 'critical',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-a',
      },
      {
        timestamp: '2026-03-17T13:11:00.000Z',
        level: 'info',
        nodeId: 'node-a',
        message: 'critical signal only',
        signal: 'critical',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-b',
      },
      {
        timestamp: '2026-03-17T13:12:00.000Z',
        level: 'info',
        nodeId: 'node-a',
        message: 'slow operation',
        durationMs: 1500,
        signal: 'meaningful',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-c',
      },
      {
        timestamp: '2026-03-17T13:13:00.000Z',
        level: 'info',
        nodeId: 'node-a',
        message: 'normal',
        durationMs: 50,
        signal: 'meaningful',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-d',
      },
    ]

    render(
      <LogsTable logs={mixed} nodeLabels={nodeLabels} nodeFamilies={nodeFamilies} onSelectLog={vi.fn()} />,
    )

    const rows = screen.getAllByRole('row').slice(1)
    const bySeverity = (s: string) => rows.filter((r) => r.getAttribute('data-severity') === s)

    expect(bySeverity('error')).toHaveLength(2)
    expect(bySeverity('warning')).toHaveLength(1)
    expect(rows.find((r) => r.getAttribute('data-severity') === null || r.getAttribute('data-severity') === undefined || !r.getAttribute('data-severity'))).toBeDefined()
  })

  it('calls the row click handler and marks error rows with data-level', async () => {
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

    fireEvent.click(screen.getByText('Provider timeout'))

    expect(onSelectLog).toHaveBeenCalledWith(logs[1])

    // Error row has data-level="error" (no longer a text badge)
    const rows = screen.getAllByRole('row').slice(1)
    const errorRow = rows.find((row) => row.getAttribute('data-level') === 'error')
    expect(errorRow).toBeDefined()

    const selectedRow = screen.getAllByRole('row').find((row) => row.getAttribute('data-state') === 'selected')
    expect(selectedRow).toBeDefined()
    expect(within(selectedRow!).getByText('Send')).toBeInTheDocument()
  })

  it('selects a row by selectedLogSeq when the log has a seq', () => {
    const logsWithSeq: LogEntry[] = [
      {
        timestamp: '2026-03-17T13:10:00.000Z',
        level: 'info',
        nodeId: 'node-a',
        message: 'First log',
        signal: 'meaningful',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-1',
        seq: 1,
      },
      {
        timestamp: '2026-03-17T13:11:00.000Z',
        level: 'info',
        nodeId: 'node-b',
        message: 'Second log',
        signal: 'meaningful',
        defaultVisible: true,
        eventType: 'log',
        traceId: 'run-2',
        seq: 2,
      },
    ]

    render(
      <LogsTable
        logs={logsWithSeq}
        nodeLabels={nodeLabels}
        nodeFamilies={nodeFamilies}
        selectedLogSeq="2"
        onSelectLog={vi.fn()}
      />,
    )

    // Default sort is time descending, so seq:2 (newer) is first
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].getAttribute('data-state')).toBe('selected')
    expect(rows[1].getAttribute('data-state')).toBeNull()
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
            stepId: 'final-result',
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
            stepName: 'status',
            message: 'processing request',
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

    expect(screen.getAllByRole('table')).toSatisfy((tables) =>
      tables.every((table: HTMLElement) => table.classList.contains('table-fixed')),
    )
    expect(container.querySelectorAll('colgroup')).toHaveLength(2)
    expect(
      [...container.querySelectorAll('colgroup')].every((group) => group.querySelectorAll('col').length === 3),
    ).toBe(true)
  })
})
