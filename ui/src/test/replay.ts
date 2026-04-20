import demoFixture from './fixtures/demo-pipeline-replay.json';
import type { FlowEvent } from '../core/types';

const DEFAULT_WS_URL = 'ws://localhost:4200/ws';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatReplayTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function shiftReplayTimestamp(timestamp: string | undefined, offsetMs: number): string | undefined {
  if (!timestamp) {
    return undefined;
  }

  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return timestamp;
  }

  return formatReplayTimestamp(parsed + offsetMs);
}

export function rebaseReplayEventsForLivePlayback(
  events: FlowEvent[],
  anchorTimeMs = Date.now(),
): FlowEvent[] {
  if (events.length === 0) {
    return events;
  }

  const firstEventTimeMs = Date.parse(events[0].timestamp);
  if (!Number.isFinite(firstEventTimeMs)) {
    return events;
  }

  const offsetMs = anchorTimeMs - firstEventTimeMs;

  return events.map((event) => ({
    ...event,
    timestamp: shiftReplayTimestamp(event.timestamp, offsetMs) ?? event.timestamp,
    start_time: shiftReplayTimestamp(event.start_time, offsetMs),
    end_time: shiftReplayTimestamp(event.end_time, offsetMs),
  }));
}

async function connectRelay(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`timed out connecting to relay at ${url}`));
    }, 2_000);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve(ws);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`failed to connect to relay at ${url}`));
    };
  });
}

function resetRelaySession(socket: WebSocket, reason = 'replay') {
  socket.send(JSON.stringify({ type: 'reset', reason }));
}

export const demoReplayEvents = demoFixture as FlowEvent[];

async function replayToRelay(socket: WebSocket, events: FlowEvent[]) {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const next = events[index + 1];

    socket.send(JSON.stringify(event));
    // eslint-disable-next-line no-console
    console.log(`[replay] sent ${event.type} ${event.span_name ?? event.message ?? ''}`);

    if (!next) {
      continue;
    }

    const delta = Math.max(Date.parse(next.timestamp) - Date.parse(event.timestamp), 0);
    if (delta > 0) {
      await delay(delta);
    }
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`[replay] loaded demo pipeline (${demoReplayEvents.length} events)`);

  try {
    const socket = await connectRelay(DEFAULT_WS_URL);
    // eslint-disable-next-line no-console
    console.log(`[replay] connected to ${DEFAULT_WS_URL}`);
    resetRelaySession(socket);
    // eslint-disable-next-line no-console
    console.log('[replay] reset live session');
    const livePlaybackEvents = rebaseReplayEventsForLivePlayback(demoReplayEvents, Date.now());
    await replayToRelay(socket, livePlaybackEvents);
    socket.close();
    // eslint-disable-next-line no-console
    console.log('[replay] complete');
    return;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[replay] relay unavailable; start the relay first with `make dev` or `make dev-relay`',
      error,
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[replay] failed', error);
    process.exit(1);
  });
}
