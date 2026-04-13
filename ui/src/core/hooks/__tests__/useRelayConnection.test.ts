import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useRelayConnection } from '../useRelayConnection'

class MockWebSocket {
  static instances: MockWebSocket[] = []

  readonly url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  close() {
    this.onclose?.()
  }

  send() {}

  emitOpen() {
    this.onopen?.()
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

describe('useRelayConnection', () => {
  const OriginalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    MockWebSocket.instances = []
    // @ts-expect-error test websocket shim
    globalThis.WebSocket = MockWebSocket
  })

  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket
  })

  it('appends batched relay envelopes and ignores duplicate snapshot events on reconnect', async () => {
    const { result, unmount } = renderHook(() => useRelayConnection('ws://example.test/ws'))

    const socket = MockWebSocket.instances[0]
    expect(socket?.url).toBe('ws://example.test/ws')

    await act(async () => {
      socket.emitOpen()
    })

    await act(async () => {
      socket.emitMessage({
        type: 'snapshot',
        events: [
          { type: 'log', seq: 1, timestamp: '2026-03-05T12:00:00.000Z', message: 'first' },
          { type: 'log', seq: 2, timestamp: '2026-03-05T12:00:00.050Z', message: 'second' },
        ],
      })
    })

    expect(result.current.connected).toBe(true)
    expect(result.current.events.map((event) => event.seq)).toEqual([1, 2])
    expect(result.current.totalEventCount).toBe(2)

    await act(async () => {
      socket.emitMessage({
        type: 'batch',
        events: [
          { type: 'log', seq: 2, timestamp: '2026-03-05T12:00:00.050Z', message: 'second' },
          { type: 'log', seq: 3, timestamp: '2026-03-05T12:00:00.100Z', message: 'third' },
        ],
      })
    })

    expect(result.current.events.map((event) => event.seq)).toEqual([1, 2, 3])
    expect(result.current.totalEventCount).toBe(3)

    await act(async () => {
      result.current.clearEvents()
    })

    expect(result.current.events).toEqual([])
    expect(result.current.totalEventCount).toBe(0)

    unmount()
  })

  it('marks live rollover as truncated without resetting the session', async () => {
    const { result } = renderHook(() => useRelayConnection('ws://example.test/ws'))

    const socket = MockWebSocket.instances[0]

    await act(async () => {
      socket.emitOpen()
    })

    await act(async () => {
      socket.emitMessage({
        type: 'batch',
        events: Array.from({ length: 4_001 }, (_, index) => ({
          type: 'log',
          seq: index + 1,
          timestamp: `2026-03-05T12:00:${String(index % 60).padStart(2, '0')}.000Z`,
          message: `event-${index + 1}`,
        })),
      })
    })

    expect(result.current.events).toHaveLength(4_000)
    expect(result.current.events[0]?.seq).toBe(2)
    expect(result.current.events.at(-1)?.seq).toBe(4_001)
    expect(result.current.wasTruncated).toBe(true)
    expect(result.current.resetKey).toBe(0)
  })
})
