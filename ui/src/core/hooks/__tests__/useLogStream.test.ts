import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { mailPipelineFlow } from '../../../flows/mail-pipeline'
import type { FlowEvent } from '../../types'
import { useLogStream } from '../useLogStream'

describe('useLogStream', () => {
  it('builds global and per-node logs and keeps global list ordered', async () => {
    const events: FlowEvent[] = [
      {
        type: 'log',
        timestamp: '2026-03-03T12:00:01.000Z',
        attributes: {
          run_id: 'run-1',
          action: 'enqueue',
          queue_name: 'rrq:queue:mail-analyze',
        },
        message: 'enqueue analyze',
      },
      {
        type: 'span_end',
        timestamp: '2026-03-03T12:00:00.500Z',
        span_name: 'handle_mail_extract',
        attributes: {
          run_id: 'run-1',
          function_name: 'handle_mail_extract',
          status: 'ok',
        },
        duration_ms: 500,
      },
    ]

    const { result } = renderHook(() => useLogStream(events, mailPipelineFlow.spanMapping))

    await waitFor(() => {
      expect(result.current.globalLogs.length).toBe(2)
    })

    expect(result.current.globalLogs[0].timestamp).toBe('2026-03-03T12:00:00.500Z')
    expect(result.current.globalLogs[1].timestamp).toBe('2026-03-03T12:00:01.000Z')
    expect(result.current.globalLogs[0].runId).toBe('run-1')
    expect(result.current.globalLogs[0].signal).toBe('raw')
    expect(result.current.globalLogs[0].defaultVisible).toBe(false)
    expect(result.current.globalLogs[1].signal).toBe('meaningful')
    expect(result.current.globalLogs[1].defaultVisible).toBe(true)

    expect(result.current.nodeLogMap.get('extract-worker')).toHaveLength(1)
    expect(result.current.nodeLogMap.get('analyze-queue')).toHaveLength(1)
  })

  it('clearSession resets all accumulated logs', async () => {
    const events: FlowEvent[] = [
      {
        type: 'log',
        timestamp: '2026-03-03T12:00:01.000Z',
        attributes: {
          action: 'enqueue',
          queue_name: 'rrq:queue:mail-analyze',
        },
      },
    ]

    const { result } = renderHook(() => useLogStream(events, mailPipelineFlow.spanMapping))

    await waitFor(() => {
      expect(result.current.globalLogs.length).toBe(1)
    })

    act(() => {
      result.current.clearSession()
    })

    expect(result.current.globalLogs).toEqual([])
    expect(result.current.nodeLogMap.size).toBe(0)
  })

  it('keeps unknown mappings in global logs but not per-node map', async () => {
    const events: FlowEvent[] = [
      {
        type: 'log',
        timestamp: '2026-03-03T12:00:01.000Z',
        attributes: {
          action: 'unmapped_action',
        },
        message: 'unknown',
      },
    ]

    const { result } = renderHook(() => useLogStream(events, mailPipelineFlow.spanMapping))

    await waitFor(() => {
      expect(result.current.globalLogs).toHaveLength(1)
    })

    expect(result.current.globalLogs[0].nodeId).toBeUndefined()
    expect(result.current.nodeLogMap.size).toBe(0)
  })

  it('prefers explicit component_id over heuristic node mapping', async () => {
    const events: FlowEvent[] = [
      {
        type: 'log',
        timestamp: '2026-03-03T12:00:01.000Z',
        attributes: {
          run_id: 'run-2',
          component_id: 'send-process',
          function_name: 'handle_mail_extract',
        },
        message: 'component-bound event',
      },
    ]

    const { result } = renderHook(() => useLogStream(events, mailPipelineFlow.spanMapping))

    await waitFor(() => {
      expect(result.current.globalLogs).toHaveLength(1)
    })

    expect(result.current.globalLogs[0].nodeId).toBe('send-process')
    expect(result.current.nodeLogMap.get('send-process')).toHaveLength(1)
    expect(result.current.nodeLogMap.get('extract-worker')).toBeUndefined()
  })
})
