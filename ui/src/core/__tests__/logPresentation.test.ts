import { describe, expect, it } from 'vitest'

import { buildFlowLogDisplayMessage, buildLogSearchText } from '../logPresentation'
import type { LogEntry } from '../types'

describe('logPresentation', () => {
  it('summarizes analyze final results for manual review', () => {
    expect(
      buildFlowLogDisplayMessage({
        stageId: 'analyze.final_result',
        message: 'analyze finalized reply branch',
        attributes: {
          reply_status: 'needs_review',
          draft_status: 'needs_review',
          result_action: 'draft_reply',
          auto_approved: false,
        },
      }),
    ).toBe('drafted; awaiting manual review')
  })

  it('summarizes analyze final results for manual approval', () => {
    expect(
      buildFlowLogDisplayMessage({
        stageId: 'analyze.final_result',
        message: 'analyze finalized reply branch',
        attributes: {
          reply_status: 'pending_action_approval',
          draft_status: 'approval_pending',
          result_action: 'draft_reply',
          auto_approved: false,
        },
      }),
    ).toBe('drafted; awaiting manual approval')
  })

  it('summarizes analyze final results for autosend execution', () => {
    expect(
      buildFlowLogDisplayMessage({
        stageId: 'analyze.final_result',
        message: 'analyze finalized reply branch',
        attributes: {
          reply_status: 'executing_actions',
          draft_status: 'approval_pending',
          result_action: 'draft_reply',
          auto_approved: true,
        },
      }),
    ).toBe('auto-send approved; execution enqueued')
  })

  it('summarizes send enqueue and send outcomes', () => {
    expect(
      buildFlowLogDisplayMessage({
        stageId: 'actions.send_enqueue',
        message: 'queued send reply job',
        attributes: {
          reply_status: 'sending',
        },
      }),
    ).toBe('send queued')

    expect(
      buildFlowLogDisplayMessage({
        stageId: 'send.final_result',
        message: 'send finalized draft outcome',
        attributes: {
          reply_status: 'sent',
          draft_status: 'sent',
          result_action: 'sent',
        },
      }),
    ).toBe('sent')

    expect(
      buildFlowLogDisplayMessage({
        stageId: 'send.final_result',
        message: 'retryable send failure: provider timeout',
        attributes: {
          reply_status: 'needs_review',
          draft_status: 'needs_review',
          result_action: 'not_sent',
          error_message: 'retryable send failure: provider timeout',
        },
      }),
    ).toBe('retryable send failure')

    expect(
      buildFlowLogDisplayMessage({
        stageId: 'send.final_result',
        message: 'send finalized draft outcome',
        attributes: {
          reply_status: 'send_failed',
          draft_status: 'send_failed',
          result_action: 'not_sent',
        },
      }),
    ).toBe('terminal send failure')
  })

  it('summarizes extract and recompute transitions with consistent phrasing', () => {
    expect(
      buildFlowLogDisplayMessage({
        stageId: 'extract.recompute_enqueue',
        message: 'extract enqueued mailbox opportunity recompute',
      }),
    ).toBe('recompute queued')

    expect(
      buildFlowLogDisplayMessage({
        stageId: 'recompute.started',
        message: 'recompute worker started mailbox opportunity recompute',
      }),
    ).toBe('recompute started')

    expect(
      buildFlowLogDisplayMessage({
        stageId: 'recompute.final_result',
        message: 'recompute finalized mailbox opportunity sync',
      }),
    ).toBe('recompute finished')
  })

  it('keeps raw message searchable even when a summary is shown', () => {
    const entry: LogEntry = {
      timestamp: '2026-03-23T12:00:00.000Z',
      level: 'info',
      nodeId: 'actions-worker',
      message: 'queued send reply job',
      displayMessage: 'send queued',
      stageId: 'actions.send_enqueue',
      componentId: 'actions-worker',
      runId: 'run-123',
      signal: 'meaningful',
      defaultVisible: true,
      eventType: 'log',
    }

    const searchText = buildLogSearchText(entry, 'Approve action batch')
    expect(searchText).toContain('send queued')
    expect(searchText).toContain('queued send reply job')
    expect(searchText).toContain('approve action batch')
  })
})
