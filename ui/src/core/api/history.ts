import { getEventMergeKey, normalizeFlowEvents } from '../events'
import type { FlowEvent } from '../types'

export const DEFAULT_BROWSER_HISTORY_WINDOW = '6h'
export const DEFAULT_BROWSER_HISTORY_LIMIT = 1_000
export const MAX_BROWSER_HISTORY_PAGES = 5

export interface HistoryWindowRange {
  from: string
  to: string
}

export interface HistoryPage {
  from: string
  to: string
  anchorTo: string
  events: FlowEvent[]
  warnings: string[]
  hasMoreOlder: boolean
  nextCursor?: string
}

interface RelayHistoryResponse {
  from: string
  to: string
  anchor_to: string
  events: FlowEvent[]
  warnings?: string[]
  has_more_older?: boolean
  next_cursor?: string | null
}

export class HistoryCursorInvalidationError extends Error {
  constructor(message = 'history cursor no longer matches the active query shape') {
    super(message)
    this.name = 'HistoryCursorInvalidationError'
  }
}

function resolveRelayHttpBaseUrl(wsUrl: string): string {
  const normalized = new URL(wsUrl)
  normalized.protocol = normalized.protocol === 'wss:' ? 'https:' : 'http:'
  normalized.pathname = ''
  normalized.search = ''
  normalized.hash = ''
  return normalized.toString()
}

export interface FetchHistoryPageInput {
  wsUrl: string
  flowId: string
  cursor?: string
  window?: string
  limit?: number
  signal?: AbortSignal
}

function normalizeHistoryEvents(events: FlowEvent[]): FlowEvent[] {
  // Relay history assigns per-response seq values; strip them so merged older pages do not
  // collide on page-local sequence numbers.
  return normalizeFlowEvents(events, 0).map((event) => ({
    ...event,
    seq: undefined,
  }))
}

export async function fetchHistoryPage({
  wsUrl,
  flowId,
  cursor,
  window = DEFAULT_BROWSER_HISTORY_WINDOW,
  limit = DEFAULT_BROWSER_HISTORY_LIMIT,
  signal,
}: FetchHistoryPageInput): Promise<HistoryPage> {
  const url = new URL('/v1/history', resolveRelayHttpBaseUrl(wsUrl))
  url.searchParams.set('flow_id', flowId)
  url.searchParams.set('logs_only', 'true')
  url.searchParams.set('limit', String(limit))
  if (cursor) {
    url.searchParams.set('cursor', cursor)
  } else {
    url.searchParams.set('window', window)
  }

  const response = await fetch(url, { signal })
  if (response.status === 400) {
    throw new HistoryCursorInvalidationError()
  }
  if (!response.ok) {
    throw new Error(`history request failed: ${response.status}`)
  }

  const payload = (await response.json()) as RelayHistoryResponse

  const dedupedEvents = new Map<string, FlowEvent>()
  for (const event of normalizeHistoryEvents(payload.events ?? [])) {
    dedupedEvents.set(getEventMergeKey(event), event)
  }

  return {
    from: payload.from,
    to: payload.to,
    anchorTo: payload.anchor_to,
    events: [...dedupedEvents.values()],
    warnings: payload.warnings ?? [],
    hasMoreOlder: payload.has_more_older ?? false,
    nextCursor: payload.next_cursor ?? undefined,
  }
}
