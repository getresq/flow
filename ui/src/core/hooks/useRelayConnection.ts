import { useCallback, useEffect, useRef, useState } from 'react';

import { parseRelayEvents } from '../events';
import type { FlowEvent, RelayConnectionState } from '../types';

function sameOriginRelayWsUrl(location: Location): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

export function resolveDefaultRelayWsUrl(location = window.location): string {
  const configuredUrl = import.meta.env.VITE_RESQ_FLOW_RELAY_WS_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
    location.port === '5173'
  ) {
    return 'ws://localhost:4200/ws';
  }

  return sameOriginRelayWsUrl(location);
}

export const DEFAULT_RELAY_WS_URL = resolveDefaultRelayWsUrl();
const MAX_RECONNECT_DELAY_MS = 10_000;
const MAX_BUFFERED_EVENTS = 4_000;

function isResetEnvelope(payload: unknown): boolean {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    'type' in payload &&
    (payload as { type?: unknown }).type === 'reset',
  );
}

function dedupeIncomingEvents(incoming: FlowEvent[], maxSeenSeq: number): FlowEvent[] {
  const seenSeqs = new Set<number>();
  const accepted: FlowEvent[] = [];

  for (const event of incoming) {
    const seq = typeof event.seq === 'number' ? event.seq : undefined;
    if (typeof seq === 'number') {
      if (seq <= maxSeenSeq || seenSeqs.has(seq)) {
        continue;
      }
      seenSeqs.add(seq);
    }
    accepted.push(event);
  }

  return accepted;
}

export function useRelayConnection(wsUrl = DEFAULT_RELAY_WS_URL): RelayConnectionState {
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [totalEventCount, setTotalEventCount] = useState(0);
  const [wasTruncated, setWasTruncated] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const maxSeqRef = useRef(0);
  const eventsRef = useRef<FlowEvent[]>([]);

  const clearEvents = useCallback(() => {
    maxSeqRef.current = 0;
    eventsRef.current = [];
    setEvents([]);
    setTotalEventCount(0);
    setWasTruncated(false);
    setResetKey((value) => value + 1);
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;

    const scheduleReconnect = () => {
      if (!shouldReconnectRef.current) {
        return;
      }

      attemptsRef.current += 1;
      const delay = Math.min(2 ** (attemptsRef.current - 1) * 1_000, MAX_RECONNECT_DELAY_MS);
      setReconnecting(true);

      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = () => {
      if (!shouldReconnectRef.current) {
        return;
      }

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptsRef.current = 0;
        setConnected(true);
        setReconnecting(false);
      };

      socket.onclose = () => {
        setConnected(false);
        if (shouldReconnectRef.current) {
          scheduleReconnect();
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onmessage = (message) => {
        let parsedPayload: unknown;
        try {
          parsedPayload = JSON.parse(String(message.data));
        } catch {
          parsedPayload = undefined;
        }

        if (isResetEnvelope(parsedPayload)) {
          clearEvents();
          return;
        }

        const parsed = parseRelayEvents(String(message.data), maxSeqRef.current);
        const accepted = dedupeIncomingEvents(parsed, maxSeqRef.current);
        if (accepted.length === 0) {
          return;
        }

        for (const event of accepted) {
          if (typeof event.seq === 'number') {
            maxSeqRef.current = Math.max(maxSeqRef.current, event.seq);
          }
        }

        const merged = [...eventsRef.current, ...accepted];
        const truncated = merged.length > MAX_BUFFERED_EVENTS;
        const nextEvents = truncated ? merged.slice(-MAX_BUFFERED_EVENTS) : merged;
        eventsRef.current = nextEvents;

        setEvents(nextEvents);
        setTotalEventCount((value) => value + accepted.length);
        if (truncated) {
          setWasTruncated(true);
        }
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      setConnected(false);
      setReconnecting(false);

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clearEvents, wsUrl]);

  return { events, connected, reconnecting, resetKey, totalEventCount, wasTruncated, clearEvents };
}
