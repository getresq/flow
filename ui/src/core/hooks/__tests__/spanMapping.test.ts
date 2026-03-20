import { describe, expect, it } from 'vitest'

import { resolveMappedNodeId } from '../../mapping'
import type { FlowEvent } from '../../types'
import { spanMapping } from '../../../flows/mail-pipeline'

describe('span mapping resolution', () => {
  it('maps explicit component_id directly to the canonical node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'extract-worker',
        function_name: 'handle_mail_extract',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker')
  })

  it('keeps explicit component_id when stage_id points at a different fallback node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'incoming-schedule-process',
        stage_id: 'scheduler.cursor_update',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('incoming-schedule-process')
  })

  it('maps function_name to extract-worker', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        function_name: 'handle_mail_extract',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker')
  })

  it('maps backfill worker function_name to backfill-worker', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        function_name: 'handle_mail_backfill_start',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('backfill-worker')
  })

  it('preserves legacy batchfill aliases for older replay fixtures', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'batchfill-worker',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('backfill-worker')
  })

  it('preserves legacy check-process alias for older replay fixtures', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'check-process',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('incoming-schedule-process')
  })

  it('maps queue_name to analyze-queue', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        queue_name: 'rrq:queue:mail-analyze',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('analyze-queue')
  })

  it('maps demoted store stage_id to its owning first-class node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        stage_id: 'incoming.write_metadata',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('incoming-worker')
  })

  it('maps rrq.function attributes for queue hops', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        'rrq.function': 'handle_mail_send_reply',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('send-worker')
  })

  it('maps messaging destination attributes for queue spans', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        'messaging.destination.name': 'rrq:queue:mail-analyze',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('analyze-queue')
  })

  it('maps extract upsert detail to extract-worker', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        stage_id: 'extract.upsert_contacts',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker')
  })

  it('maps recompute stage detail onto the shared extract-worker lane', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        stage_id: 'recompute.started',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker')
  })

  it('maps explicit recompute-worker component_id onto extract-worker', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'recompute-worker',
        function_name: 'handle_mail_recompute_opportunities',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker')
  })

  it('maps handle_mail_recompute_opportunities function_name onto extract-worker', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        function_name: 'handle_mail_recompute_opportunities',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('extract-worker')
  })

  it('maps autosend decision stage_id to decision node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        stage_id: 'analyze.autosend_decision',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('autosend-decision')
  })

  it('maps autosend execute enqueue detail to actions-queue', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        stage_id: 'analyze.execute_enqueue',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('actions-queue')
  })

  it('maps actions.send_enqueue stage detail onto actions-worker', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        stage_id: 'actions.send_enqueue',
        queue_name: 'rrq:queue:mail-send',
        function_name: 'handle_mail_send_reply',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('actions-worker')
  })

  it('still honors explicit component_id when actions.send_enqueue is mis-emitted as a node', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'send-queue',
        stage_id: 'actions.send_enqueue',
        queue_name: 'rrq:queue:mail-send',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('send-queue')
  })

  it('maps send precheck detail onto send-process', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        stage_id: 'send.precheck',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('send-process')
  })

  it('returns null for unmapped event', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        action: 'does_not_exist',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBeNull()
  })

  it('does not fallback when explicit component_id is unknown', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        component_id: 'unknown-component',
        function_name: 'handle_mail_extract',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBeNull()
  })
})
