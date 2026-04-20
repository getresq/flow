import { describe, expect, it } from 'vitest';

import { buildFlowLogDisplayMessage, buildLogSearchText } from '../logPresentation';
import type { LogEntry } from '../types';

describe('logPresentation', () => {
  it('summarizes analyze final results for manual review', () => {
    expect(
      buildFlowLogDisplayMessage({
        stepId: 'final-result',
        nodeId: 'analyze-decision',
        message: 'analyze finalized reply branch',
        attributes: {
          reply_status: 'needs_review',
          draft_status: 'needs_review',
          result_action: 'draft_reply',
          auto_approved: false,
        },
      }),
    ).toBe('drafted; awaiting manual review');
  });

  it('summarizes analyze final results for manual approval', () => {
    expect(
      buildFlowLogDisplayMessage({
        stepId: 'final-result',
        nodeId: 'analyze-decision',
        message: 'analyze finalized reply branch',
        attributes: {
          reply_status: 'pending_action_approval',
          draft_status: 'approval_pending',
          result_action: 'draft_reply',
          auto_approved: false,
        },
      }),
    ).toBe('drafted; awaiting manual approval');
  });

  it('summarizes analyze final results for autosend execution', () => {
    expect(
      buildFlowLogDisplayMessage({
        stepId: 'final-result',
        nodeId: 'analyze-decision',
        message: 'analyze finalized reply branch',
        attributes: {
          reply_status: 'executing_actions',
          draft_status: 'approval_pending',
          result_action: 'draft_reply',
          auto_approved: true,
        },
      }),
    ).toBe('auto-send approved; execution enqueued');
  });

  it('summarizes send enqueue and send outcomes', () => {
    expect(
      buildFlowLogDisplayMessage({
        stepId: 'send-enqueue',
        nodeId: 'autosend-decision',
        message: 'queued send reply job',
        attributes: {
          reply_status: 'sending',
        },
      }),
    ).toBe('send queued');

    expect(
      buildFlowLogDisplayMessage({
        stepId: 'final-result',
        nodeId: 'send-process',
        message: 'send finalized draft outcome',
        attributes: {
          reply_status: 'sent',
          draft_status: 'sent',
          result_action: 'sent',
        },
      }),
    ).toBe('sent');

    expect(
      buildFlowLogDisplayMessage({
        stepId: 'final-result',
        nodeId: 'send-process',
        message: 'retryable send failure: provider timeout',
        attributes: {
          reply_status: 'needs_review',
          draft_status: 'needs_review',
          result_action: 'not_sent',
          error_message: 'retryable send failure: provider timeout',
        },
      }),
    ).toBe('retryable send failure');

    expect(
      buildFlowLogDisplayMessage({
        stepId: 'final-result',
        nodeId: 'send-process',
        message: 'send finalized draft outcome',
        attributes: {
          reply_status: 'send_failed',
          draft_status: 'send_failed',
          result_action: 'not_sent',
        },
      }),
    ).toBe('terminal send failure');
  });

  it('summarizes extract transitions with consistent phrasing', () => {
    expect(
      buildFlowLogDisplayMessage({
        stepId: 'started',
        nodeId: 'extract-worker',
        message: 'extract worker started thread extract pass',
      }),
    ).toBe('extract started');

    expect(
      buildFlowLogDisplayMessage({
        stepId: 'final-result',
        nodeId: 'extract-worker',
        message: 'extract finalized thread extract pass',
      }),
    ).toBe('extract completed');
  });

  it('keeps raw message searchable even when a summary is shown', () => {
    const entry: LogEntry = {
      timestamp: '2026-03-23T12:00:00.000Z',
      level: 'info',
      nodeId: 'actions-worker',
      message: 'queued send reply job',
      displayMessage: 'send queued',
      stepId: 'send-enqueue',
      componentId: 'actions-worker',
      runId: 'run-123',
      signal: 'meaningful',
      defaultVisible: true,
      eventType: 'log',
    };

    const searchText = buildLogSearchText(entry, 'Approve action batch');
    expect(searchText).toContain('send queued');
    expect(searchText).toContain('queued send reply job');
    expect(searchText).toContain('approve action batch');
  });
});
