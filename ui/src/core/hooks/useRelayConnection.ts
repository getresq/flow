import { useCallback, useEffect, useRef, useState } from 'react'

import type { FlowEvent, RelayConnectionState } from '../types'

export const DEFAULT_RELAY_WS_URL = 'ws://localhost:4200/ws'
const MAX_RECONNECT_DELAY_MS = 10_000

function readAttr(event: FlowEvent, key: string): string | undefined {
  const value = event.attributes?.[key]
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return undefined
}

function inferEventKind(event: FlowEvent): NonNullable<FlowEvent['event_kind']> {
  if (event.type === 'span_start') {
    return 'node_started'
  }
  if (event.type === 'span_end') {
    return 'node_finished'
  }

  const action = readAttr(event, 'action')
  if (action === 'enqueue') {
    return 'queue_enqueued'
  }
  if (action === 'worker_pickup') {
    return 'queue_picked'
  }

  return 'log_event'
}

function toFlowEvent(payload: unknown): FlowEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const event = payload as Partial<FlowEvent>
  if (!event.type || !event.timestamp) {
    return null
  }

  return event as FlowEvent
}

export function useRelayConnection(wsUrl = DEFAULT_RELAY_WS_URL): RelayConnectionState {
  const [events, setEvents] = useState<FlowEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const attemptsRef = useRef(0)
  const shouldReconnectRef = useRef(true)
  const ingestSeqRef = useRef(0)

  const clearEvents = useCallback(() => {
    ingestSeqRef.current = 0
    setEvents([])
  }, [])

  useEffect(() => {
    shouldReconnectRef.current = true

    const scheduleReconnect = () => {
      if (!shouldReconnectRef.current) {
        return
      }

      attemptsRef.current += 1
      const delay = Math.min(2 ** (attemptsRef.current - 1) * 1_000, MAX_RECONNECT_DELAY_MS)
      setReconnecting(true)

      reconnectTimerRef.current = window.setTimeout(() => {
        connect()
      }, delay)
    }

    const connect = () => {
      if (!shouldReconnectRef.current) {
        return
      }

      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        attemptsRef.current = 0
        setConnected(true)
        setReconnecting(false)
      }

      socket.onclose = () => {
        setConnected(false)
        if (shouldReconnectRef.current) {
          scheduleReconnect()
        }
      }

      socket.onerror = () => {
        socket.close()
      }

      socket.onmessage = (message) => {
        const normalize = (event: FlowEvent): FlowEvent => {
          const seq = typeof event.seq === 'number' ? event.seq : ingestSeqRef.current + 1
          ingestSeqRef.current = Math.max(ingestSeqRef.current, seq)

          const eventKind = event.event_kind ?? inferEventKind(event)
          const queueDelta =
            typeof event.queue_delta === 'number'
              ? event.queue_delta
              : eventKind === 'queue_enqueued'
                ? 1
                : eventKind === 'queue_picked'
                  ? -1
                  : undefined

          const queueName = readAttr(event, 'queue_name')
          const functionName = readAttr(event, 'function_name')
          const workerName = readAttr(event, 'worker_name')
          const action = readAttr(event, 'action')
          const nodeKey =
            event.node_key ??
            ((eventKind === 'queue_enqueued' || eventKind === 'queue_picked'
              ? queueName ?? functionName ?? workerName ?? event.span_name ?? action
              : functionName ?? event.span_name ?? workerName ?? queueName ?? action) ??
              undefined)

          return {
            ...event,
            seq,
            event_kind: eventKind,
            queue_delta: queueDelta,
            node_key: nodeKey,
          }
        }

        try {
          const parsed = JSON.parse(message.data as string)
          if (Array.isArray(parsed)) {
            const normalized = parsed
              .map(toFlowEvent)
              .filter((event): event is FlowEvent => Boolean(event))
              .map(normalize)
            if (normalized.length > 0) {
              setEvents((previous) => {
                const merged = [...previous, ...normalized]
                merged.sort((left, right) => {
                  const bySeq = (left.seq ?? 0) - (right.seq ?? 0)
                  if (bySeq !== 0) {
                    return bySeq
                  }
                  return Date.parse(left.timestamp) - Date.parse(right.timestamp)
                })
                return merged
              })
            }
            return
          }

          const normalized = toFlowEvent(parsed)
          if (normalized) {
            const enriched = normalize(normalized)
            setEvents((previous) => {
              const merged = [...previous, enriched]
              merged.sort((left, right) => {
                const bySeq = (left.seq ?? 0) - (right.seq ?? 0)
                if (bySeq !== 0) {
                  return bySeq
                }
                return Date.parse(left.timestamp) - Date.parse(right.timestamp)
              })
              return merged
            })
          }
        } catch {
          // Ignore malformed messages from non-relay producers.
        }
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      setConnected(false)
      setReconnecting(false)

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
      }

      socketRef.current?.close()
      socketRef.current = null
    }
  }, [wsUrl])

  return { events, connected, reconnecting, clearEvents }
}
