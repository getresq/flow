import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NodeDetailContent } from '../NodeDetailPanel'
import type { FlowNodeConfig, LogEntry } from '../../types'

const node: FlowNodeConfig = {
  id: 'incoming-queue',
  type: 'rectangle',
  semanticRole: 'queue',
  label: 'Incoming Queue',
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
  it('shows recent activity across recent runs instead of limiting to the latest run', () => {
    render(<NodeDetailContent node={node} logs={logs} spans={[]} />)

    expect(screen.getByText('most recent first')).toBeInTheDocument()
    expect(screen.getByText('latest activity')).toBeInTheDocument()
    expect(screen.getByText('activity 1')).toBeInTheDocument()
  })

  it('shows the latest meaningful entry per run and labels activity when multiple runs are present', () => {
    render(
      <NodeDetailContent
        node={node}
        logs={[
          {
            timestamp: '2026-03-23T12:00:06.000Z',
            seq: 6,
            level: 'info',
            nodeId: 'incoming-queue',
            message: 'latest activity',
            displayMessage: 'latest activity',
            signal: 'meaningful',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'trace-1',
            runId: 'run-1',
            attributes: { thread_id: 'thread-1' },
          },
          {
            timestamp: '2026-03-23T12:00:05.000Z',
            seq: 5,
            level: 'info',
            nodeId: 'incoming-queue',
            message: 'older activity same run',
            displayMessage: 'older activity same run',
            signal: 'meaningful',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'trace-1',
            runId: 'run-1',
            attributes: { thread_id: 'thread-1' },
          },
          {
            timestamp: '2026-03-23T12:00:04.000Z',
            seq: 4,
            level: 'info',
            nodeId: 'incoming-queue',
            message: 'other run activity',
            displayMessage: 'other run activity',
            signal: 'meaningful',
            defaultVisible: true,
            eventType: 'log',
            traceId: 'trace-2',
            runId: 'run-2',
            attributes: { thread_id: 'thread-2' },
          },
        ]}
        spans={[]}
      />,
    )

    expect(screen.getByText('thread thread-1')).toBeInTheDocument()
    expect(screen.getByText('thread thread-2')).toBeInTheDocument()
    expect(screen.getByText('latest activity')).toBeInTheDocument()
    expect(screen.getByText('other run activity')).toBeInTheDocument()
    expect(screen.queryByText('older activity same run')).not.toBeInTheDocument()
  })
})
