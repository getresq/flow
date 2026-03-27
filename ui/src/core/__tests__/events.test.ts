import { describe, expect, it } from 'vitest'

import { eventExecutionKey, eventMatchesFlow, parseRelayEvents } from '../events'

describe('events helpers', () => {
  it('parses snapshot envelopes and normalizes missing fields', () => {
    const events = parseRelayEvents(
      JSON.stringify({
        type: 'snapshot',
        events: [
          {
            type: 'log',
            timestamp: '2026-03-05T12:00:00.000Z',
            attributes: {
              action: 'enqueue',
              queue_name: 'rrq:queue:mail-analyze',
            },
          },
        ],
      }),
      10,
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      seq: 11,
      event_kind: 'queue_enqueued',
      queue_delta: 1,
      node_key: 'rrq:queue:mail-analyze',
    })
  })

  it('prefers explicit component_id for node_key normalization', () => {
    const events = parseRelayEvents(
      JSON.stringify({
        type: 'snapshot',
        events: [
          {
            type: 'log',
            timestamp: '2026-03-05T12:00:00.000Z',
            attributes: {
              component_id: 'extract-worker',
              function_name: 'handle_mail_extract',
            },
          },
        ],
      }),
      0,
    )

    expect(events[0]?.node_key).toBe('extract-worker')
  })

  it('parses bare events and preserves explicit sequence numbers', () => {
    const events = parseRelayEvents(
      JSON.stringify({
        type: 'span_end',
        seq: 42,
        timestamp: '2026-03-05T12:00:01.000Z',
        span_name: 'handle_mail_extract',
      }),
      10,
    )

    expect(events).toEqual([
      expect.objectContaining({
        type: 'span_end',
        seq: 42,
        event_kind: 'node_finished',
        node_key: 'handle_mail_extract',
      }),
    ])
  })

  it('parses legacy array payloads and drops invalid entries', () => {
    const events = parseRelayEvents(
      JSON.stringify([
        { type: 'log', timestamp: '2026-03-05T12:00:00.000Z', message: 'kept' },
        { nope: true },
      ]),
      0,
    )

    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('kept')
  })

  it('prefers explicit flow_id over matched_flow_ids fallback', () => {
    expect(
      eventMatchesFlow(
        {
          type: 'log',
          timestamp: '2026-03-05T12:00:00.000Z',
          matched_flow_ids: ['mail-pipeline'],
          attributes: {
            flow_id: 'other-flow',
          },
        },
        'mail-pipeline',
      ),
    ).toBe(false)

    expect(
      eventMatchesFlow(
        {
          type: 'log',
          timestamp: '2026-03-05T12:00:00.000Z',
          attributes: {
            flow_id: 'mail-pipeline',
          },
        },
        'mail-pipeline',
      ),
    ).toBe(true)
  })

  it('matches flows by matched_flow_ids when explicit flow_id is absent', () => {
    expect(
      eventMatchesFlow(
        {
          type: 'log',
          timestamp: '2026-03-05T12:00:00.000Z',
          matched_flow_ids: ['mail-pipeline'],
        },
        'mail-pipeline',
      ),
    ).toBe(true)

    expect(
      eventMatchesFlow(
        {
          type: 'log',
          timestamp: '2026-03-05T12:00:00.000Z',
          matched_flow_ids: ['mail-pipeline'],
        },
        'other-flow',
      ),
    ).toBe(false)

    expect(
      eventMatchesFlow(
        {
          type: 'log',
          timestamp: '2026-03-05T12:00:00.000Z',
        },
        'any-flow',
      ),
    ).toBe(false)
  })

  it('uses run_id as the canonical execution key when present', () => {
    expect(
      eventExecutionKey({
        type: 'log',
        timestamp: '2026-03-05T12:00:00.000Z',
        trace_id: 'trace-1',
        attributes: {
          run_id: 'run-1',
        },
      }),
    ).toBe('run-1')
  })

  it('falls back to trace_id when run_id is a placeholder value', () => {
    expect(
      eventExecutionKey({
        type: 'log',
        timestamp: '2026-03-05T12:00:00.000Z',
        trace_id: 'trace-1',
        attributes: {
          run_id: 0,
        },
      }),
    ).toBe('trace-1')
  })
})
