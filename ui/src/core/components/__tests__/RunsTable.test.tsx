import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RunsTable } from '../RunsTable';
import type { TraceJourney } from '../../types';

const journeys: TraceJourney[] = [
  {
    traceId: 'run-a',
    rootEntity: 'support@resq.dev',
    startedAt: '2026-03-17T13:00:00.000Z',
    durationMs: 920,
    status: 'success',
    steps: [
      {
        stepId: 'analyze',
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
    steps: [
      {
        stepId: 'final-result',
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
    steps: [
      {
        stepId: 'pickup',
        label: 'pickup',
        nodeId: 'incoming-worker',
        startSeq: 5,
        endSeq: 5,
        startTs: '2026-03-17T13:01:00.000Z',
        durationMs: 0,
        status: 'success',
      },
      {
        stepId: 'final-result',
        label: 'final-result',
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
];

describe('RunsTable', () => {
  it('sorts by duration and keeps the selected row highlighted', async () => {
    render(<RunsTable journeys={journeys} selectedTraceId="run-b" onSelectTrace={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /duration/i }));

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('support@resq.dev')).toBeInTheDocument();
    const selectedRow = rows.find((row) => row.getAttribute('data-state') === 'selected');
    expect(selectedRow).toBeDefined();
    expect(within(selectedRow!).getByText('billing@resq.dev')).toBeInTheDocument();
  });

  it('selects and deselects a row on click', async () => {
    const onSelectTrace = vi.fn();

    render(<RunsTable journeys={journeys} onSelectTrace={onSelectTrace} />);

    fireEvent.click(screen.getByText('billing@resq.dev'));
    expect(onSelectTrace).toHaveBeenCalledWith('run-b');
    expect(screen.getByText('Provider timeout')).toBeInTheDocument();
  });

  it('shows meaningful run labels, latest steps, and compact long durations', () => {
    render(<RunsTable journeys={journeys} onSelectTrace={vi.fn()} />);

    expect(screen.getByRole('columnheader', { name: /latest step/i })).toBeInTheDocument();
    expect(screen.getByText('ops@resq.dev')).toBeInTheDocument();
    expect(screen.getByText('awaiting manual approval')).toBeInTheDocument();
    expect(screen.getByText('20536d 11h')).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });
});
