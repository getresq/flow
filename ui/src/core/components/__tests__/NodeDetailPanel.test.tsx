import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NodeDetailContent } from '../NodeDetailPanel'
import type { FlowNodeConfig, LogEntry } from '../../types'

const node: FlowNodeConfig = {
  id: 'incoming-queue',
  type: 'roundedRect',
  eyebrow: 'QUEUE',
  label: 'Incoming Queue',
  style: { color: 'amber' },
  position: { x: 0, y: 0 },
}

const logs: LogEntry[] = [
  {
    timestamp: '2026-03-23T12:00:06.000Z',
    level: 'info',
    nodeId: 'incoming-queue',
    message: 'latest activity',
    displayMessage: 'latest activity',
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-latest',
    runId: 'run-latest',
  },
  {
    timestamp: '2026-03-23T12:00:05.000Z',
    level: 'info',
    nodeId: 'incoming-queue',
    message: 'activity 5',
    displayMessage: 'activity 5',
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-5',
    runId: 'run-5',
  },
  {
    timestamp: '2026-03-23T12:00:04.000Z',
    level: 'info',
    nodeId: 'incoming-queue',
    message: 'activity 4',
    displayMessage: 'activity 4',
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-4',
    runId: 'run-4',
  },
  {
    timestamp: '2026-03-23T12:00:03.000Z',
    level: 'info',
    nodeId: 'incoming-queue',
    message: 'activity 3',
    displayMessage: 'activity 3',
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-3',
    runId: 'run-3',
  },
  {
    timestamp: '2026-03-23T12:00:02.000Z',
    level: 'info',
    nodeId: 'incoming-queue',
    message: 'activity 2',
    displayMessage: 'activity 2',
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-2',
    runId: 'run-2',
  },
  {
    timestamp: '2026-03-23T12:00:01.000Z',
    level: 'info',
    nodeId: 'incoming-queue',
    message: 'activity 1',
    displayMessage: 'activity 1',
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    traceId: 'run-1',
    runId: 'run-1',
  },
]

describe('NodeDetailContent', () => {
  it('shows the Recent events section and lists the most recent entries first', () => {
    render(<NodeDetailContent node={node} logs={logs} spans={[]} />)

    expect(screen.getByText('Recent events')).toBeInTheDocument()
    expect(screen.getByText('latest activity')).toBeInTheDocument()
    // The 6th-oldest event is hidden by the 5-event cap
    expect(screen.queryByText('activity 1')).not.toBeInTheDocument()
  })

  it('does not show a "most recent first" label (kept clean per redesign)', () => {
    render(<NodeDetailContent node={node} logs={logs} spans={[]} />)
    expect(screen.queryByText('most recent first')).not.toBeInTheDocument()
  })

  it('shows the latest failure block with the error message when a recent error is present', () => {
    render(
      <NodeDetailContent
        node={node}
        logs={[
          {
            timestamp: '2026-03-23T12:00:06.000Z',
            level: 'error',
            nodeId: 'incoming-queue',
            message: 'fallback failure',
            displayMessage: 'fallback failure',
            signal: 'critical',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'run-latest',
            runId: 'run-latest',
            attributes: { error_message: 'Provider timed out after 30s' },
          },
        ]}
        spans={[]}
      />,
    )

    expect(screen.getByText('Latest failure')).toBeInTheDocument()
    expect(screen.getByText('Provider timed out after 30s')).toBeInTheDocument()
  })

  it('does not show the latest failure block when no error logs are present', () => {
    render(<NodeDetailContent node={node} logs={logs} spans={[]} />)

    expect(screen.queryByText('Latest failure')).not.toBeInTheDocument()
    expect(screen.queryByText('Provider timed out after 30s')).not.toBeInTheDocument()
  })

  it('opens the latest failure run when the View run link is clicked', () => {
    const onOpenRun = vi.fn()

    render(
      <NodeDetailContent
        node={node}
        logs={[
          {
            timestamp: '2026-03-23T12:00:06.000Z',
            level: 'error',
            nodeId: 'incoming-queue',
            message: 'failure',
            displayMessage: 'failure',
            signal: 'critical',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'trace-latest',
            runId: 'run-latest',
            attributes: { error_message: 'Provider timed out after 30s' },
          },
        ]}
        spans={[]}
        onOpenRun={onOpenRun}
      />,
    )

    fireEvent.click(screen.getByText(/View run →/))
    expect(onOpenRun).toHaveBeenCalledWith('run-latest')
  })

  it('does not show View run link for a trace-only ambient error (no runId)', () => {
    render(
      <NodeDetailContent
        node={node}
        logs={[
          {
            timestamp: '2026-03-23T12:00:06.000Z',
            level: 'error',
            nodeId: 'incoming-queue',
            message: 'failure',
            displayMessage: 'failure',
            signal: 'critical',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'trace-latest',
            runId: undefined,
            attributes: { error_message: 'Provider timed out after 30s' },
          },
        ]}
        spans={[]}
        onOpenRun={vi.fn()}
      />,
    )

    expect(screen.queryByText(/View run/)).not.toBeInTheDocument()
  })

  it('caps recent events at five entries', () => {
    render(<NodeDetailContent node={node} logs={logs} spans={[]} />)

    expect(screen.getByText('latest activity')).toBeInTheDocument()
    expect(screen.getByText('activity 2')).toBeInTheDocument()
    // The 6th-oldest is hidden until user clicks "Show older events"
    expect(screen.queryByText('activity 1')).not.toBeInTheDocument()
  })

  it('reveals older events when "Show older events" is clicked', () => {
    render(<NodeDetailContent node={node} logs={logs} spans={[]} />)

    expect(screen.queryByText('activity 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Show older events'))
    expect(screen.getByText('activity 1')).toBeInTheDocument()
  })

  it('calls onOpenLog when a recent event row is clicked', () => {
    const onOpenLog = vi.fn()

    render(
      <NodeDetailContent
        node={node}
        logs={[
          {
            timestamp: '2026-03-23T12:00:06.000Z',
            seq: 42,
            level: 'info',
            nodeId: 'incoming-queue',
            message: 'picked work',
            displayMessage: 'picked work',
            signal: 'meaningful',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'run-1',
            runId: 'run-1',
          },
        ]}
        spans={[]}
        onOpenLog={onOpenLog}
      />,
    )

    fireEvent.click(screen.getByText('picked work'))
    expect(onOpenLog).toHaveBeenCalledTimes(1)
    expect(onOpenLog.mock.calls[0][0].message).toBe('picked work')
  })
})
