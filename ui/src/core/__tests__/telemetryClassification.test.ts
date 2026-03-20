import { describe, expect, it } from 'vitest'

import { classifyFlowEvent, isDefaultVisibleSignal } from '../telemetryClassification'
import type { FlowEvent } from '../types'

describe('telemetryClassification', () => {
  it('classifies generic lifecycle spans as raw', () => {
    const event: FlowEvent = {
      type: 'span_start',
      timestamp: '2026-03-19T12:00:00.000Z',
      span_name: 'rrq.job',
      trace_id: 'trace-1',
      span_id: 'span-1',
      attributes: {},
    }

    expect(classifyFlowEvent(event)).toBe('raw')
    expect(isDefaultVisibleSignal(classifyFlowEvent(event))).toBe(false)
  })

  it('classifies enqueue handoffs as meaningful', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-19T12:00:00.000Z',
      trace_id: 'trace-2',
      span_id: 'log-1',
      attributes: {
        action: 'enqueue',
        queue_name: 'rrq:queue:mail-actions',
      },
      message: 'enqueue approved action batch',
    }

    expect(classifyFlowEvent(event)).toBe('meaningful')
    expect(isDefaultVisibleSignal(classifyFlowEvent(event))).toBe(true)
  })

  it('classifies low-level store writes as operational', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-19T12:00:00.000Z',
      trace_id: 'trace-3',
      span_id: 'log-2',
      attributes: {
        stage_id: 'incoming.write_metadata',
        component_id: 'incoming-worker',
      },
      message: 'metadata write complete',
    }

    expect(classifyFlowEvent(event)).toBe('operational')
    expect(isDefaultVisibleSignal(classifyFlowEvent(event))).toBe(false)
  })

  it('classifies retries and failures as critical', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-19T12:00:00.000Z',
      trace_id: 'trace-4',
      span_id: 'log-3',
      attributes: {
        stage_id: 'send.final_result',
        status: 'error',
        retryable: true,
        error_message: 'provider timeout',
      },
      message: 'send failed',
    }

    expect(classifyFlowEvent(event)).toBe('critical')
    expect(isDefaultVisibleSignal(classifyFlowEvent(event))).toBe(true)
  })
})
