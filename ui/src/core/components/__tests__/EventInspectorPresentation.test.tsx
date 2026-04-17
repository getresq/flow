import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { getEventInspectorPresentation } from '../EventInspectorPresentation'
import type { LogEntry } from '../../types'

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    selectionId: '14810',
    seq: 14810,
    timestamp: '2026-04-11T10:46:50.000Z',
    level: 'info',
    message: 'received payload',
    attributes: {},
    nodeId: 'intake-worker',
    runId: 'demo-run-1',
    traceId: 'demo-run-1',
    signal: 'meaningful',
    defaultVisible: true,
    eventType: 'log',
    ...overrides,
  }
}

describe('getEventInspectorPresentation', () => {
  it('returns a clickable title button when nodeId + onOpenNode are present', () => {
    const onOpenNode = vi.fn()
    const { title } = getEventInspectorPresentation(makeEntry(), 'Intake Worker', onOpenNode)
    render(<>{title}</>)

    const button = screen.getByRole('button', { name: /intake worker/i })
    fireEvent.click(button)
    expect(onOpenNode).toHaveBeenCalledWith('intake-worker')
  })

  it('returns a plain string title when onOpenNode is not provided', () => {
    const { title } = getEventInspectorPresentation(makeEntry(), 'Intake Worker')
    render(<>{title}</>)

    expect(screen.queryByRole('button', { name: /intake worker/i })).not.toBeInTheDocument()
    expect(screen.getByText('Intake Worker')).toBeInTheDocument()
  })

  it('returns a plain string title when the entry has no nodeId', () => {
    const onOpenNode = vi.fn()
    const { title } = getEventInspectorPresentation(makeEntry({ nodeId: undefined }), 'Intake Worker', onOpenNode)
    render(<>{title}</>)

    expect(screen.queryByRole('button', { name: /intake worker/i })).not.toBeInTheDocument()
  })
})
