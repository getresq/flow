import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TraceDetailContent } from '../TraceDetailPanel'
import type { TraceJourney } from '../../types'

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
}

describe('TraceDetailPanel', () => {
  it('shows run_id in Run details when present', () => {
    render(<TraceDetailContent journey={journey} />)

    fireEvent.click(screen.getByText('Run details'))

    expect(screen.getByText('run_id')).toBeInTheDocument()
    expect(screen.getByText('mail-pipeline_abc123')).toBeInTheDocument()
  })
})
