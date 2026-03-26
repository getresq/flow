import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RunsTable } from '../RunsTable'
import type { TraceJourney } from '../../types'

const journeys: TraceJourney[] = [
  {
    traceId: 'run-a',
    rootEntity: 'support@resq.dev',
    startedAt: '2026-03-17T13:00:00.000Z',
    durationMs: 920,
    status: 'success',
    stages: [
      {
        stageId: 'analyze',
        label: 'Analyze',
        nodeId: 'analyze-decision',
        startSeq: 1,
        endSeq: 2,
        startTs: '2026-03-17T13:00:00.000Z',
        durationMs: 920,
        status: 'success',
      },
    ],
    nodePath: ['analyze'],
    lastUpdatedAt: '2026-03-17T13:09:00.000Z',
    eventCount: 4,
    identifiers: {
      mailboxOwner: 'support@resq.dev',
    },
  },
  {
    traceId: 'run-b',
    rootEntity: 'billing@resq.dev',
    startedAt: '2026-03-17T13:02:00.000Z',
    durationMs: 1_820,
    status: 'error',
    stages: [
      {
        stageId: 'send.final_result',
        label: 'Send',
        nodeId: 'send-process',
        startSeq: 3,
        endSeq: 4,
        startTs: '2026-03-17T13:02:00.000Z',
        durationMs: 1_820,
        status: 'error',
      },
    ],
    nodePath: ['send'],
    errorSummary: 'Provider timeout',
    lastUpdatedAt: '2026-03-17T13:10:00.000Z',
    eventCount: 5,
    identifiers: {
      mailboxOwner: 'billing@resq.dev',
    },
  },
  {
    traceId: 'run-c',
    rootEntity: '0',
    startedAt: '2026-03-17T13:01:00.000Z',
    durationMs: 1774352148700,
    status: 'running',
    stages: [
      {
        stageId: 'worker.pickup',
        label: 'worker.pickup',
        nodeId: 'incoming-worker',
        startSeq: 5,
        endSeq: 5,
        startTs: '2026-03-17T13:01:00.000Z',
        durationMs: 0,
        status: 'success',
      },
      {
        stageId: 'send.final_result',
        label: 'send.final_result',
        nodeId: 'send-process',
        startSeq: 6,
        endSeq: 6,
        startTs: '2026-03-17T13:01:01.000Z',
        durationMs: 1774352148700,
        status: 'running',
        attrs: {
          reply_status: 'pending_action_approval',
          draft_status: 'approval_pending',
          result_action: 'draft_reply',
          auto_approved: false,
        },
      },
    ],
    nodePath: ['extract'],
    lastUpdatedAt: '2026-03-17T13:11:00.000Z',
    eventCount: 6,
    identifiers: {
      mailboxOwner: 'ops@resq.dev',
      replyDraftId: '0',
    },
  },
]

describe('RunsTable', () => {
  it('sorts by duration and keeps the selected row highlighted', async () => {
    const user = userEvent.setup()

    render(
      <RunsTable
        journeys={journeys}
        pinnedTraceIds={new Set()}
        selectedTraceId="run-b"
        onSelectTrace={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /duration/i }))

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('support@resq.dev')).toBeInTheDocument()
    const selectedRow = rows.find((row) => row.getAttribute('data-state') === 'selected')
    expect(selectedRow).toBeDefined()
    expect(within(selectedRow!).getByText('billing@resq.dev')).toBeInTheDocument()
  })

  it('supports pinning and row selection independently', async () => {
    const user = userEvent.setup()
    const onSelectTrace = vi.fn()
    const onTogglePinned = vi.fn()

    render(
      <RunsTable
        journeys={journeys}
        pinnedTraceIds={new Set(['run-a'])}
        onSelectTrace={onSelectTrace}
        onTogglePinned={onTogglePinned}
      />,
    )

    const pinnedRow = screen.getAllByRole('row').find((row) =>
      within(row).queryByText('support@resq.dev'),
    )
    expect(pinnedRow).toBeDefined()

    await user.click(within(pinnedRow!).getByRole('button', { name: /unpin/i }))
    expect(onTogglePinned).toHaveBeenCalledWith('run-a')
    expect(onSelectTrace).not.toHaveBeenCalled()

    await user.click(screen.getByText('billing@resq.dev'))
    expect(onSelectTrace).toHaveBeenCalledWith('run-b')
    expect(screen.getByText('Provider timeout')).toBeInTheDocument()
  })

  it('shows meaningful run labels, latest steps, and compact long durations', () => {
    render(
      <RunsTable
        journeys={journeys}
        pinnedTraceIds={new Set()}
        onSelectTrace={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    expect(screen.getByRole('columnheader', { name: /latest step/i })).toBeInTheDocument()
    expect(screen.getByText('ops@resq.dev')).toBeInTheDocument()
    expect(screen.getByText('awaiting manual approval')).toBeInTheDocument()
    expect(screen.getByText('20536d 11h')).toBeInTheDocument()
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
  })
})
