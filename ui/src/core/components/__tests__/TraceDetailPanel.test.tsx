import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TraceDetailContent } from '../TraceDetailPanel';
import type { FlowEdgeConfig, FlowNodeConfig, TraceJourney } from '../../types';

const flowNodes: FlowNodeConfig[] = [
  {
    id: 'incoming-worker',
    type: 'roundedRect',
    label: 'Incoming Worker',
    position: { x: 0, y: 0 },
    layout: { order: 10 },
  },
];

const flowEdges: FlowEdgeConfig[] = [];

const journey: TraceJourney = {
  traceId: 'trace-1',
  startedAt: '2026-04-11T10:46:50.000Z',
  endedAt: '2026-04-11T10:46:56.000Z',
  durationMs: 6000,
  status: 'success',
  steps: [
    {
      instanceId: 'analyze-decision::final-result',
      stepId: 'final-result',
      label: 'analyze finalized reply branch',
      nodeId: 'analyze-decision',
      startSeq: 1,
      endSeq: 1,
      startTs: '2026-04-11T10:46:56.000Z',
      endTs: '2026-04-11T10:46:56.000Z',
      durationMs: 0,
      status: 'success',
      attrs: {
        reason_code: 'llm_draft_reply',
      },
    },
  ],
  nodePath: ['analyze-decision'],
  lastUpdatedAt: '2026-04-11T10:46:56.000Z',
  eventCount: 1,
  identifiers: {
    mailboxOwner: 'jrojas@getresq.com',
    provider: 'gmail',
    runId: 'mail-pipeline_abc123',
    threadId: 'thread-1',
    replyDraftId: 'draft-1',
  },
};

describe('TraceDetailPanel', () => {
  it('no longer renders a "Run details" section in the overview body', () => {
    render(<TraceDetailContent journey={journey} />);
    expect(screen.queryByText('Run details')).not.toBeInTheDocument();
  });

  it('renders one card per grouped node showing the summary and a node-drill button', () => {
    const onSelectNode = vi.fn();

    render(
      <TraceDetailContent
        journey={{
          ...journey,
          steps: [
            {
              instanceId: 'incoming-worker::write-metadata',
              stepId: 'write-metadata',
              label: 'write-metadata',
              nodeId: 'incoming-worker',
              startSeq: 1,
              endSeq: 1,
              startTs: '2026-04-11T10:46:50.000Z',
              endTs: '2026-04-11T10:46:50.000Z',
              durationMs: 1600,
              status: 'success',
            },
            {
              instanceId: 'incoming-worker::final-result',
              stepId: 'final-result',
              label: 'final-result',
              nodeId: 'incoming-worker',
              startSeq: 2,
              endSeq: 2,
              startTs: '2026-04-11T10:46:51.000Z',
              endTs: '2026-04-11T10:46:51.000Z',
              durationMs: 0,
              status: 'success',
            },
          ],
          nodePath: ['incoming-worker'],
        }}
        flowNodes={flowNodes}
        flowEdges={flowEdges}
        onSelectNode={onSelectNode}
      />,
    );

    // Card header = node label
    expect(screen.getByText('Incoming Worker')).toBeInTheDocument();

    // Success run: no subtext (badge alone conveys status).
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    expect(screen.queryByText('Final result')).not.toBeInTheDocument();

    // No expand, no detail rows
    expect(screen.queryByText(/\+\d+ step/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Write metadata')).not.toBeInTheDocument();

    // Node drill still works
    fireEvent.click(screen.getByRole('button', { name: /open incoming worker node/i }));
    expect(onSelectNode).toHaveBeenCalledWith('incoming-worker');
  });

  it('surfaces the first error as the summary when the group contains one', () => {
    render(
      <TraceDetailContent
        journey={{
          ...journey,
          steps: [
            {
              instanceId: 'incoming-worker::validate-auth',
              stepId: 'validate-auth',
              label: 'validate-auth',
              nodeId: 'incoming-worker',
              startSeq: 1,
              endSeq: 1,
              startTs: '2026-04-11T10:46:50.000Z',
              endTs: '2026-04-11T10:46:50.000Z',
              durationMs: 50,
              status: 'error',
              attrs: { error_message: 'auth denied' },
            },
            {
              instanceId: 'incoming-worker::cleanup',
              stepId: 'cleanup',
              label: 'cleanup',
              nodeId: 'incoming-worker',
              startSeq: 2,
              endSeq: 2,
              startTs: '2026-04-11T10:46:51.000Z',
              endTs: '2026-04-11T10:46:51.000Z',
              durationMs: 10,
              status: 'success',
            },
          ],
          nodePath: ['incoming-worker'],
        }}
        flowNodes={flowNodes}
        flowEdges={flowEdges}
      />,
    );

    // First error wins the summary, even though a later success step came after.
    expect(screen.getByText('auth denied')).toBeInTheDocument();
  });

  it('omits node navigation for the shared unmapped bucket', () => {
    render(
      <TraceDetailContent
        journey={{
          ...journey,
          steps: [
            {
              instanceId: 'unmapped::mystery-step',
              stepId: 'mystery-step',
              label: 'mystery-step',
              startSeq: 1,
              endSeq: 1,
              startTs: '2026-04-11T10:46:50.000Z',
              endTs: '2026-04-11T10:46:50.000Z',
              durationMs: 0,
              status: 'success',
            },
          ],
          nodePath: [],
        }}
      />,
    );

    expect(screen.getByText('Other Activity')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /open other activity node/i }),
    ).not.toBeInTheDocument();
  });
});
