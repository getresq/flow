import { describe, expect, it } from 'vitest';

import { resolveMappedNodeId } from '../../mapping';
import type { FlowEvent } from '../../types';
import { spanMapping } from '../../../flows/mail-pipeline';

describe('span mapping resolution', () => {
  it('maps explicit component_id directly to the canonical node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'extract-worker',
        function_name: 'handle_mail_extract',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker');
  });

  it('maps explicit scheduler cursor detail onto the visible cursor step node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'incoming-schedule-process',
        step_id: 'cursor-update',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('incoming-scheduled-at');
  });

  it('maps function_name to extract-worker', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        function_name: 'handle_mail_extract',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker');
  });

  it('maps backfill worker function_name to backfill-worker', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        function_name: 'handle_mail_backfill_start',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('backfill-worker');
  });

  it('maps standardized backfill component ids directly', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'backfill-worker',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('backfill-worker');
  });

  it('maps standardized incoming-schedule-process component ids directly', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'incoming-schedule-process',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('incoming-schedule-process');
  });

  it('maps queue_name to analyze-queue', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        queue_name: 'rrq:queue:mail-analyze',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('analyze-queue');
  });

  it('maps explicit incoming store detail onto the visible persistence step node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'incoming-worker',
        step_id: 'write-metadata',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('incoming-thread-metadata-write');
  });

  it('maps rrq.function attributes for queue hops', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        'rrq.function': 'handle_mail_send_reply',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('send-worker');
  });

  it('maps messaging destination attributes for queue spans', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        'messaging.destination.name': 'rrq:queue:mail-analyze',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('analyze-queue');
  });

  it('keeps explicit extract-worker ownership on extract detail steps', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'extract-worker',
        step_id: 'upsert-contacts',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker');
  });

  it('keeps explicit extract-worker ownership on lifecycle detail steps', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'extract-worker',
        step_id: 'started',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker');
  });

  it('keeps explicit autosend decision ownership on decision detail steps', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'autosend-decision',
        step_id: 'action-batch-auto-approve',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('autosend-decision');
  });

  it('maps autosend execute enqueue detail to the actions queue when the queue boundary is explicit', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'actions-queue',
        step_id: 'execute-enqueue',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('actions-queue');
  });

  it('maps send-enqueue stage detail onto autosend-decision', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'autosend-decision',
        step_id: 'send-enqueue',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('autosend-decision');
  });

  it('still honors explicit component_id when send-enqueue is mis-emitted as a node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'send-queue',
        step_id: 'send-enqueue',
        queue_name: 'rrq:queue:mail-send',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('send-queue');
  });

  it('keeps explicit send-process ownership on send precheck detail', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'send-process',
        step_id: 'precheck',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBe('send-process');
  });

  it('returns null for unmapped event', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        action: 'does_not_exist',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBeNull();
  });

  it('does not fallback when explicit component_id is unknown', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'unknown-component',
        function_name: 'handle_mail_extract',
      },
    };

    expect(resolveMappedNodeId(event, spanMapping)).toBeNull();
  });
});
