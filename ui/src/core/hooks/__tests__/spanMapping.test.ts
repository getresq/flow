import { describe, expect, it } from 'vitest'

import { resolveMappedNodeId } from '../../mapping'
import type { FlowEvent } from '../../types'
import { spanMapping } from '../../../flows/mail-pipeline'

describe('span mapping resolution', () => {
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

  it('maps action to write-threads', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        action: 'threads_written',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('write-threads')
  })

  it('maps metadata action to write-metadata', () => {
    const event: FlowEvent = {
      type: 'log',
      timestamp: '2026-03-03T12:00:00.000Z',
      attributes: {
        action: 'metadata_written',
      },
    }

    expect(resolveMappedNodeId(event, spanMapping)).toBe('write-metadata')
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
})
